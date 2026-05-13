"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Eye, EyeOff, Gavel, Loader2,
  RotateCcw, Send, SkipForward, Trophy, Wifi, WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getSocket } from "@/hooks/useSocket";

// ─── Types ────────────────────────────────────────────────────────────────────

type DisputeMessage = {
  id: string;
  userId: string;
  content: string;
  wordCount: number;
  turnNumber: number;
  createdAt: string;
  user: { id: string; username: string };
};

type DisputePlayer = {
  userId: string;
  isActive: boolean;
  circlePosition: number;
  eloChange: number;
  user: { id: string; username: string };
};

type LobbyMeta = {
  topic: string | null;
  maxMessageTimeSeconds: number | null;
  messageWordLimit: number | null;
  totalWordLimit: number | null;
};

type DisputeData = {
  id: string;
  status: string;
  wordsUsed: number;
  isPrivate: boolean;
  lobby: LobbyMeta;
  players: DisputePlayer[];
  messages: DisputeMessage[];
};

type ResultPayload = {
  winnerIds: string[];
  reason: string;
  players: { userId: string; username: string; eloChange: number; newElo: number }[];
};

// ─── Player colours ───────────────────────────────────────────────────────────

const PLAYER_COLOURS = [
  "text-blue-400 bg-blue-400/10 border-blue-400/20",
  "text-violet-400 bg-violet-400/10 border-violet-400/20",
];

