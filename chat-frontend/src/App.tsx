import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  type ConversationSummary,
  getMessages,
  listConversations,
  type Message,
  sendSellerMessage,
} from './api';

function timeOf(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function App() {
  const [convos, setConvos] = useState<ConversationSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [online, setOnline] = useState(true);
  const afterRef = useRef(0);
  const threadRef = useRef<HTMLDivElement>(null);

  // Poll the inbox.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const c = await listConversations();
        if (alive) {
          setConvos(c);
          setOnline(true);
        }
      } catch {
        if (alive) setOnline(false);
      }
    };
    tick();
    const iv = setInterval(tick, 3000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  // Poll the open conversation.
  useEffect(() => {
    if (!selected) return;
    afterRef.current = 0;
    setMessages([]);
    let alive = true;
    const tick = async () => {
      try {
        const d = await getMessages(selected, afterRef.current);
        if (!alive) return;
        setLabel(d.label);
        if (d.messages.length) {
          setMessages((prev) => [...prev, ...d.messages]);
          afterRef.current = Math.max(afterRef.current, ...d.messages.map((m) => m.id));
        }
      } catch {
        /* transient */
      }
    };
    tick();
    const iv = setInterval(tick, 1500);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [selected]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages]);

  const send = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const t = text.trim();
      if (!t || !selected) return;
      setText('');
      try {
        await sendSellerMessage(selected, t);
      } catch {
        setText(t); // restore on failure
      }
    },
    [text, selected],
  );

  const activeLabel = label || convos.find((c) => c.id === selected)?.label || selected || '';

  return (
    <div className="app" data-view={selected ? 'chat' : 'inbox'}>
      <aside className="sidebar">
        <header className="side-head">
          <div className="brand">
            <span className="brand-mark">◆</span>
            <div>
              <div className="brand-name">Seller Desk</div>
              <div className="brand-sub">Fleek negotiations</div>
            </div>
          </div>
          <span className={`dot ${online ? 'on' : 'off'}`} title={online ? 'Connected' : 'Reconnecting…'} />
        </header>
        <div className="inbox">
          {convos.length === 0 ? (
            <p className="empty small">
              No conversations yet. When a buyer's agent starts a negotiation, it appears here.
            </p>
          ) : (
            convos.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`convo ${c.id === selected ? 'active' : ''}`}
                onClick={() => setSelected(c.id)}
              >
                <div className="convo-top">
                  <span className="convo-label">{c.label}</span>
                  <span className="convo-time">{timeOf(c.lastTs)}</span>
                </div>
                <div className="convo-last">
                  {c.lastRole === 'seller' ? 'You: ' : ''}
                  {c.lastMessage}
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      <main className="chat">
        {selected ? (
          <>
            <header className="chat-head">
              <button type="button" className="back" onClick={() => setSelected(null)} aria-label="Back">
                ‹
              </button>
              <div>
                <div className="chat-title">{activeLabel}</div>
                <div className="chat-sub">You are replying as the seller</div>
              </div>
            </header>
            <div className="thread" ref={threadRef}>
              <div className="thread-inner">
                {messages.map((m) => (
                  <div key={m.id} className={`bubble ${m.role}`}>
                    <div className="bubble-text">{m.text}</div>
                    <div className="bubble-meta">
                      {m.role === 'agent' ? "Buyer's agent" : 'You'} · {timeOf(m.ts)}
                    </div>
                  </div>
                ))}
                {messages.length === 0 && (
                  <p className="empty small center">Waiting for the agent's first message…</p>
                )}
              </div>
            </div>
            <form className="composer" onSubmit={send}>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send(e);
                  }
                }}
                placeholder="Type your reply…"
                rows={1}
              />
              <button type="submit" disabled={!text.trim()}>
                Send
              </button>
            </form>
          </>
        ) : (
          <div className="chat-empty">
            <div className="chat-empty-mark">◆</div>
            <p>Select a negotiation to reply as the seller.</p>
          </div>
        )}
      </main>
    </div>
  );
}
