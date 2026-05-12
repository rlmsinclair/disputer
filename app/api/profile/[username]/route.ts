import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const session = await auth();
  const { username } = await params;

  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, tokenBalance: true, createdAt: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const isOwnProfile = session?.user?.id === user.id;

  const disputes = await prisma.dispute.findMany({
    where: {
      status: "COMPLETED",
      ...(isOwnProfile ? {} : { isPrivate: false }),
      players: { some: { userId: user.id } },
    },
    include: {
      result: { select: { winnerIds: true } },
      lobby: { select: { topic: true } },
      players: {
        include: { user: { select: { id: true, username: true } } },
      },
    },
    orderBy: { startedAt: "desc" },
  });

  const disputeItems = disputes.map((d) => {
    const myPlayer = d.players.find((p) => p.userId === user.id)!;
    const opponents = d.players
      .filter((p) => p.userId !== user.id)
      .map((p) => ({ username: p.user.username }));
    const won = d.result?.winnerIds.includes(user.id) ?? false;

    return {
      id: d.id,
      topic: d.lobby.topic,
      isPrivate: d.isPrivate,
      startedAt: d.startedAt.toISOString(),
      endedAt: d.endedAt?.toISOString() ?? null,
      outcome: won ? "won" : "lost",
      tokensWon: myPlayer.tokensWon,
      tokensLost: myPlayer.tokensLost,
      betAmount: myPlayer.betAmount,
      opponents,
    };
  });

  const wins = disputeItems.filter((d) => d.outcome === "won").length;
  const losses = disputeItems.filter((d) => d.outcome === "lost").length;

  // Public wins (for leaderboard and display on other profiles)
  const publicWins = disputes.filter(
    (d) => !d.isPrivate && d.result?.winnerIds.includes(user.id)
  ).length;

  return NextResponse.json({
    user: { ...user, createdAt: user.createdAt.toISOString() },
    stats: { totalDisputes: disputes.length, wins, losses, publicWins },
    disputes: disputeItems,
    isOwnProfile,
  });
}
