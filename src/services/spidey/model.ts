import { LocalAiSettings } from '../../types';
import { SpideyToolCall } from './types';

/**
 * Normalizes Ollama endpoint
 */
export function normalizeOllamaChatUrl(endpoint: string): string {
  let url = (endpoint || 'http://localhost:11434').trim().replace(/\/+$/, '');
  if (url.endsWith('/api/generate') || url.endsWith('/api/chat')) {
    return url;
  }
  return `${url}/api/chat`;
}

export function getOllamaBaseUrl(endpoint: string): string {
  let url = (endpoint || 'http://localhost:11434').trim().replace(/\/+$/, '');
  url = url.replace(/\/api\/(chat|generate|tags)\/?$/, '');
  return url;
}

export interface ModelCallPayload {
  messages: Array<{ role: string; content: string }>;
  localAi: LocalAiSettings;
  temperature?: number;
  maxTokens?: number;
}

export interface ModelResponse {
  content: string;
  toolCalls: SpideyToolCall[];
  raw?: any;
}

/**
 * Parses action tags from model response string:
 * e.g. [[ACTION: create_task | title: Bench Press | group: Workout | due: today]]
 * or [[REMEMBER: He likes ESP32 hardware]]
 */
export function parseStructuredActionTags(rawText: string): { cleanText: string; toolCalls: SpideyToolCall[] } {
  const toolCalls: SpideyToolCall[] = [];
  let cleanText = rawText;

  // 1. [[ACTION: tool_name | key: value | key: value]]
  const actionRegex = /\[\[ACTION:\s*([a-zA-Z0-9_-]+)(.*?)(?:\]\]|$)/gi;
  let match: RegExpExecArray | null;

  while ((match = actionRegex.exec(rawText)) !== null) {
    const toolName = match[1].trim();
    const paramStr = match[2] || '';
    const args: Record<string, any> = {};

    // Parse pipe separated key:value pairs
    const pairs = paramStr.split('|').map((s) => s.trim()).filter(Boolean);
    for (const pair of pairs) {
      const colonIdx = pair.indexOf(':');
      if (colonIdx !== -1) {
        const key = pair.slice(0, colonIdx).trim();
        let val: any = pair.slice(colonIdx + 1).trim();

        // Type conversion
        if (val.toLowerCase() === 'true') val = true;
        else if (val.toLowerCase() === 'false') val = false;
        else if (/^\d+$/.test(val)) val = parseInt(val, 10);
        else if (/^\d+\.\d+$/.test(val)) val = parseFloat(val);

        args[key] = val;
      }
    }

    toolCalls.push({ toolName, arguments: args });
  }

  // 2. [[REMEMBER: fact]]
  const rememberRegex = /\[\[REMEMBER:\s*([^\]]+)\]\]/gi;
  while ((match = rememberRegex.exec(rawText)) !== null) {
    const fact = match[1].trim();
    if (fact) {
      toolCalls.push({
        toolName: 'remember_fact',
        arguments: { fact },
      });
    }
  }

  // Clean the tags from the user-facing text
  cleanText = cleanText
    .replace(/\[\[ACTION:[^\]]+\]\]/gi, '')
    .replace(/\[\[REMEMBER:[^\]]+\]\]/gi, '')
    .trim();

  return { cleanText, toolCalls };
}

