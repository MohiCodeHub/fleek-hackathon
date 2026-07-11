import { type Msg, runTurn, type ToolCall, type ToolDef } from '../llm.js';

/** A tool the harness can execute: its schema plus a handler. */
export interface Tool {
  def: ToolDef;
  /** Executes the tool. Return value is JSON-serialised back to the model. */
  handler: (input: Record<string, unknown>) => Promise<unknown>;
}

export interface AgentResult {
  /** Everything the agent said to the counterparty this run, in order. */
  reply: string;
  /** The updated conversation history (append for the next user message). */
  history: Msg[];
  /** Tool calls that were executed, for observability. */
  toolCalls: { name: string; input: Record<string, unknown>; output: unknown }[];
}

/**
 * The generic agent harness. Abhi (buyer WhatsApp face) uses this tool-use
 * loop. Sanket (behind-the-scenes negotiator) currently runs via structured
 * decisions in negotiation.ts — same product, two agents, one buyer thread.
 */
export async function runAgent(opts: {
  system: string;
  history: Msg[];
  tools: Tool[];
  model?: string;
  maxSteps?: number;
}): Promise<AgentResult> {
  const registry = new Map(opts.tools.map((t) => [t.def.name, t]));
  const toolDefs = opts.tools.map((t) => t.def);
  const history: Msg[] = [...opts.history];
  const replies: string[] = [];
  const executed: AgentResult['toolCalls'] = [];
  const maxSteps = opts.maxSteps ?? 8;

  for (let step = 0; step < maxSteps; step++) {
    const turn = await runTurn({
      system: opts.system,
      messages: history,
      tools: toolDefs,
      model: opts.model,
    });

    if (turn.text) replies.push(turn.text);
    history.push(turn.assistantMessage);

    if (turn.toolCalls.length === 0) break; // finished

    // Execute tool calls and feed one tool message back per call.
    for (const call of turn.toolCalls) {
      const output = await executeTool(registry, call);
      executed.push({ name: call.name, input: call.input, output });
      history.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(output) });
    }
  }

  return { reply: replies.join('\n\n').trim(), history, toolCalls: executed };
}

async function executeTool(registry: Map<string, Tool>, call: ToolCall): Promise<unknown> {
  const tool = registry.get(call.name);
  if (!tool) return { error: `Unknown tool: ${call.name}` };
  try {
    return await tool.handler(call.input);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
