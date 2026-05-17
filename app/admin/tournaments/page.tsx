import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

const STATUS_COLOURS: Record<string, string> = {
  REGISTRATION_OPEN: "bg-green-500/15 text-green-400 border-green-500/20",
  REGISTRATION_CLOSED: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  BRACKET_GENERATED: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  IN_PROGRESS: "bg-violet-500/15 text-violet-400 border-violet-500/20",
  COMPLETED: "bg-muted text-muted-foreground border-border",
  CANCELLED: "bg-destructive/15 text-destructive border-destructive/20",
};

export default async function TournamentsAdminPage() {
  const tournaments = await prisma.tournament.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      registrations: { select: { side: true, status: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Tournaments</h1>
        <Link href="/admin/tournaments/new">
          <Button size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            New Tournament
          </Button>
        </Link>
      </div>

      {tournaments.length === 0 && (
        <p className="text-sm text-muted-foreground">No tournaments yet.</p>
      )}

      <div className="space-y-3">
        {tournaments.map((t) => {
          const registered = t.registrations.filter((r) => r.status === "REGISTERED");
          const forCount = registered.filter((r) => r.side === "FOR").length;
          const againstCount = registered.filter((r) => r.side === "AGAINST").length;
          const prizeGbp = (t.prizePoolPence / 100).toFixed(2);

          return (
            <Link
              key={t.id}
              href={`/admin/tournaments/${t.id}`}
              className="flex items-start justify-between gap-4 rounded-lg border border-border/50 bg-card px-4 py-3 hover:border-border transition-colors"
            >
              <div className="space-y-1 min-w-0">
                <p className="font-semibold truncate">{t.title}</p>
                <p className="text-xs text-muted-foreground truncate">{t.topic}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="text-blue-400">{forCount} For</span>
                  <span className="text-violet-400">{againstCount} Against</span>
                  <span>£{prizeGbp} pool</span>
                  {t.entryFeePence === 0 && <span className="text-green-400">Free</span>}
                </div>
              </div>
              <Badge className={`shrink-0 text-[10px] border ${STATUS_COLOURS[t.status] ?? ""}`}>
                {t.status.replace(/_/g, " ")}
              </Badge>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
