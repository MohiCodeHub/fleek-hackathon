import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Api, Model } from '@earendil-works/pi-ai';
import {
  type AgentSession,
  type AgentToolResult,
  AuthStorage,
  createAgentSession,
  createExtensionRuntime,
  createSyntheticSourceInfo,
  loadSkillsFromDir,
  ModelRegistry,
  type ResourceLoader,
  SessionManager,
  SettingsManager,
  type Skill,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { config, requireLlmKey } from '../config.js';
import { getBuyer } from '../db/index.js';
import type { NegotiationRuntime } from '../negotiation.js';
import { loadPersona } from '../personas.js';
import type { Buyer } from '../types.js';
import { acceptDealTool } from './tools/acceptDeal.js';
import { makeCompleteOnboardingTool } from './tools/completeOnboarding.js';
import { escalateTool } from './tools/escalate.js';
import { makeExtractMandateTool } from './tools/extractMandate.js';
import { makeFindMatchesTool } from './tools/findMatches.js';
import { makeOfferTool } from './tools/makeOffer.js';
import { makeNegotiateTool } from './tools/negotiate.js';
import { makeSearchByImageTool } from './tools/searchByImage.js';

const here = dirname(fileURLToPath(import.meta.url));
const skillsDir = join(here, '..', '..', 'skills');

export type Persona = 'abhi' | 'sanket';

export interface ToolExec {
  name: string;
  input: Record<string, unknown>;
  output: unknown;
}

export interface BuildAgentOptions {
  persona: Persona;
  /** Buyer phone (Abhi only) — drives the dynamic buyer context block. */
  buyerPhone?: string;
  /** Prior conversation history to restore (AgentMessage[]). */
  history?: AgentSession['messages'];
  /**
   * Abhi only — a photo the buyer attached to this message (https URL or data:
   * URI). When present, Abhi gains `search_by_image` over that photo.
   */
  inboundImage?: string | null;
  /** Called for each tool execution (for the memory brain / observability). */
  onToolResult?: (exec: ToolExec) => void;
  /**
   * Sanket only — the negotiation runtime the Sanket tools close over. Required
   * when persona === 'sanket'.
   */
  sanketRuntime?: NegotiationRuntime;
}

// ---------------------------------------------------------------------------
// Shared, process-wide auth + model setup (created once).
// ---------------------------------------------------------------------------

const authStorage = AuthStorage.create();
authStorage.setRuntimeApiKey(config.llm.provider, requireLlmKey());
const modelRegistry = ModelRegistry.create(authStorage);

function resolveModel(): Model<Api> {
  if (config.llm.provider === 'openai') {
    const found = modelRegistry.find('openai', config.models.reasoning);
    if (found) return found;
  }

  return {
    id: config.models.reasoning,
    name: config.models.reasoning,
    provider: config.llm.provider,
    api: 'openai-completions',
    baseUrl: config.llm.baseUrl,
    reasoning: true,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 65_536,
    maxTokens: 32_768,
  } as Model<Api>;
}

let _model: Model<Api> | undefined;
function model(): Model<Api> {
  if (!_model) _model = resolveModel();
  return _model;
}

// ---------------------------------------------------------------------------
// Skills — loaded once from the repo's skills/ dir, injected per persona.
// ---------------------------------------------------------------------------

const allSkills: Skill[] = loadSkillsFromDir({ dir: skillsDir, source: 'bundle' }).skills;
const skillFor = (persona: Persona): Skill[] => {
  const name = persona === 'abhi' ? 'abhi-sourcing' : 'sanket-negotiation';
  const skill = allSkills.find((s) => s.name === name);
  if (!skill) return [];
  // Re-tag the source info so it's self-contained (no ~/.pi dependency).
  return [
    {
      ...skill,
      sourceInfo: createSyntheticSourceInfo(skill.filePath, { source: 'bundle' }),
    },
  ];
};

// ---------------------------------------------------------------------------
// System prompt — persona identity + invariants + dynamic context.
// ---------------------------------------------------------------------------

function abhiSystemPrompt(buyer: Buyer | null): string {
  const persona = loadPersona('abhi');
  if (!buyer?.onboardedAt) {
    return (
      persona +
      '\n\n---\nBUYER CONTEXT\nNew, unonboarded buyer. First call complete_onboarding once you have their name and store/company name. ' +
      'You also have sourcing tools (extract_mandate, find_matches, negotiate) — after onboarding succeeds in this same turn, continue with their demand if they already stated one. ' +
      'Greet them, briefly say who you are, and ask for their name and their store/company name if missing — one short message. If they open with a sourcing request before you have their details, acknowledge it briefly but still get their name and company first, then proceed.'
    );
  }
  const ctx = buyer
    ? `\n\n---\nBUYER CONTEXT\nName: ${buyer.name}${buyer.company ? ` (${buyer.company})` : ''}\nKnown preferences: ${
        buyer.profile.brandsPursued.length
          ? buyer.profile.brandsPursued.join(', ')
          : '(none yet — this may be a new buyer)'
      }${buyer.profile.notes.length ? `\nNotes: ${buyer.profile.notes.join('; ')}` : ''}`
    : '\n\n---\nBUYER CONTEXT\nNew buyer, no profile yet.';
  return persona + ctx;
}

function sanketSystemPrompt(runtime: NegotiationRuntime): string {
  const persona = loadPersona('sanket');
  const { contract, bale, supplier } = runtime;
  const contractBlock = `\n\n---\nYOUR CONTRACT (hard limits — never break)\nPrice ceiling: $${contract.priceCeiling}/unit (never agree above)\nGrade floor: ${contract.gradeFloor} (never accept below)\nQuantity: at least ${contract.quantity} units (never close short)`;
  const baleBlock = `\n\n---\nTHE BALE\n${bale.description}\nCategory/era: ${bale.category}/${bale.era} | brands: ${bale.brands.join(', ')} | stated grade ${bale.grade} | ~${bale.quantity} units | supplier's opening ask: $${bale.askPrice}/unit\nSupplier: ${supplier.name}`;
  return persona + contractBlock + baleBlock;
}

// ---------------------------------------------------------------------------
// Tools per persona.
// ---------------------------------------------------------------------------

function abhiTools(
  buyerPhone: string,
  onboarded: boolean,
  inboundImage?: string | null,
): ToolDefinition[] {
  const sourcing: ToolDefinition[] = [
    makeExtractMandateTool(buyerPhone),
    makeFindMatchesTool(buyerPhone),
    makeNegotiateTool(buyerPhone),
  ];
  // Only offered when the buyer actually attached a photo to this message.
  if (inboundImage) sourcing.push(makeSearchByImageTool(inboundImage));
  // Same-turn onboarding → sourcing: always expose sourcing tools; unonboarded
  // buyers also get complete_onboarding and must call it first (see system prompt).
  if (!onboarded) return [makeCompleteOnboardingTool(buyerPhone), ...sourcing];
  return sourcing;
}

function sanketTools(runtime: NegotiationRuntime): ToolDefinition[] {
  return [makeOfferTool(runtime), acceptDealTool(runtime), escalateTool(runtime)];
}

// ---------------------------------------------------------------------------
// Minimal ResourceLoader — no ~/.pi discovery, fully self-contained.
// ---------------------------------------------------------------------------

function makeLoader(systemPrompt: string, skills: Skill[]): ResourceLoader {
  return {
    getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
    getSkills: () => ({ skills, diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => systemPrompt,
    getAppendSystemPrompt: () => [],
    extendResources: () => {},
    reload: async () => {},
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build one agent session for a persona. Abhi faces the buyer; Sanket handles the
 * supplier. Same factory, same loop — only the system prompt, skills, and tools
 * differ. History is restored from `options.history` (AgentMessage[]).
 */
export async function buildAgent(opts: BuildAgentOptions): Promise<AgentSession> {
  const { persona } = opts;

  // Surface a clear error if no key is configured (deferred to first build so
  // importing the module — e.g. in tests without a key — doesn't throw).
  requireLlmKey();

  let systemPrompt: string;
  let tools: ToolDefinition[];
  if (persona === 'abhi') {
    const buyer = opts.buyerPhone ? await getBuyer(opts.buyerPhone) : null;
    systemPrompt = abhiSystemPrompt(buyer);
    tools = abhiTools(opts.buyerPhone ?? '', !!buyer?.onboardedAt, opts.inboundImage);
  } else {
    if (!opts.sanketRuntime) {
      throw new Error('buildAgent: sanketRuntime is required for persona "sanket"');
    }
    systemPrompt = sanketSystemPrompt(opts.sanketRuntime);
    tools = sanketTools(opts.sanketRuntime);
  }

  const { session } = await createAgentSession({
    model: model(),
    thinkingLevel: 'off',
    authStorage,
    modelRegistry,
    resourceLoader: makeLoader(systemPrompt, skillFor(persona)),
    noTools: 'builtin',
    customTools: tools,
    sessionManager: SessionManager.inMemory(),
    settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
  });

  // Restore prior conversation history.
  if (opts.history?.length) {
    session.agent.state.messages = [...opts.history];
  }

  // Observability / memory brain: collect tool executions.
  if (opts.onToolResult) {
    session.subscribe((event) => {
      if (event.type !== 'tool_execution_end') return;
      const result = event.result as AgentToolResult<unknown> | undefined;
      opts.onToolResult?.({
        name: event.toolName,
        input: (event as { args?: unknown }).args as Record<string, unknown>,
        output: result?.details,
      });
    });
  }

  return session;
}

/**
 * Extract the last assistant text reply from a session's message history.
 */
export function lastAssistantText(session: AgentSession): string {
  const messages = session.messages;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg && msg.role === 'assistant') {
      const text = msg.content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text)
        .join('')
        .trim();
      if (text) return text;
    }
  }
  return '';
}
