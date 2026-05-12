import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: lobbyId } = await params;
  const { username } = await req.json();

  const invitee = await prisma.user.findUnique({ where: { username } });
  if (!invitee) return NextResponse.json({ error: "User not found." }, { status: 404 });
  if (invitee.id === session.user.id) {
    return NextResponse.json({ error: "You cannot invite yourself." }, { status: 400 });
  }

  const alreadyPlayer = await prisma.lobbyPlayer.findUnique({
    where: { lobbyId_userId: { lobbyId, userId: invitee.id } },
  });
  if (alreadyPlayer) {
    return NextResponse.json({ error: "That user is already in the lobby." }, { status: 400 });
  }

  const existing = await prisma.lobbyInvite.findUnique({
    where: { lobbyId_inviteeId: { lobbyId, inviteeId: invitee.id } },
  });
  if (existing) {
    return NextResponse.json({ error: "Invite already sent." }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.lobbyInvite.create({
      data: { lobbyId, inviterId: session.user.id, inviteeId: invitee.id },
    }),
    prisma.notification.create({
      data: {
        userId: invitee.id,
        type: "INVITE",
        payload: { lobbyId, inviterUsername: session.user.name },
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
