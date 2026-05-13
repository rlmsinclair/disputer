# Objection

A real-time 1v1 debate platform where users argue a topic and have Claude judge the winner. Results affect each player's ELO rating.

## How it works

1. A player creates a lobby and shares the link with their opponent
2. The host sets the topic and word limits; both players can discuss settings in the lobby chat. The opponent ready-ups to signal agreement; once they're ready the host can start
3. The dispute begins — both players can post arguments freely in a chat-style interface, with each player's draft visible to the opponent letter-by-letter as they type
4. When all active players pass, or the total word budget runs out, Claude reads the full transcript and delivers a verdict with reasoning
5. ELO ratings are updated based on the result; outcomes appear on profiles, notifications, and the leaderboard

## Tech stack

- **Next.js 16** — App Router, server components, API routes
- **Socket.io** — real-time messaging, live lobby state, live typing
- **Prisma 7** + **PostgreSQL** — data layer with `@prisma/adapter-pg`
- **Auth.js v5** — credentials-based auth with JWT sessions
- **Anthropic SDK** — Claude judges disputes via the Messages API
- **Web Push** — browser push notifications for dispute results
- **Tailwind CSS v4** + **shadcn/ui** — UI components

## Project structure

```
app/
  (app)/          # Authenticated app pages (lobby, dispute, profile, leaderboard, notifications)
  (auth)/         # Login and register pages
  admin/          # Admin dashboard (users, reports)
  api/            # REST API routes
components/
  dispute/        # DisputeRoom — live debate UI
  lobby/          # LobbyRoom and CreateLobbyButton
  leaderboard/    # Paginated ELO rankings
  profile/        # Dispute history with ELO changes
  admin/          # Users and reports tables
  layout/         # Navbar
  ui/             # shadcn/ui primitives
hooks/
  useSocket.ts    # Shared Socket.io client singleton
lib/
  auth.ts         # Auth.js configuration
  claude.ts       # Dispute judging via Claude
  elo.ts          # ELO calculation (K=32)
  wordcount.ts    # Per-message word counting
  socket/
    disputeHandlers.ts   # Message handling, pass/end logic, judging, ELO settlement
    lobbyHandlers.ts     # Start flow, settings, ready-up, lobby chat
  push.ts         # Web Push notifications
prisma/
  schema.prisma   # Database schema
middleware.ts     # Auth route protection
server.ts         # Custom HTTP + Socket.io server
```

## Getting started

### Prerequisites

- Node.js 20+
- PostgreSQL database

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Random secret for JWT signing — `openssl rand -base64 32` |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | VAPID public key for Web Push |
| `VAPID_PRIVATE_KEY` | VAPID private key for Web Push |
| `VAPID_SUBJECT` | Contact email for Web Push (`mailto:you@example.com`) |
| `NEXT_PUBLIC_APP_URL` | Base URL of the app (e.g. `http://localhost:3000`) |

Generate VAPID keys:
```bash
npx web-push generate-vapid-keys
```

### 3. Set up the database

```bash
npm run db:migrate
```

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server (Next.js + Socket.io) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run tunnel` | Start Cloudflare tunnel for objection.wtf |
| `npm run db:generate` | Regenerate Prisma client after schema changes |
| `npm run db:migrate` | Run database migrations |
| `npm run db:push` | Push schema changes without migrations (dev only) |
| `npm run db:studio` | Open Prisma Studio |
| `npm run lint` | Run ESLint |

## Key mechanics

**ELO rating** — all users start at 1200. After each dispute, ratings shift using standard ELO (K=32). The expected score is calculated from the rating difference, so beating a stronger opponent yields more points than beating a weaker one.

**1v1 only** — lobbies are capped at two players. The host shares a URL; anyone logged in can join an open lobby.

**Lobby chat** — players can chat in real-time before the dispute starts to agree on settings. Chat history is in-memory only and cleared when the dispute begins.

**Word limits** — the host controls the per-message word limit (default 200) and total word limit (default 10,000). Limits apply to actual word count (whitespace-separated), not tokens. The host can adjust these in the lobby and changes propagate to the opponent immediately; once the opponent readies up, settings are locked.

**Live typing** — as a player types their argument, the draft appears letter-by-letter for their opponent, styled as a ghost message with a blinking cursor.

**Free-form messaging** — both active players can post arguments at any time. There is no enforced turn order. The dispute ends when all active players pass or the total word budget is exhausted.

**Spectating** — any logged-in user can view a dispute in progress. They see messages and live drafts in real time but cannot interact.

**Notifications** — after a dispute settles, each player receives an in-app notification with the outcome and ELO change. The `/notifications` page marks them read on visit.

**Judging** — Claude receives the full transcript plus a system prompt instructing it to judge on argument quality, clarity, and logic only (not tone or message count). The verdict includes winner IDs and a written explanation. If judging fails after 3 attempts the dispute is cancelled with no ELO change.

**Privacy** — disputes can be toggled private by any participant. Private disputes are excluded from the leaderboard and other users' profiles.
