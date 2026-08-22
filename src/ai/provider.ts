import { LocalAiSettings } from '../types';
import { ToolCall } from '../agent/types';
import { parseActionTags, stripActionTags } from './actionTags';

/**
 * Parses action tags from local model output if returned in format:
 * [[ACTION:tool_name:{"arg":"val"}]] or JSON markdown blocks
 */
export function parseLocalActionTags(rawText: string): { cleanText: string; toolCalls: ToolCall[] } {
  return { cleanText: stripActionTags(rawText), toolCalls: parseActionTags(rawText) };
}

/**
 * Normalizes Ollama endpoint to ensure valid URL path
 */
export function normalizeOllamaUrl(endpoint: string): string {
  let url = (endpoint || 'http://localhost:11434').trim().replace(/\/+$/, '');
  if (!url.endsWith('/api/chat') && !url.endsWith('/api/generate')) {
    url = `${url}/api/chat`;
  }
  return url;
}

export function getOllamaBaseUrl(endpoint: string): string {
  return (endpoint || 'http://localhost:11434')
    .trim()
    .replace(/\/api\/(chat|generate|tags).*$/, '')
    .replace(/\/+$/, '');
}