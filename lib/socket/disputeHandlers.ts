import { Server, Socket } from "socket.io";
import { prisma } from "@/lib/prisma";
import { judgeDispute } from "@/lib/claude";
import { settleDispute } from "@/lib/settlement";
import { sendTurnNotification } from "@/lib/push";
import { countTokens } from "@/lib/tokenizer";

const turnTimers = new Map<string, NodeJS.Timeout>();
const turnState = new Map<string, { position: number; passCount: number; expiresAt: number }>();

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
      timeLimitSeconds: true,
      maxMessageTimeSeconds: true,
      messageTokenLimit: true,
      totalTokenLimit: true,
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

    const state = turnState.get(disputeId);
    socket.emit("dispute:state", {
      ...dispute,
      currentTurnUserId: state ? getCurrentTurnUserId(dispute?.players ?? [], state.position) : null,
      turnExpiresAt: state?.expiresAt ?? null,
    });
  });

  socket.on("dispute:message", async (data: {
    disputeId: string;
    userId: string;
    content: string;
  }) => {
    const { disputeId, userId, content } = data;

    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { players: { orderBy: { circlePosition: "asc" } }, lobby: true },
    });
    if (!dispute || dispute.status !== "IN_PROGRESS") return;

    const state = turnState.get(disputeId);
    if (!state) return;

    const activePlayers = dispute.players.filter((p) => p.isActive);
    const currentPlayer = activePlayers[state.position % activePlayers.length];
    if (!currentPlayer || currentPlayer.userId !== userId) {
      socket.emit("dispute:error", { message: "It is not your turn." });
      return;
    }

    const tokenCount = countTokens(content);
    if (tokenCount > (dispute.lobby.messageTokenLimit ?? Infinity)) {
      socket.emit("dispute:error", { message: `Message exceeds the ${dispute.lobby.messageTokenLimit}-token limit.` });
      return;
    }

    const totalUsed = dispute.tokensUsed + tokenCount;
    if (totalUsed > (dispute.lobby.totalTokenLimit ?? Infinity)) {
      socket.emit("dispute:error", { message: "Total token budget exhausted." });
      return;
    }

    const turnNumber = await prisma.message.count({ where: { disputeId } });
    const message = await prisma.message.create({
      data: { disputeId, userId, content, tokenCount, turnNumber: turnNumber + 1 },
      include: { user: { select: { id: true, username: true } } },
    });

    await prisma.dispute.update({ where: { id: disputeId }, data: { tokensUsed: totalUsed } });

    io.to(`dispute:${disputeId}`).emit("dispute:new_message", {
      message,
      tokensUsed: totalUsed,
      tokensRemaining: (dispute.lobby.totalTokenLimit ?? 0) - totalUsed,
    });

    clearTurnTimer(disputeId);
    state.passCount = 0;
    advanceTurn(io, disputeId, activePlayers.length, dispute.lobby.maxMessageTimeSeconds ?? 60);
  });

  socket.on("dispute:pass", async ({ disputeId, userId }: { disputeId: string; userId: string }) => {
    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { players: { orderBy: { circlePosition: "asc" } }, lobby: true },
    });
    if (!dispute || dispute.status !== "IN_PROGRESS") return;

    const state = turnState.get(disputeId);
    if (!state) return;

    const activePlayers = dispute.players.filter((p) => p.isActive);
    const currentPlayer = activePlayers[state.position % activePlayers.length];
    if (!currentPlayer || currentPlayer.userId !== userId) return;

    state.passCount += 1;
    io.to(`dispute:${disputeId}`).emit("dispute:player_passed", { userId });

    if (state.passCount >= activePlayers.length) {
      await endDispute(io, disputeId);
    } else {
      clearTurnTimer(disputeId);
      advanceTurn(io, disputeId, activePlayers.length, dispute.lobby.maxMessageTimeSeconds ?? 60);
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

function getCurrentTurnUserId(
  players: { userId: string; isActive: boolean; circlePosition: number }[],
  position: number
): string | null {
  const active = [...players]
    .filter((p) => p.isActive)
    .sort((a, b) => a.circlePosition - b.circlePosition);
  return active[position % active.length]?.userId ?? null;
}

function advanceTurn(io: Server, disputeId: string, activeCount: number, maxSeconds: number) {
  const state = turnState.get(disputeId);
  if (!state) return;
  state.position = (state.position + 1) % activeCount;

  const expiresAt = Date.now() + maxSeconds * 1000;
  state.expiresAt = expiresAt;

  emitCurrentTurn(io, disputeId, expiresAt);

  const timer = setTimeout(async () => {
    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { players: { orderBy: { circlePosition: "asc" } } },
    });
    if (!dispute || dispute.status !== "IN_PROGRESS") return;

    const activePlayers = dispute.players.filter((p) => p.isActive);
    const timedOutPlayer = activePlayers[state.position % activePlayers.length];
    if (!timedOutPlayer) return;

    io.to(`dispute:${disputeId}`).emit("dispute:turn_timeout", { userId: timedOutPlayer.userId });

    await prisma.disputePlayer.update({
      where: { disputeId_userId: { disputeId, userId: timedOutPlayer.userId } },
      data: { isActive: false },
    });

    const remaining = activePlayers.filter((p) => p.userId !== timedOutPlayer.userId);
    if (remaining.length < 1) {
      await endDispute(io, disputeId);
    } else {
      advanceTurn(io, disputeId, remaining.length, maxSeconds);
    }
  }, maxSeconds * 1000);

  turnTimers.set(disputeId, timer);
  emitTurnNotification(io, disputeId, state.position);
}

