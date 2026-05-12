"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Eye, EyeOff, Swords, Trophy, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type DisputeItem = {
  id: string;
  topic: string | null;
  isPrivate: boolean;
  startedAt: string;
  outcome: "won" | "lost";
  tokensWon: number;
  tokensLost: number;
  betAmount: number;
  opponents: string[];
};

type Filter = "all" | "won" | "lost";

interface Props {
  disputes: DisputeItem[];
  isOwnProfile: boolean;
  currentUserId: string;
}

export function DisputeHistory({ disputes, isOwnProfile }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [privacyMap, setPrivacyMap] = useState<Record<string, boolean>>(
    Object.fromEntries(disputes.map((d) => [d.id, d.isPrivate]))
  );
  const [toggling, setToggling] = useState<string | null>(null);

  const filtered = disputes.filter((d) => filter === "all" || d.outcome === filter);

  async function togglePrivacy(disputeId: string) {
    const current = privacyMap[disputeId];
    setToggling(disputeId);
    const res = await fetch(`/api/dispute/${disputeId}/privacy`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPrivate: !current }),
    });
    setToggling(null);
    if (res.ok) {
      setPrivacyMap((prev) => ({ ...prev, [disputeId]: !current }));
      toast.success(!current ? "Dispute hidden from your profile." : "Dispute now public.");
    } else {
      toast.error("Failed to update privacy.");
    }
  }

  return (
    <div className="space-y-3">
      {/* Filter tabs */}
      <div className="flex gap-1 rounded-lg border border-border/50 bg-secondary/30 p-1 w-fit">
        {(["all", "won", "lost"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1 text-xs font-semibold capitalize transition-colors ${
              filter === f
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center rounded-xl border border-dashed border-border/50">
          <Swords className="h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No disputes yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((d) => {
            const isPrivate = privacyMap[d.id];
            const date = new Date(d.startedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            });

            return (
              <div
                key={d.id}
                className="group flex items-start gap-3 rounded-xl border border-border/50 bg-card px-4 py-3 hover:border-border transition-colors"
              >
                {/* Outcome icon */}
                <div className={`mt-0.5 shrink-0 rounded-full p-1.5 ${d.outcome === "won" ? "bg-green-500/10" : "bg-destructive/10"}`}>
                  {d.outcome === "won"
                    ? <Trophy className="h-3.5 w-3.5 text-green-400" />
                    : <TrendingDown className="h-3.5 w-3.5 text-destructive" />}
                </div>

                {/* Main content */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <Link
                      href={`/dispute/${d.id}`}
                      className="font-semibold text-sm hover:text-primary transition-colors line-clamp-1"
                    >
                      {d.topic ?? <span className="italic text-muted-foreground font-normal">Untitled dispute</span>}
                    </Link>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        className={`text-[10px] px-1.5 py-0 ${
                          d.outcome === "won"
                            ? "bg-green-500/15 text-green-400 border-green-500/20"
                            : "bg-destructive/15 text-destructive border-destructive/20"
                        }`}
                      >
                        {d.outcome === "won" ? `+${d.tokensWon}` : `-${d.tokensLost}`} tokens
                      </Badge>
                      {isPrivate && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                          Private
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">
                      vs {d.opponents.length > 0 ? d.opponents.join(", ") : "unknown"}
                    </span>
                    <span className="text-muted-foreground/40 text-xs">·</span>
                    <span className="text-xs text-muted-foreground">{date}</span>
                    <span className="text-muted-foreground/40 text-xs">·</span>
                    <span className="text-xs text-muted-foreground">Bet: {d.betAmount}</span>
                  </div>
                </div>

                {/* Privacy toggle (own profile only) */}
                {isOwnProfile && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    disabled={toggling === d.id}
                    onClick={() => togglePrivacy(d.id)}
                    title={isPrivate ? "Make public" : "Make private"}
                  >
                    {isPrivate
                      ? <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                      : <Eye className="h-3.5 w-3.5 text-muted-foreground" />}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
