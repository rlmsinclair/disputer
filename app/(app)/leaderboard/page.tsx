import { prisma } from "@/lib/prisma";
import { LeaderboardList } from "@/components/leaderboard/LeaderboardList";
import { Trophy } from "lucide-react";

const PAGE_SIZE = 20;

async function getTokensPage() {
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ tokenBalance: "desc" }, { username: "asc" }],
      take: PAGE_SIZE,
      select: { id: true, username: true, tokenBalance: true },
    }),
    prisma.user.count(),
  ]);
  return {
    users: users.map((u, i) => ({ rank: i + 1, userId: u.id, username: u.username, value: u.tokenBalance })),
    total,
    hasMore: PAGE_SIZE < total,
  };
}

async function getWinsPage() {
  const rows = await prisma.$queryRawUnsafe<
    { userId: string; username: string; wins: number }[]
  >(
    `SELECT dp."userId", u.username, COUNT(*)::int AS wins
     FROM "DisputePlayer" dp
     INNER JOIN "DisputeResult" dr ON dr."disputeId" = dp."disputeId"
     INNER JOIN "Dispute" d  ON d.id = dp."disputeId"
     INNER JOIN "User" u     ON u.id = dp."userId"
     WHERE d."isPrivate" = false
       AND d.status = 'COMPLETED'
       AND dp."userId" = ANY(dr."winnerIds")
     GROUP BY dp."userId", u.username
     ORDER BY wins DESC, u.username ASC
     LIMIT $1`,
    PAGE_SIZE
  );

  const totalRow = await prisma.$queryRawUnsafe<{ count: number }[]>(
    `SELECT COUNT(DISTINCT dp."userId")::int AS count
     FROM "DisputePlayer" dp
     INNER JOIN "DisputeResult" dr ON dr."disputeId" = dp."disputeId"
     INNER JOIN "Dispute" d  ON d.id = dp."disputeId"
     WHERE d."isPrivate" = false
       AND d.status = 'COMPLETED'
       AND dp."userId" = ANY(dr."winnerIds")`
  );

  const total = totalRow[0]?.count ?? 0;
  return {
    users: rows.map((r, i) => ({ rank: i + 1, userId: r.userId, username: r.username, value: r.wins })),
    total,
    hasMore: PAGE_SIZE < total,
  };
}

export default async function LeaderboardPage() {
  const [tokensData, winsData] = await Promise.all([getTokensPage(), getWinsPage()]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
          <Trophy className="h-6 w-6 text-primary" />
          Leaderboard
        </h1>
        <p className="text-sm text-muted-foreground">
          Rankings across all Dispute players
        </p>
      </div>

      <LeaderboardList
        initialTokensData={tokensData}
        initialWinsData={winsData}
      />
    </div>
  );
}
