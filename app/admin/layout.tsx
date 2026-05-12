import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Flag, LayoutDashboard, Users } from "lucide-react";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || role !== "admin") redirect("/lobby");

  const pendingReports = await prisma.report.count({ where: { status: "PENDING" } });

  const navItems = [
    { href: "/admin", label: "Overview", icon: LayoutDashboard },
    { href: "/admin/reports", label: "Reports", icon: Flag, badge: pendingReports },
    { href: "/admin/users", label: "Users", icon: Users },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      {/* Admin top bar */}
      <header className="border-b border-border/50 bg-background/95 backdrop-blur sticky top-0 z-50">
        <div className="mx-auto flex h-12 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link href="/lobby" className="text-lg font-black tracking-tighter hover:text-primary transition-colors">
              OBJECTION
            </Link>
            <span className="text-muted-foreground/40">/</span>
            <span className="text-sm font-semibold text-muted-foreground">Admin</span>
          </div>
          <Badge variant="outline" className="text-xs border-primary/30 text-primary">
            {(session.user as { name?: string }).name}
          </Badge>
        </div>
      </header>

      <div className="flex flex-1 mx-auto w-full max-w-6xl">
        {/* Sidebar */}
        <aside className="w-48 shrink-0 border-r border-border/50 py-6 px-3 space-y-1">
          {navItems.map(({ href, label, icon: Icon, badge }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center justify-between gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
            >
              <span className="flex items-center gap-2.5">
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </span>
              {badge != null && badge > 0 && (
                <Badge className="h-5 min-w-5 px-1.5 text-[10px] bg-destructive text-destructive-foreground">
                  {badge}
                </Badge>
              )}
            </Link>
          ))}
        </aside>

        {/* Main content */}
        <main className="flex-1 px-6 py-6 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
