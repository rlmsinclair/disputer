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
        include: { user: { select: { id: true, username: true, elo: true } } },
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
          maxMessageTimeSeconds: true,
          messageWordLimit: true,
          totalWordLimit: true,
        },
      },
    },
  });

  if (!dispute) notFound();

  const userId = session.user!.id!;
  const isPlayer = dispute.players.some((p) => p.userId === userId);

  const resultPayload = dispute.result
    ? {
        winnerIds: dispute.result.winnerIds,
        reason: dispute.result.reason,
        players: dispute.players.map((p) => ({
          userId: p.userId,
          username: p.user.username,
          eloChange: p.eloChange,
          newElo: p.user.elo,
        })),
      }
    : null;

  return (
    <DisputeRoom
      initialDispute={{
        id: dispute.id,
        status: dispute.status,
        wordsUsed: dispute.wordsUsed,
        isPrivate: dispute.isPrivate,
        lobby: dispute.lobby,
        players: dispute.players.map((p) => ({
          userId: p.userId,
          isActive: p.isActive,
          circlePosition: p.circlePosition,
          eloChange: p.eloChange,
          user: p.user,
        })),
        messages: dispute.messages.map((m) => ({
          id: m.id,
          userId: m.userId,
          content: m.content,
          wordCount: m.wordCount,
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
