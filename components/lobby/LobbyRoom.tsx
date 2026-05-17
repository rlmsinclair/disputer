"use client";

import { useEffect, useReducer, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, Link2, Loader2, Send, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSocket } from "@/hooks/useSocket";

// ─── Types ────────────────────────────────────────────────────────────────────

type LobbyPlayer = {
  userId: string;
  isReady: boolean;
  joinedAt: string;
  user?: { username: string; elo: number };
};

type ChatMessage = {
  userId: string;
  username: string;
  content: string;
  timestamp: number;
};

type LobbyData = {
  id: string;
  creatorId: string;
  status: string;
  topic: string | null;
  maxMessageTimeSeconds: number;
  messageWordLimit: number;
  totalWordLimit: number;
  players: LobbyPlayer[];
  chatHistory: ChatMessage[];
};

// ─── Reducer ──────────────────────────────────────────────────────────────────

type Action =
  | { type: "SET"; lobby: LobbyData }
  | { type: "PLAYER_JOINED"; player: LobbyPlayer }
  | { type: "PLAYER_LEFT"; userId: string }
  | { type: "SETTING_UPDATED"; field: string; value: unknown }
  | { type: "READY_UPDATE"; userId: string; isReady: boolean }
  | { type: "CHAT_MESSAGE"; msg: ChatMessage };

