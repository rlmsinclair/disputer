# Disputer

A real-time structured debate platform where users argue a topic, wager tokens on the outcome, and have Claude judge the winner.

## How it works

1. A player creates a lobby and invites opponents
2. Both sides agree on a topic, time limits, per-message token caps, and bet amounts
3. The dispute begins — players take turns making arguments in a chat-style interface
4. When all players pass or the token budget runs out, Claude reads the full transcript and delivers a verdict with reasoning
5. Tokens are redistributed from losers to winners; results appear on profiles and the leaderboard

## Tech stack

- **Next.js 16** — App Router, server components, API routes
- **Socket.io** — real-time turn management, live lobby state
- **Prisma 7** + **PostgreSQL** — data layer with `@prisma/adapter-pg`
- **Auth.js v5** — credentials-based auth with JWT sessions
- **Anthropic SDK** — Claude judges disputes via the Messages API
- **Web Push** — browser push notifications for turn reminders
- **Tailwind CSS v4** + **shadcn/ui** — UI components

## Project structure

```
app/
  (app)/          # Authenticated app pages (lobby, dispute, profile, leaderboard)
  (auth)/         # Login and register pages
  admin/          # Admin dashboard (users, reports)
  api/            # REST API routes
components/
  dispute/        # DisputeRoom — live debate UI
  lobby/          # LobbyRoom — pre-game setup
  leaderboard/    # Paginated rankings
  profile/        # Dispute history
  admin/          # Users and reports tables
  ui/             # shadcn/ui primitives
lib/
  auth.ts         # Auth.js configuration
  claude.ts       # Dispute judging via Claude
  settlement.ts   # Token redistribution logic
  socket/
    disputeHandlers.ts   # Turn management, timeouts, judging trigger
    lobbyHandlers.ts     # Ready flow, bet negotiation, kick votes
  tokens.ts       # Daily login reward
  tokenizer.ts    # Per-message token counting (tiktoken)
  push.ts         # Web Push notifications
prisma/
  schema.prisma   # Database schema
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
| `npm run db:generate` | Regenerate Prisma client after schema changes |
| `npm run db:migrate` | Run database migrations |
| `npm run db:push` | Push schema changes without migrations (dev only) |
| `npm run db:studio` | Open Prisma Studio |
| `npm run lint` | Run ESLint |

## Key mechanics

**Token economy** — new users start with 100 tokens and earn 100 more on each daily login. Bets are escrowed at dispute start; winners receive their stake back plus a share of the loser pool (capped at their own bet size). Failed judging refunds all bets.

**Turn system** — players take turns in circle order. Each turn has a configurable time limit; missing it marks the player inactive (they can rejoin). All players passing consecutively ends the dispute.

**Token limits** — each player proposes a per-message and total-chat token limit; the lobby locks in the average of all proposals. Total is capped at 178,000 tokens to fit within Claude's context window.

**Judging** — Claude receives the full transcript plus a system prompt instructing it to judge on argument quality, clarity, and logic only (not tone or message count). The verdict includes winner IDs and a written explanation. If judging fails after 3 attempts, all bets are refunded and the dispute is cancelled.

**Privacy** — disputes can be toggled private by any participant. Private disputes are hidden from the leaderboard and other users' profiles.
