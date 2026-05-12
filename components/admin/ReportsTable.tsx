"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, ExternalLink, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

type Report = {
  id: string;
  reason: string;
  status: "PENDING" | "REVIEWED" | "DISMISSED";
  adminNote: string | null;
  createdAt: string;
  reporter: { id: string; username: string };
  reportedUser: { id: string; username: string };
  dispute: { id: string; topic: string | null } | null;
};

type Filter = "ALL" | "PENDING" | "REVIEWED" | "DISMISSED";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  REVIEWED: "bg-green-500/15 text-green-400 border-green-500/20",
  DISMISSED: "bg-secondary text-muted-foreground border-border/50",
};

export function ReportsTable({ initialReports }: { initialReports: Report[] }) {
  const [reports, setReports] = useState<Report[]>(initialReports);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [reviewing, setReviewing] = useState<Report | null>(null);
  const [noteInput, setNoteInput] = useState("");
  const [loading, setLoading] = useState(false);

  const filtered = reports.filter((r) => filter === "ALL" || r.status === filter);

  async function updateReport(id: string, status: "REVIEWED" | "DISMISSED", adminNote?: string) {
    setLoading(true);
    const res = await fetch(`/api/admin/reports/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, adminNote }),
    });
    setLoading(false);
    if (!res.ok) { toast.error("Failed to update report."); return; }
    setReports((prev) =>
      prev.map((r) => r.id === id ? { ...r, status, adminNote: adminNote ?? r.adminNote } : r)
    );
    toast.success(`Report marked as ${status.toLowerCase()}.`);
    setReviewing(null);
    setNoteInput("");
  }

  const pendingCount = reports.filter((r) => r.status === "PENDING").length;

  return (
    <>
      {/* Filter tabs */}
      <div className="flex gap-1 rounded-lg border border-border/50 bg-secondary/30 p-1 w-fit">
        {(["ALL", "PENDING", "REVIEWED", "DISMISSED"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1 text-xs font-semibold capitalize transition-colors flex items-center gap-1.5 ${
              filter === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.charAt(0) + f.slice(1).toLowerCase()}
            {f === "PENDING" && pendingCount > 0 && (
              <span className="rounded-full bg-destructive text-destructive-foreground text-[10px] px-1.5 min-w-4 text-center">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No reports</p>
      ) : (
        <div className="rounded-xl border border-border/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 bg-secondary/30">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reporter</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reported</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dispute</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reason</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-secondary/20 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/profile/${r.reporter.username}`} className="hover:text-primary transition-colors font-medium">
                      {r.reporter.username}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/profile/${r.reportedUser.username}`} className="hover:text-primary transition-colors font-medium">
                      {r.reportedUser.username}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {r.dispute ? (
                      <Link
                        href={`/dispute/${r.dispute.id}`}
                        className="flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
                      >
                        <span className="truncate max-w-32">{r.dispute.topic ?? "Untitled"}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </Link>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 max-w-48">
                    <p className="truncate text-muted-foreground">{r.reason}</p>
                    {r.adminNote && (
                      <p className="text-xs text-muted-foreground/60 mt-0.5 truncate">Note: {r.adminNote}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={`text-[10px] px-2 py-0.5 ${STATUS_STYLES[r.status]}`}>
                      {r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </td>
                  <td className="px-4 py-3">
                    {r.status === "PENDING" && (
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-green-400 hover:text-green-300 hover:bg-green-500/10"
                          onClick={() => { setReviewing(r); setNoteInput(r.adminNote ?? ""); }}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                          onClick={() => updateReport(r.id, "DISMISSED")}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Review modal */}
      <Dialog open={!!reviewing} onOpenChange={(open) => !open && setReviewing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Review Report</DialogTitle>
          </DialogHeader>
          {reviewing && (
            <div className="space-y-4">
              <div className="rounded-lg bg-secondary/50 p-3 text-sm space-y-1">
                <p><span className="text-muted-foreground">Reporter:</span> {reviewing.reporter.username}</p>
                <p><span className="text-muted-foreground">Reported:</span> {reviewing.reportedUser.username}</p>
                <p><span className="text-muted-foreground">Reason:</span> {reviewing.reason}</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Admin note (optional)</Label>
                <textarea
                  rows={3}
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  placeholder="Add a note about your decision…"
                  className="w-full resize-none rounded-lg border border-border/50 bg-input/50 px-3 py-2 text-sm outline-none focus:border-primary/50 transition-colors"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setReviewing(null)}>Cancel</Button>
                <Button
                  size="sm"
                  disabled={loading}
                  onClick={() => updateReport(reviewing.id, "REVIEWED", noteInput.trim() || undefined)}
                >
                  Mark Reviewed
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