async function emitCurrentTurn(io: Server, disputeId: string, expiresAt: number) {
  const state = turnState.get(disputeId);
  if (!state) return;

  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: { players: { where: { isActive: true }, orderBy: { circlePosition: "asc" } } },
  });
  if (!dispute) return;

  const currentPlayer = dispute.players[state.position % dispute.players.length];
  if (!currentPlayer) return;

  io.to(`dispute:${disputeId}`).emit("dispute:turn", {
    userId: currentPlayer.userId,
    expiresAt,
  });
}

async function emitTurnNotification(io: Server, disputeId: string, position: number) {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: { players: { where: { isActive: true }, orderBy: { circlePosition: "asc" } } },
  });
  if (!dispute) return;

  const currentPlayer = dispute.players[position % dispute.players.length];
  if (!currentPlayer) return;

  await sendTurnNotification(currentPlayer.userId, disputeId);
}

function clearTurnTimer(disputeId: string) {
  const t = turnTimers.get(disputeId);
  if (t) { clearTimeout(t); turnTimers.delete(disputeId); }
}

export async function startDispute(io: Server, lobbyId: string) {
  const lobby = await prisma.lobby.findUnique({
    where: { id: lobbyId },
    include: { players: true },
  });
  if (!lobby) return null;

  if (lobby.status !== "WAITING") return null;

  const missingBet = lobby.players.find((p) => p.betAmount == null);
  if (missingBet) throw new Error(`Player ${missingBet.userId} has no bet amount`);

  // Atomic status change — prevents double-start on simultaneous ready clicks
  const { count } = await prisma.lobby.updateMany({
    where: { id: lobbyId, status: "WAITING" },
    data: { status: "IN_PROGRESS" },
  });
  if (count === 0) return null;

  for (const player of lobby.players) {
    await prisma.user.update({
      where: { id: player.userId },
      data: { tokenBalance: { decrement: player.betAmount! } },
    });
  }

  const dispute = await prisma.dispute.create({
    data: {
      lobbyId,
      players: {
        create: lobby.players.map((p, index) => ({
          userId: p.userId,
          betAmount: p.betAmount!,
          circlePosition: index,
        })),
      },
    },
  });

  if (lobby.messageTokenLimit == null || lobby.totalTokenLimit == null) {
    await prisma.lobby.update({
      where: { id: lobbyId },
      data: {
        messageTokenLimit: lobby.messageTokenLimit ?? 500,
        totalTokenLimit: lobby.totalTokenLimit ?? 50000,
      },
    });
  }

  turnState.set(dispute.id, { position: -1, passCount: 0, expiresAt: 0 });
  advanceTurn(io, dispute.id, lobby.players.length, lobby.maxMessageTimeSeconds ?? 60);

  return dispute.id;
}

export async function endDispute(io: Server, disputeId: string) {
  clearTurnTimer(disputeId);
  turnState.delete(disputeId);

  await prisma.dispute.update({ where: { id: disputeId }, data: { status: "JUDGING", endedAt: new Date() } });
  io.to(`dispute:${disputeId}`).emit("dispute:judging");

  let result = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      result = await judgeDispute(disputeId);
      break;
    } catch {
      if (attempt === 2) {
        await refundBets(disputeId);
        await prisma.dispute.update({ where: { id: disputeId }, data: { status: "CANCELLED" } });
        io.to(`dispute:${disputeId}`).emit("dispute:error", {
          message: "Judging failed after 3 attempts. All bets have been refunded.",
        });
        return;
      }
    }
  }

  if (!result) return;
  await settleDispute(disputeId, result.winnerIds, result.reason, result.claudeResponse);

  // Fetch per-player outcomes to send to clients
  const players = await prisma.disputePlayer.findMany({
    where: { disputeId },
    include: { user: { select: { username: true } } },
  });

  io.to(`dispute:${disputeId}`).emit("dispute:result", {
    winnerIds: result.winnerIds,
    reason: result.reason,
    players: players.map((p) => ({
      userId: p.userId,
      username: p.user.username,
      tokensWon: p.tokensWon,
      tokensLost: p.tokensLost,
      betAmount: p.betAmount,
    })),
  });
}

async function refundBets(disputeId: string) {
  const players = await prisma.disputePlayer.findMany({ where: { disputeId } });
  for (const player of players) {
    await prisma.user.update({
      where: { id: player.userId },
      data: { tokenBalance: { increment: player.betAmount } },
    });
  }
}
