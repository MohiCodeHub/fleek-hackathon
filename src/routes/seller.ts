import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { log } from '../log.js';
import { type SellerMessage, sellerChannel } from '../seller/channel.js';
import { sellerPageHtml } from '../seller/page.js';

/**
 * The seller-POV console: a local WhatsApp-style page the supplier watches
 * during the demo. GET /seller serves the page; /seller/stream is the live SSE
 * feed; POST /seller/reply is the seller's outbound message (their approval).
 */
export const sellerRoutes = new Hono();

sellerRoutes.get('/seller', (c) => c.html(sellerPageHtml));

sellerRoutes.get('/seller/stream', (c) =>
  streamSSE(c, async (stream) => {
    // Replay the thread so a fresh/refreshed tab is in sync.
    for (const m of sellerChannel.history()) {
      await stream.writeSSE({ event: 'message', data: JSON.stringify(m), id: m.id });
    }

    const onMessage = (m: SellerMessage) => {
      stream.writeSSE({ event: 'message', data: JSON.stringify(m), id: m.id }).catch(() => {});
    };
    const onReset = () => {
      stream.writeSSE({ event: 'reset', data: '{}' }).catch(() => {});
    };
    sellerChannel.on('message', onMessage);
    sellerChannel.on('reset', onReset);

    // Heartbeat so proxies don't drop the idle connection.
    const ping = setInterval(() => {
      stream.writeSSE({ event: 'ping', data: '' }).catch(() => {});
    }, 25_000);

    await new Promise<void>((resolve) => stream.onAbort(resolve));

    clearInterval(ping);
    sellerChannel.off('message', onMessage);
    sellerChannel.off('reset', onReset);
  }),
);

sellerRoutes.post('/seller/reply', async (c) => {
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return c.json({ ok: false, error: 'empty' }, 400);
  const msg = sellerChannel.submitReply(text);
  log.info('seller.reply', { len: text.length });
  return c.json({ ok: true, id: msg.id });
});

/** Clear the thread between demo runs (also fired by the combined demo script). */
sellerRoutes.post('/seller/reset', (c) => {
  sellerChannel.reset();
  return c.json({ ok: true });
});
