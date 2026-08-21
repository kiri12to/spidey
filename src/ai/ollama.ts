import { LocalAiSettings } from '../types';
import { ModelMessage, ModelResponse } from '../agent/types';
import { normalizeOllamaUrl, parseLocalActionTags, getOllamaBaseUrl } from './provider';

/**
 * Executes a call to a local Ollama instance with optional streaming support.
 * Defaults are tuned for the user's Spidey Qwen model on a 4 GB GPU / 16 GB RAM PC.
 */
export async function callOllama(
  messages: ModelMessage[],
  localAi: LocalAiSettings,
  temperature: number = 0.7,
  maxTokens: number = 600,
  onChunk?: (chunk: string) => void
): Promise<ModelResponse> {
  const targetUrl = normalizeOllamaUrl(localAi.endpointUrl);
  const isGenerate = targetUrl.endsWith('/api/generate');
  const model = localAi.modelName || 'spidey-qwen';
  const contextSize = 4096;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    let body: any;

    if (isGenerate) {
      const sysMsg = messages.find((m) => m.role === 'system')?.content || '';
      const conversation = messages
        .filter((m) => m.role !== 'system')
        .map((m) => `${m.role === 'user' ? 'User' : 'Spidey'}: ${m.content}`)
        .join('\n\n');

      body = {
        model,
        system: sysMsg,
        prompt: `${conversation}\n\nSpidey:`,
        stream: Boolean(onChunk),
        options: {
          temperature,
          num_predict: maxTokens,
          num_ctx: contextSize,
        },
      };
    } else {
      body = {
        model,
        messages,
        stream: Boolean(onChunk),
        options: {
          temperature,
          num_predict: maxTokens,
          num_ctx: contextSize,
        },
      };
    }

    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Ollama HTTP ${res.status}: ${errText || res.statusText}`);
    }

    if (onChunk && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let fullText = '';
      let pending = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        pending += decoder.decode(value, { stream: true });
        const lines = pending.split('\n');
        pending = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            const token = isGenerate ? parsed.response : parsed.message?.content;
            if (token) {
              fullText += token;
              onChunk(token);
            }
          } catch {
            // Keep incomplete JSON in the pending buffer instead of losing it.
          }
        }
      }

      if (pending.trim()) {
        try {
          const parsed = JSON.parse(pending);
          const token = isGenerate ? parsed.response : parsed.message?.content;
          if (token) {
            fullText += token;
            onChunk(token);
          }
        } catch {
          // Ignore a malformed final chunk.
        }
      }

      const { cleanText, toolCalls } = parseLocalActionTags(fullText);
      return { content: cleanText, toolCalls };
    }

    const data = await res.json();
    const rawContent = data.message?.content || data.response || '';
    const { cleanText, toolCalls } = parseLocalActionTags(rawContent);

    return { content: cleanText, toolCalls, raw: data };
  } catch (err: any) {
    clearTimeout(timeoutId);

    if (err.name === 'AbortError') {
      throw new Error('Local Ollama server timed out after 120 seconds.');
    }

    if (err.message && (err.message.includes('Failed to fetch') || err.name === 'TypeError')) {
      throw new Error(
        `Unable to reach local Ollama at ${targetUrl}. Make sure Ollama is running and that your Spidey app is allowed to connect to it.`
      );
    }

    throw err;
  }
}

/**
 * Checks if Ollama is running and lists models.
 */
export async function pingOllama(localAi: LocalAiSettings): Promise<{ success: boolean; message: string }> {
  const baseUrl = getOllamaBaseUrl(localAi.endpointUrl);

  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (res.ok) {
      const data = await res.json();
      const models: string[] = (data.models || []).map((m: any) => m.name || m.model || '');
      const reqModel = localAi.modelName || 'spidey-qwen';
      const exists = models.some((m) => m.toLowerCase() === reqModel.toLowerCase());

      return {
        success: true,
        message: exists
          ? `Connected to Ollama! Model "${reqModel}" found.`
          : `Ollama is active. Available: ${models.slice(0, 5).join(', ') || 'none'}.`,
      };
    }

    return { success: false, message: `Ollama replied with status ${res.status}` };
  } catch (err: any) {
    return { success: false, message: err.message || 'Cannot connect to Ollama' };
  }
}
