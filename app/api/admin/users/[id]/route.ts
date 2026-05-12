import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

async function requireAdmin() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || role !== "admin") return null;
  return session;
}

const schema = z.object({
  isBanned: z.boolean().optional(),
  tokenDelta: z.number().int().optional(),
  role: z.enum(["user", "admin"]).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // Prevent admins from banning themselves
  if (parsed.data.isBanned === true && id === session.user!.id) {
    return NextResponse.json({ error: "You cannot ban yourself." }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.isBanned !== undefined) updates.isBanned = parsed.data.isBanned;
  if (parsed.data.role !== undefined) updates.role = parsed.data.role;

  if (parsed.data.tokenDelta !== undefined) {
    const user = await prisma.user.findUnique({ where: { id }, select: { tokenBalance: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const newBalance = user.tokenBalance + parsed.data.tokenDelta;
    if (newBalance < 0) return NextResponse.json({ error: "Balance cannot go negative." }, { status: 400 });
    updates.tokenBalance = newBalance;
  }

  const user = await prisma.user.update({
    where: { id },
    data: updates,
    select: { id: true, username: true, tokenBalance: true, role: true, isBanned: true },
  });

  return NextResponse.json(user);
}
