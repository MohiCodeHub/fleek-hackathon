import OpenAI from 'openai';
import { config, requireLlmKey } from './config.js';

/**
 * Thin single-shot LLM helpers for the extraction modules (mandate, matching,
 * supplier-sim). The agent harness itself runs on the Pi SDK (see
 * `src/agent/factory.ts`); these are only for one-shot structured completions
 * called from inside tool handlers, which the Pi SDK is not shaped to serve.
 */

let _client: OpenAI | null = null;

function client(): OpenAI {
  if (!_client) {
    _client = new OpenAI({ apiKey: requireLlmKey(), baseURL: config.llm.baseUrl });
  }
  return _client;
}

/** A JSON Schema object for structured output. */
export type JSONSchema = Record<string, unknown>;

/** A conversation message (OpenAI chat message param: user/assistant/system). */
export type Msg = OpenAI.Chat.Completions.ChatCompletionMessageParam;

const DEFAULT_MAX_TOKENS = 4000;

function withSystem(system: string, messages: Msg[]): Msg[] {
  return [{ role: 'system', content: system }, ...messages];
}

/** Plain text completion. Used by the supplier sim and free-form reasoning. */
export async function generateText(opts: {
  system: string;
  messages: Msg[];
  model?: string;
  maxTokens?: number;
}): Promise<string> {
  const res = await client().chat.completions.create({
    model: opts.model ?? config.models.reasoning,
    max_completion_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages: withSystem(opts.system, opts.messages),
  });
  return res.choices[0]?.message.content?.trim() ?? '';
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Lightweight JSON-schema subset validation for our tool schemas
 * (type/object/array/enum/required/additionalProperties:false).
 */
export function validateAgainstSchema(value: unknown, schema: JSONSchema, path = '$'): string[] {
  const errors: string[] = [];
  const typ = schema.type;

  if (typ === 'object') {
    if (!isPlainObject(value)) {
      errors.push(`${path}: expected object`);
      return errors;
    }
    const props = (schema.properties ?? {}) as Record<string, JSONSchema>;
    const required = (schema.required ?? []) as string[];
    for (const key of required) {
      if (!(key in value)) errors.push(`${path}.${key}: required`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in props)) errors.push(`${path}.${key}: unexpected property`);
      }
    }
    for (const [key, propSchema] of Object.entries(props)) {
      if (key in value)
        errors.push(...validateAgainstSchema(value[key], propSchema, `${path}.${key}`));
    }
    return errors;
  }

  if (typ === 'array') {
    if (!Array.isArray(value)) {
      errors.push(`${path}: expected array`);
      return errors;
    }
    const items = schema.items as JSONSchema | undefined;
    if (items) {
      value.forEach((item, i) => {
        errors.push(...validateAgainstSchema(item, items, `${path}[${i}]`));
      });
    }
    return errors;
  }

  if (typ === 'string') {
    if (typeof value !== 'string') {
      errors.push(`${path}: expected string`);
      return errors;
    }
    const enm = schema.enum as unknown[] | undefined;
    if (enm && !enm.includes(value)) errors.push(`${path}: not in enum`);
    return errors;
  }

  if (typ === 'integer') {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      errors.push(`${path}: expected integer`);
    }
    return errors;
  }

  if (typ === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      errors.push(`${path}: expected number`);
    }
    return errors;
  }

  return errors;
}

/**
 * Structured output constrained to `schema`, via forced tool use — portable and
 * reliable across models. Returns the tool arguments after schema validation.
 */
export async function generateJSON<T>(opts: {
  system: string;
  messages: Msg[];
  schema: JSONSchema;
  toolName?: string;
  toolDescription?: string;
  model?: string;
  maxTokens?: number;
}): Promise<T> {
  const name = opts.toolName ?? 'emit_result';
  const res = await client().chat.completions.create({
    model: opts.model ?? config.models.reasoning,
    max_completion_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages: withSystem(opts.system, opts.messages),
    tools: [
      {
        type: 'function',
        function: {
          name,
          description: opts.toolDescription ?? 'Emit the structured result.',
          parameters: opts.schema,
        },
      },
    ],
    tool_choice: { type: 'function', function: { name } },
  });
  const call = res.choices[0]?.message.tool_calls?.[0];
  if (!call || call.function.name !== name) throw new Error(`Model did not call ${name}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(call.function.arguments);
  } catch {
    throw new Error(`Model returned invalid JSON args: ${call.function.arguments.slice(0, 200)}`);
  }
  const errors = validateAgainstSchema(parsed, opts.schema);
  if (errors.length > 0) {
    throw new Error(`Model JSON failed schema: ${errors.slice(0, 5).join('; ')}`);
  }
  return parsed as T;
}

// ---------------------------------------------------------------------------
// Vision + embeddings — the image-search path (see src/image-search.ts).
// ---------------------------------------------------------------------------

/**
 * A user message carrying an image alongside optional text.
 * `image` is either an https URL or a `data:image/...;base64,...` URI —
 * WhatsApp images arrive as one or the other depending on the Wassist payload.
 */
export function imageMessage(image: string, text?: string): Msg {
  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: 'image_url', image_url: { url: image, detail: 'low' } },
  ];
  if (text) content.unshift({ type: 'text', text });
  return { role: 'user', content };
}

/**
 * Embedding dimensions. 512 is ample for a catalog of this size and keeps the
 * committed index small; `text-embedding-3-small` supports truncation natively.
 */
export const EMBED_DIMS = 512;
const EMBED_MODEL = 'text-embedding-3-small';

/** Embed texts into unit-length vectors (so cosine similarity is a dot product). */
export async function embed(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  const res = await client().embeddings.create({
    model: EMBED_MODEL,
    input: texts,
    dimensions: EMBED_DIMS,
  });
  // The API returns unit-normalised vectors, but normalise defensively —
  // `dot` below assumes it.
  return res.data.map((d) => normalise(Float32Array.from(d.embedding)));
}

function normalise(v: Float32Array): Float32Array {
  let sum = 0;
  for (const x of v) sum += x * x;
  const mag = Math.sqrt(sum);
  if (mag === 0) return v;
  for (let i = 0; i < v.length; i++) v[i] = (v[i] as number) / mag;
  return v;
}

/** Cosine similarity of two unit vectors. */
export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += (a[i] as number) * (b[i] as number);
  return s;
}
