import { prisma } from "@/lib/prisma";

export async function settleDispute(
  disputeId: string,
  winnerIds: string[],
  reason: string,
  claudeResponse: string
) {
  const players = await prisma.disputePlayer.findMany({ where: { disputeId } });

  const winners = players.filter((p) => winnerIds.includes(p.userId));
  const losers = players.filter((p) => !winnerIds.includes(p.userId));

  const totalLoserBets = losers.reduce((sum, p) => sum + p.betAmount, 0);
  const perWinner = Math.floor(totalLoserBets / winners.length);
  const remainder = totalLoserBets - perWinner * winners.length;

  await prisma.$transaction(async (tx) => {
    // Record result
    await tx.disputeResult.create({
      data: { disputeId, claudeResponse, winnerIds, reason },
    });

    // Refund winners their own bets + winnings (per-winner share of loser pool)
    for (let i = 0; i < winners.length; i++) {
      const winner = winners[i];
      // Cap: winner cannot receive more than their own bet from the pool
      const cappedWinnings = Math.min(winner.betAmount, perWinner + (i === 0 ? remainder : 0));

      await tx.disputePlayer.update({
        where: { disputeId_userId: { disputeId, userId: winner.userId } },
        data: { tokensWon: cappedWinnings },
      });

      // Return their own bet + winnings
      await tx.user.update({
        where: { id: winner.userId },
        data: { tokenBalance: { increment: winner.betAmount + cappedWinnings } },
      });

      // Notify winner
      await tx.notification.create({
        data: {
          userId: winner.userId,
          type: "DISPUTE_RESULT",
          payload: { disputeId, outcome: "won", tokensWon: cappedWinnings, reason },
        },
      });
    }

    // Record losses for losers (bets already escrowed on start)
    for (const loser of losers) {
      await tx.disputePlayer.update({
        where: { disputeId_userId: { disputeId, userId: loser.userId } },
        data: { tokensLost: loser.betAmount },
      });

      await tx.notification.create({
        data: {
          userId: loser.userId,
          type: "DISPUTE_RESULT",
          payload: { disputeId, outcome: "lost", tokensLost: loser.betAmount, reason },
        },
      });
    }

    await tx.dispute.update({
      where: { id: disputeId },
      data: { status: "COMPLETED" },
    });
  });
}
