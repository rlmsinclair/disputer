"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/hooks/useSocket";

export function TournamentRefresher({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();

  useEffect(() => {
    const s = getSocket();
    s.emit("tournament:join", { tournamentId });
    s.on("tournament:bracket_updated", () => router.refresh());
    return () => { s.off("tournament:bracket_updated"); };
  }, [tournamentId, router]);

  return null;
}
