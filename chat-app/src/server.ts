import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { chatPage, inboxPage } from './pages.js';
import {
  appendMessage,
  getConversation,
  listConversations,
  messagesSince,
} from './store.js';

const app = new Hono();

// Allow the standalone frontend (e.g. Vercel) to call the API cross-origin.
app.use('/api/*', cors());

// --- Web UI ---------------------------------------------------------------

app.get('/', (c) => c.html(inboxPage(listConversations())));

app.get('/c/:id', (c) => {
  const id = c.req.param('id');
  const conv = getConversation(id);
  // Allow opening a not-yet-created conversation gracefully (label falls back to id).
  return c.html(chatPage(id, conv?.label ?? id));
});

// --- JSON API (agent + seller UI) -----------------------------------------

app.get('/api/conversations', (c) => c.json({ conversations: listConversations() }));

app.get('/api/conversations/:id/messages', (c) => {
  const id = c.req.param('id');
  const after = Number.parseInt(c.req.query('after') ?? '0', 10) || 0;
  const conv = getConversation(id);
  return c.json({
    conversationId: id,
    label: conv?.label ?? id,
    messages: messagesSince(id, after),
  });
});

app.post('/api/conversations/:id/messages', async (c) => {
  const id = c.req.param('id');
  let body: { role?: string; text?: string; label?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Body must be JSON.' }, 400);
  }
  const role = body.role === 'seller' ? 'seller' : 'agent';
  const text = (body.text ?? '').toString().trim();
  if (!text) return c.json({ error: 'text is required.' }, 400);
  const message = appendMessage(id, role, text, body.label);
  return c.json({ conversationId: id, message }, 201);
});

app.get('/health', (c) => c.json({ ok: true, service: 'seller-chat' }));

const port = Number(process.env.PORT ?? 4000);
serve({ fetch: app.fetch, port });
console.log(`Seller chat platform listening on http://localhost:${port}`);
