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
          betAmount: true,
          isReady: true,
          circlePosition: true,
          topicConfirmed: true,
          timeLimitConfirmed: true,
          maxMessageTimeConfirmed: true,
          betConfirmed: true,
          proposedMessageTokenLimit: true,
          proposedTotalTokenLimit: true,
          user: { select: { username: true, tokenBalance: true } },
        },
      },
      invites: {
        where: { accepted: null },
        select: { inviteeId: true, invitee: { select: { username: true } } },
      },
      dispute: { select: { id: true } },
    },
  });

  if (!lobby) notFound();

  // Redirect to active dispute if one exists
  if (lobby.status === "IN_PROGRESS" && lobby.dispute) {
    redirect(`/dispute/${lobby.dispute.id}`);
  }

  const isPlayer = lobby.players.some((p) => p.userId === userId);
  const hasInvite = await prisma.lobbyInvite.findUnique({
    where: { lobbyId_inviteeId: { lobbyId: id, inviteeId: userId } },
  });

  if (!isPlayer && !hasInvite) {
    redirect("/lobby");
  }

  return (
    <LobbyRoom
      initialLobby={lobby}
      currentUserId={userId}
      currentUsername={session.user.name ?? ""}
      isPlayer={isPlayer}
      hasInvite={!!hasInvite}
    />
  );
}
