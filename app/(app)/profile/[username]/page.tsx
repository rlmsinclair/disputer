import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DisputeHistory } from "@/components/profile/DisputeHistory";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Swords, Trophy, TrendingDown, Calendar } from "lucide-react";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const session = await auth();
  const { username } = await params;

  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, tokenBalance: true, createdAt: true },
  });
  if (!user) notFound();

  const isOwnProfile = session?.user?.id === user.id;

  const disputes = await prisma.dispute.findMany({
    where: {
      status: "COMPLETED",
      ...(isOwnProfile ? {} : { isPrivate: false }),
      players: { some: { userId: user.id } },
    },
    include: {
      result: { select: { winnerIds: true } },
      lobby: { select: { topic: true } },
      players: {
        include: { user: { select: { id: true, username: true } } },
      },
    },
    orderBy: { startedAt: "desc" },
  });

  const disputeItems = disputes.map((d) => {
    const myPlayer = d.players.find((p) => p.userId === user.id)!;
    return {
      id: d.id,
      topic: d.lobby.topic,
      isPrivate: d.isPrivate,
      startedAt: d.startedAt.toISOString(),
      outcome: (d.result?.winnerIds.includes(user.id) ? "won" : "lost") as "won" | "lost",
      tokensWon: myPlayer.tokensWon,
      tokensLost: myPlayer.tokensLost,
      betAmount: myPlayer.betAmount,
      opponents: d.players
        .filter((p) => p.userId !== user.id)
        .map((p) => p.user.username),
    };
  });

  const wins = disputeItems.filter((d) => d.outcome === "won").length;
  const losses = disputeItems.filter((d) => d.outcome === "lost").length;
  const winRate = disputeItems.length > 0 ? Math.round((wins / disputeItems.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 space-y-8">

      {/* Header */}
      <div className="flex items-start gap-5">
        <div className="h-16 w-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-2xl font-black text-primary shrink-0">
          {user.username[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-black tracking-tight">{user.username}</h1>
            {isOwnProfile && (
              <Badge variant="outline" className="text-xs border-primary/30 text-primary">you</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            Member since {new Date(user.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Token Balance"
          value={user.tokenBalance.toLocaleString()}
          sub="tokens"
          highlight
        />
        <StatCard label="Disputes" value={disputeItems.length} sub="played" />
        <StatCard
          label="Wins"
          value={wins}
          sub={`${winRate}% win rate`}
          icon={<Trophy className="h-4 w-4 text-amber-400" />}
        />
        <StatCard
          label="Losses"
          value={losses}
          sub="disputes"
          icon={<TrendingDown className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <Separator />

      {/* Dispute history */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Swords className="h-4 w-4" />
          Dispute History
          {!isOwnProfile && (
            <span className="font-normal normal-case text-muted-foreground/60">
              (public only)
            </span>
          )}
        </h2>
        <DisputeHistory
          disputes={disputeItems}
          isOwnProfile={isOwnProfile}
          currentUserId={user.id}
        />
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  highlight,
  icon,
}: {
  label: string;
  value: string | number;
  sub: string;
  highlight?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-card px-4 py-3 space-y-0.5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </p>
      <p className={`text-xl font-black tabular-nums ${highlight ? "text-primary" : "text-foreground"}`}>
        {value}
      </p>
      <p className="text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}
