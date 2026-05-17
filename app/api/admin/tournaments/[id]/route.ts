import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || role !== "admin") return null;
  return session;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      registrations: {
        where: { status: "REGISTERED" },
        include: { user: { select: { id: true, username: true, elo: true } } },
        orderBy: { registeredAt: "asc" },
      },
      rounds: {
        orderBy: { roundNumber: "asc" },
        include: {
          matches: {
            include: {
              forUser: { select: { id: true, username: true, elo: true } },
              againstUser: { select: { id: true, username: true, elo: true } },
              winner: { select: { id: true, username: true } },
              dispute: { select: { id: true, status: true } },
            },
            orderBy: { id: "asc" },
          },
        },
      },
    },
  });

  if (!tournament) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(tournament);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json();
  const allowed = ["status", "title", "topic", "description", "maxTypingSpeedWpm", "matchTimeLimitSeconds", "startsAt", "registrationDeadline", "entryFeePence", "platformCutBps", "customSystemPrompt", "claudeModel", "claudeMaxTokens", "claudeTemperature"];
  const data: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) data[key] = body[key];
  }

  if (data.registrationDeadline) data.registrationDeadline = new Date(data.registrationDeadline as string);

  const tournament = await prisma.tournament.update({ where: { id }, data });
  return NextResponse.json(tournament);
}
