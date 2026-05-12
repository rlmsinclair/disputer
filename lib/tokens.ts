import { prisma } from "@/lib/prisma";

const DAILY_REWARD = 100;

export async function grantDailyReward(userId: string): Promise<void> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const existing = await prisma.dailyLoginReward.findUnique({
    where: { userId_date: { userId, date: today } },
  });
  if (existing) return;

  await prisma.$transaction([
    prisma.dailyLoginReward.create({
      data: { userId, date: today, tokens: DAILY_REWARD },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { tokenBalance: { increment: DAILY_REWARD } },
    }),
  ]);
}
