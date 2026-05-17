"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface Props {
  tournamentId: string;
  entryFeePence: number;
  isFree: boolean;
  isOpenQuestion?: boolean;
}

export function TournamentRegisterForm({ tournamentId, entryFeePence, isFree, isOpenQuestion }: Props) {
  const [side, setSide] = useState<"FOR" | "AGAINST" | null>(null);
  const [loading, setLoading] = useState(false);

  async function register() {
    if (!isOpenQuestion && !side) { toast.error("Choose a side first"); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side: isOpenQuestion ? null : side }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        toast.success("Registered!");
        window.location.reload();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-border/50 bg-card p-5">
      <p className="text-sm font-semibold">Register for this tournament</p>

      {!isOpenQuestion && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {(["FOR", "AGAINST"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSide(s)}
                className={`rounded-lg border px-4 py-3 text-sm font-semibold transition-colors ${
                  side === s
                    ? s === "FOR"
                      ? "border-blue-500/50 bg-blue-500/10 text-blue-400"
                      : "border-violet-500/50 bg-violet-500/10 text-violet-400"
                    : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                {s === "FOR" ? "👍 For" : "👎 Against"}
              </button>
            ))}
          </div>
          {side && (
            <p className="text-xs text-muted-foreground">
              You will argue <strong className={side === "FOR" ? "text-blue-400" : "text-violet-400"}>{side}</strong> the motion throughout the tournament.
            </p>
          )}
        </>
      )}

      <Button
        className="w-full"
        disabled={(!isOpenQuestion && !side) || loading}
        onClick={register}
      >
        {loading
          ? "Processing…"
          : isFree
          ? "Register (Free)"
          : `Register & Pay £${(entryFeePence / 100).toFixed(2)}`}
      </Button>
    </div>
  );
}
