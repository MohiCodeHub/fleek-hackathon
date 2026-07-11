import OpenAI from 'openai';
import { config, requireOpenAIKey } from './config.js';

let _client: OpenAI | null = null;

function client(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: requireOpenAIKey() });
  return _client;
}

/** A JSON Schema object for tool parameters / structured output. */
export type JSONSchema = Record<string, unknown>;

/** A conversation message (OpenAI chat message param: user/assistant/tool/system). */
export type Msg = OpenAI.Chat.Completions.ChatCompletionMessageParam;

/** A tool the agent harness can call. */
export interface ToolDef {
  name: string;
  description: string;
  parameters: JSONSchema;
}

const DEFAULT_MAX_TOKENS = 4000;

function toOpenAITools(tools: ToolDef[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

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

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface TurnResult {
  /** User-facing text the assistant produced this turn (may be empty). */
  text: string;
  /** Tool calls the assistant requested (empty when it finished its turn). */
  toolCalls: ToolCall[];
  /** The assistant message to append to history for the next turn. */
  assistantMessage: Msg;
  stopReason: string | null;
}

/**
 * One turn of a tool-use loop. The caller executes any returned tool calls,
 * appends the assistant message + one tool message per call, and calls again
 * until `toolCalls` is empty. This is the generic agent-harness step —
 * persona-agnostic; only `system`, `messages`, and `tools` differ.
 */
export async function runTurn(opts: {
  system: string;
  messages: Msg[];
  tools: ToolDef[];
  model?: string;
  maxTokens?: number;
}): Promise<TurnResult> {
  const res = await client().chat.completions.create({
    model: opts.model ?? config.models.reasoning,
    max_completion_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages: withSystem(opts.system, opts.messages),
    tools: toOpenAITools(opts.tools),
  });

  const choice = res.choices[0];
  const msg = choice?.message;
  const toolCalls: ToolCall[] = [];
  for (const tc of msg?.tool_calls ?? []) {
    if (tc.type !== 'function') continue;
    let input: Record<string, unknown> = {};
    try {
      input = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
    } catch {
      input = {};
    }
    toolCalls.push({ id: tc.id, name: tc.function.name, input });
  }

  const assistantMessage: Msg = {
    role: 'assistant',
    content: msg?.content ?? '',
    ...(msg?.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}),
  };

  return {
    text: msg?.content?.trim() ?? '',
    toolCalls,
    assistantMessage,
    stopReason: choice?.finish_reason ?? null,
  };
}
