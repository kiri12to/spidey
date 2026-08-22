import { ChatMessage, LocalAiSettings } from '../types';
import { 
  processSpideyMessage, 
  buildSpideySystemPrompt as buildPrompt,
  testLocalModelConnection,
  generateProactiveReaction,
  normalizeOllamaChatUrl as normOllamaUrl
} from './spidey';

export interface ProcessMessageResult {
  reply: string;
  actionExecuted?: ChatMessage['actionExecuted'];
  modelUsed?: string;
  isFallback?: boolean;
  fallbackReason?: string;
}

export const normalizeOllamaChatUrl = normOllamaUrl;

export function buildSpideySystemPrompt(userName: string = 'Anas'): string {
  return buildPrompt('', userName);
}

/**
 * Main chat message processor: delegates directly to Spidey Orchestrator
 */
export async function sendChatMessage(
  prompt: string,
  history: ChatMessage[],
  localAi: LocalAiSettings,
  userName: string = 'Anas'
): Promise<ProcessMessageResult> {
  const res = await processSpideyMessage(prompt, history, localAi, userName);
  return {
    reply: res.reply,
    actionExecuted: res.actionExecuted,
    modelUsed: res.modelUsed,
    isFallback: res.isFallback,
    fallbackReason: res.fallbackReason,
  };
}

/**
 * Health check test for local model connection
 */
export async function testLocalAiConnection(localAi: LocalAiSettings): Promise<{ success: boolean; message: string }> {
  return testLocalModelConnection(localAi);
}

/**
 * Proactive line generator for the spider companion
 */
export async function generateCompanionProactiveLine(
  reason: 'idle' | 'task_completed' | 'timer_finished' | 'welcome' | 'late_night' | 'maker_thought' | 'vocab_drop',
  userName: string = 'Anas',
  localAi?: LocalAiSettings
): Promise<string> {
  return generateProactiveReaction(reason, userName, localAi);
}
