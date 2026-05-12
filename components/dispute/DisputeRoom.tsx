"use client";

import { useEffect, useReducer, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check, ChevronRight, Clock, Eye, EyeOff, Gavel, Loader2,
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
  tokenCount: number;
  turnNumber: number;
  createdAt: string;
  user: { id: string; username: string };
};

type DisputePlayer = {
  userId: string;
  isActive: boolean;
  circlePosition: number;
  betAmount: number;
  tokensWon: number;
  tokensLost: number;
  user: { id: string; username: string };
};

type LobbyMeta = {
  topic: string | null;
  timeLimitSeconds: number | null;
  maxMessageTimeSeconds: number | null;
  messageTokenLimit: number | null;
  totalTokenLimit: number | null;
};

type DisputeData = {
  id: string;
  status: string;
  tokensUsed: number;
  isPrivate: boolean;
  lobby: LobbyMeta;
  players: DisputePlayer[];
  messages: DisputeMessage[];
};

type ResultPayload = {
  winnerIds: string[];
  reason: string;
  players: { userId: string; username: string; tokensWon: number; tokensLost: number; betAmount: number }[];
};

// ─── Player colours (consistent per position) ─────────────────────────────────

const PLAYER_COLOURS = [
  "text-blue-400 bg-blue-400/10 border-blue-400/20",
  "text-violet-400 bg-violet-400/10 border-violet-400/20",
  "text-amber-400 bg-amber-400/10 border-amber-400/20",
  "text-cyan-400 bg-cyan-400/10 border-cyan-400/20",
  "text-pink-400 bg-pink-400/10 border-pink-400/20",
  "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
];

