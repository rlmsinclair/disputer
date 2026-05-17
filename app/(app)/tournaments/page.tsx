import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";

export default async function TournamentsPage() {
  const tournaments = await prisma.tournament.findMany({
    where: { status: { in: ["REGISTRATION_OPEN", "BRACKET_GENERATED", "IN_PROGRESS"] } },
    orderBy: { createdAt: "desc" },
    include: {
      registrations: { where: { status: "REGISTERED" }, select: { side: true } },
    },
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <h1 className="text-2xl font-black tracking-tight">Tournaments</h1>

      {tournaments.length === 0 && (
        <p className="text-sm text-muted-foreground">No open tournaments right now.</p>
      )}

      <div className="space-y-3">
        {tournaments.map((t) => {
          const forCount = t.registrations.filter((r) => r.side === "FOR").length;
          const againstCount = t.registrations.filter((r) => r.side === "AGAINST").length;
          const prizeGbp = (t.prizePoolPence / 100).toFixed(2);

          return (
            <Link
              key={t.id}
              href={`/tournaments/${t.id}`}
              className="block rounded-xl border border-border/50 bg-card px-5 py-4 hover:border-border transition-colors space-y-2"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-bold">{t.title}</p>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {t.entryFeePence === 0 ? "Free" : `£${(t.entryFeePence / 100).toFixed(2)} entry`}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{t.topic}</p>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-blue-400">{forCount} arguing For</span>
                <span className="text-violet-400">{againstCount} arguing Against</span>
                <span className="text-muted-foreground">£{prizeGbp} prize pool</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
