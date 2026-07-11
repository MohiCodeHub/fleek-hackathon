# Jack & Jill

A WhatsApp-native agent system for **B2B secondhand-fashion sourcing**, built on [Fleek](https://fleek.co) + [Wassist](https://wassist.app) for the a16z × Fleek hackathon (Agents & LLMs track).

A buyer states demand in natural language → **Jack** extracts a structured mandate and returns ranked supplier matches with fit rationale → the buyer picks → **Jill** autonomously negotiates within the buyer's mandate → returns a closed deal, all in one WhatsApp thread.

## The idea

The unsolved, agent-shaped problem downstream of Fleek Sort ("what is this item") is buyer↔supplier **matching + negotiation** — hard because it's async (parties never online together), multi-party, and judgement-under-a-mandate. We build on Sort's output, not the vision layer.

- **Jack** faces the buyer. **Jill** faces the supplier. They're the *same agent harness* — only the system prompt and scoped memory differ. Persona is chosen by who's on the other end of the WhatsApp thread.
- Negotiation is **autonomous within a contract**: `≤ price ceiling, ≥ grade floor, ≥ quantity`. Jill auto-closes inside the mandate and escalates to the buyer only when terms fall outside it.
- A **memory brain** accretes per-buyer revealed preferences so matching sharpens over time — Fleek's data-flywheel thesis.

## Architecture

```
WhatsApp ─▶ Wassist ─▶ POST /webhook (BYOA payload) ─▶ interim JSON reply
                                              │
                                     background: Jack/Jill + Postgres
                                              │
                          POST reply_callback ─▶ Wassist ─▶ WhatsApp
```

| Env var | Meaning |
|---------|---------|
| `WASSIST_BASE_URL` | Wassist **platform API** (default `https://wassist.app`) — not your tunnel |
| `PUBLIC_WEBHOOK_URL` | **Your** public `…/webhook` that Wassist calls (Railway HTTPS or local ngrok) |

Key files: `src/agent/harness.ts`, `src/agent/jack.ts`, `src/mandate.ts`, `src/matching.ts`,
`src/negotiation.ts`, `src/wassist.ts`, `src/routes/webhook.ts`, `personas/*.md`.

## Setup

```bash
npm install
cp .env.example .env      # add OPENAI_API_KEY (+ DATABASE_URL)
npm run db:push           # apply Drizzle schema
npm run seed              # seed fuzzy bulk-bale inventory + a buyer
```

## Run

**Offline demo (without WhatsApp):**
```bash
npm run demo
npm run chat
```

**WhatsApp via Wassist (Railway):**
```bash
# 1. Deploy this service; set WASSIST_API_KEY, DATABASE_URL, OPENAI_API_KEY on Railway
# 2. Point Wassist at your public webhook:
PUBLIC_WEBHOOK_URL=https://<service>.up.railway.app/webhook npm run register
# 3. In the Wassist dashboard, deploy the agent to your WhatsApp number
# 4. Text the number from WhatsApp
```

**WhatsApp via Wassist (local):**
```bash
npm run serve             # :8787
ngrok http 8787           # only needed locally — Railway already has HTTPS
PUBLIC_WEBHOOK_URL=https://<ngrok-host>/webhook npm run register
```

## Test

```bash
npm test
npm run typecheck
npm run lint              # if Biome is installed
```

## Deliberately unresolved (pending Fleek conversations)

- Real supplier inventory structure — the matching interface (`Matcher` in `src/matching.ts`) is swappable.
- Fleeky's existing capabilities — determines whether to lean matching vs negotiation.
