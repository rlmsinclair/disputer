import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || role !== "admin") return null;
  return session;
}

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tournaments = await prisma.tournament.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      registrations: { select: { side: true, status: true } },
      _count: { select: { rounds: true } },
    },
  });

  return NextResponse.json(tournaments);
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { title, topic, description, entryFeePence, platformCutBps, maxTypingSpeedWpm, matchTimeLimitSeconds, prizeGuaranteePence, prizeGuaranteeMinPct, registrationDeadline } = body;

  if (!title?.trim() || !topic?.trim() || !registrationDeadline) {
    return NextResponse.json({ error: "title, topic, and registrationDeadline are required" }, { status: 400 });
  }

  const tournament = await prisma.tournament.create({
    data: {
      title: title.trim(),
      topic: topic.trim(),
      description: description?.trim() || null,
      entryFeePence: entryFeePence ?? 0,
      platformCutBps: platformCutBps ?? 1000,
      maxTypingSpeedWpm: maxTypingSpeedWpm || null,
      matchTimeLimitSeconds: matchTimeLimitSeconds || null,
      prizeGuaranteePence: prizeGuaranteePence || null,
      prizeGuaranteeMinPct: prizeGuaranteeMinPct ?? 100,
      registrationDeadline: new Date(registrationDeadline),
    },
  });

  return NextResponse.json(tournament, { status: 201 });
}
