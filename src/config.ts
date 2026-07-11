import { config as loadEnv } from 'dotenv';

// `.env` is authoritative for this project — override any stale shell vars.
loadEnv({ override: true });

/** Central config, read once from the environment. */
export const config = {
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  models: {
    /** Reasoning-heavy work: mandate extraction, matching, negotiation. */
    reasoning: process.env.MODEL_REASONING ?? 'gpt-4o',
    /** Cheap/fast work: classification, small extractions, supplier sim. */
    fast: process.env.MODEL_FAST ?? 'gpt-4o-mini',
  },
  wassist: {
    apiKey: process.env.WASSIST_API_KEY ?? '',
    baseUrl: process.env.WASSIST_BASE_URL ?? 'https://alpha-plagiocephalic-darrell.ngrok-free.dev',
    webhookSecret: process.env.WASSIST_WEBHOOK_SECRET ?? '',
    publicWebhookUrl: process.env.PUBLIC_WEBHOOK_URL ?? '',
  },
  port: Number(process.env.PORT ?? 8787),
  databaseUrl: process.env.DATABASE_URL ?? '',
} as const;

export function requireDatabaseUrl(): string {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  }
  return config.databaseUrl;
}

export function requireOpenAIKey(): string {
  if (!config.openaiApiKey) {
    throw new Error('OPENAI_API_KEY is not set. Copy .env.example to .env and fill it in.');
  }
  return config.openaiApiKey;
}
