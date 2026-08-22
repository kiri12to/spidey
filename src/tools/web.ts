import { ToolResult } from '../agent/types';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * REAL web search.
 *
 * The old version of this file returned `Looked up: "${query}"` and made no
 * network call at all. Spidey would report a successful search and then
 * answer from training data — which is exactly the "claimed to do something
 * she didn't do" failure her own rules forbid.
 *
 * Now it hits /api/search on the Express server, which runs a provider chain
 * (SearXNG -> Google CSE -> Brave -> DuckDuckGo) and keeps any API keys
 * server-side. DuckDuckGo needs no key, so this works with zero config.
 *
 * If every provider fails, this returns success:false with a real reason so
 * she can say so instead of bluffing.
 */
export async function executeWebTool(
  toolName: string,
  args: Record<string, any>
): Promise<ToolResult | null> {
  if (toolName !== 'web_search') return null;

  const query = String(args.query || args.q || '').trim();
  if (!query) {
    return { toolName, success: false, message: 'I need something to search for.' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        toolName,
        success: false,
        message: payload?.error || `Search failed (${res.status}).`,
      };
    }

    const results: SearchResult[] = payload?.results || [];
    if (results.length === 0) {
      return { toolName, success: false, message: `Nothing came back for "${query}".` };
    }

    // This text is what gets fed back into her context, so it has to carry
    // the actual content — not just a confirmation that a search happened.
    const digest = results
      .map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}\n${r.url}`)
      .join('\n\n');

    return {
      toolName,
      success: true,
      message: `Found ${results.length} results for "${query}":\n\n${digest}`,
      data: { query, results },
      actionType: 'web_search',
      actionDetails: query,
    };
  } catch (err: any) {
    const msg =
      err?.name === 'AbortError'
        ? 'Search timed out.'
        : 'Could not reach the search endpoint. Is the server running?';
    return { toolName, success: false, message: msg };
  }
}