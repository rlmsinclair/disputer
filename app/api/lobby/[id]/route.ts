import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const lobby = await prisma.lobby.findUnique({
    where: { id },
    include: {
      players: {
        select: {
          userId: true,
          joinedAt: true,
          user: { select: { username: true, elo: true } },
        },
      },
      dispute: { select: { id: true } },
    },
  });

  if (!lobby) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(lobby);
}
