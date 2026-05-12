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

  const status = req.nextUrl.searchParams.get("status") ?? undefined;

  const reports = await prisma.report.findMany({
    where: status ? { status: status as "PENDING" | "REVIEWED" | "DISMISSED" } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      reporter: { select: { id: true, username: true } },
      reportedUser: { select: { id: true, username: true } },
      dispute: { select: { id: true, lobby: { select: { topic: true } } } },
    },
  });

  return NextResponse.json(reports);
}