function playerColour(circlePosition: number) {
  return PLAYER_COLOURS[circlePosition % PLAYER_COLOURS.length];
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

type Action =
  | { type: "NEW_MESSAGE"; message: DisputeMessage; wordsUsed: number }
  | { type: "PLAYER_STATUS"; userId: string; isActive: boolean }
  | { type: "PRIVACY"; isPrivate: boolean }
  | { type: "STATUS"; status: string };

function reducer(state: DisputeData, action: Action): DisputeData {
  switch (action.type) {
    case "NEW_MESSAGE":
      return { ...state, messages: [...state.messages, action.message], wordsUsed: action.wordsUsed };
    case "PLAYER_STATUS":
      return {
        ...state,
        players: state.players.map((p) =>
          p.userId === action.userId ? { ...p, isActive: action.isActive } : p
        ),
      };
    case "PRIVACY":
      return { ...state, isPrivate: action.isPrivate };
    case "STATUS":
      return { ...state, status: action.status };
    default:
      return state;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  initialDispute: DisputeData;
  initialResult: ResultPayload | null;
  currentUserId: string;
  currentUsername: string;
  isPlayer: boolean;
}

export function DisputeRoom({
  initialDispute,
  initialResult,
  currentUserId,
  isPlayer,
}: Props) {
  const router = useRouter();
  const [dispute, dispatch] = useReducer(reducer, initialDispute);
  const [result, setResult] = useState<ResultPayload | null>(initialResult);
  const [isJudging, setIsJudging] = useState(dispute.status === "JUDGING");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [rejoining, setRejoining] = useState(false);
  const [liveDrafts, setLiveDrafts] = useState<Record<string, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const me = dispute.players.find((p) => p.userId === currentUserId);
  const iAmDisconnected = me && !me.isActive && dispute.status === "IN_PROGRESS";

  const wordLimit = dispute.lobby.messageWordLimit ?? 200;
  const totalLimit = dispute.lobby.totalWordLimit ?? 0;
  const wordsRemaining = totalLimit - dispute.wordsUsed;
  const wordProgress = totalLimit > 0 ? (dispute.wordsUsed / totalLimit) * 100 : 0;
  const draftWordCount = draft.trim() ? draft.trim().split(/\s+/).filter(Boolean).length : 0;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [dispute.messages.length]);

  useEffect(() => {
    if (dispute.status === "COMPLETED" || dispute.status === "CANCELLED") return;

    const s = getSocket();
    const event = isPlayer ? "dispute:join" : "dispute:spectate";
    s.emit(event, { disputeId: dispute.id, userId: currentUserId });

    s.on("dispute:new_message", ({ message, wordsUsed }: { message: DisputeMessage; wordsUsed: number }) => {
      dispatch({ type: "NEW_MESSAGE", message, wordsUsed });
      setLiveDrafts((prev) => {
        const next = { ...prev };
        delete next[message.userId];
        return next;
      });
    });

    s.on("dispute:typing", ({ userId, content }: { userId: string; content: string }) => {
      setLiveDrafts((prev) => {
        if (!content) {
          const next = { ...prev };
          delete next[userId];
          return next;
        }
        return { ...prev, [userId]: content };
      });
    });

    s.on("dispute:player_passed", ({ userId }: { userId: string }) => {
      const p = dispute.players.find((pl) => pl.userId === userId);
      if (p) toast.info(`${p.user.username} is done arguing.`);
    });

    s.on("dispute:player_disconnected", ({ userId }: { userId: string }) => {
      dispatch({ type: "PLAYER_STATUS", userId, isActive: false });
    });

    s.on("dispute:player_rejoined", ({ userId }: { userId: string }) => {
      dispatch({ type: "PLAYER_STATUS", userId, isActive: true });
      const p = dispute.players.find((pl) => pl.userId === userId);
      if (p && userId !== currentUserId) toast.info(`${p.user.username} rejoined.`);
    });

    s.on("dispute:judging", () => {
      setIsJudging(true);
      dispatch({ type: "STATUS", status: "JUDGING" });
    });

    s.on("dispute:result", (payload: ResultPayload) => {
      setResult(payload);
      setIsJudging(false);
      dispatch({ type: "STATUS", status: "COMPLETED" });
    });

    s.on("dispute:privacy_updated", ({ isPrivate }: { isPrivate: boolean }) => {
      dispatch({ type: "PRIVACY", isPrivate });
    });

    s.on("dispute:error", ({ message }: { message: string }) => {
      toast.error(message);
      setSending(false);
    });

    return () => {
      s.off("dispute:new_message");
      s.off("dispute:typing");
      s.off("dispute:player_passed");
      s.off("dispute:player_disconnected");
      s.off("dispute:player_rejoined");
      s.off("dispute:judging");
      s.off("dispute:result");
      s.off("dispute:privacy_updated");
      s.off("dispute:error");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispute.id, dispute.status, isPlayer, currentUserId]);

  function updateDraft(value: string) {
    setDraft(value);
    if (isPlayer && dispute.status === "IN_PROGRESS") {
      getSocket().emit("dispute:typing", {
        disputeId: dispute.id,
        userId: currentUserId,
        content: value,
      });
    }
  }

  function sendMessage() {
    if (!draft.trim() || sending) return;
    setSending(true);
    getSocket().emit("dispute:message", {
      disputeId: dispute.id,
      userId: currentUserId,
      content: draft.trim(),
    });
    setDraft("");
    setSending(false);
  }

  function passTurn() {
    getSocket().emit("dispute:pass", { disputeId: dispute.id, userId: currentUserId });
  }

  function rejoin() {
    setRejoining(true);
    getSocket().emit("dispute:rejoin", { disputeId: dispute.id, userId: currentUserId });
    setRejoining(false);
  }

  function togglePrivate() {
    getSocket().emit("dispute:toggle_private", {
      disputeId: dispute.id,
      userId: currentUserId,
      isPrivate: !dispute.isPrivate,
    });
  }

  const liveDraftEntries = Object.entries(liveDrafts).filter(
    ([uid, content]) => uid !== currentUserId && content
  );

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between gap-3 border-b border-border/50 bg-background px-4 py-2.5 shrink-0">
        <div className="min-w-0">
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
            {dispute.status === "IN_PROGRESS" ? "Live" : dispute.status === "JUDGING" ? "Judging" : "Ended"}
          </p>
          <h2 className="font-bold leading-tight truncate">
            {dispute.lobby.topic ?? "Untitled dispute"}
          </h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {totalLimit > 0 && dispute.status === "IN_PROGRESS" && (
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-24 h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${wordProgress > 80 ? "bg-destructive" : "bg-primary"}`}
                  style={{ width: `${Math.min(wordProgress, 100)}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {wordsRemaining.toLocaleString()} words left
              </span>
            </div>
          )}

          {isPlayer && dispute.status !== "COMPLETED" && dispute.status !== "CANCELLED" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={togglePrivate}
              title={dispute.isPrivate ? "Make public" : "Make private"}
            >
              {dispute.isPrivate ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          )}

          {dispute.isPrivate && (
            <Badge variant="outline" className="text-xs">Private</Badge>
          )}
        </div>
      </div>

      {/* ── Main layout ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Players sidebar ── */}
        <aside className="hidden md:flex flex-col w-52 shrink-0 border-r border-border/50 bg-background py-3 px-3 gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
            Players
          </p>
          {dispute.players.map((p) => {
            const colour = playerColour(p.circlePosition);
            const isTyping = !!liveDrafts[p.userId];
            const isMe = p.userId === currentUserId;
            return (
              <div
                key={p.userId}
                className={`rounded-lg border px-2.5 py-2 transition-colors ${isTyping ? "border-primary/40 bg-primary/5" : "border-border/40 bg-secondary/20"}`}
              >
                <div className="flex items-center gap-2">
                  <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold border ${colour}`}>
                    {p.user.username[0].toUpperCase()}
                  </div>
                  <span className="text-sm font-medium truncate flex-1">{p.user.username}</span>
                  {isTyping && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse shrink-0" />
                  )}
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="flex items-center gap-1">
                    {p.isActive
                      ? <Wifi className="h-3 w-3 text-green-500" />
                      : <WifiOff className="h-3 w-3 text-muted-foreground/50" />}
                    {isMe && <span className="text-[10px] text-muted-foreground">you</span>}
                  </span>
                </div>
              </div>
            );
          })}

        </aside>

        {/* ── Chat area ── */}
        <div className="flex flex-col flex-1 overflow-hidden">

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
            {dispute.messages.length === 0 && (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  {dispute.status === "IN_PROGRESS"
                    ? "The dispute has begun. Make your arguments."
                    : "No messages were sent."}
                </p>
              </div>
            )}

            {dispute.messages.map((msg, i) => {
              const player = dispute.players.find((p) => p.userId === msg.userId);
              const colour = player ? playerColour(player.circlePosition) : PLAYER_COLOURS[0];
              const isMe = msg.userId === currentUserId;
              const prevMsg = dispute.messages[i - 1];
              const showHeader = !prevMsg || prevMsg.userId !== msg.userId;

              return (
                <div key={msg.id} className={`${showHeader && i > 0 ? "mt-4" : ""}`}>
                  {showHeader && (
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold border ${colour}`}>
                        {msg.user.username[0].toUpperCase()}
                      </div>
                      <span className="text-sm font-semibold">{msg.user.username}</span>
                      {isMe && <span className="text-[10px] text-muted-foreground">(you)</span>}
                      <span className="text-[11px] text-muted-foreground ml-auto">
                        #{msg.turnNumber} · {msg.wordCount}w
                      </span>
                    </div>
                  )}
                  <div className={`ml-8 text-sm leading-relaxed ${isMe ? "text-foreground" : "text-foreground/85"}`}>
                    {msg.content}
                  </div>
                </div>
              );
            })}

            {isJudging && (
              <div className="flex items-center gap-3 mt-6 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                <Gavel className="h-5 w-5 text-primary animate-bounce shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-primary">Claude is deliberating…</p>
                  <p className="text-xs text-muted-foreground">Analysing all arguments. Results incoming.</p>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── Live drafts — fixed above input, outside scroll ── */}
          {liveDraftEntries.length > 0 && dispute.status === "IN_PROGRESS" && (
            <div className="border-t border-border/30 bg-background px-4 py-2 space-y-2 shrink-0">
              {liveDraftEntries.map(([uid, content]) => {
                const player = dispute.players.find((p) => p.userId === uid);
                const colour = player ? playerColour(player.circlePosition) : PLAYER_COLOURS[0];
                return (
                  <div key={uid} className="opacity-60">
                    <div className="flex items-center gap-2 mb-0.5">
                      <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${colour}`}>
                        {player?.user.username[0].toUpperCase() ?? "?"}
                      </div>
                      <span className="text-xs font-semibold">{player?.user.username ?? "…"}</span>
                      <span className="text-[10px] text-muted-foreground italic">typing…</span>
                    </div>
                    <div className="ml-7 text-sm leading-relaxed text-foreground/70 italic">
                      {content}<span className="animate-pulse">▍</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Result panel ── */}
          {result && (
            <div className="border-t border-border/50 bg-card px-4 py-4 space-y-4 max-h-80 overflow-y-auto">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-base">
                  {result.winnerIds.length > 1 ? "Winners" : "Winner"}:{" "}
                  {result.players
                    .filter((p) => result.winnerIds.includes(p.userId))
                    .map((p) => p.username)
                    .join(" & ")}
                </h3>
              </div>

              <div className="flex flex-wrap gap-2">
                {result.players.map((p) => {
                  const won = result.winnerIds.includes(p.userId);
                  return (
                    <div
                      key={p.userId}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${won ? "border-green-500/30 bg-green-500/10 text-green-400" : "border-destructive/30 bg-destructive/10 text-destructive"}`}
                    >
                      <span className="font-medium">{p.username}</span>
                      <span className="tabular-nums font-mono">
                        {won ? `+${p.eloChange}` : `${p.eloChange}`} ELO
                      </span>
                      <span className="text-[11px] opacity-60">→ {p.newElo}</span>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Gavel className="h-3.5 w-3.5" /> Claude's Reasoning
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {result.reason}
                </p>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => router.push("/lobby")}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Back to lobbies
              </Button>
            </div>
          )}

          {/* ── Rejoin bar ── */}
          {iAmDisconnected && !result && (
            <div className="border-t border-border/50 bg-card px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">You are inactive</p>
                <p className="text-xs text-muted-foreground">Rejoin to continue arguing</p>
              </div>
              <Button size="sm" onClick={rejoin} disabled={rejoining} className="gap-2">
                {rejoining && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Rejoin
              </Button>
            </div>
          )}

          {/* ── Input ── */}
          {isPlayer && dispute.status === "IN_PROGRESS" && !iAmDisconnected && (
            <div className="border-t border-border/50 bg-card px-4 pt-3 pb-4 space-y-2 shrink-0">
              {draft.length > 0 && (
                <div className="flex justify-end">
                  <span className={`text-xs tabular-nums ${draftWordCount > wordLimit ? "text-destructive" : "text-muted-foreground"}`}>
                    {draftWordCount}/{wordLimit} words
                  </span>
                </div>
              )}
              <div className="flex gap-2">
                <textarea
                  ref={textareaRef}
                  rows={2}
                  placeholder="Make your argument…"
                  disabled={sending}
                  value={draft}
                  onChange={(e) => updateDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  className="flex-1 resize-none rounded-lg border border-border/50 bg-input/50 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                />
                <div className="flex flex-col gap-1.5">
                  <Button
                    size="sm"
                    className="h-9 px-3 gap-1.5"
                    disabled={!draft.trim() || sending || draftWordCount > wordLimit}
                    onClick={sendMessage}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Send
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 px-3 gap-1.5 text-muted-foreground"
                    onClick={passTurn}
                  >
                    <SkipForward className="h-3.5 w-3.5" />
                    Done
                  </Button>
                </div>
              </div>
            </div>
          )}

          {!isPlayer && dispute.status === "IN_PROGRESS" && (
            <div className="border-t border-border/50 bg-card px-4 py-3">
              <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
                <Eye className="h-3.5 w-3.5" />
                Spectating
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
