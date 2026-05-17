import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || role !== "admin") return null;
  return session;
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; matchId: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { matchId } = await params;

  const match = await prisma.tournamentMatch.findUnique({
    where: { id: matchId },
    include: {
      round: { include: { tournament: { select: { id: true, topic: true } } } },
    },
  });

  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  if (!match.forUserId || !match.againstUserId) {
    return NextResponse.json({ error: "Both players must be assigned before creating a lobby" }, { status: 400 });
  }
  if (match.lobbyId) {
    return NextResponse.json({ error: "Lobby already exists for this match" }, { status: 409 });
  }

  const topic = match.round.tournament.topic;

  const lobby = await prisma.lobby.create({
    data: {
      creatorId: match.forUserId,
      topic,
      status: "WAITING",
      players: {
        create: [
          { userId: match.forUserId, isReady: true },
          { userId: match.againstUserId, isReady: true },
        ],
      },
    },
  });

  await prisma.tournamentMatch.update({
    where: { id: matchId },
    data: { lobbyId: lobby.id, status: "LOBBY_CREATED" },
  });

  // Notify both players
  await prisma.notification.createMany({
    data: [match.forUserId, match.againstUserId].map((userId) => ({
      userId,
      type: "TOURNAMENT_MATCH_STARTING" as const,
      payload: {
        tournamentId: match.round.tournament.id,
        matchId: match.id,
        lobbyId: lobby.id,
      },
    })),
  });

  // Emit socket notification to user rooms if io is available
  const io = (globalThis as unknown as { io?: { to: (room: string) => { emit: (event: string, data: unknown) => void } } }).io;
  if (io) {
    for (const userId of [match.forUserId, match.againstUserId]) {
      io.to(`user:${userId}`).emit("tournament:match_ready", { matchId: match.id, lobbyId: lobby.id });
    }
  }

  return NextResponse.json({ lobbyId: lobby.id });
}
