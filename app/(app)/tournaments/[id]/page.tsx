import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { TournamentRegisterForm } from "@/components/tournament/TournamentRegisterForm";
import { BracketView } from "@/components/tournament/BracketView";
import { JUDGE_SYSTEM_PROMPT } from "@/lib/claude";

export default async function TournamentPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ registered?: string }>;
}) {
  const { id } = await params;
  const { registered } = await searchParams;

  const session = await auth();
  const userId = session?.user?.id ?? null;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      registrations: {
        where: { status: "REGISTERED" },
        include: { user: { select: { id: true, username: true, elo: true } } },
      },
      rounds: {
        orderBy: { roundNumber: "asc" },
        include: {
          matches: {
            include: {
              forUser: { select: { id: true, username: true, elo: true } },
              againstUser: { select: { id: true, username: true, elo: true } },
              winner: { select: { id: true, username: true } },
              dispute: { select: { id: true, status: true, result: { select: { reason: true } } } },
            },
            orderBy: { id: "asc" },
          },
        },
      },
    },
  });

  if (!tournament) notFound();

  const userRegistration = userId
    ? tournament.registrations.find((r) => r.userId === userId)
    : null;

  const forPlayers = tournament.registrations.filter((r) => r.side === "FOR");
  const againstPlayers = tournament.registrations.filter((r) => r.side === "AGAINST");
  const prizeNet = Math.floor(tournament.prizePoolPence * (10000 - tournament.platformCutBps) / 10000);
  const isOpen = tournament.status === "REGISTRATION_OPEN";

  const userMessageTemplate = `Topic: ${tournament.topic}${tournament.description ? `\nContext: ${tournament.description}` : ""}

Participants:
- [username1] (id: [userId1])
- [username2] (id: [userId2])

Transcript (chronological):
[debate messages in order]

Judge this dispute and return your verdict as JSON.`;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-black tracking-tight">{tournament.title}</h1>
            <p className="text-muted-foreground mt-1">{tournament.topic}</p>
            {tournament.description && (
              <p className="text-sm text-muted-foreground/70 mt-1">{tournament.description}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <Badge variant="outline" className="text-sm px-3 py-1 font-bold">
              £{(prizeNet / 100).toFixed(2)} prize pool
            </Badge>
            <span className="text-xs text-muted-foreground">split between 2 champions</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>Entry: <strong className="text-foreground">{tournament.entryFeePence === 0 ? "Free" : `£${(tournament.entryFeePence / 100).toFixed(2)}`}</strong></span>
          <span>Deadline: <strong className="text-foreground">{tournament.registrationDeadline.toLocaleDateString()}</strong></span>
          {tournament.maxTypingSpeedWpm && (
            <span className="text-amber-400">⚡ Max typing speed: <strong>{tournament.maxTypingSpeedWpm} WPM</strong> (enforced)</span>
          )}
        </div>
      </div>

      {registered && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
          You&apos;re registered! You&apos;ll be notified when your match lobby is ready.
        </div>
      )}

      {/* Registration / status */}
      {isOpen && userId && !userRegistration && (
        <TournamentRegisterForm
          tournamentId={tournament.id}
          entryFeePence={tournament.entryFeePence}
          isFree={tournament.entryFeePence === 0}
        />
      )}

      {userRegistration && (
        <div className="rounded-lg border border-border/50 bg-card px-4 py-3 text-sm">
          You&apos;re registered arguing{" "}
          <strong className={userRegistration.side === "FOR" ? "text-blue-400" : "text-violet-400"}>
            {userRegistration.side}
          </strong>
          .
        </div>
      )}

      {/* Registration counts */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 space-y-2">
          <p className="text-sm font-semibold text-blue-400">For ({forPlayers.length})</p>
          {forPlayers.map((r, i) => (
            <div key={r.userId} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-4">{i + 1}.</span>
              <span className="text-foreground">{r.user.username}</span>
              <span>{r.seedElo} ELO</span>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-3 space-y-2">
          <p className="text-sm font-semibold text-violet-400">Against ({againstPlayers.length})</p>
          {againstPlayers.map((r, i) => (
            <div key={r.userId} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-4">{i + 1}.</span>
              <span className="text-foreground">{r.user.username}</span>
              <span>{r.seedElo} ELO</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bracket */}
      {tournament.rounds.length > 0 && (
        <BracketView
          tournamentId={tournament.id}
          rounds={tournament.rounds}
          currentUserId={userId}
          totalRounds={tournament.rounds.length}
        />
      )}

      {/* How winners are decided */}
      <details className="group rounded-xl border border-border/50 bg-card">
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold flex items-center justify-between">
          How winners are decided
          <span className="text-muted-foreground text-xs group-open:hidden">▼ Show</span>
          <span className="text-muted-foreground text-xs hidden group-open:inline">▲ Hide</span>
        </summary>
        <div className="px-5 pb-5 space-y-4 text-sm">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">System Prompt (sent to Claude)</p>
            <pre className="rounded-lg bg-secondary/50 p-3 text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap leading-relaxed">
              {JUDGE_SYSTEM_PROMPT}
            </pre>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">User Message Template</p>
            <pre className="rounded-lg bg-secondary/50 p-3 text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap leading-relaxed">
              {userMessageTemplate}
            </pre>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Required Response Format</p>
            <pre className="rounded-lg bg-secondary/50 p-3 text-xs text-muted-foreground overflow-x-auto">{`{
  "winnerIds": ["userId"],
  "reason": "Explanation of why the winner(s) won."
}`}</pre>
          </div>
        </div>
      </details>
    </div>
  );
}
