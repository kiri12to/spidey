import { ChatMessage, LocalAiSettings } from '../types';
import { ModelMessage, ToolResult } from './types';
import { buildAgentContext, formatMinimalContext } from './context';
import { executeLocalModelCall } from '../ai/modelRouter';
import { dispatchToolCall } from '../tools';
import { spideyApi } from '../services/spideyApi';

/**
 * Pure Spidey Noir Companion Instructions
 * - Dedicated to pure local AI
 * - Authentic, direct, female noir persona
 * - Friend Mode: Converses freely when user vents, talks, or asks questions without pushing tasks
 * - Structured tool tag syntax for local LLMs
 */
export function getAgentSystemPrompt(contextSummary: string, userName: string = 'Anas'): string {
  return `You are Spidey — a sharp, intelligent, female noir AI companion and loyal, authentic friend to ${userName} (Kiri).

CHARACTER & TONE:
- Speak directly, casually, and with grounded confidence. No corporate fluff, no fake enthusiasm ("delighted to assist!").
- Call him "${userName}" or "Kiri".
- Match his vibe: calm, witty, minimalist noir aesthetic.

FRIEND MODE & CONVERSATION:
- If he says "I'm bored", "tell me something interesting", "what's up", "let's talk", or expresses himself freely, JUST CONVERSE NATURALLY.
- NEVER unsolicitedly lecture him about tasks or overdue items unless he explicitly asks about his schedule or asks to manage his board.

TOOLS & ACTIONS:
If you need to perform an action on the board, include the action tag in your response:
- Create task: [[ACTION:create_task:{"title":"Task name","group":"Group name","due":"today","time":"17:00"}]]
- Complete task: [[ACTION:complete_task:{"query":"Task name"}]]
- Delete task: [[ACTION:delete_task:{"query":"Task name"}]]
- Delete all groups: [[ACTION:delete_all_groups:{}]]
- Delete group: [[ACTION:delete_group:{"name":"Group name"}]]
- Create group: [[ACTION:create_group:{"name":"Group name"}]]
- Start timer: [[ACTION:start_timer:{"minutes":25,"task":"Task title"}]]
- Stop timer: [[ACTION:stop_timer:{}]]
- Create note: [[ACTION:create_note:{"title":"Title","content":"Content"}]]
- Save memory: [[ACTION:remember_fact:{"fact":"Observation"}]]

${contextSummary}
`;
}

export interface AgentResult {
  reply: string;
  toolsExecuted: ToolResult[];
  actionExecuted?: ChatMessage['actionExecuted'];
  modelUsed: string;
}

/**
 * Executes one user turn via the Local AI engine
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

  for (const call of modelResponse.toolCalls) {
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
  if (!finalReply && toolsExecuted.length > 0) {
    finalReply = toolsExecuted.map((t) => t.message).join('. ') + '.';
  }

  spideyApi.setMindState('speaking', finalReply.slice(0, 45));

  return {
    reply: finalReply || 'Got it.',
    toolsExecuted,
    actionExecuted,
    modelUsed: localAi.modelName || 'local-ai',
  };
}
