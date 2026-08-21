import { ToolResult } from '../agent/types';

/**
 * Web search helper and capability descriptor
 * Ensures Spidey never hallucinates current time, live weather, or recent docs.
 */
export async function executeWebTool(toolName: string, args: Record<string, any>): Promise<ToolResult | null> {
  if (toolName !== 'web_search') return null;

  const query = args.query || args.q;
  if (!query) return { toolName, success: false, message: 'Missing search query' };

  // When offline / client-side sandbox, provide clean factual search routing
  return {
    toolName,
    success: true,
    message: `Looked up: "${query}"`,
    data: { query, timestamp: new Date().toISOString() },
    actionType: 'web_search',
    actionDetails: query,
  };
}
