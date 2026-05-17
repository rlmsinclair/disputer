"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Bell, LogOut, Trophy, User } from "lucide-react";
import { getSocket } from "@/hooks/useSocket";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavbarProps {
  username: string;
  userId: string;
  elo: number;
  unreadNotifications: number;
}

export function Navbar({ username, userId, elo = 1200, unreadNotifications = 0 }: NavbarProps) {
  const router = useRouter();

  useEffect(() => {
    getSocket().emit("user:join", { userId });
  }, [userId]);

  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link
          href="/lobby"
          className="text-xl font-black tracking-tighter text-foreground hover:text-primary transition-colors"
        >
          OBJECTION
        </Link>

        <div className="flex items-center gap-3">
          <span className="hidden sm:flex items-center gap-1.5 rounded-full border border-border/50 bg-secondary px-3 py-1 text-sm font-semibold tabular-nums">
            <span className="text-primary">{elo ?? 1200}</span>
            <span className="text-muted-foreground">ELO</span>
          </span>

          <Link href="/tournaments">
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Tournaments">
              <Trophy className="h-4 w-4" />
            </Button>
          </Link>

          <Link href="/notifications" className="relative">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Bell className="h-4 w-4" />
              {unreadNotifications > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {unreadNotifications > 9 ? "9+" : unreadNotifications}
                </span>
              )}
            </Button>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
              <User className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => router.push(`/profile/${username}`)}>
                <User className="mr-2 h-4 w-4" />
                {username}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => signOut({ callbackUrl: "/login" })}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
