import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { advanceBracket } from "@/lib/tournament";

async function requireAdmin() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || role !== "admin") return null;
  return session;
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; matchId: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { matchId } = await params;

  const match = await prisma.tournamentMatch.findUnique({ where: { id: matchId } });
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  if (match.status === "COMPLETED" || match.status === "BYE") {
    return NextResponse.json({ error: "Match is already resolved" }, { status: 409 });
  }

  const winnerId = match.forUserId ?? match.againstUserId;
  if (!winnerId) return NextResponse.json({ error: "No players assigned to this match" }, { status: 400 });

  await prisma.tournamentMatch.update({
    where: { id: matchId },
    data: { status: "BYE", winnerUserId: winnerId },
  });

  await advanceBracket(matchId, winnerId);

  return NextResponse.json({ winnerId });
}
