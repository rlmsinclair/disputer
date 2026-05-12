import { prisma } from "@/lib/prisma";
import { ReportsTable } from "@/components/admin/ReportsTable";

export default async function AdminReportsPage() {
  const reports = await prisma.report.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      reporter: { select: { id: true, username: true } },
      reportedUser: { select: { id: true, username: true } },
      dispute: { select: { id: true, lobby: { select: { topic: true } } } },
    },
  });

  const serialised = reports.map((r) => ({
    id: r.id,
    reason: r.reason,
    status: r.status,
    adminNote: r.adminNote,
    createdAt: r.createdAt.toISOString(),
    reporter: r.reporter,
    reportedUser: r.reportedUser,
    dispute: r.dispute
      ? { id: r.dispute.id, topic: r.dispute.lobby.topic }
      : null,
  }));

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Reports</h1>
      <ReportsTable initialReports={serialised} />
    </div>
  );
}
