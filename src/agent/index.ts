import { ChatMessage, LocalAiSettings } from '../types';
import { runAgentTurn, AgentResult } from './agent';
import { pingLocalServer } from '../ai/modelRouter';
import { formatMinimalContext, buildAgentContext } from './context';
import { dispatchToolCall } from '../tools';

export * from './types';
export * from './agent';
export * from './context';

/**
 * Clean Application Logic bridge for UI & Services
 */
export async function sendUserMessage(
  prompt: string,
  history: ChatMessage[],
  localAi: LocalAiSettings,
  userName: string = 'Anas',
  onStreamChunk?: (chunk: string) => void
): Promise<AgentResult> {
  return runAgentTurn(prompt, history, localAi, userName, onStreamChunk);
}

export async function pingLocalAi(localAi: LocalAiSettings): Promise<{ success: boolean; message: string }> {
  return pingLocalServer(localAi);
}
