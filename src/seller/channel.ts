import { EventEmitter } from 'node:events';
import { id } from '../ids.js';

/**
 * In-memory bridge between the running negotiation (in-process) and the
 * seller's WhatsApp-style web console (`/seller`). The supply-side agent
 * `post()`s messages the seller sees; the seller `submitReply()`s back; the
 * agent can `awaitReply()` at an approval checkpoint. One process, one seller
 * thread — perfect for a local demo. Swap this for a Baileys/WhatsApp adapter
 * later without touching the negotiation code.
 */

export type Sender = 'agent' | 'seller' | 'system';

export interface SellerMessage {
  id: string;
  from: Sender;
  text: string;
  ts: number;
  /** Optional UI hint: 'intro' | 'recommendation' | 'status' | 'outcome' | 'mirror'. */
  kind?: string;
  /** Quick-reply buttons the console renders under an agent message. */
  quickReplies?: string[];
}

interface PendingReply {
  resolve: (reply: { text: string; auto: boolean }) => void;
  timer: NodeJS.Timeout;
}

class SellerChannel extends EventEmitter {
  /** Full message log for the current demo run (replayed to new console tabs). */
  private log: SellerMessage[] = [];
  private pending: PendingReply | null = null;

  constructor() {
    super();
    // Allow several console tabs (each SSE stream adds listeners) without warnings.
    this.setMaxListeners(50);
  }

  /** Append an agent/system message and broadcast it to connected consoles. */
  post(
    from: Sender,
    text: string,
    opts: { kind?: string; quickReplies?: string[] } = {},
  ): SellerMessage {
    const msg: SellerMessage = {
      id: id('msg'),
      from,
      text,
      ts: Date.now(),
      kind: opts.kind,
      quickReplies: opts.quickReplies,
    };
    this.log.push(msg);
    this.emit('message', msg);
    return msg;
  }

  /** Record a reply typed by the seller in the console and resolve any pending wait. */
  submitReply(text: string): SellerMessage {
    const msg: SellerMessage = { id: id('msg'), from: 'seller', text, ts: Date.now() };
    this.log.push(msg);
    this.emit('message', msg);
    if (this.pending) {
      const { resolve, timer } = this.pending;
      this.pending = null;
      clearTimeout(timer);
      resolve({ text, auto: false });
    }
    return msg;
  }

  /**
   * Wait for the seller's next reply (their approval). Resolves early on
   * `submitReply`, or after `timeoutMs` with `auto: true` so a live demo never
   * hangs if the seller doesn't click. Only one wait is active at a time.
   */
  awaitReply(timeoutMs: number): Promise<{ text: string; auto: boolean }> {
    // If a previous wait is somehow still pending, auto-resolve it first.
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.resolve({ text: '', auto: true });
      this.pending = null;
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.pending) {
          this.pending = null;
          resolve({ text: '', auto: true });
        }
      }, timeoutMs);
      // Don't keep the process alive just for this timer.
      if (typeof timer.unref === 'function') timer.unref();
      this.pending = { resolve, timer };
    });
  }

  /** All messages so far (for replay when a console tab connects/refreshes). */
  history(): SellerMessage[] {
    return this.log;
  }

  /** Clear the thread for a fresh demo run. */
  reset(): void {
    this.log = [];
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.resolve({ text: '', auto: true });
      this.pending = null;
    }
    this.emit('reset');
  }
}

/** Process-wide singleton — imported by both the negotiation and the /seller routes. */
export const sellerChannel = new SellerChannel();
