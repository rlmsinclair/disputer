import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || role !== "admin") return null;
  return session;
}

export async function GET(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const query = req.nextUrl.searchParams.get("q") ?? "";
  const page = Math.max(0, parseInt(req.nextUrl.searchParams.get("page") ?? "0"));
  const PAGE_SIZE = 30;

  const where = query
    ? { OR: [{ username: { contains: query, mode: "insensitive" as const } }, { email: { contains: query, mode: "insensitive" as const } }] }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, username: true, email: true,
        elo: true, role: true, isBanned: true, createdAt: true,
        _count: { select: { disputePlayers: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({
    users: users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
    total,
    hasMore: (page + 1) * PAGE_SIZE < total,
    nextPage: page + 1,
  });
}
