import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;

  const lobbies = await prisma.lobby.findMany({
    where: {
      status: { in: ["WAITING", "IN_PROGRESS"] },
      players: { some: { userId } },
    },
    include: {
      players: {
        select: { userId: true, user: { select: { username: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ lobbies });
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;

  const lobby = await prisma.lobby.create({
    data: {
      creatorId: userId,
      players: {
        create: { userId },
      },
    },
  });

  return NextResponse.json({ lobbyId: lobby.id }, { status: 201 });
}
