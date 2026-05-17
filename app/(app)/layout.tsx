import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Navbar } from "@/components/layout/Navbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [user, unreadCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { username: true, elo: true },
    }),
    prisma.notification.count({
      where: { userId: session.user.id, read: false },
    }),
  ]);

  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar
        username={user.username}
        userId={session.user.id}
        elo={user.elo ?? 1200}
        unreadNotifications={unreadCount}
      />
      <main className="flex-1">{children}</main>
    </div>
  );
}
