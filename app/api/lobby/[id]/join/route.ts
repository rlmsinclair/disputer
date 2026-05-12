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

  const invite = await prisma.lobbyInvite.findUnique({
    where: { lobbyId_inviteeId: { lobbyId, inviteeId: userId } },
  });
  if (!invite) return NextResponse.json({ error: "No invite found." }, { status: 403 });

  const lobby = await prisma.lobby.findUnique({ where: { id: lobbyId } });
  if (!lobby || lobby.status !== "WAITING") {
    return NextResponse.json({ error: "Lobby is not accepting players." }, { status: 400 });
  }

  const alreadyJoined = await prisma.lobbyPlayer.findUnique({
    where: { lobbyId_userId: { lobbyId, userId } },
  });
  if (alreadyJoined) return NextResponse.json({ ok: true });

  await prisma.$transaction([
    prisma.lobbyPlayer.create({ data: { lobbyId, userId } }),
    prisma.lobbyInvite.update({
      where: { lobbyId_inviteeId: { lobbyId, inviteeId: userId } },
      data: { accepted: true },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