function lobbyReducer(state: LobbyData, action: Action): LobbyData {
  switch (action.type) {
    case "SET":
      return { ...action.lobby, players: action.lobby.players ?? [] };

    case "PLAYER_JOINED":
      if (state.players.some((p) => p.userId === action.player.userId)) return state;
      return { ...state, players: [...state.players, action.player] };

    case "PLAYER_LEFT":
      return { ...state, players: state.players.filter((p) => p.userId !== action.userId) };

    case "SETTING_UPDATED":
      return { ...state, [action.field]: action.value };

    case "READY_UPDATE":
      return {
        ...state,
        players: state.players.map((p) =>
          p.userId === action.userId ? { ...p, isReady: action.isReady } : p
        ),
      };

    case "CHAT_MESSAGE":
      return { ...state, chatHistory: [...state.chatHistory, action.msg] };

    default:
      return state;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  initialLobby: LobbyData;
  currentUserId: string;
  isPlayer: boolean;
}

export function LobbyRoom({ initialLobby, currentUserId, isPlayer }: Props) {
  const router = useRouter();
  const [lobby, dispatch] = useReducer(lobbyReducer, {
    ...initialLobby,
    chatHistory: initialLobby.chatHistory ?? [],
  });
  const [joining, setJoining] = useState(false);
  const [isJoined, setIsJoined] = useState(isPlayer);
  const [starting, setStarting] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [topicInput, setTopicInput] = useState(initialLobby.topic ?? "");

  const isCreator = lobby.creatorId === currentUserId;
  const opponent = lobby.players.find((p) => p.userId !== currentUserId);
  const me = lobby.players.find((p) => p.userId === currentUserId);
  const opponentReady = opponent?.isReady ?? false;
  const settingsLocked = opponentReady; // host can't change settings once opponent is ready
  const canStart = isCreator && lobby.players.length === 2 && !!lobby.topic?.trim() && opponentReady;
  const isFull = lobby.players.length >= 2;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lobby.chatHistory.length]);

  // Sync inputs when settings change remotely
  useEffect(() => {
    setTopicInput(lobby.topic ?? "");
  }, [lobby.topic]);

  // ── Socket setup ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isJoined) return;
    const s = getSocket();
    s.emit("lobby:join", { lobbyId: lobby.id, userId: currentUserId });

    s.on("lobby:state", (data: LobbyData) => dispatch({ type: "SET", lobby: data }));
    s.on("lobby:player_joined", (player: LobbyPlayer) => dispatch({ type: "PLAYER_JOINED", player }));
    s.on("lobby:player_left", ({ userId }: { userId: string }) => dispatch({ type: "PLAYER_LEFT", userId }));
    s.on("lobby:setting_updated", ({ field, value }: { field: string; value: unknown }) =>
      dispatch({ type: "SETTING_UPDATED", field, value })
    );
    s.on("lobby:ready_update", ({ userId, isReady }: { userId: string; isReady: boolean }) =>
      dispatch({ type: "READY_UPDATE", userId, isReady })
    );
    s.on("lobby:chat_message", (msg: ChatMessage) => dispatch({ type: "CHAT_MESSAGE", msg }));
    s.on("lobby:dispute_started", ({ disputeId }: { disputeId: string }) => {
      toast.success("Debate starting!");
      router.push(`/dispute/${disputeId}`);
    });
    s.on("lobby:error", ({ message }: { message: string }) => {
      toast.error(message);
      setStarting(false);
    });

    return () => {
      s.off("lobby:state");
      s.off("lobby:player_joined");
      s.off("lobby:player_left");
      s.off("lobby:setting_updated");
      s.off("lobby:ready_update");
      s.off("lobby:chat_message");
      s.off("lobby:dispute_started");
      s.off("lobby:error");
      s.emit("lobby:leave", { lobbyId: lobby.id, userId: currentUserId });
    };
  }, [isJoined, lobby.id, currentUserId, router]);

  // ── Actions ──────────────────────────────────────────────────────────────────
  const emit = useCallback((event: string, data: object) => {
    getSocket().emit(event, { lobbyId: lobby.id, userId: currentUserId, ...data });
  }, [lobby.id, currentUserId]);

  async function joinLobby() {
    setJoining(true);
    const res = await fetch(`/api/lobby/${lobby.id}/join`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Failed to join lobby.");
      setJoining(false);
      return;
    }
    setIsJoined(true);
    setJoining(false);
  }

  function emitSetting(field: string, value: unknown) {
    if (settingsLocked) return;
    emit("lobby:update_setting", { field, value });
  }

  function commitTopic() {
    const v = topicInput.trim();
    if (v === (lobby.topic ?? "")) return;
    emitSetting("topic", v || null);
  }

  function commitNumber(field: string, raw: string, min: number, max?: number) {
    const n = parseInt(raw);
    if (isNaN(n) || n < min || (max !== undefined && n > max)) return;
    if (n === (lobby as Record<string, unknown>)[field]) return;
    emitSetting(field, n);
  }

  function toggleReady() {
    emit("lobby:ready", {});
  }

  function sendChat() {
    if (!chatInput.trim()) return;
    emit("lobby:chat", { content: chatInput.trim() });
    setChatInput("");
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Link copied!");
  }

  function startDebate() {
    if (!canStart) return;
    setStarting(true);
    emit("lobby:start", {});
  }

  // ── Join prompt ──────────────────────────────────────────────────────────────
  if (!isJoined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <Card className="w-full max-w-sm border-primary/30 text-center">
          <CardHeader>
            <Swords className="mx-auto h-10 w-10 text-primary mb-2" />
            <p className="font-bold text-lg">Join this lobby</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {lobby.topic ? (
              <p className="text-sm text-muted-foreground">
                Topic: <span className="font-medium text-foreground">{lobby.topic}</span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">Topic not set yet</p>
            )}
            {isFull ? (
              <p className="text-sm text-destructive font-medium">This lobby is full.</p>
            ) : (
              <Button className="w-full" onClick={joinLobby} disabled={joining}>
                {joining ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {joining ? "Joining…" : "Join Lobby"}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Main lobby room ───────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
            Lobby · {lobby.id.slice(-6).toUpperCase()}
          </p>
          <h2 className="text-xl font-bold mt-0.5 leading-tight">
            {lobby.topic ?? <span className="text-muted-foreground italic font-normal">Awaiting topic…</span>}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">{lobby.players.length} / 2</Badge>
          <Button variant="outline" size="sm" onClick={copyLink} className="gap-1.5 text-xs">
            <Link2 className="h-3.5 w-3.5" />
            Copy link
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* ── Left column ── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Players */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Players
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {lobby.players.map((p) => {
                const isMe = p.userId === currentUserId;
                const isHost = p.userId === lobby.creatorId;
                return (
                  <div key={p.userId} className="flex items-center gap-3 rounded-lg border border-border/50 bg-secondary/30 px-3 py-2.5">
                    <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                      {p.user?.username?.[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-sm truncate">{p.user?.username ?? p.userId.slice(-6)}</span>
                        {isHost && <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">host</Badge>}
                        {isMe && <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 border-primary/50 text-primary">you</Badge>}
                        {!isHost && p.isReady && (
                          <Badge className="text-[10px] px-1.5 py-0 shrink-0 bg-green-500/20 text-green-400 border-green-500/30">
                            <Check className="h-2.5 w-2.5 mr-0.5" />ready
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{p.user?.elo ?? 1200} ELO</p>
                    </div>
                  </div>
                );
              })}
              {lobby.players.length < 2 && (
                <div className="flex items-center gap-3 rounded-lg border border-dashed border-border/40 px-3 py-2.5 text-muted-foreground">
                  <div className="h-8 w-8 rounded-full border-2 border-dashed border-border/40 flex items-center justify-center text-xs">?</div>
                  <span className="text-sm italic">Waiting for opponent…</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Share link */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Invite Opponent
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              <p className="text-xs text-muted-foreground">Share this link to invite someone to the lobby:</p>
              <Button variant="secondary" size="sm" className="w-full gap-2" onClick={copyLink}>
                <Copy className="h-3.5 w-3.5" />
                Copy lobby link
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* ── Right column ── */}
        <div className="lg:col-span-3 space-y-4">

          {/* Settings */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Settings
                {isCreator && settingsLocked && (
                  <span className="ml-2 text-[10px] font-normal text-amber-400 normal-case">locked — opponent is ready</span>
                )}
                {isCreator && !settingsLocked && (
                  <span className="ml-2 text-[10px] font-normal text-muted-foreground normal-case">(you&apos;re the host)</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-4">

              {/* Topic */}
              <div className="space-y-1.5">
                <Label className="text-xs">Topic</Label>
                {isCreator && !settingsLocked ? (
                  <Input
                    placeholder="What are you debating?"
                    value={topicInput}
                    onChange={(e) => setTopicInput(e.target.value)}
                    onBlur={commitTopic}
                    onKeyDown={(e) => e.key === "Enter" && commitTopic()}
                    className="bg-input/50 h-9 text-sm"
                  />
                ) : (
                  <div className="rounded-md border border-border/50 bg-secondary/30 px-3 py-2 text-sm">
                    {lobby.topic ?? <span className="text-muted-foreground italic">Waiting for host…</span>}
                  </div>
                )}
              </div>

            </CardContent>
          </Card>

          {/* Action button */}
          {isCreator ? (
            <Button
              className="w-full h-12 text-base font-bold tracking-wide"
              disabled={!canStart || starting}
              onClick={startDebate}
            >
              {starting ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Starting…</>
              ) : lobby.players.length < 2 ? (
                "Waiting for opponent…"
              ) : !lobby.topic?.trim() ? (
                "Set a topic to start"
              ) : !opponentReady ? (
                "Waiting for opponent to ready up…"
              ) : (
                <><Swords className="mr-2 h-5 w-5" /> Start Debate</>
              )}
            </Button>
          ) : (
            <Button
              className={`w-full h-12 text-base font-bold tracking-wide ${me?.isReady ? "border-green-500/40" : ""}`}
              variant={me?.isReady ? "outline" : "default"}
              onClick={toggleReady}
              disabled={lobby.players.length < 2}
            >
              {me?.isReady ? (
                <><Check className="mr-2 h-5 w-5 text-green-400" /> Ready — click to unready</>
              ) : lobby.players.length < 2 ? (
                "Waiting for host…"
              ) : (
                <><Swords className="mr-2 h-5 w-5" /> Ready Up</>
              )}
            </Button>
          )}

          {/* Lobby chat */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Lobby Chat
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div className="h-40 overflow-y-auto space-y-2 pr-1">
                {lobby.chatHistory.length === 0 && (
                  <p className="text-xs text-muted-foreground italic text-center pt-8">
                    Use this chat to agree on settings before starting.
                  </p>
                )}
                {lobby.chatHistory.map((msg, i) => (
                  <div key={i} className="text-sm">
                    <span className="font-semibold text-foreground/90">{msg.username}: </span>
                    <span className="text-foreground/75">{msg.content}</span>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Say something…"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendChat()}
                  className="bg-input/50 h-9 text-base md:text-sm"
                  maxLength={500}
                />
                <Button size="sm" onClick={sendChat} className="shrink-0 gap-1.5">
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
