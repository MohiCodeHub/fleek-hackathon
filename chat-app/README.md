# Seller chat platform

A minimal WhatsApp stand-in for **sellers**. The Fleek negotiation agent (Sanket)
relays its offers here over HTTP; a human seller reads them on a web chat and
replies. Needed because the WhatsApp sandbox only binds one device (the buyer),
so the seller side gets its own channel.

Self-contained (Hono + in-memory store, no DB). State resets on restart — fine
for a demo.

## Run locally

```bash
cd chat-app
npm install
npm start            # http://localhost:4000  (PORT overrides)
```

- `/`            — seller inbox (active negotiations)
- `/c/:id`       — chat thread for one negotiation

## API

- `POST /api/conversations/:id/messages` — `{ role: 'agent'|'seller', text, label? }`
  (auto-creates the conversation; the agent sends its opening line with a `label`).
- `GET  /api/conversations/:id/messages?after=<id>` — poll for new messages.
- `GET  /api/conversations` — inbox list.

## Deploy on Render

The repo root `render.yaml` is a Blueprint that builds this folder as its own
service (`rootDir: chat-app`). Render Dashboard → **New → Blueprint** → pick this
repo. Then set `SELLER_PLATFORM_URL=https://<service>.onrender.com` in the main
agent app so Sanket routes to it.
