import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const dispute = await prisma.dispute.findUnique({
    where: { id },
    include: {
      players: {
        include: { user: { select: { id: true, username: true } } },
        orderBy: { circlePosition: "asc" },
      },
      messages: {
        include: { user: { select: { id: true, username: true } } },
        orderBy: { createdAt: "asc" },
      },
      result: true,
      lobby: {
        select: {
          topic: true,
          timeLimitSeconds: true,
          maxMessageTimeSeconds: true,
          messageTokenLimit: true,
          totalTokenLimit: true,
        },
      },
    },
  });

  if (!dispute) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(dispute);
}
