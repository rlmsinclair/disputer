"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSocket } from "@/hooks/useSocket";

interface MatchUser {
  id: string;
  username: string;
  elo: number;
}

interface Match {
  id: string;
  status: string;
  forUser: MatchUser | null;
  againstUser: MatchUser | null;
  winner: { id: string; username: string } | null;
  winnerUserId: string | null;
  lobbyId: string | null;
  disputeId: string | null;
}

interface Round {
  id: string;
  roundNumber: number;
  scheduledAt: Date | string;
  matches: Match[];
}

interface Props {
  tournamentId: string;
  rounds: Round[];
  currentUserId: string | null;
  totalRounds: number;
}

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Scheduled",
  LOBBY_CREATED: "Lobby Ready",
  IN_PROGRESS: "Live",
  COMPLETED: "Done",
  BYE: "Bye",
  CANCELLED: "Cancelled",
};

const STATUS_COLOUR: Record<string, string> = {
  SCHEDULED: "text-muted-foreground",
  LOBBY_CREATED: "text-amber-400",
  IN_PROGRESS: "text-green-400",
  COMPLETED: "text-blue-400",
  BYE: "text-muted-foreground/50",
  CANCELLED: "text-destructive",
};

export function BracketView({ tournamentId, rounds, currentUserId, totalRounds }: Props) {
  const router = useRouter();

  useEffect(() => {
    const s = getSocket();
    s.emit("tournament:join", { tournamentId });
    s.on("tournament:bracket_updated", () => router.refresh());
    return () => {
      s.off("tournament:bracket_updated");
    };
  }, [tournamentId, router]);

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Bracket</h2>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {rounds.map((round) => {
          const isFinal = round.roundNumber === totalRounds;
          return (
            <div key={round.id} className="flex flex-col gap-3 min-w-[220px]">
              <p className="text-xs font-semibold text-center text-muted-foreground">
                {isFinal ? "Final" : `Round ${round.roundNumber}`}
              </p>
              <div className="flex flex-col gap-2 justify-around flex-1">
                {round.matches.map((match, i) => {
                  const isMyMatch = currentUserId &&
                    (match.forUser?.id === currentUserId || match.againstUser?.id === currentUserId);

                  return (
                    <div
                      key={match.id}
                      className={`rounded-lg border px-3 py-2.5 space-y-1.5 ${
                        isMyMatch
                          ? "border-primary/40 bg-primary/5"
                          : "border-border/40 bg-card"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono text-muted-foreground">M{i + 1}</span>
                        <span className={`text-[10px] font-semibold ${STATUS_COLOUR[match.status] ?? ""}`}>
                          {STATUS_LABEL[match.status] ?? match.status}
                        </span>
                      </div>

                      {/* For player */}
                      <div className={`flex items-center gap-1.5 text-xs ${
                        match.winnerUserId === match.forUser?.id ? "text-green-400 font-semibold" : "text-blue-400"
                      }`}>
                        <span className="h-2 w-2 rounded-full bg-blue-400/40 shrink-0" />
                        <span className="truncate">{match.forUser?.username ?? "TBD"}</span>
                        {match.winnerUserId === match.forUser?.id && <span>✓</span>}
                      </div>

                      {/* Against player */}
                      <div className={`flex items-center gap-1.5 text-xs ${
                        match.winnerUserId === match.againstUser?.id ? "text-green-400 font-semibold" : "text-violet-400"
                      }`}>
                        <span className="h-2 w-2 rounded-full bg-violet-400/40 shrink-0" />
                        <span className="truncate">{match.againstUser?.username ?? "TBD"}</span>
                        {match.winnerUserId === match.againstUser?.id && <span>✓</span>}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 pt-0.5">
                        {match.status === "LOBBY_CREATED" && match.lobbyId && isMyMatch && (
                          <Link href={`/lobby/${match.lobbyId}`} className="text-[10px] text-primary hover:underline font-semibold">
                            Go to lobby →
                          </Link>
                        )}
                        {match.disputeId && (
                          <Link href={`/dispute/${match.disputeId}`} className="text-[10px] text-muted-foreground hover:underline">
                            View debate
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
