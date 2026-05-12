import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { isPrivate } = await req.json();

  const dispute = await prisma.dispute.findUnique({
    where: { id },
    include: { players: { select: { userId: true } } },
  });
  if (!dispute) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isPlayer = dispute.players.some((p) => p.userId === session.user!.id);
  if (!isPlayer) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.dispute.update({ where: { id }, data: { isPrivate } });
  return NextResponse.json({ ok: true });
}
