import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LobbyRoom } from "@/components/lobby/LobbyRoom";

export default async function LobbyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const userId = session.user.id;

  const lobby = await prisma.lobby.findUnique({
    where: { id },
    include: {
      players: {
        select: {
          userId: true,
          isReady: true,
          joinedAt: true,
          user: { select: { username: true, elo: true } },
        },
      },
      dispute: { select: { id: true } },
    },
  });

  if (!lobby) notFound();

  if (lobby.status === "IN_PROGRESS" && lobby.dispute) {
    redirect(`/dispute/${lobby.dispute.id}`);
  }

  const isPlayer = lobby.players.some((p) => p.userId === userId);

  return (
    <LobbyRoom
      initialLobby={{
        ...lobby,
        players: lobby.players.map((p) => ({ ...p, joinedAt: p.joinedAt.toISOString() })),
        chatHistory: [],
      }}
      currentUserId={userId}
      isPlayer={isPlayer}
    />
  );
}
