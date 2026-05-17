"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateTournamentForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    topic: "",
    description: "",
    entryFeePence: 0,
    prizeGuaranteePence: "",
    prizeGuaranteeMinPct: 100,
    platformCutBps: 1000,
    maxTypingSpeedWpm: "",
    matchTimeLimitMinutes: "",
    registrationDeadline: "",
    customSystemPrompt: "",
    claudeModel: "claude-sonnet-4-6",
    claudeMaxTokens: 1024,
    claudeTemperature: "",
  });

  function set(field: string, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/admin/tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          maxTypingSpeedWpm: form.maxTypingSpeedWpm ? parseInt(form.maxTypingSpeedWpm) : null,
          matchTimeLimitSeconds: form.matchTimeLimitMinutes ? parseInt(form.matchTimeLimitMinutes) * 60 : null,
          customSystemPrompt: form.customSystemPrompt.trim() || null,
          claudeModel: form.claudeModel || null,
          claudeMaxTokens: form.claudeMaxTokens || null,
          claudeTemperature: form.claudeTemperature !== "" ? parseFloat(form.claudeTemperature) : null,
          entryFeePence: Math.round(form.entryFeePence * 100),
          prizeGuaranteePence: form.prizeGuaranteePence ? Math.round(parseFloat(form.prizeGuaranteePence) * 100) : null,
          prizeGuaranteeMinPct: form.prizeGuaranteeMinPct,
        }),
      });
      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error);
      }
      const tournament = await res.json();
      toast.success("Tournament created");
      router.push(`/admin/tournaments/${tournament.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create tournament");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 max-w-lg">
      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          placeholder="Summer 2026 Debate Championship"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="topic">Debate Motion</Label>
        <Input
          id="topic"
          placeholder="This house believes social media does more harm than good"
          value={form.topic}
          onChange={(e) => set("topic", e.target.value)}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">
          Additional Context for AI Judge{" "}
          <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <textarea
          id="description"
          rows={3}
          placeholder="Provide extra context that will help Claude judge arguments more accurately…"
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="entryFee">Entry Fee (£)</Label>
          <Input
            id="entryFee"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={form.entryFeePence === 0 ? "" : form.entryFeePence}
            onChange={(e) => set("entryFeePence", parseFloat(e.target.value) || 0)}
          />
          <p className="text-[11px] text-muted-foreground">Set to 0 for a free tournament</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="prizeGuarantee">
            Guaranteed Prize (£){" "}
            <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input
            id="prizeGuarantee"
            type="number"
            min="0"
            step="0.01"
            placeholder="e.g. 100.00"
            value={form.prizeGuaranteePence}
            onChange={(e) => set("prizeGuaranteePence", e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">Bracket locked until entry fees reach this amount</p>
        </div>
      </div>

      {form.prizeGuaranteePence && (
        <div className="space-y-1.5">
          <Label htmlFor="minPct">Minimum % of guarantee to unlock bracket</Label>
          <Input
            id="minPct"
            type="number"
            min="0"
            max="100"
            step="5"
            value={form.prizeGuaranteeMinPct}
            onChange={(e) => set("prizeGuaranteeMinPct", parseInt(e.target.value) ?? 100)}
          />
          <p className="text-[11px] text-muted-foreground">
            0% = start any time regardless of entries · 50% = start when half is covered · 100% = fully funded (default)
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="platformCut">Platform Cut (basis points)</Label>
        <Input
          id="platformCut"
          type="number"
          min="0"
          max="10000"
          step="100"
          value={form.platformCutBps}
          onChange={(e) => set("platformCutBps", parseInt(e.target.value) || 0)}
        />
        <p className="text-[11px] text-muted-foreground">1000 = 10%</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="maxWpm">
          Max Typing Speed (WPM){" "}
          <span className="text-muted-foreground font-normal">(optional — leave blank for no limit)</span>
        </Label>
        <Input
          id="maxWpm"
          type="number"
          min="1"
          placeholder="e.g. 80"
          value={form.maxTypingSpeedWpm}
          onChange={(e) => set("maxTypingSpeedWpm", e.target.value)}
        />
        <p className="text-[11px] text-muted-foreground">
          Messages exceeding this speed will be rejected. Shown to players on the tournament page.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="matchTimeLimit">
          Match Time Limit (minutes){" "}
          <span className="text-muted-foreground font-normal">(optional — leave blank for no limit)</span>
        </Label>
        <Input
          id="matchTimeLimit"
          type="number"
          min="1"
          placeholder="e.g. 10"
          value={form.matchTimeLimitMinutes}
          onChange={(e) => set("matchTimeLimitMinutes", e.target.value)}
        />
        <p className="text-[11px] text-muted-foreground">
          Match ends automatically when the clock hits zero. Players see a live countdown.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="deadline">Registration Deadline</Label>
        <Input
          id="deadline"
          type="datetime-local"
          value={form.registrationDeadline}
          onChange={(e) => set("registrationDeadline", e.target.value)}
          required
        />
      </div>

      {/* Claude API settings */}
      <div className="space-y-4 rounded-lg border border-border/50 bg-secondary/20 p-4">
        <p className="text-sm font-semibold">Judge Settings (Claude API)</p>

        <div className="space-y-1.5">
          <Label htmlFor="customPrompt">
            Custom System Prompt{" "}
            <span className="text-muted-foreground font-normal">(optional — leave blank to use the default)</span>
          </Label>
          <textarea
            id="customPrompt"
            rows={8}
            placeholder={`Leave blank to use the default prompt, or write your own.\n\nIMPORTANT: your prompt must instruct Claude to respond with valid JSON in this exact format:\n{\n  "winnerIds": ["userId"],\n  "reason": "explanation"\n}`}
            value={form.customSystemPrompt}
            onChange={(e) => set("customSystemPrompt", e.target.value)}
            className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <p className="text-[11px] text-muted-foreground">
            Use this to change judging criteria entirely — e.g. for open-ended questions, creative challenges, or custom scoring rules.
            Must still output <code className="font-mono">{"{ winnerIds, reason }"}</code>.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="claudeModel">Model</Label>
            <select
              id="claudeModel"
              value={form.claudeModel}
              onChange={(e) => set("claudeModel", e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="claude-sonnet-4-6">Sonnet 4.6 (default)</option>
              <option value="claude-opus-4-7">Opus 4.7 (best, slower)</option>
              <option value="claude-haiku-4-5-20251001">Haiku 4.5 (fastest)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="claudeMaxTokens">Max Tokens</Label>
            <Input
              id="claudeMaxTokens"
              type="number"
              min="256"
              max="8192"
              step="256"
              value={form.claudeMaxTokens}
              onChange={(e) => set("claudeMaxTokens", parseInt(e.target.value) || 1024)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="claudeTemperature">
              Temperature{" "}
              <span className="text-muted-foreground font-normal">(0–1)</span>
            </Label>
            <Input
              id="claudeTemperature"
              type="number"
              min="0"
              max="1"
              step="0.1"
              placeholder="default"
              value={form.claudeTemperature}
              onChange={(e) => set("claudeTemperature", e.target.value)}
            />
          </div>
        </div>
      </div>

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Creating…" : "Create Tournament"}
      </Button>
    </form>
  );
}