export interface CloudAiPayload {
  messages: Array<{ role: string; content: string }>;
  systemInstruction?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Dispatches request to the server-side Gemini 3.7 Flash AI engine
 */
export async function callCloudAiModel(payload: CloudAiPayload): Promise<ModelResponse> {
  const res = await fetch('/api/spidey/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: payload.messages,
      systemInstruction: payload.systemInstruction,
      temperature: payload.temperature ?? 0.7,
      maxTokens: payload.maxTokens ?? 1000,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Server AI error (${res.status})`);
  }

  const data = await res.json();
  const rawText = data.content || '';
  const serverToolCalls: SpideyToolCall[] = data.toolCalls || [];

  // Also parse any action tags in rawText if present
  const { cleanText, toolCalls: parsedTags } = parseStructuredActionTags(rawText);

  // Combine tool calls
  const combinedTools = [...serverToolCalls, ...parsedTags];

  return {
    content: cleanText,
    toolCalls: combinedTools,
    raw: data,
  };
}

/**
 * Dispatches request to the configured local model (e.g. Qwen3 8B, Llama 3.1)
 */
export async function callLocalModel(payload: ModelCallPayload): Promise<ModelResponse> {
  const { messages, localAi, temperature = 0.7, maxTokens = 500 } = payload;
  const endpoint = localAi.endpointUrl || 'http://localhost:11434/api/chat';
  const modelName = localAi.modelName || 'qwen3:8b';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout

  try {
    if (localAi.provider === 'ollama') {
      const targetUrl = normalizeOllamaChatUrl(endpoint);
      const isGenerate = targetUrl.endsWith('/api/generate');

      let requestBody: any;
      if (isGenerate) {
        const sysMsg = messages.find((m) => m.role === 'system')?.content || '';
        const conversation = messages
          .filter((m) => m.role !== 'system')
          .map((m) => `${m.role === 'user' ? 'User' : 'Spidey'}: ${m.content}`)
          .join('\n\n');

        const promptText = `${conversation}\n\nSpidey:`;

        requestBody = {
          model: modelName,
          system: sysMsg,
          prompt: promptText,
          stream: false,
          options: {
            temperature,
          },
        };
      } else {
        requestBody = {
          model: modelName,
          messages,
          stream: false,
          options: {
            temperature,
          },
        };
      }

      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Ollama error (${res.status}): ${errText || res.statusText}`);
      }

      const data = await res.json();
      const rawContent = data.message?.content || data.response || '';
      const { cleanText, toolCalls } = parseStructuredActionTags(rawContent);

      return {
        content: cleanText,
        toolCalls,
        raw: data,
      };
    } else {
      // OpenAI Compatible (LM Studio / vLLM / LocalAI)
      let chatUrl = endpoint.trim().replace(/\/+$/, '');
      if (!chatUrl.endsWith('/chat/completions')) {
        chatUrl = `${chatUrl}/v1/chat/completions`;
      }

      const res = await fetch(chatUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`OpenAI-compatible server error (${res.status}): ${res.statusText}`);
      }

      const data = await res.json();
      const rawContent = data.choices?.[0]?.message?.content || '';
      const { cleanText, toolCalls } = parseStructuredActionTags(rawContent);

      return {
        content: cleanText,
        toolCalls,
        raw: data,
      };
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Connection to local model timed out after 25s.`);
    }
    if (err.message && (err.message.includes('Failed to fetch') || err.name === 'TypeError')) {
      throw new Error(
        `Browser blocked connection to ${endpoint}. (Mixed Content / CORS). If running on HTTPS, click browser site settings -> Insecure content: Allow, and run Ollama with OLLAMA_ORIGINS="*"`
      );
    }
    throw err;
  }
}

/**
 * Health-check ping to verify local model connection
 */
export async function testLocalModelConnection(localAi: LocalAiSettings): Promise<{ success: boolean; message: string }> {
  try {
    const endpoint = localAi.endpointUrl || 'http://localhost:11434/api/chat';
    const modelName = localAi.modelName || 'qwen3:8b';

    if (localAi.provider === 'ollama') {
      const baseUrl = getOllamaBaseUrl(endpoint);
      // First try /api/tags (fastest check for running Ollama instance)
      try {
        const tagsRes = await fetch(`${baseUrl}/api/tags`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        if (tagsRes.ok) {
          const tagsData = await tagsRes.json();
          const modelsList: string[] = (tagsData.models || []).map((m: any) => m.name || m.model || '');
          const hasModel = modelsList.some((m) => m.toLowerCase().includes(modelName.toLowerCase().split(':')[0]));
          if (hasModel) {
            return { success: true, message: `Connected to Ollama! Model "${modelName}" is ready.` };
          } else {
            return {
              success: true,
              message: `Ollama is running. Note: "${modelName}" not found in list (${modelsList.slice(0, 3).join(', ') || 'none'}). Run 'ollama run ${modelName}'`,
            };
          }
        }
      } catch (tagsErr) {
        // Fall through to test via standard model call
      }
    }

    const res = await callLocalModel({
      localAi,
      messages: [
        { role: 'system', content: 'You are Spidey. Reply with one word: "Ready".' },
        { role: 'user', content: 'ping' },
      ],
      temperature: 0.1,
      maxTokens: 10,
    });

    if (res.content.trim()) {
      return { success: true, message: `Connected to ${modelName} (${res.content.slice(0, 30)}...)` };
    }
    return { success: false, message: 'Server returned empty response' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Connection failed. Check CORS / Mixed Content settings.' };
  }
}
