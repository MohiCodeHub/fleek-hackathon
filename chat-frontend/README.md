# Seller Desk — chat frontend

Standalone React (Vite) frontend for the seller chat. Talks to the `chat-app`
JSON API. Deployable as a static site on **Vercel**; the `chat-app` backend runs
on Render.

## Local dev

```bash
cd chat-frontend
npm install
npm run dev            # http://localhost:5173
```

Start the backend too (`cd ../chat-app && npm start`). In dev the Vite proxy
forwards `/api` → `http://localhost:4000`, so no env var is needed.

## Deploy on Vercel

- Import the repo → set **Root Directory** to `chat-frontend`.
- Framework preset: **Vite** (auto-detected). Build `npm run build`, output `dist`.
- **Env var:** `VITE_API_BASE_URL = https://<your-render-service>.onrender.com`

That's the only variable. The backend enables CORS on `/api/*`, so the Vercel
origin can call it directly.
