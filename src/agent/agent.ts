import { ChatMessage, LocalAiSettings } from '../types';
import { ModelMessage, ToolResult } from './types';
import { buildAgentContext, formatMinimalContext } from './context';
import { executeLocalModelCall } from '../ai/modelRouter';
import { dispatchToolCall } from '../tools';
import { spideyApi } from '../services/spideyApi';

/**
 * Spidey's core personality and operating rules.
 * The model may suggest actions, but it must never claim an action happened
 * unless a real application tool successfully executed it.
 */
export function getAgentSystemPrompt(contextSummary: string, userName: string = 'Anas'): string {
  return `You are Spidey — a sharp, intelligent, female noir AI companion and loyal, authentic friend to ${userName} (Kiri).

CHARACTER & TONE:
- Speak naturally, casually, calmly, and confidently.
- Be witty when it fits, but never force jokes.
- No corporate language, fake enthusiasm, excessive emojis, or generic customer-support phrases.
- You may disagree with the user when appropriate.
- Be supportive without being fake.
- If the user wants to talk, simply talk. Do not turn every conversation into productivity advice.

HONESTY:
- Never claim that you created, changed, completed, deleted, searched, remembered, or opened something unless a tool result confirms that it actually happened.
- If a requested action fails, tell the user honestly.
- If a request is ambiguous and acting on the wrong item could be harmful, ask a clarification question.

TOOLS:
When an application action is required, emit one or more action tags exactly in this format and with valid JSON:
[[ACTION:tool_name:{"argument":"value"}]]

Available tools:
- create_task: {"title":"Task name","group":"optional group","due":"today|tomorrow|YYYY-MM-DD","time":"HH:MM","priority":"low|medium|high","notes":"optional"}
- complete_task: {"query":"Task name"}
- delete_task: {"query":"Task name"}
- delete_all_groups: {}
- delete_group: {"name":"Group name"}
- create_group: {"name":"Group name"}
- start_timer: {"minutes":25,"task":"optional task title"}
- stop_timer: {}
- create_note: {"title":"Title","content":"Content"}
- remember_fact: {"fact":"Something worth remembering"}

ACTION RULES:
- Only emit an action tag when the user actually asked for the action.
- Do not invent IDs.
- For task actions, use the user's task wording as the query.
- If you are unsure which task the user means, do not guess.
- You may put a short natural sentence before an action tag, but never pretend it succeeded before the tool result returns.

${contextSummary}`;
}

export interface AgentResult {
  reply: string;
  toolsExecuted: ToolResult[];
  actionExecuted?: ChatMessage['actionExecuted'];
  modelUsed: string;
}

/**
 * Executes one user turn through the local AI engine and then executes any
 * actions the model requested. The current application uses action tags for
 * local models; this function keeps that protocol reliable while preventing
 * runaway repeated tool execution.
 */
export async function runAgentTurn(
  prompt: string,
  history: ChatMessage[],
  localAi: LocalAiSettings,
  userName: string = 'Anas',
  onTokenChunk?: (chunk: string) => void
): Promise<AgentResult> {
  const cleanPrompt = prompt.trim();
  if (!cleanPrompt) {
    return { reply: 'Listening.', toolsExecuted: [], modelUsed: 'local' };
  }

  spideyApi.setMindState('thinking', cleanPrompt);

  const ctx = buildAgentContext(cleanPrompt, userName);
  const contextSummary = formatMinimalContext(ctx);
  const systemPrompt = localAi.customSystemPrompt || getAgentSystemPrompt(contextSummary, userName);

  const messages: ModelMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-8).map((m) => ({
      role: (m.sender === 'user' ? 'user' : 'assistant') as ModelMessage['role'],
      content: m.text,
    })),
    { role: 'user', content: cleanPrompt },
  ];

  const modelResponse = await executeLocalModelCall(
    messages,
    localAi,
    0.7,
    undefined,
    onTokenChunk
  );

  const toolsExecuted: ToolResult[] = [];
  let actionExecuted: ChatMessage['actionExecuted'] | undefined;

  // A single user turn may request multiple independent actions. Execute each
  // once; the model cannot trigger an endless action loop from this turn.
  for (const call of modelResponse.toolCalls.slice(0, 5)) {
    const res = await dispatchToolCall(call);
    toolsExecuted.push(res);

    if (res.actionType && res.actionDetails) {
      actionExecuted = {
        type: res.actionType,
        details: res.actionDetails,
      };
    }
  }

  let finalReply = modelResponse.content.trim();

  if (toolsExecuted.length > 0) {
    const successful = toolsExecuted.filter((t) => t.success);
    const failed = toolsExecuted.filter((t) => !t.success);

    if (!finalReply) {
      finalReply = successful.length > 0
        ? successful.map((t) => t.message).join('. ') + '.'
        : failed.map((t) => t.message).join('. ') + '.';
    }
  }

  spideyApi.setMindState('speaking', finalReply.slice(0, 45));

  return {
    reply: finalReply || 'Got it.',
    toolsExecuted,
    actionExecuted,
    modelUsed: localAi.modelName || 'spidey-qwen',
  };
}
