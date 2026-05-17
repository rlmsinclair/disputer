import { Server, Socket } from "socket.io";
import { prisma } from "@/lib/prisma";
import { judgeDispute } from "@/lib/claude";
import { calculateElo } from "@/lib/elo";
import { countWords } from "@/lib/wordcount";
import { advanceBracket } from "@/lib/tournament";

const passedUsers = new Map<string, Set<string>>();

const disputeInclude = {
  players: {
    include: { user: { select: { id: true, username: true } } },
    orderBy: { circlePosition: "asc" as const },
  },
  messages: {
    include: { user: { select: { id: true, username: true } } },
    orderBy: { createdAt: "asc" as const },
  },
  result: true,
  lobby: {
    select: {
      topic: true,
      maxMessageTimeSeconds: true,
      messageWordLimit: true,
      totalWordLimit: true,
    },
  },
};

export function registerDisputeHandlers(io: Server, socket: Socket) {
  socket.on("dispute:spectate", ({ disputeId }: { disputeId: string }) => {
    socket.join(`dispute:${disputeId}`);
  });

  socket.on("dispute:join", async ({ disputeId, userId }: { disputeId: string; userId: string }) => {
    socket.join(`dispute:${disputeId}`);
    socket.data.userId = userId;
    socket.data.disputeId = disputeId;

    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: disputeInclude,
    });

    socket.emit("dispute:state", {
      ...dispute,
      currentTurnUserId: null,
      turnExpiresAt: null,
    });
  });

  socket.on("dispute:message", async (data: {
    disputeId: string;
    userId: string;
    content: string;
    wordsPerMinute?: number;
  }) => {
    const { disputeId, userId, content, wordsPerMinute } = data;

    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        players: { orderBy: { circlePosition: "asc" } },
        lobby: true,
        tournamentMatch: { include: { round: { include: { tournament: true } } } },
      },
    });
    if (!dispute || dispute.status !== "IN_PROGRESS") return;

    const isActivePlayer = dispute.players.some((p) => p.userId === userId && p.isActive);
    if (!isActivePlayer) {
      socket.emit("dispute:error", { message: "You are not an active player." });
      return;
    }

    // WPM enforcement for tournament matches
    const maxWpm = dispute.tournamentMatch?.round?.tournament?.maxTypingSpeedWpm ?? null;
    if (maxWpm && wordsPerMinute && wordsPerMinute > maxWpm) {
      socket.emit("dispute:error", {
        message: `Message rejected: typing speed (${Math.round(wordsPerMinute)} WPM) exceeded the ${maxWpm} WPM limit.`,
      });
      return;
    }

    const wordCount = countWords(content);
    if (wordCount > dispute.lobby.messageWordLimit) {
      socket.emit("dispute:error", { message: `Message exceeds the ${dispute.lobby.messageWordLimit}-word limit.` });
      return;
    }

    const totalUsed = dispute.wordsUsed + wordCount;
    if (totalUsed > dispute.lobby.totalWordLimit) {
      socket.emit("dispute:error", { message: "Total word budget exhausted." });
      return;
    }

    const turnNumber = await prisma.message.count({ where: { disputeId } });
    const message = await prisma.message.create({
      data: {
        disputeId, userId, content, wordCount, turnNumber: turnNumber + 1,
        wordsPerMinute: wordsPerMinute ?? null,
      },
      include: { user: { select: { id: true, username: true } } },
    });

    await prisma.dispute.update({ where: { id: disputeId }, data: { wordsUsed: totalUsed } });

    io.to(`dispute:${disputeId}`).emit("dispute:new_message", {
      message,
      wordsUsed: totalUsed,
      wordsRemaining: dispute.lobby.totalWordLimit - totalUsed,
    });

    // Sending a message un-passes this player
    passedUsers.get(disputeId)?.delete(userId);
  });

  socket.on("dispute:pass", async ({ disputeId, userId }: { disputeId: string; userId: string }) => {
    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { players: { orderBy: { circlePosition: "asc" } } },
    });
    if (!dispute || dispute.status !== "IN_PROGRESS") return;

    const activePlayers = dispute.players.filter((p) => p.isActive);
    if (!activePlayers.some((p) => p.userId === userId)) return;

    const passed = passedUsers.get(disputeId);
    if (!passed) return;

    passed.add(userId);
    io.to(`dispute:${disputeId}`).emit("dispute:player_passed", { userId });

    if (passed.size >= activePlayers.length) {
      await endDispute(io, disputeId);
    }
  });

  socket.on("dispute:rejoin", async ({ disputeId, userId }: { disputeId: string; userId: string }) => {
    await prisma.disputePlayer.update({
      where: { disputeId_userId: { disputeId, userId } },
      data: { isActive: true },
    });
    socket.join(`dispute:${disputeId}`);
    socket.data.userId = userId;
    socket.data.disputeId = disputeId;
    io.to(`dispute:${disputeId}`).emit("dispute:player_rejoined", { userId });
  });

  socket.on("dispute:typing", ({ disputeId, userId, content }: {
    disputeId: string;
    userId: string;
    content: string;
  }) => {
    socket.to(`dispute:${disputeId}`).emit("dispute:typing", { userId, content });
  });

  socket.on("dispute:toggle_private", async ({ disputeId, userId, isPrivate }: {
    disputeId: string;
    userId: string;
    isPrivate: boolean;
  }) => {
    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { players: true },
    });
    if (!dispute || !dispute.players.some((p) => p.userId === userId)) return;

    await prisma.dispute.update({ where: { id: disputeId }, data: { isPrivate } });
    io.to(`dispute:${disputeId}`).emit("dispute:privacy_updated", { isPrivate });
  });

  socket.on("disconnecting", async () => {
    const disputeId = socket.data.disputeId;
    const userId = socket.data.userId;
    if (!disputeId || !userId) return;

    await prisma.disputePlayer.updateMany({
      where: { disputeId, userId },
      data: { isActive: false },
    });
    io.to(`dispute:${disputeId}`).emit("dispute:player_disconnected", { userId });
  });
}

