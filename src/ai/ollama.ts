import { LocalAiSettings } from "../types";
import { ModelMessage, ModelResponse, ToolCall } from "../agent/types";

const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const DEFAULT_MODEL = "spidey-qwen:latest";
const DEFAULT_CONTEXT = 4096;

/**
 * Get the Ollama server URL.
 */
function getOllamaUrl(settings?: LocalAiSettings): string {
  return (
    settings?.baseUrl?.replace(/\/+$/, "") ||
    DEFAULT_OLLAMA_URL
  );
}

/**
 * Get the configured model.
 */
function getOllamaModel(settings?: LocalAiSettings): string {
  return (
    settings?.modelName?.trim() ||
    DEFAULT_MODEL
  );
}

/**
 * Get context size.
 *
 * Your Spidey model is configured for 4096.
 */
function getContextSize(settings?: LocalAiSettings): number {
  return settings?.contextSize || DEFAULT_CONTEXT;
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
export function parseActionTags(text: string): ToolCall[] {
  const toolCalls: ToolCall[] = [];

  const regex =
    /\[\[ACTION:([a-zA-Z0-9_-]+):(\{[\s\S]*?\})\]\]/g;

  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const toolName = match[1];
    const rawArguments = match[2];

    try {
      const args = JSON.parse(rawArguments);

      toolCalls.push({
        toolName,
        arguments: args,
      });
    } catch (error) {
      console.warn(
        `Spidey could not parse action arguments for "${toolName}".`,
        error
      );
    }
  }

  return toolCalls;
}

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
      } catch {
        /**
         * Ignore incomplete final JSON.
         */
      }
    }

    return {
      content: fullContent,

      /**
       * ALWAYS return an array.
       *
       * This fixes:
       *
       * modelResponse.toolCalls is not iterable
       */
      toolCalls:
        parseActionTags(fullContent),
    };
  }

  /**
   * Non-streaming mode.
   */
  const data = await response.json();

  const content =
    data?.message?.content || "";

  return {
    content,

    /**
     * ALWAYS return an array.
     */
    toolCalls:
      parseActionTags(content),
  };
}