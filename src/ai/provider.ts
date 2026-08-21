import { LocalAiSettings } from '../types';
import { ModelMessage, ModelResponse, ToolCall } from '../agent/types';

/**
 * Parses action tags from local model output if returned in format:
 * [[ACTION:tool_name:{"arg":"val"}]] or JSON markdown blocks
 */
export function parseLocalActionTags(rawText: string): { cleanText: string; toolCalls: ToolCall[] } {
  const toolCalls: ToolCall[] = [];
  let cleanText = rawText;

  // 1. Tag format: [[ACTION:tool_name:{"arg":"val"}]]
  const tagRegex = /\[\[ACTION:([a-zA-Z0-9_-]+):(\{[\s\S]*?\})\]\]/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(rawText)) !== null) {
    const toolName = match[1];
    const argsJson = match[2];
    try {
      const args = JSON.parse(argsJson);
      toolCalls.push({ toolName, arguments: args });
    } catch {
      // Continue parsing
    }
  }
  cleanText = cleanText.replace(tagRegex, '').trim();

  // 2. Tag format: [ACTION:tool_name {"arg":"val"}]
  const tagRegexAlt = /\[ACTION:([a-zA-Z0-9_-]+)\s+(\{[\s\S]*?\})\]/g;
  while ((match = tagRegexAlt.exec(cleanText)) !== null) {
    const toolName = match[1];
    const argsJson = match[2];
    try {
      const args = JSON.parse(argsJson);
      toolCalls.push({ toolName, arguments: args });
    } catch {
      // Continue parsing
    }
  }
  cleanText = cleanText.replace(tagRegexAlt, '').trim();

  return { cleanText, toolCalls };
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