export async function startDispute(io: Server, lobbyId: string) {
  const lobby = await prisma.lobby.findUnique({
    where: { id: lobbyId },
    include: { players: true },
  });
  if (!lobby) return null;
  if (lobby.status !== "WAITING") return null;

  const { count } = await prisma.lobby.updateMany({
    where: { id: lobbyId, status: "WAITING" },
    data: { status: "IN_PROGRESS" },
  });
  if (count === 0) return null;

  const dispute = await prisma.dispute.create({
    data: {
      lobbyId,
      players: {
        create: lobby.players.map((p, index) => ({
          userId: p.userId,
          circlePosition: index,
        })),
      },
    },
  });

  passedUsers.set(dispute.id, new Set());

  return dispute.id;
}

export async function endDispute(io: Server, disputeId: string) {
  passedUsers.delete(disputeId);

  await prisma.dispute.update({ where: { id: disputeId }, data: { status: "JUDGING", endedAt: new Date() } });
  io.to(`dispute:${disputeId}`).emit("dispute:judging");

  let result = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      result = await judgeDispute(disputeId);
      break;
    } catch {
      if (attempt === 2) {
        await prisma.dispute.update({ where: { id: disputeId }, data: { status: "CANCELLED" } });
        io.to(`dispute:${disputeId}`).emit("dispute:error", {
          message: "Judging failed after 3 attempts. No ELO changes.",
        });
        return;
      }
    }
  }

  if (!result) return;

  await applyEloAndSettle(disputeId, result.winnerIds, result.reason, result.claudeResponse, io);
}

async function applyEloAndSettle(
  disputeId: string,
  winnerIds: string[],
  reason: string,
  claudeResponse: string,
  io: Server
) {
  const players = await prisma.disputePlayer.findMany({
    where: { disputeId },
    include: { user: { select: { id: true, username: true, elo: true } } },
  });

  const winners = players.filter((p) => winnerIds.includes(p.userId));
  const losers = players.filter((p) => !winnerIds.includes(p.userId));

  await prisma.$transaction(async (tx) => {
    await tx.disputeResult.create({
      data: { disputeId, claudeResponse, winnerIds, reason },
    });

    for (const winner of winners) {
      for (const loser of losers) {
        const { winnerDelta, loserDelta } = calculateElo(winner.user.elo, loser.user.elo);

        await tx.disputePlayer.update({
          where: { disputeId_userId: { disputeId, userId: winner.userId } },
          data: { eloChange: { increment: winnerDelta } },
        });
        await tx.user.update({
          where: { id: winner.userId },
          data: { elo: { increment: winnerDelta } },
        });

        await tx.disputePlayer.update({
          where: { disputeId_userId: { disputeId, userId: loser.userId } },
          data: { eloChange: { increment: loserDelta } },
        });
        await tx.user.update({
          where: { id: loser.userId },
          data: { elo: { increment: loserDelta } },
        });

        await tx.notification.create({
          data: {
            userId: winner.userId,
            type: "DISPUTE_RESULT",
            payload: { disputeId, outcome: "won", eloChange: winnerDelta, reason },
          },
        });
        await tx.notification.create({
          data: {
            userId: loser.userId,
            type: "DISPUTE_RESULT",
            payload: { disputeId, outcome: "lost", eloChange: loserDelta, reason },
          },
        });
      }
    }

    await tx.dispute.update({
      where: { id: disputeId },
      data: { status: "COMPLETED" },
    });
  });

  const updatedPlayers = await prisma.disputePlayer.findMany({
    where: { disputeId },
    include: { user: { select: { id: true, username: true, elo: true } } },
  });

  io.to(`dispute:${disputeId}`).emit("dispute:result", {
    winnerIds,
    reason,
    players: updatedPlayers.map((p) => ({
      userId: p.userId,
      username: p.user.username,
      eloChange: p.eloChange,
      newElo: p.user.elo,
    })),
  });

  // Advance tournament bracket if this dispute was part of one
  const tournamentMatch = await prisma.tournamentMatch.findUnique({
    where: { disputeId },
    include: { round: true },
  });
  if (tournamentMatch && winnerIds[0]) {
    await prisma.tournamentMatch.update({
      where: { id: tournamentMatch.id },
      data: { status: "COMPLETED", winnerUserId: winnerIds[0] },
    });
    await advanceBracket(tournamentMatch.id, winnerIds[0]);
    io.to(`tournament:${tournamentMatch.round.tournamentId}`).emit("tournament:bracket_updated");
  }
}
