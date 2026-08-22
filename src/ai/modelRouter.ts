import { LocalAiSettings } from '../types';
import { ModelMessage, ModelResponse, RoutingTier } from '../agent/types';
import { callOllama, pingOllama } from './ollama';
import { callOpenAiCompatible } from './openaiCompatible';
import { resolveEndpoint } from './endpoint';

/**
 * Model Router: Selects the appropriate local model tier (Fast for simple tasks/tools vs Deep for reasoning)
 * Optimizes prompts to be light on 4GB VRAM / 16GB RAM machines.
 */
export function classifyRequestTier(prompt: string): RoutingTier {
  const p = prompt.toLowerCase();

  // Complex reasoning / deep tasks
  if (
    p.includes('explain') ||
    p.includes('architecture') ||
    p.includes('how does') ||
    p.includes('write code') ||
    p.includes('debug') ||
    p.includes('plan my week') ||
    p.includes('research') ||
    p.length > 250
  ) {
    return 'deep';
  }

  // Fast / direct tool / conversational tasks
  return 'fast';
}

/**
 * Dispatches inference to configured local provider
 */
export async function executeLocalModelCall(
  messages: ModelMessage[],
  localAi: LocalAiSettings,
  temperature: number = 0.7,
  maxTokens?: number,
  onChunk?: (chunk: string) => void
): Promise<ModelResponse> {
  const lastUserMsg = messages.filter((m) => m.role === 'user').pop()?.content || '';
  const tier = classifyRequestTier(lastUserMsg);

  // Set tight token budgets for low-end hardware efficiency
  const tokens = maxTokens ?? (tier === 'fast' ? 350 : 700);

  if (resolveEndpoint(localAi).provider === 'ollama') {
    return callOllama(messages, localAi, temperature, tokens, onChunk);
  } else {
    return callOpenAiCompatible(messages, localAi, temperature, tokens, onChunk);
  }
}

export async function pingLocalServer(localAi: LocalAiSettings): Promise<{ success: boolean; message: string }> {
  if (resolveEndpoint(localAi).provider === 'ollama') {
    return pingOllama(localAi);
  } else {
    try {
      const res = await callOpenAiCompatible(
        [{ role: 'user', content: 'hi' }],
        localAi,
        0.1,
        5
      );
      return { success: true, message: `Connected to ${localAi.modelName || 'server'}!` };
    } catch (e: any) {
      return { success: false, message: e.message || 'Connection failed' };
    }
  }
}