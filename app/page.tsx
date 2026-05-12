import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Swords, Trophy, Zap } from "lucide-react";

export default async function RootPage() {
  const session = await auth();
  if (session) redirect("/lobby");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Nav */}
      <header className="flex h-14 items-center justify-between px-6 border-b border-border/50">
        <span className="text-xl font-black tracking-tighter">DISPUTE</span>
        <div className="flex items-center gap-2">
          <Link href="/login">
            <Button variant="ghost" size="sm">Sign in</Button>
          </Link>
          <Link href="/register">
            <Button size="sm">Get started</Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center justify-center text-center px-4 gap-10">
        <div className="space-y-4 max-w-2xl">
          <h1 className="text-6xl sm:text-7xl font-black tracking-tighter leading-none">
            DISPUTE
          </h1>
          <p className="text-xl text-muted-foreground font-medium">
            Argue. Wager. Win.
          </p>
          <p className="text-muted-foreground max-w-md mx-auto">
            Challenge anyone to a real-time debate, back yourself with tokens, and let AI decide who won.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link href="/register">
            <Button size="lg" className="px-10 text-base font-bold h-12">
              Start disputing
            </Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="outline" className="px-10 text-base h-12">
              Sign in
            </Button>
          </Link>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-3 text-sm">
          {[
            { icon: Swords, label: "Real-time debates" },
            { icon: Trophy, label: "Token wagering" },
            { icon: Zap, label: "AI judging" },
          ].map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-2 rounded-full border border-border/50 bg-secondary/40 px-4 py-2 text-muted-foreground"
            >
              <Icon className="h-4 w-4 text-primary" />
              {label}
            </div>
          ))}
        </div>
      </main>

      <footer className="py-6 text-center text-xs text-muted-foreground border-t border-border/50">
        disputer.xyz
      </footer>
    </div>
  );
}
