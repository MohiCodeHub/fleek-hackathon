import type { ConversationSummary } from './store.js';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const BASE_CSS = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0b141a; color: #e9edef; }
  a { color: inherit; text-decoration: none; }
  .topbar { background: #202c33; padding: 14px 18px; font-weight: 600; display: flex; gap: 10px;
    align-items: center; position: sticky; top: 0; border-bottom: 1px solid #2a3942; }
  .topbar .sub { font-weight: 400; color: #8696a0; font-size: .85rem; }
  .wrap { max-width: 720px; margin: 0 auto; }
`;

/** Seller inbox — the list of active negotiations. */
export function inboxPage(conversations: ConversationSummary[]): string {
  const rows = conversations.length
    ? conversations
        .map(
          (c) => `
      <a class="row" href="/c/${encodeURIComponent(c.id)}">
        <div class="row-main">
          <div class="row-label">${esc(c.label)}</div>
          <div class="row-last">${c.lastRole === 'seller' ? 'You: ' : ''}${esc(c.lastMessage).slice(0, 90)}</div>
        </div>
        <div class="row-meta">${c.count} msg</div>
      </a>`,
        )
        .join('')
    : `<p class="empty">No conversations yet. A negotiation will appear here when the agent reaches out.</p>`;

  return `<!doctype html><html lang="en"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Seller inbox</title>
  <style>${BASE_CSS}
    .row { display: flex; justify-content: space-between; gap: 12px; align-items: center;
      padding: 14px 18px; border-bottom: 1px solid #2a3942; }
    .row:hover { background: #202c33; }
    .row-label { font-weight: 600; }
    .row-last { color: #8696a0; font-size: .88rem; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .row-meta { color: #8696a0; font-size: .78rem; white-space: nowrap; }
    .empty { padding: 40px 18px; color: #8696a0; }
  </style></head><body>
  <div class="topbar"><span>📥 Seller inbox</span><span class="sub">Fleek negotiations</span></div>
  <div class="wrap">${rows}</div>
  <script>setTimeout(() => location.reload(), 4000);</script>
  </body></html>`;
}

/** Seller chat thread — polls for agent messages, sends seller replies. */
export function chatPage(conversationId: string, label: string): string {
  const cid = JSON.stringify(conversationId);
  return `<!doctype html><html lang="en"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(label)}</title>
  <style>${BASE_CSS}
    html, body { height: 100%; }
    body { display: flex; flex-direction: column; }
    .thread { flex: 1; overflow-y: auto; padding: 18px; display: flex; flex-direction: column; gap: 8px; }
    .thread-inner { max-width: 720px; margin: 0 auto; width: 100%; display: flex; flex-direction: column; gap: 8px; }
    .bubble { max-width: 78%; padding: 8px 11px; border-radius: 8px; font-size: .95rem; line-height: 1.35;
      white-space: pre-wrap; word-wrap: break-word; }
    .agent { align-self: flex-start; background: #202c33; border-top-left-radius: 2px; }
    .seller { align-self: flex-end; background: #005c4b; border-top-right-radius: 2px; }
    .meta { font-size: .68rem; color: #8696a0; margin-top: 3px; }
    .seller .meta { color: #a7d3c8; text-align: right; }
    form { display: flex; gap: 8px; padding: 12px 18px; background: #202c33; border-top: 1px solid #2a3942; }
    .composer { max-width: 720px; margin: 0 auto; width: 100%; display: flex; gap: 8px; }
    textarea { flex: 1; resize: none; border: 0; border-radius: 8px; padding: 10px 12px; font: inherit;
      background: #2a3942; color: #e9edef; min-height: 42px; max-height: 120px; }
    button { border: 0; border-radius: 8px; padding: 0 18px; background: #00a884; color: #0b141a;
      font-weight: 600; cursor: pointer; }
    button:disabled { opacity: .5; cursor: default; }
    .back { color: #8696a0; }
  </style></head><body>
  <div class="topbar"><a class="back" href="/">←</a><span>${esc(label)}</span><span class="sub">you are the seller</span></div>
  <div class="thread"><div class="thread-inner" id="thread"></div></div>
  <form id="composer"><div class="composer">
    <textarea id="input" placeholder="Type your reply to the buyer's agent…" autocomplete="off"></textarea>
    <button id="send" type="submit">Send</button>
  </div></form>
  <script>
    const CID = ${cid};
    const thread = document.getElementById('thread');
    const input = document.getElementById('input');
    const form = document.getElementById('composer');
    let after = 0;
    function fmtTime(ts) { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    function render(msgs) {
      for (const m of msgs) {
        const el = document.createElement('div');
        el.className = 'bubble ' + (m.role === 'agent' ? 'agent' : 'seller');
        const body = document.createElement('div'); body.textContent = m.text; el.appendChild(body);
        const meta = document.createElement('div'); meta.className = 'meta';
        meta.textContent = (m.role === 'agent' ? "Buyer's agent · " : 'You · ') + fmtTime(m.ts);
        el.appendChild(meta);
        thread.appendChild(el); after = Math.max(after, m.id);
      }
      if (msgs.length) window.scrollTo(0, document.body.scrollHeight), thread.parentElement.scrollTop = thread.parentElement.scrollHeight;
    }
    async function poll() {
      try {
        const r = await fetch('/api/conversations/' + encodeURIComponent(CID) + '/messages?after=' + after);
        const d = await r.json(); if (d.messages && d.messages.length) render(d.messages);
      } catch (e) {}
    }
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim(); if (!text) return;
      input.value = ''; input.focus();
      await fetch('/api/conversations/' + encodeURIComponent(CID) + '/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'seller', text }),
      });
      poll();
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
    poll(); setInterval(poll, 1500);
  </script>
  </body></html>`;
}
