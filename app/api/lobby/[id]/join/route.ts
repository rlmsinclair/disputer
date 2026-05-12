import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const { id: lobbyId } = await params;

  const lobby = await prisma.lobby.findUnique({
    where: { id: lobbyId },
    include: { players: true },
  });

  if (!lobby || lobby.status !== "WAITING") {
    return NextResponse.json({ error: "Lobby is not accepting players." }, { status: 400 });
  }

  const alreadyJoined = lobby.players.some((p) => p.userId === userId);
  if (alreadyJoined) return NextResponse.json({ ok: true });

  if (lobby.players.length >= 2) {
    return NextResponse.json({ error: "Lobby is full." }, { status: 400 });
  }

  await prisma.lobbyPlayer.create({ data: { lobbyId, userId } });

  return NextResponse.json({ ok: true });
}
