"use client";

import { useEffect, useReducer, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Clock, Loader2, UserMinus, UserPlus, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getSocket } from "@/hooks/useSocket";

// ─── Types ────────────────────────────────────────────────────────────────────

type LobbyPlayer = {
  userId: string;
  betAmount: number | null;
  isReady: boolean;
  circlePosition: number | null;
  topicConfirmed: boolean;
  timeLimitConfirmed: boolean;
  maxMessageTimeConfirmed: boolean;
  betConfirmed: boolean;
  proposedMessageTokenLimit: number | null;
  proposedTotalTokenLimit: number | null;
  user?: { username: string; tokenBalance: number };
};

type LobbyData = {
  id: string;
  creatorId: string;
  status: string;
  topic: string | null;
  timeLimitSeconds: number | null;
  maxMessageTimeSeconds: number | null;
  messageTokenLimit: number | null;
  totalTokenLimit: number | null;
  players: LobbyPlayer[];
  invites: { inviteeId: string; invitee: { username: string } }[];
};

type KickVote = { votes: number; required: number };

// ─── Reducer ──────────────────────────────────────────────────────────────────

type Action =
  | { type: "SET"; lobby: LobbyData }
  | { type: "PLAYER_JOINED"; player: LobbyPlayer }
  | { type: "PLAYER_LEFT"; userId: string }
  | { type: "SETTING_UPDATED"; field: string; value: unknown }
  | { type: "BET_PROPOSED"; userId: string; amount: number }
  | { type: "BET_CONFIRMED"; userId: string }
  | { type: "TOKEN_PROPOSAL_UPDATE"; userId: string; messageTokenLimit: number; totalTokenLimit: number }
  | { type: "TOKEN_LIMITS_SET"; messageTokenLimit: number; totalTokenLimit: number }
  | { type: "READY_UPDATE"; userId: string }
  | { type: "PLAYER_KICKED"; userId: string };