function playerColour(circlePosition: number) {
  return PLAYER_COLOURS[circlePosition % PLAYER_COLOURS.length];
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

type Action =
  | { type: "NEW_MESSAGE"; message: DisputeMessage; tokensUsed: number }
  | { type: "PLAYER_STATUS"; userId: string; isActive: boolean }
  | { type: "PRIVACY"; isPrivate: boolean }
  | { type: "STATUS"; status: string };

function reducer(state: DisputeData, action: Action): DisputeData {
  switch (action.type) {
    case "NEW_MESSAGE":
      return {
        ...state,
        messages: [...state.messages, action.message],
        tokensUsed: action.tokensUsed,
      };
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

// ─── Countdown hook ───────────────────────────────────────────────────────────

function useCountdown(expiresAt: number | null) {
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!expiresAt) { setTimeLeft(null); return; }
    const tick = () => setTimeLeft(Math.max(0, Math.round((expiresAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [expiresAt]);

  return timeLeft;
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
  const [currentTurnUserId, setCurrentTurnUserId] = useState<string | null>(null);
  const [turnExpiresAt, setTurnExpiresAt] = useState<number | null>(null);
  const [result, setResult] = useState<ResultPayload | null>(initialResult);
  const [isJudging, setIsJudging] = useState(dispute.status === "JUDGING");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [rejoining, setRejoining] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const timeLeft = useCountdown(turnExpiresAt);
  const isMyTurn = currentTurnUserId === currentUserId;
  const me = dispute.players.find((p) => p.userId === currentUserId);
  const iAmDisconnected = me && !me.isActive && dispute.status === "IN_PROGRESS";
  const tokenLimit = dispute.lobby.messageTokenLimit ?? 500;
  // rough client-side token estimate (4 chars ≈ 1 token)
  const draftTokenEstimate = Math.ceil(draft.length / 4);
  const totalLimit = dispute.lobby.totalTokenLimit ?? 0;
  const tokensRemaining = totalLimit - dispute.tokensUsed;
  const tokenProgress = totalLimit > 0 ? (dispute.tokensUsed / totalLimit) * 100 : 0;

  // Auto-scroll to bottom when messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [dispute.messages.length]);

  // Socket setup
  useEffect(() => {
    if (dispute.status === "COMPLETED" || dispute.status === "CANCELLED") return;

    const s = getSocket();
    const event = isPlayer ? "dispute:join" : "dispute:spectate";
    s.emit(event, { disputeId: dispute.id, userId: currentUserId });

    s.on("dispute:state", (data: DisputeData & { currentTurnUserId: string | null; turnExpiresAt: number | null }) => {
      setCurrentTurnUserId(data.currentTurnUserId);
      setTurnExpiresAt(data.turnExpiresAt);
    });

    s.on("dispute:turn", ({ userId, expiresAt }: { userId: string; expiresAt: number }) => {
      setCurrentTurnUserId(userId);
      setTurnExpiresAt(expiresAt);
      if (userId === currentUserId) textareaRef.current?.focus();
    });

    s.on("dispute:new_message", ({ message, tokensUsed }: { message: DisputeMessage; tokensUsed: number }) => {
      dispatch({ type: "NEW_MESSAGE", message, tokensUsed });
    });

    s.on("dispute:player_passed", ({ userId }: { userId: string }) => {
      const p = dispute.players.find((pl) => pl.userId === userId);
      if (p) toast.info(`${p.user.username} passed their turn.`);
    });

    s.on("dispute:turn_timeout", ({ userId }: { userId: string }) => {
      const p = dispute.players.find((pl) => pl.userId === userId);
      dispatch({ type: "PLAYER_STATUS", userId, isActive: false });
      if (userId === currentUserId) {
        toast.warning("Time's up! You can rejoin while the dispute is still active.");
      } else if (p) {
        toast.info(`${p.user.username} ran out of time.`);
      }
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
      s.off("dispute:state");
      s.off("dispute:turn");
      s.off("dispute:new_message");
      s.off("dispute:player_passed");
      s.off("dispute:turn_timeout");
      s.off("dispute:player_disconnected");
      s.off("dispute:player_rejoined");
      s.off("dispute:judging");
      s.off("dispute:result");
      s.off("dispute:privacy_updated");
      s.off("dispute:error");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispute.id, dispute.status, isPlayer, currentUserId]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  function sendMessage() {
    if (!draft.trim() || !isMyTurn || sending) return;
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
    if (!isMyTurn) return;
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

  const currentTurnPlayer = dispute.players.find((p) => p.userId === currentTurnUserId);

  // ── Render ───────────────────────────────────────────────────────────────────

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
          {/* Token progress */}
          {totalLimit > 0 && dispute.status === "IN_PROGRESS" && (
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-24 h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${tokenProgress > 80 ? "bg-destructive" : "bg-primary"}`}
                  style={{ width: `${Math.min(tokenProgress, 100)}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {tokensRemaining.toLocaleString()} left
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
            const isCurrent = p.userId === currentTurnUserId;
            const isMe = p.userId === currentUserId;
            return (
              <div
                key={p.userId}
                className={`rounded-lg border px-2.5 py-2 transition-colors ${isCurrent ? "border-primary/40 bg-primary/5" : "border-border/40 bg-secondary/20"}`}
              >
                <div className="flex items-center gap-2">
                  <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold border ${colour}`}>
                    {p.user.username[0].toUpperCase()}
                  </div>
                  <span className="text-sm font-medium truncate flex-1">{p.user.username}</span>
                  {isCurrent && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse shrink-0" />
                  )}
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[11px] text-muted-foreground">
                    Bet: {p.betAmount}
                  </span>
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

          <Separator className="my-1" />

          <div className="text-[11px] text-muted-foreground space-y-1">
            {dispute.lobby.timeLimitSeconds && (
              <div className="flex justify-between">
                <span>Time limit</span>
                <span>{Math.floor(dispute.lobby.timeLimitSeconds / 60)}m</span>
              </div>
            )}
            {dispute.lobby.maxMessageTimeSeconds && (
              <div className="flex justify-between">
                <span>Per turn</span>
                <span>{dispute.lobby.maxMessageTimeSeconds}s</span>
              </div>
            )}
            {dispute.lobby.messageTokenLimit && (
              <div className="flex justify-between">
                <span>Msg limit</span>
                <span>{dispute.lobby.messageTokenLimit} tok</span>
              </div>
            )}
          </div>
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
                        #{msg.turnNumber} · {msg.tokenCount} tok
                      </span>
                    </div>
                  )}
                  <div className={`ml-8 text-sm leading-relaxed ${isMe ? "text-foreground" : "text-foreground/85"}`}>
                    {msg.content}
                  </div>
                </div>
              );
            })}

            {/* Judging indicator */}
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

              {/* Per-player outcomes */}
              <div className="flex flex-wrap gap-2">
                {result.players.map((p) => {
                  const won = result.winnerIds.includes(p.userId);
                  return (
                    <div
                      key={p.userId}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${won ? "border-green-500/30 bg-green-500/10 text-green-400" : "border-destructive/30 bg-destructive/10 text-destructive"}`}
                    >
                      <span className="font-medium">{p.username}</span>
                      <span className="tabular-nums">
                        {won ? `+${p.tokensWon}` : `-${p.tokensLost}`} tokens
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Claude's reasoning */}
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

          {/* ── Turn bar + input ── */}
          {isPlayer && dispute.status === "IN_PROGRESS" && !iAmDisconnected && (
            <div className="border-t border-border/50 bg-card px-4 pt-3 pb-4 space-y-2 shrink-0">
              {/* Turn indicator */}
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-1.5">
                  {isMyTurn ? (
                    <>
                      <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                      <span className="font-semibold text-primary">Your turn</span>
                    </>
                  ) : (
                    <>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {currentTurnPlayer?.user.username ?? "…"}'s turn
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {/* Turn timer */}
                  {timeLeft !== null && (
                    <span className={`flex items-center gap-1 font-mono text-sm font-semibold tabular-nums ${timeLeft <= 10 ? "text-destructive" : "text-muted-foreground"}`}>
                      <Clock className="h-3.5 w-3.5" />
                      {timeLeft}s
                    </span>
                  )}
                  {/* Draft token estimate */}
                  {isMyTurn && draft.length > 0 && (
                    <span className={`text-xs tabular-nums ${draftTokenEstimate > tokenLimit ? "text-destructive" : "text-muted-foreground"}`}>
                      ~{draftTokenEstimate}/{tokenLimit} tok
                    </span>
                  )}
                </div>
              </div>

              {/* Input row */}
              <div className="flex gap-2">
                <textarea
                  ref={textareaRef}
                  rows={2}
                  placeholder={isMyTurn ? "Make your argument…" : `Waiting for ${currentTurnPlayer?.user.username ?? "opponent"}…`}
                  disabled={!isMyTurn || sending}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
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
                    disabled={!isMyTurn || !draft.trim() || sending || draftTokenEstimate > tokenLimit}
                    onClick={sendMessage}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Send
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 px-3 gap-1.5 text-muted-foreground"
                    disabled={!isMyTurn}
                    onClick={passTurn}
                  >
                    <SkipForward className="h-3.5 w-3.5" />
                    Pass
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Spectator bar */}
          {!isPlayer && dispute.status === "IN_PROGRESS" && (
            <div className="border-t border-border/50 bg-card px-4 py-3">
              <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
                <Eye className="h-3.5 w-3.5" />
                Spectating — {currentTurnPlayer?.user.username ?? "…"}'s turn
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
