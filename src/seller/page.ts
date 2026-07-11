/**
 * Self-contained WhatsApp-style seller console (no build step, no external
 * assets). Streams messages from the supply-side agent over SSE and posts the
 * seller's replies back. Served at GET /seller.
 */
export const sellerPageHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<title>Fleek Sourcing — Supplier</title>
<style>
  :root { --wa-teal:#128C7E; --wa-green:#25D366; --wa-out:#d9fdd3; --wa-bg:#efeae2; --wa-in:#fff; }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #d1d7db; display: flex; justify-content: center;
  }
  .phone {
    width: 100%; max-width: 460px; height: 100vh; display: flex; flex-direction: column;
    background: var(--wa-bg); box-shadow: 0 0 24px rgba(0,0,0,.15);
  }
  header {
    background: var(--wa-teal); color: #fff; padding: 10px 14px; display: flex; align-items: center; gap: 12px;
  }
  .avatar {
    width: 40px; height: 40px; border-radius: 50%; background: #0b6b60; color: #fff;
    display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 15px; flex: 0 0 auto;
  }
  .who { line-height: 1.25; }
  .who .name { font-weight: 600; font-size: 16px; }
  .who .sub { font-size: 12px; opacity: .85; }
  #log {
    flex: 1; overflow-y: auto; padding: 14px 12px 6px;
    background-image: linear-gradient(rgba(229,221,213,.6), rgba(229,221,213,.6));
    display: flex; flex-direction: column; gap: 6px;
  }
  .row { display: flex; }
  .row.agent { justify-content: flex-start; }
  .row.seller { justify-content: flex-end; }
  .row.system { justify-content: center; }
  .bubble {
    max-width: 82%; padding: 7px 10px 8px; border-radius: 8px; font-size: 14.5px; line-height: 1.4;
    box-shadow: 0 1px .5px rgba(0,0,0,.13); white-space: pre-wrap; word-wrap: break-word; position: relative;
  }
  .agent .bubble { background: var(--wa-in); border-top-left-radius: 2px; }
  .seller .bubble { background: var(--wa-out); border-top-right-radius: 2px; }
  .system .bubble {
    background: #d8e7ee; color: #4a5a63; font-size: 12.5px; text-align: center;
    box-shadow: none; border-radius: 12px; padding: 4px 12px;
  }
  .bubble .time { font-size: 10.5px; color: #667781; float: right; margin: 4px 0 -2px 10px; }
  .bubble.mirror { background: #f5f6f2; color: #3b4a3b; font-size: 13px; }
  .quick { display: flex; flex-wrap: wrap; gap: 8px; padding: 4px 12px 10px; justify-content: flex-end; }
  .quick button {
    border: 1px solid var(--wa-teal); background: #fff; color: var(--wa-teal); border-radius: 18px;
    padding: 7px 14px; font-size: 13.5px; font-weight: 600; cursor: pointer;
  }
  .quick button:active { background: #e7f4f2; }
  footer { display: flex; gap: 8px; padding: 8px 10px; background: #f0f0f0; align-items: center; }
  #text {
    flex: 1; border: none; border-radius: 20px; padding: 10px 14px; font-size: 15px; outline: none; background: #fff;
  }
  #send {
    width: 44px; height: 44px; border: none; border-radius: 50%; background: var(--wa-teal); color: #fff;
    font-size: 19px; cursor: pointer; flex: 0 0 auto;
  }
  .empty { color: #667781; text-align: center; margin: auto; font-size: 14px; padding: 24px; }
</style>
</head>
<body>
  <div class="phone">
    <header>
      <div class="avatar">FS</div>
      <div class="who">
        <div class="name">Fleek Sourcing</div>
        <div class="sub" id="status">supply-side agent · online</div>
      </div>
    </header>
    <div id="log"><div class="empty" id="empty">Waiting for a buyer match…<br>Trigger a negotiation on the buyer side and it'll land here.</div></div>
    <div class="quick" id="quick"></div>
    <footer>
      <input id="text" placeholder="Message" autocomplete="off" />
      <button id="send" title="Send">➤</button>
    </footer>
  </div>
<script>
  const log = document.getElementById('log');
  const quick = document.getElementById('quick');
  const empty = document.getElementById('empty');
  const seen = new Set();

  function esc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function fmt(s){
    return esc(s)
      .replace(/\\*([^*]+)\\*/g, '<strong>$1</strong>')
      .replace(/_([^_]+)_/g, '<em>$1</em>')
      .replace(/\\n/g, '<br>');
  }
  function time(ts){ const d = new Date(ts); return d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); }

  function render(m){
    if (seen.has(m.id)) return; seen.add(m.id);
    if (empty) empty.remove();
    quick.innerHTML = '';
    const side = m.from === 'seller' ? 'seller' : (m.from === 'system' ? 'system' : 'agent');
    const row = document.createElement('div');
    row.className = 'row ' + side;
    const b = document.createElement('div');
    b.className = 'bubble' + (m.kind === 'mirror' ? ' mirror' : '');
    b.innerHTML = fmt(m.text) + (side === 'system' ? '' : '<span class="time">' + time(m.ts) + '</span>');
    row.appendChild(b);
    log.appendChild(row);
    if (m.quickReplies && m.quickReplies.length) {
      for (const label of m.quickReplies) {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.onclick = () => send(label);
        quick.appendChild(btn);
      }
    }
    log.scrollTop = log.scrollHeight;
  }

  async function send(text){
    text = (text || '').trim(); if (!text) return;
    document.getElementById('text').value = '';
    quick.innerHTML = '';
    await fetch('/seller/reply', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text }) });
  }

  document.getElementById('send').onclick = () => send(document.getElementById('text').value);
  document.getElementById('text').addEventListener('keydown', e => { if (e.key === 'Enter') send(e.target.value); });

  const es = new EventSource('/seller/stream');
  es.addEventListener('message', e => { try { render(JSON.parse(e.data)); } catch {} });
  es.addEventListener('reset', () => { log.innerHTML = ''; quick.innerHTML = ''; seen.clear(); });
</script>
</body>
</html>`;
