import { ChatMessage, LocalAiSettings } from '../types';
import { ModelMessage, ToolResult } from './types';
import { buildAgentContext } from './context';
import { buildSystemPrompt } from './prompt';
import { executeLocalModelCall } from '../ai/modelRouter';
import { dispatchToolCall } from '../tools';
import { spideyApi } from '../services/spideyApi';

export interface AgentResult {
  reply: string;
  toolsExecuted: ToolResult[];
  actionExecuted?: ChatMessage['actionExecuted'];
  modelUsed: string;
}

const MAX_STEPS = 3;

/** Tools whose whole point is returning data she must then read. */
const READ_TOOLS = new Set(['web_search', 'recall']);

/**
 * One user turn = a small loop, not a single shot.
 *
 * Old flow: call model once -> run tools -> return. The model never learned
 * whether the tool worked, so it could not correct itself and could not
 * confirm honestly. Now every tool result is fed back as a system observation
 * and she gets to respond to reality.
 */
export async function runAgentTurn(
  prompt: string,
  history: ChatMessage[],
  localAi: LocalAiSettings,
  userName: string = 'Kiri',
  onTokenChunk?: (chunk: string) => void
): Promise<AgentResult> {
  const cleanPrompt = prompt.trim();
  if (!cleanPrompt) {
    return { reply: 'Listening.', toolsExecuted: [], modelUsed: 'local' };
  }

  spideyApi.setMindState('thinking', cleanPrompt);

  const ctx = buildAgentContext(cleanPrompt, userName);
  const persona = localAi.personaPrompt || localAi.customSystemPrompt;

  const messages: ModelMessage[] = [
    { role: 'system', content: buildSystemPrompt(ctx, persona) },
    ...history.slice(-8).map((m) => ({
      role: (m.sender === 'user' ? 'user' : 'assistant') as ModelMessage['role'],
      content: m.text,
    })),
    { role: 'user', content: cleanPrompt },
  ];

  const toolsExecuted: ToolResult[] = [];
  let actionExecuted: ChatMessage['actionExecuted'] | undefined;
  let finalReply = '';

  for (let step = 0; step < MAX_STEPS; step++) {
    // Only stream the first pass to the UI — follow-up passes are corrections
    // and would double up the text in the bubble.
    const streamer = step === 0 ? onTokenChunk : undefined;

    const res = await executeLocalModelCall(messages, localAi, localAi.temperature ?? 0.7, undefined, streamer);

    const text = (res.content || '').trim();
    if (text) finalReply = text;

    const calls = Array.isArray(res.toolCalls) ? res.toolCalls : [];
    if (calls.length === 0) break;

    const observations: string[] = [];
    for (const call of calls) {
      const out = await dispatchToolCall(call);
      toolsExecuted.push(out);
      if (out.actionType && out.actionDetails) {
        actionExecuted = { type: out.actionType, details: out.actionDetails };
      }
      observations.push(`${call.toolName}: ${out.success ? 'OK' : 'FAILED'} — ${out.message}`);
      // A read tool that succeeded means she must speak again from the data,
      // so clear the pre-tool text -- it was written before she knew anything.
      if (out.success && READ_TOOLS.has(call.toolName)) finalReply = '';
    }

    const allOk = toolsExecuted.slice(-calls.length).every((t) => t.success);

    // Read-only tools EXIST to give her information. She has to get another
    // pass to actually read the results, otherwise she searches and then
    // answers from training data anyway.
    const needsToRead = calls.some((c) => READ_TOOLS.has(c.toolName));

    // Everything worked, nothing to read, and she already spoke -> done.
    if (allOk && finalReply && !needsToRead) break;

    // Something failed (or she emitted only a tag with no words). Refresh the
    // board and let her answer to what actually happened.
    const freshCtx = buildAgentContext(cleanPrompt, userName);
    messages.push({ role: 'assistant', content: text || '(tool call)' });
    const instruction = needsToRead
      ? `Today is ${freshCtx.dayOfWeek} ${freshCtx.todayDate}.

Answer him from the results above — figures, names and dates come from there, not from memory.

CHECK THE DATES. Search returns old pages alongside new ones. If a result is
from months or years ago, it may be out of date; say so, or prefer a newer
result. Don't report the first hit as current just because it ranked first.

You just searched, so never write "as of my last update", "as of my last
knowledge" or anything implying this came from memory. It didn't.

Stay in your own voice — short, dry, talking to a friend. No "Would you like
more details", no offers of further help, no bullet-point report format. Say
what you found and stop. If it failed or came back thin, say that instead.`
      : `Now reply to him in one or two lines about what actually happened. If something failed, say so plainly — do not claim it worked. Only emit a new tag if you're retrying with a corrected name.`;

    messages.push({
      role: 'system',
      content: `TOOL RESULTS:\n${observations.join('\n')}\n\nUPDATED BOARD:\nGroups: ${freshCtx.groups
        .map((g) => g.name)
        .join(', ') || '(none)'}\n\n${instruction}`,
    });
  }

  if (!finalReply && toolsExecuted.length > 0) {
    finalReply = toolsExecuted.map((t) => t.message).join(' ');
  }

  // Safety net: if she claimed a change but emitted no tag, don't let the lie stand.
  if (toolsExecuted.length === 0 && soundsLikeAClaim(finalReply)) {
    finalReply += "\n\n(...actually, hold on — I didn't touch anything. Say it again and be specific about the name?)";
  }

  spideyApi.setMindState('speaking', finalReply.slice(0, 45));

  return {
    reply: finalReply || 'Got it.',
    toolsExecuted,
    actionExecuted,
    modelUsed: localAi.modelName || 'local-ai',
  };
}

const CLAIM_PATTERNS = [
  /\b(deleted|removed|created|added|renamed|moved|cleared|wiped|nuked)\b/i,
  /\b(done|got it, done|all set)\b.*\b(group|task|note|timer)\b/i,
];

function soundsLikeAClaim(text: string): boolean {
  return CLAIM_PATTERNS.some((r) => r.test(text));
}