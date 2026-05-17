import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { TournamentControls } from "@/components/admin/TournamentControls";
import { ArrowLeft } from "lucide-react";

const STATUS_COLOURS: Record<string, string> = {
  REGISTRATION_OPEN: "bg-green-500/15 text-green-400 border-green-500/20",
  REGISTRATION_CLOSED: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  BRACKET_GENERATED: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  IN_PROGRESS: "bg-violet-500/15 text-violet-400 border-violet-500/20",
  COMPLETED: "bg-muted text-muted-foreground border-border",
  CANCELLED: "bg-destructive/15 text-destructive border-destructive/20",
};

export default async function TournamentAdminDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      registrations: {
        where: { status: "REGISTERED" },
        include: { user: { select: { id: true, username: true, elo: true } } },
        orderBy: { seedElo: "desc" },
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

  if (!tournament) notFound();

  const registered = tournament.registrations;
  const forPlayers = registered.filter((r) => r.side === "FOR");
  const againstPlayers = registered.filter((r) => r.side === "AGAINST");
  const prizeNet = Math.floor(tournament.prizePoolPence * (10000 - tournament.platformCutBps) / 10000);

  // Flagged messages from tournament disputes
  const flaggedMessages = await prisma.message.findMany({
    where: {
      isFlagged: true,
      dispute: {
        tournamentMatch: { round: { tournamentId: id } },
      },
    },
    include: {
      user: { select: { username: true } },
      dispute: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const controlRounds = tournament.rounds.map((r) => ({
    id: r.id,
    roundNumber: r.roundNumber,
    matches: r.matches.map((m) => ({
      id: m.id,
      status: m.status,
      forUser: m.forUser,
      againstUser: m.againstUser,
      winnerUserId: m.winnerUserId,
      lobbyId: m.lobbyId,
      disputeId: m.disputeId,
    })),
  }));

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-3">
        <Link href="/admin/tournaments" className="mt-1 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold">{tournament.title}</h1>
            <Badge className={`text-[10px] border ${STATUS_COLOURS[tournament.status] ?? ""}`}>
              {tournament.status.replace(/_/g, " ")}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{tournament.topic}</p>
          {tournament.description && (
            <p className="text-xs text-muted-foreground/70 mt-1">{tournament.description}</p>
          )}
        </div>
      </div>

      {/* Meta strip */}
      <div className="flex flex-wrap gap-4 text-sm">
        <span>
          <span className="text-muted-foreground">Entry: </span>
          <span className="font-semibold">
            {tournament.entryFeePence === 0 ? "Free" : `£${(tournament.entryFeePence / 100).toFixed(2)}`}
          </span>
        </span>
        <span>
          <span className="text-muted-foreground">Prize pool: </span>
          <span className="font-semibold">£{(tournament.prizePoolPence / 100).toFixed(2)}</span>
          <span className="text-muted-foreground ml-1">(net £{(prizeNet / 100).toFixed(2)} — split between 2 winners)</span>
        </span>
        {tournament.maxTypingSpeedWpm && (
          <span>
            <span className="text-muted-foreground">Max WPM: </span>
            <span className="font-semibold">{tournament.maxTypingSpeedWpm}</span>
          </span>
        )}
        {tournament.matchTimeLimitSeconds && (
          <span>
            <span className="text-muted-foreground">Match limit: </span>
            <span className="font-semibold">{tournament.matchTimeLimitSeconds / 60} min</span>
          </span>
        )}
        <span>
          <span className="text-muted-foreground">Deadline: </span>
          <span className="font-semibold">{tournament.registrationDeadline.toLocaleString()}</span>
        </span>
      </div>

      {/* Registrations */}
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-blue-400">For ({forPlayers.length})</h2>
          {forPlayers.length === 0 && <p className="text-xs text-muted-foreground">No registrations yet</p>}
          {forPlayers.map((r, i) => (
            <div key={r.userId} className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground text-xs w-4">{i + 1}.</span>
              <span>{r.user.username}</span>
              <span className="text-xs text-muted-foreground">{r.seedElo} ELO</span>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-violet-400">Against ({againstPlayers.length})</h2>
          {againstPlayers.length === 0 && <p className="text-xs text-muted-foreground">No registrations yet</p>}
          {againstPlayers.map((r, i) => (
            <div key={r.userId} className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground text-xs w-4">{i + 1}.</span>
              <span>{r.user.username}</span>
              <span className="text-xs text-muted-foreground">{r.seedElo} ELO</span>
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <TournamentControls
        tournamentId={tournament.id}
        status={tournament.status}
        tournamentType={tournament.type}
        forCount={forPlayers.length}
        againstCount={againstPlayers.length}
        prizePoolPence={tournament.prizePoolPence}
        prizeGuaranteePence={tournament.prizeGuaranteePence}
        prizeGuaranteeMinPct={tournament.prizeGuaranteeMinPct}
        matchTimeLimitSeconds={tournament.matchTimeLimitSeconds}
        rounds={controlRounds}
      />

      {/* Flagged messages */}
      {flaggedMessages.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Flagged Messages ({flaggedMessages.length})
          </h2>
          <div className="space-y-2">
            {flaggedMessages.map((msg) => (
              <div key={msg.id} className="flex items-start justify-between gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm">
                <div className="space-y-0.5 min-w-0">
                  <span className="font-medium text-amber-400">{msg.user.username}</span>
                  {msg.wordsPerMinute && (
                    <span className="ml-2 text-xs text-muted-foreground">{Math.round(msg.wordsPerMinute)} WPM</span>
                  )}
                  <p className="text-xs text-muted-foreground truncate">{msg.content.slice(0, 80)}…</p>
                </div>
                <Link href={`/dispute/${msg.dispute.id}`} className="text-xs text-primary hover:underline shrink-0">
                  View
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
