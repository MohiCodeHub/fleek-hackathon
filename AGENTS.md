# AGENTS.md

## Project overview

**Abhi & Sanket** — WhatsApp-native sourcing agents for [Fleek](https://joinfleek.com) (B2B vintage wholesale marketplace). Built for the a16z × Fleek hackathon.

| Agent | Role | Surface |
|-------|------|---------|
| **Abhi** | Buyer agent — mandate, match, dispatch Sanket, report | **Only** WhatsApp face (buyer thread) |
| **Sanket** | Supplier agent — negotiate within mandate (price / grade / qty) | **Behind the scenes** (Abhi dispatches; in-process vs supplier sim) |

Doctrine: two agents, one thread. Humans never talk to Sanket on WhatsApp in MVP.

Stack: **Node ≥22**, **TypeScript (ESM)**, **Hono** + `@hono/node-server`, **Drizzle + Postgres**, **OpenAI**, **Wassist BYOA** (WhatsApp transport). Deployed on **Railway**.

Package manager: **npm**. Root package name: `abhi-and-sanket`.

There is a separate `website/` Vite React app; treat it as out of scope unless the task explicitly targets it. Biome/CI cover root `src/` and `tests/` only.

## Architecture (backend)

```
WhatsApp → Wassist → POST /webhook (BYOA) → interim JSON reply
                              ↓ background
                     Abhi/Sanket + Postgres
                              ↓
              POST reply_callback → Wassist → WhatsApp
```

Key paths:

| Path | Purpose |
|------|---------|
| `src/server.ts` | Listen on `0.0.0.0:$PORT` |
| `src/app.ts` | Hono app factory (used by tests via `app.request()`) |
| `src/routes/webhook.ts` | BYOA webhook: interim reply + background `processInbound` |
| `src/routes/health.ts` | `GET /health`, `GET /` |
| `src/handler.ts` | Buyer WhatsApp → Abhi; supplier numbers → stub (Sanket is off-stage) |
| `src/agent/abhi.ts` | Buyer agent + tools |
| `src/agent/harness.ts` | Shared tool-use loop |
| `src/negotiation.ts` | Sanket autonomous negotiation loop |
| `src/wassist.ts` | Parse BYOA payload, signatures, `replyViaCallback` |
| `src/db/` | Drizzle client, schema, accessors |
| `personas/*.md` | System prompts (`abhi`, `sanket`, `supplier-responder`) |

Do not confuse env vars:

- `WASSIST_BASE_URL` — Wassist **platform** API (default `https://wassist.app`)
- `PUBLIC_WEBHOOK_URL` — **this** service’s public `/webhook` (Railway HTTPS or local ngrok)

## Setup commands

```bash
npm install
cp .env.example .env   # OPENAI_API_KEY, DATABASE_URL required for agent runs
npm run db:push        # apply Drizzle schema to Postgres
npm run seed           # fuzzy bulk-bale inventory + demo buyer
```

Required env (see `.env.example`):

- `OPENAI_API_KEY`, `DATABASE_URL`
- For WhatsApp: `WASSIST_API_KEY`, `PUBLIC_WEBHOOK_URL`; optional `WASSIST_WEBHOOK_SECRET`
- Optional model overrides: `MODEL_REASONING`, `MODEL_FAST`

Never commit `.env`. Config loads with `dotenv` override (`src/config.ts`).

## Development workflow

```bash
npm run serve          # same as start — Hono on PORT (default 8787)
npm run demo           # scripted buyer → Abhi → Sanket (needs DB + OpenAI)
npm run chat           # interactive CLI as buyer talking to Abhi
npm run register       # register BYOA webhook with Wassist (needs PUBLIC_WEBHOOK_URL)
npm run db:studio      # Drizzle Studio
```

Local WhatsApp: run `npm run serve`, expose with ngrok, set `PUBLIC_WEBHOOK_URL=https://…/webhook`, then `npm run register`. Railway already has HTTPS — ngrok is local-only.

Imports use `.js` extensions in TypeScript source (ESM / NodeNext-style). Prefer matching existing patterns when adding files.

## Testing instructions

```bash
npm test               # vitest run
npm run test:watch     # vitest watch
npm run typecheck      # tsc --noEmit
npm run lint           # biome check .
npm run lint:fix      # biome check --write .
```

Tests live in `tests/`:

- `tests/contract.test.ts` — mandate contract guards
- `tests/wassist.test.ts` — BYOA parse / reply helpers
- `tests/server.test.ts` — Hono routes via `createApp()`

CI (`.github/workflows/ci.yml`) on every PR and pushes to `main`:

1. `npm ci`
2. `npx biome ci .`
3. `npm run typecheck`
4. `npm test`

Before opening or updating a PR, run the same four checks locally. Fix Biome formatting failures with `npm run lint:fix` (line wrap at 100, single quotes).

## Code style

- TypeScript strict; `noUncheckedIndexedAccess` on
- Biome 2.5.3: 2-space indent, line width 100, **single quotes**, recommended lint rules
- Personas: edit `personas/*.md`; load via `loadPersona()` in `src/personas.ts`
- Agent naming: **Abhi** = buyer, **Sanket** = supplier — do not reintroduce Jack/Jill
- Negotiation speaker in transcripts: `'sanket' | 'supplier'`
- Keep webhook responses fast: interim JSON within ~5s; long work via `reply_callback`
- Prefer small, focused modules over large refactors; match existing file layout

## Build and deployment

No separate build artifact for production — Railway runs `npm start` (`tsx src/server.ts`) per `railway.toml`. Health check: `GET /health`.

Railway env must include at least: `DATABASE_URL`, `OPENAI_API_KEY`, `WASSIST_API_KEY`, `WASSIST_BASE_URL`, `PUBLIC_WEBHOOK_URL` (service’s own `/webhook`). After deploy, re-register BYOA if the public URL changed.

## Pull request guidelines

- One concern → one branch → one PR (do not stack unrelated work)
- Prefer concise commit messages focused on why
- Required green checks: Biome CI, typecheck, tests
- Do not commit secrets (`.env`, API keys)
- Update tests when changing webhook/BYOA shapes or health payloads

## Domain / product context

- Fleek product: [joinfleek.com](https://joinfleek.com) — not fleek.co
- **Two agents, one WhatsApp thread:** Abhi faces the buyer; Sanket negotiates behind the scenes when Abhi dispatches `negotiate`
- Inventory is messy **bulk bales** (grade, quantity, ask price), not clean retail SKUs
- Negotiation is autonomous **inside** the mandate; escalate only when best terms fall outside
- WhatsApp is the primary UX; offline `demo` / `chat` scripts exist for rehearsal without Wassist

## Common gotchas

- `WASSIST_BASE_URL` ≠ public webhook URL
- Interim webhook reply text is asserted in `tests/server.test.ts` — update tests if you change copy
- Renaming agents/personas requires updating `PersonaName`, file names under `personas/`, and negotiation speaker unions
- Unit tests for Hono do not need Postgres; agent `demo`/`chat`/`seed` do
