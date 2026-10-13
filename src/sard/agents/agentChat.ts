/**
 * «وكيل سَرد» chat orchestration (device).
 *
 * Pipeline for every user message:
 *  1. Source guard (code-level hard rule): requests to find/add sources,
 *     sites, repos or plugins (including "show sources") are refused
 *     locally; Sard ships no built-in sources.
 *  2. Offline parser: common Arabic commands run instantly with no AI call.
 *  3. Gemini function-calling restricted to the fixed local tool whitelist.
 *     Any unknown tool / invalid args is rejected; every link in model text
 *     is stripped.
 *  4. Destructive tools always return a confirmation first.
 */
import {
  aiClient,
  getAISettings,
  getApiKey,
  type AIMessage,
} from '@services/ai';
import { agentSystemPrompt } from '../ai/prompts';
import { aiErrorMessage, AGENT_STRINGS } from '../ai/strings';
import { appendChat, clearChat, listChat, type StoredChatMessage } from '../ai/db';
import { parseLocalCommand } from './commandParser';
import { loadLibraryNovels } from './library';
import { detectSourceIntent, stripDisallowedLinks } from './sourceGuard';
import {
  executeTool,
  type AgentReply,
  type PendingCall,
} from './toolExecutor';
import { toolDeclarations, validateToolCall } from './tools';

export const AGENT_THREAD = 'agent';
const S = AGENT_STRINGS.chat;

export const aiAvailable = () => {
  const s = getAISettings();
  return s.enabled && !!getApiKey(s.provider);
};

const buildLibraryContext = async () => {
  const novels = await loadLibraryNovels();
  const lines = novels
    .slice()
    .sort((a, b) => (b.lastReadAt ?? '').localeCompare(a.lastReadAt ?? ''))
    .slice(0, 80)
    .map(
      n =>
        `- ${n.name} (فصول: ${n.totalChapters ?? 0}، غير مقروء: ${
          n.chaptersUnread ?? 0
        }، محمّل: ${n.chaptersDownloaded ?? 0})`,
    );
  return `عدد روايات المكتبة: ${novels.length}\n${lines.join('\n')}`;
};

const historyForModel = (history: StoredChatMessage[]): AIMessage[] =>
  history
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-8)
    .map(m =>
      m.role === 'user'
        ? { role: 'user' as const, text: m.content }
        : { role: 'model' as const, text: m.content },
    );

const persist = async (reply: AgentReply) => {
  await appendChat(AGENT_THREAD, 'assistant', reply.text, reply);
  return reply;
};

export const loadAgentChat = () => listChat(AGENT_THREAD, 300);
export const clearAgentChat = () => clearChat(AGENT_THREAD);

export const sendAgentMessage = async (text: string): Promise<AgentReply> => {
  const input = text.trim();
  if (!input) return { kind: 'text', text: '' };
  const history = await listChat(AGENT_THREAD, 20);
  await appendChat(AGENT_THREAD, 'user', input);

  // 1) hard source rule — enforced before anything else, no AI involved
  const intent = detectSourceIntent(input);
  if (intent === 'refuse') {
    return persist({ kind: 'text', text: S.sourceRefusal });
  }

  // 2) offline parser
  const local = parseLocalCommand(input);
  if (local) {
    const v = validateToolCall(local.tool, local.args);
    if (v.ok) return persist(await executeTool(v));
  }

  // 3) AI function calling with the fixed whitelist
  if (!aiAvailable()) {
    return persist({
      kind: 'text',
      text: S.offlineHint,
      actions: [{ type: 'navigate', label: 'إعدادات الذكاء الاصطناعي', screen: 'SardAiSettings' }],
    });
  }
  try {
    const res = await aiClient.generate('agent', {
      system: agentSystemPrompt(await buildLibraryContext()),
      messages: [...historyForModel(history), { role: 'user', text: input }],
      tools: toolDeclarations(),
      toolMode: 'auto',
      temperature: 0.2,
      maxOutputTokens: 800,
    });
    const call = res.functionCalls[0];
    if (call) {
      const v = validateToolCall(call.name, call.args);
      if (!v.ok) {
        return persist({
          kind: 'error',
          text: v.error === 'unknown_tool' ? S.unknownTool : S.invalidArgs,
        });
      }
      const reply = await executeTool(v);
      return persist({ ...reply, viaAI: true });
    }
    const safe = stripDisallowedLinks(res.text, []);
    return persist({ kind: 'text', text: safe, viaAI: true });
  } catch (e) {
    return persist({ kind: 'error', text: aiErrorMessage(e) });
  }
};

/** User tapped «نفّذ» on a confirmation, or picked a novel from choices. */
export const resolvePending = async (
  pending: PendingCall,
  choice: { confirmed?: boolean; novelId?: number },
): Promise<AgentReply> => {
  const v = validateToolCall(pending.tool, pending.args);
  if (!v.ok) return persist({ kind: 'error', text: S.unknownTool });
  if (choice.novelId !== undefined) {
    const picked = (await loadLibraryNovels()).find(n => n.id === choice.novelId);
    if (picked) await appendChat(AGENT_THREAD, 'user', picked.name);
  }
  const reply = await executeTool(v, {
    confirmed: choice.confirmed,
    novelId: choice.novelId ?? pending.novelId,
    flags: pending.flags,
  });
  return persist(reply);
};

export const cancelPending = async () =>
  persist({ kind: 'text', text: S.cancelled });
