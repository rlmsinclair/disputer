import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DisputeRoom } from "@/components/dispute/DisputeRoom";

export default async function DisputePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

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
      result: {
        include: { dispute: { include: { players: { include: { user: { select: { username: true } } } } } } },
      },
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

  if (!dispute) notFound();

  const userId = session.user!.id!;
  const isPlayer = dispute.players.some((p) => p.userId === userId);

  // Build result payload if dispute is complete
  const resultPayload = dispute.result
    ? {
        winnerIds: dispute.result.winnerIds,
        reason: dispute.result.reason,
        players: dispute.players.map((p) => ({
          userId: p.userId,
          username: p.user.username,
          tokensWon: p.tokensWon,
          tokensLost: p.tokensLost,
          betAmount: p.betAmount,
        })),
      }
    : null;

  return (
    <DisputeRoom
      initialDispute={{
        id: dispute.id,
        status: dispute.status,
        tokensUsed: dispute.tokensUsed,
        isPrivate: dispute.isPrivate,
        lobby: dispute.lobby,
        players: dispute.players.map((p) => ({
          userId: p.userId,
          isActive: p.isActive,
          circlePosition: p.circlePosition,
          betAmount: p.betAmount,
          tokensWon: p.tokensWon,
          tokensLost: p.tokensLost,
          user: p.user,
        })),
        messages: dispute.messages.map((m) => ({
          id: m.id,
          userId: m.userId,
          content: m.content,
          tokenCount: m.tokenCount,
          turnNumber: m.turnNumber,
          createdAt: m.createdAt.toISOString(),
          user: m.user,
        })),
      }}
      initialResult={resultPayload}
      currentUserId={userId}
      currentUsername={session.user?.name ?? ""}
      isPlayer={isPlayer}
    />
  );
}
