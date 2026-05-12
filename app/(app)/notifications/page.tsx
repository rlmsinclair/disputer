import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Bell, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Mark all as read
  await prisma.notification.updateMany({
    where: { userId: session.user.id, read: false },
    data: { read: true },
  });

  return (
    <div className="mx-auto max-w-xl px-4 py-10 space-y-6">
      <div className="flex items-center gap-2">
        <Bell className="h-5 w-5" />
        <h1 className="text-xl font-bold">Notifications</h1>
      </div>

      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-dashed border-border/50">
          <Bell className="h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No notifications yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const payload = n.payload as Record<string, unknown>;
            const date = new Date(n.createdAt).toLocaleDateString("en-US", {
              month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
            });

            if (n.type === "DISPUTE_RESULT") {
              const won = payload.outcome === "won";
              const eloChange = payload.eloChange as number;
              return (
                <Link key={n.id} href={`/dispute/${payload.disputeId}`}>
                  <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 hover:border-border transition-colors ${n.read ? "border-border/30 bg-card" : won ? "border-green-500/20 bg-green-500/5" : "border-destructive/20 bg-destructive/5"}`}>
                    <Trophy className={`h-4 w-4 mt-0.5 shrink-0 ${won ? "text-green-400" : "text-destructive"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        Dispute {won ? "won" : "lost"}{" "}
                        <Badge className={`text-[10px] px-1.5 py-0 font-mono ${won ? "bg-green-500/15 text-green-400 border-green-500/20" : "bg-destructive/15 text-destructive border-destructive/20"}`}>
                          {eloChange >= 0 ? `+${eloChange}` : `${eloChange}`} ELO
                        </Badge>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{date}</p>
                    </div>
                    {!n.read && <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                  </div>
                </Link>
              );
            }

            return null;
          })}
        </div>
      )}
    </div>
  );
}
