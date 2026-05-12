import { Server, Socket } from "socket.io";
import { prisma } from "@/lib/prisma";
import { startDispute } from "@/lib/socket/disputeHandlers";

type ChatMessage = { userId: string; username: string; content: string; timestamp: number };

const lobbyChatHistory = new Map<string, ChatMessage[]>();

const playerSelect = {
  userId: true,
  isReady: true,
  joinedAt: true,
  user: { select: { username: true, elo: true } },
};

export function registerLobbyHandlers(io: Server, socket: Socket) {
  socket.on("lobby:join", async ({ lobbyId, userId }: { lobbyId: string; userId: string }) => {
    socket.join(`lobby:${lobbyId}`);
    socket.data.userId = userId;
    socket.data.lobbyId = lobbyId;

    const lobby = await prisma.lobby.findUnique({
      where: { id: lobbyId },
      include: { players: { select: playerSelect } },
    });

    socket.emit("lobby:state", {
      ...lobby,
      chatHistory: lobbyChatHistory.get(lobbyId) ?? [],
    });

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
    const lobby = await prisma.lobby.findUnique({
      where: { id: lobbyId },
      include: { players: true },
    });
    if (!lobby || lobby.creatorId !== userId) return;

    // Block changes once the opponent has readied up
    const opponentReady = lobby.players.some((p) => p.userId !== userId && p.isReady);
    if (opponentReady) return;

    const allowed = ["topic", "maxMessageTimeSeconds", "messageWordLimit", "totalWordLimit"];
    if (!allowed.includes(field)) return;

    if (field === "maxMessageTimeSeconds") {
      const n = Number(value);
      if (isNaN(n) || n < 10 || n > 300) return;
    }
    if (field === "messageWordLimit") {
      const n = Number(value);
      if (isNaN(n) || n < 10 || n > 2000) return;
    }
    if (field === "totalWordLimit") {
      const n = Number(value);
      if (isNaN(n) || n < 100) return;
    }

    await prisma.lobby.update({ where: { id: lobbyId }, data: { [field]: value } });
    io.to(`lobby:${lobbyId}`).emit("lobby:setting_updated", { field, value });
  });

  socket.on("lobby:ready", async ({ lobbyId, userId }: { lobbyId: string; userId: string }) => {
    const lobby = await prisma.lobby.findUnique({
      where: { id: lobbyId },
      include: { players: true },
    });
    if (!lobby || lobby.creatorId === userId) return; // only non-host can ready

    const player = lobby.players.find((p) => p.userId === userId);
    if (!player) return;

    const newReady = !player.isReady;
    await prisma.lobbyPlayer.update({
      where: { lobbyId_userId: { lobbyId, userId } },
      data: { isReady: newReady },
    });

    io.to(`lobby:${lobbyId}`).emit("lobby:ready_update", { userId, isReady: newReady });
  });

  socket.on("lobby:start", async ({ lobbyId, userId }: { lobbyId: string; userId: string }) => {
    const lobby = await prisma.lobby.findUnique({
      where: { id: lobbyId },
      include: { players: true },
    });
    if (!lobby || lobby.creatorId !== userId) return;
    if (lobby.players.length < 2) {
      socket.emit("lobby:error", { message: "Need 2 players to start." });
      return;
    }
    if (!lobby.topic?.trim()) {
      socket.emit("lobby:error", { message: "Set a topic before starting." });
      return;
    }
    const opponentReady = lobby.players.some((p) => p.userId !== userId && p.isReady);
    if (!opponentReady) {
      socket.emit("lobby:error", { message: "Waiting for opponent to ready up." });
      return;
    }

    try {
      const disputeId = await startDispute(io, lobbyId);
      if (disputeId) {
        lobbyChatHistory.delete(lobbyId);
        io.to(`lobby:${lobbyId}`).emit("lobby:dispute_started", { disputeId });
      }
    } catch (err) {
      console.error("[lobby:start] startDispute failed:", err);
      socket.emit("lobby:error", { message: "Failed to start. Please try again." });
    }
  });

  socket.on("lobby:chat", async (data: { lobbyId: string; userId: string; content: string }) => {
    const { lobbyId, userId, content } = data;
    if (!content?.trim() || content.length > 500) return;

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
    if (!user) return;

    const msg: ChatMessage = {
      userId,
      username: user.username,
      content: content.trim(),
      timestamp: Date.now(),
    };

    const history = lobbyChatHistory.get(lobbyId) ?? [];
    history.push(msg);
    if (history.length > 50) history.shift();
    lobbyChatHistory.set(lobbyId, history);

    io.to(`lobby:${lobbyId}`).emit("lobby:chat_message", msg);
  });
}
