import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || role !== "admin") return null;
  return session;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { addPence } = await req.json();
  if (!addPence || typeof addPence !== "number" || addPence <= 0) {
    return NextResponse.json({ error: "addPence must be a positive number" }, { status: 400 });
  }

  const tournament = await prisma.tournament.update({
    where: { id },
    data: { prizePoolPence: { increment: addPence } },
    select: { id: true, prizePoolPence: true },
  });

  return NextResponse.json(tournament);
}
