import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 20;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const tab = searchParams.get("tab") === "wins" ? "wins" : "elo";
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0"));
  const skip = page * PAGE_SIZE;

  if (tab === "elo") {
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        orderBy: [{ elo: "desc" }, { username: "asc" }],
        skip,
        take: PAGE_SIZE,
        select: { id: true, username: true, elo: true },
      }),
      prisma.user.count(),
    ]);

    return NextResponse.json({
      users: users.map((u, i) => ({
        rank: skip + i + 1,
        userId: u.id,
        username: u.username,
        value: u.elo,
      })),
      total,
      hasMore: skip + PAGE_SIZE < total,
      nextPage: page + 1,
    });
  }

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
     LIMIT $1 OFFSET $2`,
    PAGE_SIZE,
    skip
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

  return NextResponse.json({
    users: rows.map((r, i) => ({
      rank: skip + i + 1,
      userId: r.userId,
      username: r.username,
      value: r.wins,
    })),
    total,
    hasMore: skip + PAGE_SIZE < total,
    nextPage: page + 1,
  });
}
