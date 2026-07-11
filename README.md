# Abhi & Sanket

WhatsApp-native sourcing agents for **[Fleek](https://joinfleek.com)** — the B2B vintage wholesale marketplace connecting resellers and shops to 1,000+ verified suppliers worldwide. Built with [Wassist](https://wassist.app) for the a16z × Fleek hackathon (Agents & LLMs track).

A buyer texts demand on WhatsApp → **Abhi** (buyer agent) extracts a structured mandate and returns ranked supplier matches with fit rationale → the buyer picks → Abhi dispatches **Sanket** (supplier agent) **behind the scenes** to negotiate within the mandate → Abhi reports the closed deal or escalation — all in **one WhatsApp thread**.

## The idea

Fleek already surfaces bulk bales, grading, Demand Hub–style sourcing, and Virtual Handpick. The unsolved, agent-shaped problem is buyer↔supplier **matching + negotiation** — hard because it's async, multi-party, and judgement-under-a-mandate. Pattern inspired by dual-agent marketplaces (Jack & Jill–style): two agents, each loyal to one side; humans only talk to one face.

- **Abhi** is the only WhatsApp face — fiduciary to the buyer. **Sanket** negotiates the supplier side **off-stage** (in-process vs inventory / supplier sim). Same product, two agents; one thread.
- Negotiation is **autonomous within a contract**: `≤ price ceiling, ≥ grade floor, ≥ quantity`. Sanket auto-closes inside the mandate and escalates to Abhi (who tells the buyer) only when terms fall outside it.
- A **memory brain** accretes per-buyer revealed preferences so matching sharpens over time — Fleek's data-flywheel thesis.

## Architecture

```
Buyer WhatsApp ─▶ Wassist ─▶ POST /webhook ─▶ interim JSON reply
                                    │
                         background: Abhi (tools)
                                    │
              Abhi ──dispatch──▶ Sanket (behind the scenes) + Postgres
                                    │
                         Abhi final reply
                                    │
              POST reply_callback ─▶ Wassist ─▶ same WhatsApp thread
```

| Env var | Meaning |
|---------|---------|
| `WASSIST_BASE_URL` | Wassist **platform API** (default `https://wassist.app`) — not your tunnel |
| `PUBLIC_WEBHOOK_URL` | **Your** public `…/webhook` that Wassist calls (Railway HTTPS or local ngrok) |

Key files: `src/agent/harness.ts`, `src/agent/abhi.ts`, `src/mandate.ts`, `src/matching.ts`,
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
