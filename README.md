# Abhi & Sanket

WhatsApp-native sourcing agents for **[Fleek](https://joinfleek.com)** — the B2B vintage wholesale marketplace connecting resellers and shops to 1,000+ verified suppliers worldwide. Built with [Wassist](https://wassist.app) for the a16z × Fleek hackathon (Agents & LLMs track).

A buyer texts demand on WhatsApp → **Abhi** (buyer agent) extracts a structured mandate and returns ranked supplier matches with fit rationale → the buyer picks → Abhi dispatches **Sanket** (supplier agent) **behind the scenes** to negotiate within the mandate → Abhi reports the closed deal or escalation — all in **one WhatsApp thread**.

## The idea

Fleek already surfaces bulk bales, grading, Demand Hub–style sourcing, and Virtual Handpick. The unsolved, agent-shaped problem is buyer↔supplier **matching + negotiation** — hard because it's async, multi-party, and judgement-under-a-mandate: two agents, each loyal to one side, while humans talk to one face.

- **Abhi** is the only WhatsApp face — fiduciary to the buyer. **Sanket** negotiates the supplier side **off-stage** (in-process vs inventory / supplier sim). One Pi SDK factory (`src/agent/factory.ts`) builds either agent by swapping the system prompt, on-demand skill, and scoped tools.
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

Key files: `src/agent/factory.ts` (one Pi SDK factory for both agents), `src/agent/tools/` (Abhi's `complete_onboarding`/`extract_mandate`/`find_matches`/`negotiate` and Sanket's `make_offer`/`accept_deal`/`escalate`), `skills/abhi-sourcing/` + `skills/sanket-negotiation/` (on-demand playbooks), `personas/*.md` (always-on identity and invariants), `src/mandate.ts`, `src/matching.ts`, `src/negotiation.ts`, `src/supplier-sim.ts`, `src/contract.ts`, `src/memory.ts`, `src/wassist.ts`, and `src/routes/webhook.ts`.

## Web surface

The same Hono app serves a small server-rendered web funnel (no Vite/React build):

| Route | Purpose |
|-------|---------|
| `GET /` | Landing page — one CTA: **Message Abhi on WhatsApp** (`wa.me`) |
| `GET /collections`, `GET /collections/:slug` | Catalog with per-lot WhatsApp sourcing links |
| `GET /api/products…` | Catalog product JSON (Postgres `products` table, seeded by `npm run seed`) |

Set `WHATSAPP_NUMBER` to override the sandbox number (`447424845871`). Pages are Hono JSX in
`src/web/`; styles in `public/web.css`; design tokens in `src/web/DESIGN.md`.

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

## Seller POV — the supply-side agent (local, no Wassist)

The buyer talks to Abhi; the **seller** (supplier) has their own side. With `SELLER_MODE=1`,
the moment a buyer picks a match, a supply-side agent **proactively** messages the seller on a
local WhatsApp-style console at **`/seller`**: *"You've been matched with {buyer} — they want X at
up to $Y."* It then reads the buyer + supplier **AM-Brain profiles** (`am-brain-hackathon/profiles/`,
the "context layer"), **recommends a counteroffer** grounded in that context, flags that the seller's
recent counters have varied, and **waits for the seller to approve** before it goes to the buyer.
Runs entirely on this machine — Wassist can't drive two devices, so the seller side is local by design.

```bash
# Fully-local two-POV demo in one process (buyer in terminal, seller in browser):
npm run seller-demo
#   → open http://localhost:8787/seller   (the supplier's phone)
#   → in the terminal, ask Abhi to source something, then pick an option to pursue
```

To attach the seller console to the real-WhatsApp buyer path instead, run `SELLER_MODE=1 npm run serve`
and open `/seller` while the buyer texts the Wassist number. The seller channel
(`src/seller/channel.ts`) is an in-memory bridge — swap it for a Baileys/WhatsApp adapter later without
touching the negotiation. Key files: `src/seller/handoff.ts` (proactive intro → profile-grounded
recommendation → approval), `src/seller/profiles.ts` (AM-Brain context loader), `src/routes/seller.ts`
+ `src/seller/page.ts` (the console).

## Test

```bash
npm test
npm run typecheck
npm run lint              # if Biome is installed
```

## Deliberately unresolved (pending Fleek conversations)

- Real supplier inventory structure — the matching interface (`Matcher` in `src/matching.ts`) is swappable.
- Fleeky's existing capabilities — determines whether to lean matching vs negotiation.
