"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Ban, Check, Loader2, Search, ShieldCheck, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AdminUser = {
  id: string;
  username: string;
  email: string;
  elo: number;
  role: string;
  isBanned: boolean;
  createdAt: string;
  _count: { disputePlayers: number };
};

interface Props {
  initialUsers: AdminUser[];
  initialTotal: number;
}

export function UsersTable({ initialUsers, initialTotal }: Props) {
  const [users, setUsers] = useState<AdminUser[]>(initialUsers);
  const [total, setTotal] = useState(initialTotal);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  // inline token edit state
  const [editingTokens, setEditingTokens] = useState<string | null>(null);
  const [eloDeltaInput, setTokenDeltaInput] = useState("");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    const res = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}`);
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users);
      setTotal(data.total);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  async function patchUser(id: string, data: object) {
    setLoadingId(id);
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setLoadingId(null);
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error ?? "Failed to update user.");
      return null;
    }
    return await res.json();
  }

  async function toggleBan(user: AdminUser) {
    const updated = await patchUser(user.id, { isBanned: !user.isBanned });
    if (!updated) return;
    setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, isBanned: updated.isBanned } : u));
    toast.success(updated.isBanned ? `${user.username} banned.` : `${user.username} unbanned.`);
  }

  async function toggleRole(user: AdminUser) {
    const newRole = user.role === "admin" ? "user" : "admin";
    const updated = await patchUser(user.id, { role: newRole });
    if (!updated) return;
    setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, role: updated.role } : u));
    toast.success(`${user.username} is now ${updated.role}.`);
  }

  async function adjustTokens(user: AdminUser) {
    const delta = parseInt(eloDeltaInput);
    if (isNaN(delta) || delta === 0) {
      toast.error("Enter a non-zero number.");
      return;
    }
    const updated = await patchUser(user.id, { eloDelta: delta });
    if (!updated) return;
    setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, elo: updated.elo } : u));
    toast.success(`Tokens adjusted. New balance: ${updated.elo}`);
    setEditingTokens(null);
    setTokenDeltaInput("");
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9 h-9 bg-input/50"
          placeholder="Search username or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      <p className="text-xs text-muted-foreground">{total.toLocaleString()} users total</p>

      <div className="rounded-xl border border-border/50 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50 bg-secondary/30">
              {["Username", "Email", "ELO", "Disputes", "Role", "Status", "Joined", "Actions"].map((h) => (
                <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {users.map((u) => (
              <tr key={u.id} className={`hover:bg-secondary/20 transition-colors ${u.isBanned ? "opacity-50" : ""}`}>
                <td className="px-4 py-3 font-medium">
                  <Link href={`/profile/${u.username}`} className="hover:text-primary transition-colors">
                    {u.username}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{u.email}</td>

                {/* Tokens — inline editable */}
                <td className="px-4 py-3">
                  {editingTokens === u.id ? (
                    <div className="flex items-center gap-1">
                      <Input
                        className="h-7 w-20 text-xs px-2 bg-input/50"
                        placeholder="+/-"
                        value={eloDeltaInput}
                        onChange={(e) => setTokenDeltaInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") adjustTokens(u); if (e.key === "Escape") setEditingTokens(null); }}
                        autoFocus
                      />
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-400" onClick={() => adjustTokens(u)}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => setEditingTokens(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <button
                      className="tabular-nums hover:text-primary transition-colors"
                      onClick={() => { setEditingTokens(u.id); setTokenDeltaInput(""); }}
                      title="Click to adjust"
                    >
                      {u.elo.toLocaleString()}
                    </button>
                  )}
                </td>

                <td className="px-4 py-3 text-muted-foreground tabular-nums">{u._count.disputePlayers}</td>

                <td className="px-4 py-3">
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 cursor-pointer hover:opacity-80 ${u.role === "admin" ? "border-primary/30 text-primary" : ""}`}
                    onClick={() => toggleRole(u)}
                    title="Click to toggle role"
                  >
                    {u.role}
                  </Badge>
                </td>

                <td className="px-4 py-3">
                  {u.isBanned ? (
                    <Badge className="text-[10px] px-1.5 py-0 bg-destructive/15 text-destructive border-destructive/20">
                      Banned
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-green-400 border-green-500/20">
                      Active
                    </Badge>
                  )}
                </td>

                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(u.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </td>

                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className={`h-7 px-2 ${u.isBanned ? "text-green-400 hover:bg-green-500/10" : "text-destructive/70 hover:text-destructive hover:bg-destructive/10"}`}
                      disabled={loadingId === u.id}
                      onClick={() => toggleBan(u)}
                      title={u.isBanned ? "Unban user" : "Ban user"}
                    >
                      {loadingId === u.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : u.isBanned
                        ? <ShieldCheck className="h-3.5 w-3.5" />
                        : <Ban className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
