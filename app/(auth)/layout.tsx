export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="mb-10 text-center">
        <h1 className="text-5xl font-black tracking-tighter text-foreground">
          OBJECTION
        </h1>
        <p className="mt-2 text-sm font-medium tracking-widest text-muted-foreground uppercase">
          Argue &middot; Debate &middot; Win
        </p>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
