import { prisma } from "@/lib/prisma";

export async function advanceBracket(tournamentMatchId: string, winnerId: string): Promise<void> {
  const match = await prisma.tournamentMatch.findUnique({
    where: { id: tournamentMatchId },
    include: {
      round: {
        include: {
          tournament: true,
          matches: { orderBy: { id: "asc" } },
        },
      },
    },
  });
  if (!match) return;

  const { round } = match;
  const { tournament } = round;

  // Find this match's index within its round
  const matchIndex = round.matches.findIndex((m) => m.id === match.id);
  const loserId = match.forUserId === winnerId ? match.againstUserId : match.forUserId;

  // Find the next round
  const nextRound = await prisma.tournamentRound.findUnique({
    where: {
      tournamentId_roundNumber: {
        tournamentId: tournament.id,
        roundNumber: round.roundNumber + 1,
      },
    },
    include: { matches: { orderBy: { id: "asc" } } },
  });

  if (!nextRound) {
    // This was the final round — both finalists are co-champions
    await prisma.tournament.update({
      where: { id: tournament.id },
      data: { status: "COMPLETED" },
    });

    // Notify both finalists as winners
    const finalistIds = [match.forUserId, match.againstUserId].filter(Boolean) as string[];
    await prisma.notification.createMany({
      data: finalistIds.map((userId) => ({
        userId,
        type: "TOURNAMENT_WINNER" as const,
        payload: {
          tournamentId: tournament.id,
          tournamentTitle: tournament.title,
          prizeEstimatePence: Math.floor(
            (tournament.prizePoolPence * (10000 - tournament.platformCutBps)) / 10000 / 2
          ),
        },
      })),
    });
  } else {
    // Advance winner into the next round's shell match
    const nextMatchIndex = Math.floor(matchIndex / 2);
    const nextMatch = nextRound.matches[nextMatchIndex];
    if (!nextMatch) return;

    // Winner keeps their For/Against slot
    const winnerWasFor = match.forUserId === winnerId;
    await prisma.tournamentMatch.update({
      where: { id: nextMatch.id },
      data: winnerWasFor ? { forUserId: winnerId } : { againstUserId: winnerId },
    });

    // If both slots are now filled, mark as scheduled
    const updated = await prisma.tournamentMatch.findUnique({ where: { id: nextMatch.id } });
    if (updated?.forUserId && updated?.againstUserId) {
      await prisma.tournamentMatch.update({
        where: { id: nextMatch.id },
        data: { status: "SCHEDULED" },
      });
    }
  }

  // Notify the loser they're eliminated
  if (loserId) {
    await prisma.notification.create({
      data: {
        userId: loserId,
        type: "TOURNAMENT_ELIMINATED",
        payload: {
          tournamentId: tournament.id,
          tournamentTitle: tournament.title,
          roundNumber: round.roundNumber,
        },
      },
    });
  }
}
