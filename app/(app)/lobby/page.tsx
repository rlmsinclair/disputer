import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateLobbyButton } from "@/components/lobby/CreateLobbyButton";
import { Users, Swords } from "lucide-react";

export default async function LobbyDashboard() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const lobbies = await prisma.lobby.findMany({
    where: {
      status: { in: ["WAITING", "IN_PROGRESS"] },
      players: { some: { userId } },
    },
    include: {
      players: { select: { userId: true, user: { select: { username: true } } } },
      dispute: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Lobbies</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Create a lobby, share the link, and start debating</p>
        </div>
        <CreateLobbyButton />
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Your Lobbies
        </h3>
        {lobbies.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-14 text-center">
              <Swords className="h-10 w-10 text-muted-foreground/40 mb-4" />
              <p className="font-medium text-muted-foreground">No active lobbies</p>
              <p className="text-sm text-muted-foreground/60 mt-1">
                Create one and share the link to challenge someone
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {lobbies.map((lobby) => {
              const isInProgress = lobby.status === "IN_PROGRESS";
              const href = isInProgress && lobby.dispute
                ? `/dispute/${lobby.dispute.id}`
                : `/lobby/${lobby.id}`;

              return (
                <Link key={lobby.id} href={href}>
                  <Card className="hover:border-primary/40 hover:bg-card/80 transition-colors cursor-pointer h-full">
                    <CardHeader className="pb-2 pt-4 px-5">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base font-semibold leading-tight line-clamp-2">
                          {lobby.topic ?? (
                            <span className="text-muted-foreground italic font-normal">
                              Topic not set
                            </span>
                          )}
                        </CardTitle>
                        <Badge
                          variant={isInProgress ? "default" : "secondary"}
                          className="shrink-0 text-xs"
                        >
                          {isInProgress ? "Live" : "Waiting"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pb-4 px-5">
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {lobby.players.length} / 2
                        </span>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="truncate">
                          {lobby.players.map((p) => p.user.username).join(" vs ")}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
