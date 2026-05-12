import { prisma } from "@/lib/prisma";
import { UsersTable } from "@/components/admin/UsersTable";

export default async function AdminUsersPage() {
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true, username: true, email: true,
        tokenBalance: true, role: true, isBanned: true, createdAt: true,
        _count: { select: { disputePlayers: true } },
      },
    }),
    prisma.user.count(),
  ]);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Users</h1>
      <UsersTable
        initialUsers={users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }))}
        initialTotal={total}
      />
    </div>
  );
}
