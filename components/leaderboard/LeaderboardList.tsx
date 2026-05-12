"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { Loader2, Medal, Trophy } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type LeaderboardUser = {
  rank: number;
  userId: string;
  username: string;
  value: number;
};

type PageData = {
  users: LeaderboardUser[];
  total: number;
  hasMore: boolean;
};

interface Props {
  initialTokensData: PageData;
  initialWinsData: PageData;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Trophy className="h-4 w-4 text-amber-400" />;
  if (rank === 2) return <Medal className="h-4 w-4 text-slate-400" />;
  if (rank === 3) return <Medal className="h-4 w-4 text-amber-700" />;
  return (
    <span className="text-sm font-mono text-muted-foreground tabular-nums w-4 text-center">
      {rank}
    </span>
  );
}

function LeaderboardTab({
  tab,
  initial,
  valueLabel,
  valueSuffix,
}: {
  tab: "tokens" | "wins";
  initial: PageData;
  valueLabel: string;
  valueSuffix: string;
}) {
  const [users, setUsers] = useState<LeaderboardUser[]>(initial.users);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [nextPage, setNextPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    const res = await fetch(`/api/leaderboard?tab=${tab}&page=${nextPage}`);
    if (res.ok) {
      const data = await res.json();
      setUsers((prev) => [...prev, ...data.users]);
      setHasMore(data.hasMore);
      setNextPage((p) => p + 1);
    }
    setLoading(false);
  }, [loading, hasMore, tab, nextPage]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { rootMargin: "200px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  return (
    <div className="space-y-1">
      {/* Column headers */}
      <div className="flex items-center gap-3 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="w-6 text-center">Rank</span>
        <span className="flex-1">Player</span>
        <span>{valueLabel}</span>
      </div>

      {users.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
          No data yet
        </div>
      ) : (
        users.map((u, i) => {
          const isTop3 = u.rank <= 3;
          return (
            <Link key={u.userId} href={`/profile/${u.username}`}>
              <div
                className={`flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-secondary/50 ${
                  isTop3 ? "border border-border/30 bg-secondary/20" : ""
                }`}
              >
                {/* Rank */}
                <div className="w-6 flex justify-center shrink-0">
                  <RankBadge rank={u.rank} />
                </div>

                {/* Avatar + username */}
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <div
                    className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold border shrink-0 ${
                      u.rank === 1
                        ? "bg-amber-400/10 border-amber-400/30 text-amber-400"
                        : u.rank === 2
                        ? "bg-slate-400/10 border-slate-400/30 text-slate-400"
                        : u.rank === 3
                        ? "bg-amber-700/10 border-amber-700/30 text-amber-700"
                        : "bg-secondary border-border/40 text-muted-foreground"
                    }`}
                  >
                    {u.username[0].toUpperCase()}
                  </div>
                  <span className={`font-semibold truncate ${isTop3 ? "text-foreground" : "text-foreground/80"}`}>
                    {u.username}
                  </span>
                </div>

                {/* Value */}
                <span className={`font-mono font-bold tabular-nums shrink-0 ${isTop3 ? "text-primary" : "text-muted-foreground"}`}>
                  {u.value.toLocaleString()}
                  <span className="text-[10px] font-normal ml-1 text-muted-foreground">
                    {valueSuffix}
                  </span>
                </span>
              </div>
            </Link>
          );
        })
      )}

      {/* Sentinel for infinite scroll */}
      <div ref={sentinelRef} className="h-4" />

      {loading && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

export function LeaderboardList({ initialTokensData, initialWinsData }: Props) {
  return (
    <Tabs defaultValue="tokens">
      <TabsList className="grid w-full max-w-xs grid-cols-2 mb-6">
        <TabsTrigger value="tokens">By Tokens</TabsTrigger>
        <TabsTrigger value="wins">By Wins</TabsTrigger>
      </TabsList>

      <TabsContent value="tokens">
        <LeaderboardTab
          tab="tokens"
          initial={initialTokensData}
          valueLabel="Tokens"
          valueSuffix="tok"
        />
      </TabsContent>

      <TabsContent value="wins">
        <LeaderboardTab
          tab="wins"
          initial={initialWinsData}
          valueLabel="Public wins"
          valueSuffix="wins"
        />
      </TabsContent>
    </Tabs>
  );
}
