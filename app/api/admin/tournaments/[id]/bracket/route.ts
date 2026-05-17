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

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id: tournamentId } = await params;

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      registrations: { where: { status: "REGISTERED" }, include: { user: { select: { id: true, elo: true } } } },
    },
  });
  if (!tournament) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (tournament.prizeGuaranteePence && tournament.prizePoolPence < tournament.prizeGuaranteePence) {
    const shortfall = ((tournament.prizeGuaranteePence - tournament.prizePoolPence) / 100).toFixed(2);
    return NextResponse.json({
      error: `Prize guarantee not met. Need £${shortfall} more in entry fees before the bracket can be generated.`,
    }, { status: 400 });
  }

  const forPlayers = tournament.registrations
    .filter((r) => r.side === "FOR")
    .sort((a, b) => b.seedElo - a.seedElo);
  const againstPlayers = tournament.registrations
    .filter((r) => r.side === "AGAINST")
    .sort((a, b) => b.seedElo - a.seedElo);

  if (forPlayers.length === 0 || againstPlayers.length === 0) {
    return NextResponse.json({ error: "Need at least 1 player on each side" }, { status: 400 });
  }

  const maxSide = Math.max(forPlayers.length, againstPlayers.length);
  const slots = Math.pow(2, Math.ceil(Math.log2(Math.max(maxSide, 1))));
  const roundCount = Math.log2(slots);

  // Pad each side to `slots` length with null (bye)
  const forSeeded = [...forPlayers.map((r) => r.userId), ...Array(slots - forPlayers.length).fill(null)] as (string | null)[];
  const againstSeeded = [...againstPlayers.map((r) => r.userId), ...Array(slots - againstPlayers.length).fill(null)] as (string | null)[];

  const byeMatchIds: string[] = [];

  await prisma.$transaction(async (tx) => {
    // Delete any previously generated rounds/matches
    const existingRounds = await tx.tournamentRound.findMany({ where: { tournamentId } });
    for (const round of existingRounds) {
      await tx.tournamentMatch.deleteMany({ where: { roundId: round.id } });
    }
    await tx.tournamentRound.deleteMany({ where: { tournamentId } });

    // Create rounds
    const rounds = [];
    for (let r = 1; r <= roundCount; r++) {
      const round = await tx.tournamentRound.create({
        data: {
          tournamentId,
          roundNumber: r,
          // Placeholder — admin sets per-round schedule on the detail page
          scheduledAt: new Date(Date.now() + r * 24 * 60 * 60 * 1000),
        },
      });
      rounds.push(round);
    }

    // Round 1 matches
    const round1 = rounds[0];
    const matchesPerRound = slots / 2;
    for (let i = 0; i < matchesPerRound; i++) {
      const forId = forSeeded[i];
      const againstId = againstSeeded[i];

      const isBye = !forId || !againstId;
      const winnerId = isBye ? (forId ?? againstId) : null;

      const match = await tx.tournamentMatch.create({
        data: {
          roundId: round1.id,
          forUserId: forId,
          againstUserId: againstId,
          status: isBye ? "BYE" : "SCHEDULED",
          winnerUserId: winnerId,
        },
      });

      if (isBye && winnerId) {
        byeMatchIds.push(match.id);
      }
    }

    // Shell matches for subsequent rounds
    for (let r = 1; r < rounds.length; r++) {
      const round = rounds[r];
      const matchCount = slots / Math.pow(2, r + 1);
      for (let i = 0; i < matchCount; i++) {
        await tx.tournamentMatch.create({
          data: { roundId: round.id, status: "SCHEDULED" },
        });
      }
    }

    await tx.tournament.update({
      where: { id: tournamentId },
      data: { status: "BRACKET_GENERATED" },
    });
  });

  // Advance bye matches outside the transaction (since advanceBracket does its own queries)
  for (const byeMatchId of byeMatchIds) {
    const byeMatch = await prisma.tournamentMatch.findUnique({ where: { id: byeMatchId } });
    if (byeMatch?.winnerUserId) {
      await advanceBracket(byeMatchId, byeMatch.winnerUserId);
    }
  }

  const updated = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      rounds: {
        orderBy: { roundNumber: "asc" },
        include: { matches: { orderBy: { id: "asc" } } },
      },
    },
  });

  return NextResponse.json(updated);
}
