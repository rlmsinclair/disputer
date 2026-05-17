"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Match {
  id: string;
  status: string;
  forUser: { id: string; username: string } | null;
  againstUser: { id: string; username: string } | null;
  winnerUserId: string | null;
  lobbyId: string | null;
  disputeId: string | null;
}

interface Props {
  tournamentId: string;
  status: string;
  forCount: number;
  againstCount: number;
  prizePoolPence: number;
  prizeGuaranteePence: number | null;
  rounds: { id: string; roundNumber: number; matches: Match[] }[];
}

export function TournamentControls({ tournamentId, status, forCount, againstCount, prizePoolPence, prizeGuaranteePence, rounds }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [topUpGbp, setTopUpGbp] = useState("");

  async function action(path: string, method = "POST", body?: object) {
    setLoading(path);
    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}${path}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      toast.success("Done");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(null);
    }
  }

  const isLoading = (key: string) => loading === key;

  return (
    <div className="space-y-6">
      {/* Status controls */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Registration</h3>
        <div className="flex flex-wrap gap-2">
          {status === "REGISTRATION_OPEN" && (
            <Button
              size="sm"
              variant="outline"
              disabled={isLoading("/close")}
              onClick={() => action("", "PATCH", { status: "REGISTRATION_CLOSED" })}
            >
              Close Registration
            </Button>
          )}
          {(status === "REGISTRATION_CLOSED" || status === "REGISTRATION_OPEN") && (() => {
            const guaranteeShortfall = prizeGuaranteePence && prizePoolPence < prizeGuaranteePence
              ? prizeGuaranteePence - prizePoolPence
              : 0;
            const blocked = forCount === 0 || againstCount === 0 || guaranteeShortfall > 0;
            return (
              <>
                <Button
                  size="sm"
                  disabled={isLoading("/bracket") || blocked}
                  onClick={() => action("/bracket")}
                >
                  {isLoading("/bracket") ? "Generating…" : "Generate Bracket"}
                </Button>
                {guaranteeShortfall > 0 && (
                  <p className="text-xs text-amber-400">
                    Locked — need £{(guaranteeShortfall / 100).toFixed(2)} more in entry fees to meet the prize guarantee.
                  </p>
                )}
              </>
            );
          })()}
          {status === "BRACKET_GENERATED" && (
            <Button
              size="sm"
              disabled={isLoading("/bracket")}
              variant="outline"
              onClick={() => action("/bracket")}
            >
              Re-generate Bracket
            </Button>
          )}
        </div>
        {(forCount === 0 || againstCount === 0) && (
          <p className="text-xs text-amber-400">Need at least 1 player on each side to generate bracket.</p>
        )}
        {forCount !== againstCount && forCount > 0 && againstCount > 0 && (
          <p className="text-xs text-amber-400">
            Uneven sides ({forCount} For, {againstCount} Against) — {Math.abs(forCount - againstCount)} bye match(es) will be created.
          </p>
        )}
      </div>

      {/* Prize pool top-up */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Prize Pool — currently £{(prizePoolPence / 100).toFixed(2)}
        </h3>
        <div className="flex gap-2 items-end">
          <div className="flex-1 max-w-[160px]">
            <label className="text-xs text-muted-foreground mb-1 block">Add amount (£)</label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="50.00"
              value={topUpGbp}
              onChange={(e) => setTopUpGbp(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={isLoading("/prize") || !topUpGbp}
            onClick={async () => {
              const pence = Math.round(parseFloat(topUpGbp) * 100);
              if (isNaN(pence) || pence <= 0) { toast.error("Enter a valid amount"); return; }
              await action("/prize", "PATCH", { addPence: pence });
              setTopUpGbp("");
            }}
          >
            Top Up
          </Button>
        </div>
      </div>

      {/* Per-match controls */}
      {rounds.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Matches</h3>
          {rounds.map((round) => (
            <div key={round.id} className="space-y-2">
              <p className="text-xs font-semibold">
                {round.roundNumber === rounds.length ? "Final" : `Round ${round.roundNumber}`}
              </p>
              {round.matches.map((match, i) => (
                <div
                  key={match.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-secondary/20 px-3 py-2"
                >
                  <span className="text-sm text-muted-foreground">
                    Match {i + 1}:{" "}
                    <span className="text-blue-400">{match.forUser?.username ?? "TBD"}</span>
                    {" vs "}
                    <span className="text-violet-400">{match.againstUser?.username ?? "TBD"}</span>
                    {match.status === "COMPLETED" && match.winnerUserId && (
                      <span className="ml-2 text-green-400 text-xs">
                        ✓ {match.forUser?.id === match.winnerUserId ? match.forUser?.username : match.againstUser?.username} won
                      </span>
                    )}
                    {match.status === "BYE" && <span className="ml-2 text-muted-foreground text-xs">(bye)</span>}
                  </span>
                  <div className="flex gap-1.5 shrink-0">
                    {match.status === "SCHEDULED" && match.forUser && match.againstUser && !match.lobbyId && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={isLoading(`/matches/${match.id}/lobby`)}
                        onClick={() => action(`/matches/${match.id}/lobby`)}
                      >
                        Create Lobby
                      </Button>
                    )}
                    {match.lobbyId && !match.disputeId && (
                      <a
                        href={`/lobby/${match.lobbyId}`}
                        className="text-xs text-primary hover:underline"
                        target="_blank"
                      >
                        View Lobby
                      </a>
                    )}
                    {match.disputeId && (
                      <a
                        href={`/dispute/${match.disputeId}`}
                        className="text-xs text-primary hover:underline"
                        target="_blank"
                      >
                        View Debate
                      </a>
                    )}
                    {["SCHEDULED", "LOBBY_CREATED"].includes(match.status) && (match.forUser || match.againstUser) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-muted-foreground"
                        disabled={isLoading(`/matches/${match.id}/bye`)}
                        onClick={() => action(`/matches/${match.id}/bye`)}
                      >
                        Award Bye
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
