import { prisma } from "@/lib/prisma";
import { Flag, Swords, Users, Trophy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default async function AdminDashboard() {
  const [totalUsers, totalDisputes, pendingReports, recentReports] = await Promise.all([
    prisma.user.count(),
    prisma.dispute.count({ where: { status: "COMPLETED" } }),
    prisma.report.count({ where: { status: "PENDING" } }),
    prisma.report.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        reporter: { select: { username: true } },
        reportedUser: { select: { username: true } },
      },
    }),
  ]);

  const stats = [
    { label: "Total Users", value: totalUsers, icon: Users, color: "text-blue-400" },
    { label: "Completed Disputes", value: totalDisputes, icon: Swords, color: "text-violet-400" },
    { label: "Pending Reports", value: pendingReports, icon: Flag, color: "text-destructive", urgent: pendingReports > 0 },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Overview</h1>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {stats.map(({ label, value, icon: Icon, color, urgent }) => (
          <Card key={label} className={urgent ? "border-destructive/30" : ""}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className={`rounded-lg p-2.5 bg-secondary ${color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-black tabular-nums">{value.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent pending reports */}
      {recentReports.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Pending Reports
            </h2>
            <Link href="/admin/reports" className="text-xs text-primary hover:underline">
              View all →
            </Link>
          </div>
          <div className="space-y-2">
            {recentReports.map((r) => (
              <div
                key={r.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border/50 bg-card px-4 py-3"
              >
                <div className="space-y-0.5">
                  <p className="text-sm">
                    <span className="font-medium">{r.reporter.username}</span>
                    <span className="text-muted-foreground"> reported </span>
                    <span className="font-medium">{r.reportedUser.username}</span>
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-1">{r.reason}</p>
                </div>
                <Badge className="shrink-0 text-[10px] bg-amber-500/15 text-amber-400 border-amber-500/20">
                  Pending
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