function lobbyReducer(state: LobbyData, action: Action): LobbyData {
  switch (action.type) {
    case "SET":
      return { ...action.lobby, players: action.lobby.players ?? [] };

    case "PLAYER_JOINED":
      if (state.players.some((p) => p.userId === action.player.userId)) return state;
      return { ...state, players: [...state.players, action.player] };

    case "PLAYER_LEFT":
    case "PLAYER_KICKED":
      return { ...state, players: state.players.filter((p) => p.userId !== action.userId) };

    case "SETTING_UPDATED":
      return { ...state, [action.field]: action.value };

    case "BET_PROPOSED":
      return {
        ...state,
        players: state.players.map((p) => ({
          ...p,
          betAmount: p.userId === action.userId ? action.amount : p.betAmount,
          betConfirmed: false,
          isReady: false,
        })),
      };

    case "BET_CONFIRMED":
      return {
        ...state,
        players: state.players.map((p) =>
          p.userId === action.userId ? { ...p, betConfirmed: true } : p
        ),
      };

    case "TOKEN_PROPOSAL_UPDATE":
      return {
        ...state,
        players: state.players.map((p) =>
          p.userId === action.userId
            ? { ...p, proposedMessageTokenLimit: action.messageTokenLimit, proposedTotalTokenLimit: action.totalTokenLimit }
            : p
        ),
      };

    case "TOKEN_LIMITS_SET":
      return { ...state, messageTokenLimit: action.messageTokenLimit, totalTokenLimit: action.totalTokenLimit };

    case "READY_UPDATE":
      return {
        ...state,
        players: state.players.map((p) =>
          p.userId === action.userId ? { ...p, isReady: true } : p
        ),
      };

    default:
      return state;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────


// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  initialLobby: LobbyData;
  currentUserId: string;
  currentUsername: string;
  isPlayer: boolean;
  hasInvite: boolean;
}

export function LobbyRoom({ initialLobby, currentUserId, currentUsername, isPlayer, hasInvite }: Props) {
  const router = useRouter();
  const [lobby, dispatch] = useReducer(lobbyReducer, initialLobby);
  const [kickVotes, setKickVotes] = useState<Record<string, KickVote>>({});
  const [joining, setJoining] = useState(false);
  const [isJoined, setIsJoined] = useState(isPlayer);

  // Form inputs
  const [topicInput, setTopicInput] = useState(initialLobby.topic ?? "");
  const [timeLimitInput, setTimeLimitInput] = useState(
    initialLobby.timeLimitSeconds ? String(Math.floor(initialLobby.timeLimitSeconds / 60)) : ""
  );
  const [maxMsgTimeInput, setMaxMsgTimeInput] = useState(
    initialLobby.maxMessageTimeSeconds ? String(initialLobby.maxMessageTimeSeconds) : ""
  );
  const [msgTokenInput, setMsgTokenInput] = useState("");
  const [totalTokenInput, setTotalTokenInput] = useState("");
  const [betInput, setBetInput] = useState("");
  const [inviteInput, setInviteInput] = useState("");

  const me = lobby.players.find((p) => p.userId === currentUserId);
  const isCreator = lobby.creatorId === currentUserId;

  const canReady =
    lobby.topic != null &&
    lobby.timeLimitSeconds != null &&
    lobby.maxMessageTimeSeconds != null &&
    lobby.players.length >= 2 &&
    lobby.players.every((p) => p.betConfirmed && p.betAmount != null);

  // ── Socket setup ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isJoined) return;
    const s = getSocket();
    s.emit("lobby:join", { lobbyId: lobby.id, userId: currentUserId });

    s.on("lobby:state", (data: LobbyData) => dispatch({ type: "SET", lobby: data }));
    s.on("lobby:player_joined", (player: LobbyPlayer) => dispatch({ type: "PLAYER_JOINED", player }));
    s.on("lobby:player_left", ({ userId }: { userId: string }) => dispatch({ type: "PLAYER_LEFT", userId }));

    s.on("lobby:setting_updated", ({ field, value }: { field: string; value: unknown }) => {
      dispatch({ type: "SETTING_UPDATED", field, value });
      if (field === "topic") setTopicInput(value as string);
      if (field === "timeLimitSeconds") setTimeLimitInput(String(Math.floor((value as number) / 60)));
      if (field === "maxMessageTimeSeconds") setMaxMsgTimeInput(String(value));
    });

    s.on("lobby:bet_proposed", ({ userId, amount }: { userId: string; amount: number }) =>
      dispatch({ type: "BET_PROPOSED", userId, amount })
    );

    s.on("lobby:bet_confirmation_update", ({ userId }: { userId: string }) =>
      dispatch({ type: "BET_CONFIRMED", userId })
    );

    s.on("lobby:token_proposal_update", (data: { userId: string; messageTokenLimit: number; totalTokenLimit: number }) =>
      dispatch({ type: "TOKEN_PROPOSAL_UPDATE", ...data })
    );

    s.on("lobby:token_limits_set", ({ messageTokenLimit, totalTokenLimit }: { messageTokenLimit: number; totalTokenLimit: number }) =>
      dispatch({ type: "TOKEN_LIMITS_SET", messageTokenLimit, totalTokenLimit })
    );

    s.on("lobby:ready_update", ({ userId }: { userId: string }) =>
      dispatch({ type: "READY_UPDATE", userId })
    );

    s.on("lobby:player_kicked", ({ userId }: { userId: string }) => {
      if (userId === currentUserId) {
        toast.error("You were removed from the lobby.");
        router.push("/lobby");
        return;
      }
      dispatch({ type: "PLAYER_KICKED", userId });
      toast.info("A player was removed from the lobby.");
    });

    s.on("lobby:kick_vote_update", ({ targetId, votes, required }: { targetId: string; votes: number; required: number }) =>
      setKickVotes((prev) => ({ ...prev, [targetId]: { votes, required } }))
    );

    s.on("lobby:dispute_started", ({ disputeId }: { disputeId: string }) => {
      toast.success("Dispute starting!");
      router.push(`/dispute/${disputeId}`);
    });

    s.on("lobby:error", ({ message }: { message: string }) => toast.error(message));

    return () => {
      s.off("lobby:state");
      s.off("lobby:player_joined");
      s.off("lobby:player_left");
      s.off("lobby:setting_updated");
      s.off("lobby:bet_proposed");
      s.off("lobby:bet_confirmation_update");
      s.off("lobby:token_proposal_update");
      s.off("lobby:token_limits_set");
      s.off("lobby:ready_update");
      s.off("lobby:player_kicked");
      s.off("lobby:kick_vote_update");
      s.off("lobby:dispute_started");
      s.off("lobby:error");
      s.emit("lobby:leave", { lobbyId: lobby.id, userId: currentUserId });
    };
  }, [isJoined, lobby.id, currentUserId, router]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const emit = useCallback((event: string, data: object) => {
    getSocket().emit(event, { lobbyId: lobby.id, userId: currentUserId, ...data });
  }, [lobby.id, currentUserId]);

  async function joinLobby() {
    setJoining(true);
    const res = await fetch(`/api/lobby/${lobby.id}/join`, { method: "POST" });
    if (!res.ok) {
      toast.error("Failed to join lobby.");
      setJoining(false);
      return;
    }
    setIsJoined(true);
    setJoining(false);
  }

  function updateTopic() {
    if (!topicInput.trim()) return;
    emit("lobby:update_setting", { field: "topic", value: topicInput.trim() });
  }

  function updateTimeLimit() {
    const mins = parseInt(timeLimitInput);
    if (isNaN(mins) || mins < 1 || mins > 180) {
      toast.error("Time limit must be 1–180 minutes.");
      return;
    }
    emit("lobby:update_setting", { field: "timeLimitSeconds", value: mins * 60 });
  }

  function updateMaxMsgTime() {
    const secs = parseInt(maxMsgTimeInput);
    if (isNaN(secs) || secs < 10 || secs > 300) {
      toast.error("Max message time must be 10–300 seconds.");
      return;
    }
    emit("lobby:update_setting", { field: "maxMessageTimeSeconds", value: secs });
  }

  function proposeBet() {
    const amount = parseInt(betInput);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Enter a valid bet amount.");
      return;
    }
    emit("lobby:propose_bet", { amount });
    setBetInput("");
  }

  function proposeTokenLimits() {
    const msg = parseInt(msgTokenInput);
    const total = parseInt(totalTokenInput);
    if (isNaN(msg) || msg < 10 || msg > 4000) {
      toast.error("Message limit must be 10–4000 tokens.");
      return;
    }
    if (isNaN(total) || total < 100) {
      toast.error("Total limit must be at least 100 tokens.");
      return;
    }
    emit("lobby:propose_token_limits", { messageTokenLimit: msg, totalTokenLimit: total });
    setMsgTokenInput("");
    setTotalTokenInput("");
  }

  async function sendInvite() {
    if (!inviteInput.trim()) return;
    const res = await fetch(`/api/lobby/${lobby.id}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: inviteInput.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Failed to send invite.");
    } else {
      toast.success(`Invite sent to ${inviteInput.trim()}`);
      setInviteInput("");
    }
  }

  // ── Join prompt ─────────────────────────────────────────────────────────────
  if (!isJoined && hasInvite) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <Card className="w-full max-w-sm border-primary/30 text-center">
          <CardHeader>
            <Swords className="mx-auto h-10 w-10 text-primary mb-2" />
            <CardTitle>You&apos;ve been invited</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {lobby.topic
                ? <>Topic: <span className="font-medium text-foreground">{lobby.topic}</span></>
                : "Topic not set yet"}
            </p>
            <p className="text-xs text-muted-foreground">
              {lobby.players.length} player{lobby.players.length !== 1 ? "s" : ""} in lobby
            </p>
            <Button className="w-full" onClick={joinLobby} disabled={joining}>
              {joining ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {joining ? "Joining…" : "Join Lobby"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Main lobby room ──────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
            Lobby · {lobby.id.slice(-6).toUpperCase()}
          </p>
          <h2 className="text-xl font-bold mt-0.5 leading-tight">
            {lobby.topic ?? <span className="text-muted-foreground italic font-normal">Awaiting topic…</span>}
          </h2>
        </div>
        <Badge variant="secondary" className="text-xs">
          {lobby.players.length} / ∞ players
        </Badge>
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
                const vote = kickVotes[p.userId];
                return (
                  <div
                    key={p.userId}
                    className="rounded-lg border border-border/50 bg-secondary/30 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {p.user?.username?.[0]?.toUpperCase() ?? "?"}
                        </div>
                        <span className="font-medium text-sm truncate">{p.user?.username ?? p.userId.slice(-6)}</span>
                        {p.userId === lobby.creatorId && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">host</Badge>
                        )}
                        {isMe && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 border-primary/50 text-primary">you</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {p.isReady ? (
                          <Badge className="text-[10px] bg-green-500/20 text-green-400 border-green-500/30 px-1.5 py-0">
                            Ready
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                            Waiting
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Bet confirmed indicator */}
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      {p.betConfirmed
                        ? <><Check className="h-3 w-3 text-green-500" /> Bet confirmed</>
                        : <><Clock className="h-3 w-3" /> Bet pending</>}
                    </div>

                    {/* Bet + kick */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Bet:{" "}
                        <span className={p.betAmount != null ? "text-foreground font-semibold" : "italic"}>
                          {p.betAmount != null ? `${p.betAmount} tokens` : "not set"}
                        </span>
                      </span>
                      {!isMe && lobby.players.length > 2 && (
                        <button
                          onClick={() => emit("lobby:vote_kick", { voterId: currentUserId, targetId: p.userId })}
                          className="text-[10px] text-destructive/60 hover:text-destructive transition-colors flex items-center gap-0.5"
                        >
                          <UserMinus className="h-3 w-3" />
                          Kick {vote ? `(${vote.votes}/${vote.required})` : ""}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Invite */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Invite Player
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Username"
                  value={inviteInput}
                  onChange={(e) => setInviteInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendInvite()}
                  className="bg-input/50 h-9 text-sm"
                />
                <Button size="sm" onClick={sendInvite} className="shrink-0 gap-1.5">
                  <UserPlus className="h-3.5 w-3.5" />
                  Invite
                </Button>
              </div>
              {(lobby.invites ?? []).length > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Pending: {(lobby.invites ?? []).map((i) => i.invitee.username).join(", ")}
                </p>
              )}
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
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-4">
              {/* Topic */}
              <div className="space-y-1.5">
                <Label className="text-xs">Topic</Label>
                {isCreator ? (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter the dispute topic…"
                      value={topicInput}
                      onChange={(e) => setTopicInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && updateTopic()}
                      className="bg-input/50 h-9 text-sm"
                    />
                    <Button size="sm" variant="secondary" onClick={updateTopic} className="shrink-0">
                      Set
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-md border border-border/50 bg-secondary/30 px-3 py-2 text-sm">
                    {lobby.topic ?? <span className="text-muted-foreground italic">Waiting for host…</span>}
                  </div>
                )}
              </div>

              {/* Time limit */}
              <div className="space-y-1.5">
                <Label className="text-xs">Time Limit</Label>
                {isCreator ? (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Minutes (1–180)"
                      type="number"
                      min={1}
                      max={180}
                      value={timeLimitInput}
                      onChange={(e) => setTimeLimitInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && updateTimeLimit()}
                      className="bg-input/50 h-9 text-sm"
                    />
                    <Button size="sm" variant="secondary" onClick={updateTimeLimit} className="shrink-0">
                      Set
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-md border border-border/50 bg-secondary/30 px-3 py-2 text-sm">
                    {lobby.timeLimitSeconds
                      ? `${Math.floor(lobby.timeLimitSeconds / 60)} minutes`
                      : <span className="text-muted-foreground italic">Waiting for host…</span>}
                  </div>
                )}
              </div>

              {/* Max message time */}
              <div className="space-y-1.5">
                <Label className="text-xs">Max Message Time</Label>
                {isCreator ? (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Seconds per turn (10–300)"
                      type="number"
                      min={10}
                      max={300}
                      value={maxMsgTimeInput}
                      onChange={(e) => setMaxMsgTimeInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && updateMaxMsgTime()}
                      className="bg-input/50 h-9 text-sm"
                    />
                    <Button size="sm" variant="secondary" onClick={updateMaxMsgTime} className="shrink-0">
                      Set
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-md border border-border/50 bg-secondary/30 px-3 py-2 text-sm">
                    {lobby.maxMessageTimeSeconds
                      ? `${lobby.maxMessageTimeSeconds}s per turn`
                      : <span className="text-muted-foreground italic">Waiting for host…</span>}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Token limits */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Token Limits
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              {lobby.messageTokenLimit != null ? (
                <div className="rounded-md border border-green-500/20 bg-green-500/5 px-4 py-3 space-y-1">
                  <p className="text-xs text-green-400 font-medium">Limits locked (averaged from all proposals)</p>
                  <div className="flex gap-6 text-sm">
                    <span>Per message: <strong>{lobby.messageTokenLimit}</strong> tokens</span>
                    <span>Total chat: <strong>{lobby.totalTokenLimit}</strong> tokens</span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Per-message limit</Label>
                      <Input
                        placeholder="e.g. 200"
                        type="number"
                        min={10}
                        max={4000}
                        value={msgTokenInput}
                        onChange={(e) => setMsgTokenInput(e.target.value)}
                        className="bg-input/50 h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Total chat limit</Label>
                      <Input
                        placeholder="e.g. 10000"
                        type="number"
                        min={100}
                        value={totalTokenInput}
                        onChange={(e) => setTotalTokenInput(e.target.value)}
                        className="bg-input/50 h-9 text-sm"
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={proposeTokenLimits}
                    disabled={me?.proposedMessageTokenLimit != null}
                    className="w-full"
                  >
                    {me?.proposedMessageTokenLimit != null ? "Proposal submitted ✓" : "Submit proposal"}
                  </Button>
                  <div className="space-y-1">
                    {lobby.players.map((p) => (
                      <div key={p.userId} className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{p.user?.username ?? "…"}</span>
                        <span>
                          {p.proposedMessageTokenLimit != null
                            ? `${p.proposedMessageTokenLimit} / ${p.proposedTotalTokenLimit}`
                            : <span className="italic">no proposal yet</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Bets */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Bets
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              {/* My bet input */}
              <div className="flex gap-2">
                <Input
                  placeholder={`Your bet (max ${me?.user?.tokenBalance ?? 0} tokens)`}
                  type="number"
                  min={1}
                  max={me?.user?.tokenBalance}
                  value={betInput}
                  onChange={(e) => setBetInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && proposeBet()}
                  className="bg-input/50 h-9 text-sm"
                />
                <Button size="sm" variant="secondary" onClick={proposeBet} className="shrink-0">
                  Set
                </Button>
              </div>

              {/* All players bets */}
              <div className="space-y-1.5">
                {lobby.players.map((p) => (
                  <div key={p.userId} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{p.user?.username ?? "…"}</span>
                    <div className="flex items-center gap-2">
                      <span className={p.betAmount != null ? "font-semibold" : "text-muted-foreground italic text-xs"}>
                        {p.betAmount != null ? `${p.betAmount} tokens` : "not set"}
                      </span>
                      {p.betConfirmed
                        ? <Check className="h-3.5 w-3.5 text-green-500" />
                        : <Clock className="h-3.5 w-3.5 text-muted-foreground" />}
                    </div>
                  </div>
                ))}
              </div>

              {/* Confirm bets button */}
              {lobby.players.every((p) => p.betAmount != null) && !me?.betConfirmed && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full border-green-500/30 text-green-400 hover:bg-green-500/10 hover:text-green-300"
                  onClick={() => emit("lobby:confirm_bet", {})}
                >
                  Confirm all bets
                </Button>
              )}
              {me?.betConfirmed && (
                <p className="text-center text-xs text-green-400">
                  <Check className="inline h-3.5 w-3.5 mr-1" />
                  You confirmed the bets
                </p>
              )}
            </CardContent>
          </Card>

          {/* Ready button */}
          <Button
            className="w-full h-12 text-base font-bold tracking-wide"
            disabled={!canReady || me?.isReady}
            onClick={() => emit("lobby:ready", {})}
          >
            {me?.isReady ? (
              <>
                <Check className="mr-2 h-5 w-5" />
                Ready!
              </>
            ) : canReady ? (
              "Ready Up"
            ) : (
              "Complete all settings to ready up"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
