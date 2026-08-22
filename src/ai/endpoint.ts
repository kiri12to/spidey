import { LocalAiSettings } from '../types';

/**
 * ONE place that decides where we talk to, and how.
 *
 * The old code read `localAi.provider`, `localAi.endpointUrl` and
 * `localAi.baseUrl` in different files. Two of those didn't exist on the
 * type, so they were `undefined` at compile time and worked only by luck at
 * runtime. Everything now goes through here.
 */
export type Provider = 'ollama' | 'openai';

export interface ResolvedEndpoint {
  provider: Provider;
  /** Root, no trailing slash. e.g. http://localhost:11434 */
  baseUrl: string;
  /** Full chat URL for the provider. */
  chatUrl: string;
  model: string;
  contextSize: number;
}

function stripPath(url: string): string {
  return url
    .trim()
    .replace(/\/api\/(chat|generate|tags).*$/, '')
    .replace(/\/v1\/chat\/completions.*$/, '')
    .replace(/\/v1\/?$/, '')
    .replace(/\/+$/, '');
}

export function resolveEndpoint(localAi: Partial<LocalAiSettings> | undefined): ResolvedEndpoint {
  const raw =
    localAi?.baseUrl ||
    (localAi as any)?.endpointUrl || // legacy settings saved in localStorage
    'http://localhost:11434';

  const provider: Provider =
    localAi?.provider ||
    (raw.includes('11434') ? 'ollama' : 'openai');

  const baseUrl = stripPath(raw) || 'http://localhost:11434';

  return {
    provider,
    baseUrl,
    chatUrl: provider === 'ollama' ? `${baseUrl}/api/chat` : `${baseUrl}/v1/chat/completions`,
    model: localAi?.modelName?.trim() || 'qwen2.5:3b',
    contextSize: localAi?.contextSize || 4096,
  };
}