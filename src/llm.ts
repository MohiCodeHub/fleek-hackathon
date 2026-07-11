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

/**
 * Structured output constrained to `schema`, via forced tool use — portable and
 * reliable across models. Returns the tool arguments, matching the schema.
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
  try {
    return JSON.parse(call.function.arguments) as T;
  } catch {
    throw new Error(`Model returned invalid JSON args: ${call.function.arguments.slice(0, 200)}`);
  }
}
