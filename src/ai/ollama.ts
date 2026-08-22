import { LocalAiSettings } from "../types";
import { ModelMessage, ModelResponse } from "../agent/types";
import { resolveEndpoint } from "./endpoint";
import { parseActionTags, stripActionTags } from "./actionTags";
import { TOOL_SCHEMAS } from "../tools/schemas";
import { ToolCall } from "../agent/types";

/**
 * Reads Ollama's native tool_calls off a message.
 *
 * Qwen2.5-instruct is trained on this format, so calls come back as real JSON
 * objects instead of a bracket syntax the model has to reproduce by hand.
 * That removes the entire class of "mangled tag did nothing" failures.
 */
function readNativeToolCalls(message: any): ToolCall[] {
  const raw = message?.tool_calls;
  if (!Array.isArray(raw)) return [];

  const calls: ToolCall[] = [];
  for (const c of raw) {
    const fn = c?.function;
    if (!fn?.name) continue;
    let args = fn.arguments;
    if (typeof args === "string") {
      try {
        args = JSON.parse(args);
      } catch {
        args = {};
      }
    }
    calls.push({ toolName: fn.name, arguments: args || {} });
  }
  return calls;
}

const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const DEFAULT_MODEL = "spidey-qwen:latest";
const DEFAULT_CONTEXT = 4096;

/**
 * Get the Ollama server URL.
 */
function getOllamaUrl(settings?: LocalAiSettings): string {
  return resolveEndpoint(settings).baseUrl || DEFAULT_OLLAMA_URL;
}

/**
 * Get the configured model.
 */
function getOllamaModel(settings?: LocalAiSettings): string {
  return resolveEndpoint(settings).model || DEFAULT_MODEL;
}

/**
 * Get context size.
 *
 * Your Spidey model is configured for 4096.
 */
function getContextSize(settings?: LocalAiSettings): number {
  // Passing num_ctx here OVERRIDES whatever the Modelfile set. The default
  // used to be 4096, which silently clamped a model built for 16384 back down
  // to a quarter of its window -- persona, tools, board state and history were
  // being truncated on every call.
  //
  // 8192 is the compromise for a 4GB card: the KV cache for 16K would push
  // another ~1GB off the GPU and onto the CPU, and inference speed matters
  // more than headroom she rarely uses.
  return settings?.contextSize || 8192;
}

/**
 * Check that Ollama is reachable.
 */
export async function checkOllamaConnection(
  settings?: LocalAiSettings
): Promise<boolean> {
  try {
    const response = await fetch(
      `${getOllamaUrl(settings)}/api/tags`
    );

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Existing parts of Spidey use pingOllama().
 *
 * Keep this function for compatibility.
 */
export async function pingOllama(
  settings?: LocalAiSettings
): Promise<{ success: boolean; message: string }> {
  try {
    const baseUrl = getOllamaUrl(settings);

    const response = await fetch(
      `${baseUrl}/api/tags`
    );

    if (!response.ok) {
      return {
        success: false,
        message: `Ollama returned HTTP ${response.status}.`,
      };
    }

    const data = await response.json();

    if (!Array.isArray(data.models)) {
      return {
        success: false,
        message: "Ollama responded, but the model list was invalid.",
      };
    }

    const configuredModel = getOllamaModel(settings);

    const modelExists = data.models.some(
      (model: { name?: string }) =>
        model.name === configuredModel ||
        model.name === `${configuredModel}:latest`
    );

    if (!modelExists) {
      const availableModels = data.models
        .map((model: { name?: string }) => model.name)
        .filter(Boolean)
        .join(", ");

      return {
        success: false,
        message:
          `Ollama is running, but "${configuredModel}" was not found. ` +
          `Available models: ${availableModels}`,
      };
    }

    return {
      success: true,
      message: `Connected to ${configuredModel}.`,
    };
  } catch (error: any) {
    return {
      success: false,
      message:
        error?.message ||
        "Could not connect to Ollama.",
    };
  }
}

/**
 * Convert our internal messages into Ollama messages.
 */
function convertMessages(messages: ModelMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

/**
 * Parse Spidey's action tags.
 *
 * Example:
 *
 * [[ACTION:create_task:{"title":"Study networking"}]]
 */
/**
 * Call Ollama.
 *
 * IMPORTANT:
 * The function signature matches modelRouter.ts:
 *
 * messages
 * settings
 * temperature
 * maxTokens
 * onChunk
 */
export async function callOllama(
  messages: ModelMessage[],
  settings: LocalAiSettings,
  temperature: number = 0.7,
  maxTokens?: number,
  onChunk?: (chunk: string) => void
): Promise<ModelResponse> {
  const baseUrl = getOllamaUrl(settings);
  const model = getOllamaModel(settings);

  const response = await fetch(
    `${baseUrl}/api/chat`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        model,

        messages: convertMessages(messages),

        stream: Boolean(onChunk),

        // Tools go here, NOT in the system prompt. This is the single biggest
        // reliability win available: the model emits structured calls it was
        // trained on, and ~700 tokens of prompt go back to personality.
        tools: TOOL_SCHEMAS,

        options: {
          temperature,

          num_ctx: getContextSize(settings),

          ...(maxTokens
            ? {
                num_predict: maxTokens,
              }
            : {}),
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Ollama request failed (${response.status}): ${errorText}`
    );
  }

  /**
   * Streaming mode.
   */
  if (onChunk && response.body) {
    const reader = response.body.getReader();

    const decoder = new TextDecoder();

    let buffer = "";
    let fullContent = "";
    const nativeCalls: ToolCall[] = [];

    while (true) {
      const { value, done } =
        await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(
        value,
        { stream: true }
      );

      const lines =
        buffer.split("\n");

      buffer =
        lines.pop() || "";

      for (const line of lines) {
        const trimmed =
          line.trim();

        if (!trimmed) {
          continue;
        }

        try {
          const data = JSON.parse(trimmed);

          const text =
            data?.message?.content || "";

          if (text) {
            fullContent += text;

            onChunk(text);
          }

          // Tool calls arrive in their own chunk, usually the last one.
          nativeCalls.push(...readNativeToolCalls(data?.message));
        } catch {
          /**
           * Ignore incomplete JSON.
           */
        }
      }
    }

    /**
     * Process final buffered JSON.
     */
    if (buffer.trim()) {
      try {
        const data =
          JSON.parse(buffer.trim());

        const text =
          data?.message?.content || "";

        if (text) {
          fullContent += text;

          onChunk(text);
        }

        nativeCalls.push(...readNativeToolCalls(data?.message));
      } catch {
        /**
         * Ignore incomplete final JSON.
         */
      }
    }

    return {
      content: stripActionTags(fullContent),
      // Native calls win. Tag parsing stays as a fallback for when the model
      // ignores the tool interface and writes the old bracket syntax anyway.
      toolCalls: nativeCalls.length > 0 ? nativeCalls : parseActionTags(fullContent),
    };
  }

  /**
   * Non-streaming mode.
   */
  const data = await response.json();

  const content =
    data?.message?.content || "";

  const native = readNativeToolCalls(data?.message);
  return {
    content: stripActionTags(content),
    toolCalls: native.length > 0 ? native : parseActionTags(content),
  };
}

export { parseActionTags, stripActionTags };
