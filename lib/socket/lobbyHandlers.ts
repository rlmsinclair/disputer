import { Server, Socket } from "socket.io";
import { prisma } from "@/lib/prisma";
import { startDispute } from "@/lib/socket/disputeHandlers";

const playerSelect = {
  userId: true,
  betAmount: true,
  isReady: true,
  circlePosition: true,
  topicConfirmed: true,
  timeLimitConfirmed: true,
  maxMessageTimeConfirmed: true,
  betConfirmed: true,
  proposedMessageTokenLimit: true,
  proposedTotalTokenLimit: true,
  user: { select: { username: true, tokenBalance: true } },
};

export function registerLobbyHandlers(io: Server, socket: Socket) {
  socket.on("lobby:join", async ({ lobbyId, userId }: { lobbyId: string; userId: string }) => {
    socket.join(`lobby:${lobbyId}`);
    socket.data.userId = userId;
    socket.data.lobbyId = lobbyId;

    const lobby = await prisma.lobby.findUnique({
      where: { id: lobbyId },
      include: {
        players: { select: playerSelect },
        invites: {
          where: { accepted: null },
          select: { inviteeId: true, invitee: { select: { username: true } } },
        },
      },
    });
    socket.emit("lobby:state", lobby);

    // Emit full player data to others so they can add the player to their list
    const joining = lobby?.players.find((p) => p.userId === userId);
    if (joining) {
      socket.to(`lobby:${lobbyId}`).emit("lobby:player_joined", joining);
    }
  });

  socket.on("lobby:leave", ({ lobbyId, userId }: { lobbyId: string; userId: string }) => {
    socket.leave(`lobby:${lobbyId}`);
    io.to(`lobby:${lobbyId}`).emit("lobby:player_left", { userId });
  });

  socket.on("lobby:update_setting", async (data: {
    lobbyId: string;
    userId: string;
    field: string;
    value: unknown;
  }) => {
    const { lobbyId, userId, field, value } = data;
    const lobby = await prisma.lobby.findUnique({ where: { id: lobbyId } });
    if (!lobby || lobby.creatorId !== userId) return;

    const allowed = ["topic", "timeLimitSeconds", "maxMessageTimeSeconds"];
    if (!allowed.includes(field)) return;

    await prisma.lobby.update({ where: { id: lobbyId }, data: { [field]: value } });
    io.to(`lobby:${lobbyId}`).emit("lobby:setting_updated", { field, value });
  });

  socket.on("lobby:propose_bet", async (data: {
    lobbyId: string;
    userId: string;
    amount: number;
  }) => {
    const { lobbyId, userId, amount } = data;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || amount > user.tokenBalance || amount <= 0) {
      socket.emit("lobby:error", { message: "Invalid bet amount." });
      return;
    }

    // Set bet and reset ALL players' betConfirmed since the arrangement changed
    await prisma.$transaction([
      prisma.lobbyPlayer.update({
        where: { lobbyId_userId: { lobbyId, userId } },
        data: { betAmount: amount },
      }),
      prisma.lobbyPlayer.updateMany({
        where: { lobbyId },
        data: { betConfirmed: false, isReady: false },
      }),
    ]);

    io.to(`lobby:${lobbyId}`).emit("lobby:bet_proposed", { userId, amount });
  });

  socket.on("lobby:confirm_bet", async (data: { lobbyId: string; userId: string }) => {
    const { lobbyId, userId } = data;
    await prisma.lobbyPlayer.update({
      where: { lobbyId_userId: { lobbyId, userId } },
      data: { betConfirmed: true },
    });

    const players = await prisma.lobbyPlayer.findMany({ where: { lobbyId } });
    const allConfirmed = players.every((p) => p.betConfirmed && p.betAmount != null);
    io.to(`lobby:${lobbyId}`).emit("lobby:bet_confirmation_update", { userId, allConfirmed });
  });

  socket.on("lobby:propose_token_limits", async (data: {
    lobbyId: string;
    userId: string;
    messageTokenLimit: number;
    totalTokenLimit: number;
  }) => {
    const { lobbyId, userId, messageTokenLimit, totalTokenLimit } = data;

    // Validate reasonable bounds
    if (messageTokenLimit < 10 || messageTokenLimit > 4000) {
      socket.emit("lobby:error", { message: "Message token limit must be between 10 and 4000." });
      return;
    }

    await prisma.lobbyPlayer.update({
      where: { lobbyId_userId: { lobbyId, userId } },
      data: { proposedMessageTokenLimit: messageTokenLimit, proposedTotalTokenLimit: totalTokenLimit },
    });

    const players = await prisma.lobbyPlayer.findMany({ where: { lobbyId } });
    const allProposed = players.every(
      (p) => p.proposedMessageTokenLimit != null && p.proposedTotalTokenLimit != null
    );

    // Emit intermediate update so others see this player's proposal
    io.to(`lobby:${lobbyId}`).emit("lobby:token_proposal_update", { userId, messageTokenLimit, totalTokenLimit });

    if (allProposed) {
      const TOKEN_OVERHEAD_BUFFER = 2000;
      const MAX_CLAUDE_TOKENS = 180000;

      const avgMessage = Math.floor(
        players.reduce((s, p) => s + (p.proposedMessageTokenLimit ?? 0), 0) / players.length
      );
      const avgTotal = Math.floor(
        players.reduce((s, p) => s + (p.proposedTotalTokenLimit ?? 0), 0) / players.length
      );
      const cappedTotal = Math.min(avgTotal, MAX_CLAUDE_TOKENS - TOKEN_OVERHEAD_BUFFER);

      await prisma.lobby.update({
        where: { id: lobbyId },
        data: { messageTokenLimit: avgMessage, totalTokenLimit: cappedTotal },
      });

      io.to(`lobby:${lobbyId}`).emit("lobby:token_limits_set", {
        messageTokenLimit: avgMessage,
        totalTokenLimit: cappedTotal,
      });
    }
  });

  socket.on("lobby:ready", async (data: { lobbyId: string; userId: string }) => {
    const { lobbyId, userId } = data;

    await prisma.lobbyPlayer.update({
      where: { lobbyId_userId: { lobbyId, userId } },
      data: { isReady: true },
    });

    const players = await prisma.lobbyPlayer.findMany({ where: { lobbyId } });
    const allReady = players.length >= 2 && players.every((p) => p.isReady);
    io.to(`lobby:${lobbyId}`).emit("lobby:ready_update", { userId, allReady });

    if (allReady) {
      try {
        const disputeId = await startDispute(io, lobbyId);
        if (disputeId) {
          io.to(`lobby:${lobbyId}`).emit("lobby:dispute_started", { disputeId });
        }
      } catch (err) {
        console.error("[lobby:ready] startDispute failed:", err);
        socket.emit("lobby:error", { message: "Failed to start dispute. Please try again." });
      }
    }
  });

  socket.on("lobby:vote_kick", async (data: {
    lobbyId: string;
    voterId: string;
    targetId: string;
  }) => {
    const { lobbyId, voterId, targetId } = data;

    const voteKey = `kick_votes_${lobbyId}_${targetId}`;
    const votes: Set<string> =
      (globalThis as Record<string, unknown>)[voteKey] as Set<string> ?? new Set();
    votes.add(voterId);
    (globalThis as Record<string, unknown>)[voteKey] = votes;

    const players = await prisma.lobbyPlayer.findMany({ where: { lobbyId } });
    const majority = Math.floor(players.length / 2) + 1;

    if (votes.size >= majority) {
      delete (globalThis as Record<string, unknown>)[voteKey];
      await prisma.$transaction([
        prisma.lobbyPlayer.delete({ where: { lobbyId_userId: { lobbyId, userId: targetId } } }),
        prisma.lobbyPlayer.updateMany({ where: { lobbyId }, data: { isReady: false } }),
      ]);
      io.to(`lobby:${lobbyId}`).emit("lobby:player_kicked", { userId: targetId });
    } else {
      io.to(`lobby:${lobbyId}`).emit("lobby:kick_vote_update", {
        targetId,
        votes: votes.size,
        required: majority,
      });
    }
  });
}
