import { config as loadEnv } from 'dotenv';

// `.env` is authoritative for this project — override any stale shell vars.
loadEnv({ override: true });

/**
 * Public origin for links we hand to buyers. Prefer PUBLIC_BASE_URL; otherwise
 * reuse the origin of the webhook URL (same service on Railway); else localhost.
 */
function publicBaseUrl(): string {
  const explicit = process.env.PUBLIC_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const webhook = process.env.PUBLIC_WEBHOOK_URL?.trim();
  if (webhook) {
    try {
      return new URL(webhook).origin;
    } catch {
      // Malformed webhook URL — fall through to localhost rather than throw at import.
    }
  }
  return `http://localhost:${Number(process.env.PORT ?? 8787)}`;
}

/** Central config, read once from the environment. */
export const config = {
  llm: {
    provider: process.env.LLM_PROVIDER ?? 'openai',
    apiKey: process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY ?? '',
    baseUrl: process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1',
  },
  models: {
    /** Reasoning-heavy work: mandate extraction, matching, negotiation. */
    reasoning: process.env.MODEL_REASONING ?? 'gpt-4o',
    /** Cheap/fast work: classification, small extractions, supplier sim. */
    fast: process.env.MODEL_FAST ?? 'gpt-4o-mini',
  },
  wassist: {
    apiKey: process.env.WASSIST_API_KEY ?? '',
    /** Wassist platform API host (not your tunnel). */
    baseUrl: process.env.WASSIST_BASE_URL ?? 'https://wassist.app',
    /** Optional. If set, require X-Wassist-Signature when present. */
    webhookSecret: process.env.WASSIST_WEBHOOK_SECRET ?? '',
    /**
     * YOUR public webhook URL that Wassist calls (Railway HTTPS or local ngrok).
     * Example: https://<service>.up.railway.app/webhook
     */
    publicWebhookUrl: process.env.PUBLIC_WEBHOOK_URL ?? '',
  },
  /** WhatsApp number for the buyer-facing Abhi thread (digits only, for wa.me links). */
  whatsappNumber: (process.env.WHATSAPP_NUMBER ?? '447424845871').replace(/[^0-9]/g, ''),
  /**
   * Public origin of this app, used to build checkout links Abhi sends over
   * WhatsApp. Falls back to PUBLIC_WEBHOOK_URL's origin so a Railway deploy
   * that already set that needs no extra config.
   */
  publicBaseUrl: publicBaseUrl(),
  port: Number(process.env.PORT ?? 8787),
  databaseUrl: process.env.DATABASE_URL ?? '',
  /** `debug` | `info` | `warn` | `error` — gates structured app + HTTP logs. */
  logLevel: process.env.LOG_LEVEL ?? 'info',
} as const;

export function requireDatabaseUrl(): string {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  }
  return config.databaseUrl;
}

export function requireLlmKey(): string {
  if (!config.llm.apiKey) {
    throw new Error('LLM_API_KEY is not set. Copy .env.example to .env and fill it in.');
  }
  return config.llm.apiKey;
}
