import { LocalAiSettings } from '../types';
import { ModelMessage, ModelResponse } from '../agent/types';
import { parseLocalActionTags } from './provider';

/**
 * Handles standard OpenAI-compatible API servers (LM Studio, vLLM, LocalAI, text-generation-webui)
 */
export async function callOpenAiCompatible(
  messages: ModelMessage[],
  localAi: LocalAiSettings,
  temperature: number = 0.7,
  maxTokens: number = 600,
  onChunk?: (chunk: string) => void
): Promise<ModelResponse> {
  let chatUrl = (localAi.endpointUrl || 'http://localhost:1234/v1/chat/completions').trim().replace(/\/+$/, '');
  if (!chatUrl.endsWith('/chat/completions')) {
    chatUrl = `${chatUrl}/v1/chat/completions`;
  }
  const model = localAi.modelName || 'local-model';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const res = await fetch(chatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: Boolean(onChunk),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`OpenAI API server error ${res.status}: ${errText || res.statusText}`);
    }

    if (onChunk && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const content = data.choices?.[0]?.delta?.content;
              if (content) {
                fullText += content;
                onChunk(content);
              }
            } catch {
              // Ignore partial chunk parse error
            }
          }
        }
      }

      const { cleanText, toolCalls } = parseLocalActionTags(fullText);
      return { content: cleanText, toolCalls };
    }

    const data = await res.json();
    const rawContent = data.choices?.[0]?.message?.content || '';
    const { cleanText, toolCalls } = parseLocalActionTags(rawContent);

    return { content: cleanText, toolCalls, raw: data };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Local API server timed out after 35 seconds.');
    }
    if (err.message && (err.message.includes('Failed to fetch') || err.name === 'TypeError')) {
      throw new Error(`Unable to reach server at ${chatUrl}. Check if server is running and CORS is enabled.`);
    }
    throw err;
  }
}
