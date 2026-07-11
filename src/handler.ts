import type { ImageContent } from '@earendil-works/pi-ai';
import type { AgentSession } from '@earendil-works/pi-coding-agent';
import { buildAgent, lastAssistantText, type ToolExec } from './agent/factory.js';
import {
  getBuyer,
  getSupplierByPhone,
  getThread,
  releaseDelivery,
  saveThread,
  upsertBuyer,
} from './db/index.js';
import { trimHistory } from './history.js';
import { log, maskPhone } from './log.js';
import { fetchImageContent } from './media.js';
import { learnFromInteraction } from './memory.js';
import {
  type InboundMessage,
  isWassistReplyCallback,
  type ReplyPayload,
  replyViaCallback,
} from './wassist.js';

const EMPTY_REPLY_FALLBACK = "Still on it — give me a moment and I'll come back with options.";
const ERROR_REPLY = "Something glitched on my side. Mind sending that again? I'll pick it up.";

/** Serialize processInbound per phone so concurrent WA messages don't race history. */
const phoneQueues = new Map<string, Promise<unknown>>();

function enqueueForPhone<T>(phone: string, work: () => Promise<T>): Promise<T> {
  const prev = phoneQueues.get(phone) ?? Promise.resolve();
  const next = prev.then(work, work);
  phoneQueues.set(
    phone,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

function toolOk(output: unknown): boolean {
  if (output == null) return true;
  if (typeof output === 'object' && output !== null && 'error' in output) return false;
  if (typeof output === 'string' && /error/i.test(output.slice(0, 40))) return false;
  return true;
}

function compactToolFields(name: string, output: unknown): Record<string, unknown> {
  if (!output || typeof output !== 'object') return {};
  const o = output as Record<string, unknown>;
  const fields: Record<string, unknown> = {};
  if ('mandateId' in o) fields.mandateId = o.mandateId;
  if ('error' in o) fields.error = o.error;
  if (name === 'find_matches' && Array.isArray(o.matches)) {
    fields.baleIds = (o.matches as Array<{ baleId?: string }>).map((m) => m.baleId).filter(Boolean);
    fields.matchCount = (o.matches as unknown[]).length;
  }
  if (name === 'negotiate') {
    if (Array.isArray(o.outcomes)) {
      fields.outcomes = (o.outcomes as Array<{ state?: string; baleId?: string }>).map((x) => ({
        baleId: x.baleId,
        state: x.state,
      }));
    }
  }
  if (name === 'extract_mandate' && 'missing' in o) fields.missing = o.missing;
  return fields;
}

/**
 * Process one inbound WhatsApp message on the buyer-facing thread.
 * Humans talk only to Abhi; Sanket runs behind the scenes during negotiation.
 */
export async function processInbound(inbound: InboundMessage): Promise<string> {
  return enqueueForPhone(inbound.from, () => processInboundLocked(inbound));
}

async function processInboundLocked(inbound: InboundMessage): Promise<string> {
  const { from, body, replyCallback, image, deliveryId } = inbound;
  const start = Date.now();

  try {
    const supplier = await getSupplierByPhone(from);
    const isSupplier = !!supplier;
    if (!isSupplier && !(await getBuyer(from))) {
      await upsertBuyer({
        phone: from,
        name: '',
        company: null,
        onboardedAt: null,
        profile: { brandsPursued: [], notes: [] },
      });
    }

    const role: 'buyer' | 'supplier' = isSupplier ? 'supplier' : 'buyer';
    log.info('inbound.start', {
      phone: maskPhone(from),
      role,
      bodyLen: body.length,
      hasImage: Boolean(image),
    });

    const thread = (await getThread(from)) ?? {
      phone: from,
      role,
      conversationId: null,
      history: [],
    };
    const history = (thread.history ?? []) as AgentSession['messages'];

    let reply: string;
    if (role === 'buyer') {
      const result = await runAbhiTurn(from, history, body, image);
      reply = result.reply || EMPTY_REPLY_FALLBACK;
      await saveThread({
        phone: from,
        role,
        conversationId: thread.conversationId,
        history: trimHistory(result.history),
      });
    } else {
      reply =
        "Thanks — this line is handled by Fleek's sourcing agent. A live negotiation will reach you here when a buyer's mandate matches your stock.";
      await saveThread({
        phone: from,
        role,
        conversationId: thread.conversationId,
        history: trimHistory(history as unknown[]),
      });
    }

    await deliver(replyCallback, reply);
    log.info('inbound.done', {
      phone: maskPhone(from),
      role,
      ms: Date.now() - start,
      replyLen: reply.length,
    });
    return reply;
  } catch (e) {
    log.error('abhi.turn_error', {
      phone: maskPhone(from),
      err: e instanceof Error ? e.message : String(e),
    });
    try {
      await deliver(replyCallback, ERROR_REPLY);
    } catch (deliverErr) {
      log.error('deliver.error_fallback_failed', {
        err: deliverErr instanceof Error ? deliverErr.message : String(deliverErr),
      });
    }
    if (deliveryId) {
      await releaseDelivery(deliveryId).catch(() => undefined);
    }
    throw e;
  }
}

/** Build the user prompt text + optional vision attachments for Abhi. */
async function prepareBuyerPrompt(
  body: string,
  imageUrl: string | null,
): Promise<{ text: string; images: ImageContent[] }> {
  const images: ImageContent[] = [];
  let text = body.trim();

  if (imageUrl) {
    const img = await fetchImageContent(imageUrl);
    if (img) {
      images.push(img);
      // Abhi can see the photo, but seeing it is not the same as knowing we can
      // match it against stock — point him at the visual index explicitly.
      const note = '(Buyer sent an image — use search_by_image to find lots that look like it.)';
      text = text ? `${text}\n\n${note}` : note;
    } else if (text) {
      text = `${text}\n\n(Buyer also sent an image that could not be loaded.)`;
    } else {
      text = '(Buyer sent an image, but it could not be loaded.)';
    }
  }

  if (!text) text = '(empty message)';
  return { text, images };
}

/** Run one Abhi turn: build the session, prompt, capture tool execs for memory. */
async function runAbhiTurn(
  buyerPhone: string,
  history: AgentSession['messages'],
  userMessage: string,
  imageUrl: string | null,
): Promise<{ reply: string; history: AgentSession['messages'] }> {
  const toolExecs: ToolExec[] = [];
  const session = await buildAgent({
    persona: 'abhi',
    buyerPhone,
    history,
    // Abhi *sees* the photo via the vision attachment below; this additionally
    // gives him search_by_image over it, to match it against the catalog index.
    inboundImage: imageUrl,
    onToolResult: (exec) => {
      toolExecs.push(exec);
      log.info('abhi.tool', {
        tool: exec.name,
        ok: toolOk(exec.output),
        ...compactToolFields(exec.name, exec.output),
      });
    },
  });
  try {
    const { text, images } = await prepareBuyerPrompt(userMessage, imageUrl);
    await session.prompt(text, images.length > 0 ? { images } : undefined);
    const reply = lastAssistantText(session);
    await learnFromInteraction(buyerPhone, toolExecs);
    return { reply, history: session.messages };
  } finally {
    session.dispose();
  }
}

/** POST the final reply to Wassist reply_callback (or log in local/dev). */
async function deliver(replyCallback: string, reply: string | ReplyPayload): Promise<void> {
  if (typeof reply === 'string' && !reply) return;
  if (!replyCallback.startsWith('http')) {
    log.info('deliver.skip', {
      reason: 'non_http',
      replyLen: typeof reply === 'string' ? reply.length : JSON.stringify(reply).length,
    });
    return;
  }
  if (!isWassistReplyCallback(replyCallback)) {
    let host = '';
    try {
      host = new URL(replyCallback).host;
    } catch {
      host = 'invalid';
    }
    log.warn('deliver.skip', { reason: 'non_wassist_host', host });
    return;
  }
  await replyViaCallback(replyCallback, reply);
}
