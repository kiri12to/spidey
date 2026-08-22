import { ToolCall } from '../agent/types';

/**
 * Tolerant action-tag parsing.
 *
 * Local models mangle the closing delimiter constantly. Real example:
 *
 *   [[ACTION:delete_task:{"query":"explain linux"}}
 *                                                ^^ should be }]]
 *
 * The old strict regex needed an exact `}]]`, so that match failed, which
 * meant BOTH failures at once: the tool never ran, and the tag was never
 * stripped, so it dumped raw into the chat bubble.
 *
 * Two rules here:
 *   1. Accept sloppy closers.
 *   2. Strip ANYTHING that looks like a tag, parseable or not. A malformed
 *      tag is a bug, but the user should never have to see it.
 */

/** Finds the opener + tool name + start of JSON. Closer handled manually. */
const OPENER = /\[\[?ACTION:([a-zA-Z0-9_-]+)[:\s]+/g;

interface Found {
  toolName: string;
  json: string;
  start: number;
  end: number;
}

/**
 * Walks braces to find where the JSON object really ends, so nested objects
 * work and a wrong closer doesn't matter.
 */
function scanTags(text: string): Found[] {
  const found: Found[] = [];
  const re = new RegExp(OPENER.source, 'g');
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    const braceStart = text.indexOf('{', m.index + m[0].length - 1);
    if (braceStart === -1) continue;

    let depth = 0;
    let inStr = false;
    let esc = false;
    let braceEnd = -1;

    for (let i = braceStart; i < text.length; i++) {
      const c = text[i];
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) { braceEnd = i; break; }
      }
    }
    if (braceEnd === -1) continue;

    // Swallow whatever junk closer follows: }} , }] , ]] , ] , nothing.
    let end = braceEnd + 1;
    while (end < text.length && /[\]}\s]/.test(text[end]) && end - braceEnd < 5) end++;

    found.push({
      toolName: m[1],
      json: text.slice(braceStart, braceEnd + 1),
      start: m.index,
      end,
    });
    re.lastIndex = end;
  }

  return found;
}

export function parseActionTags(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const f of scanTags(text)) {
    try {
      calls.push({ toolName: f.toolName, arguments: JSON.parse(f.json) });
    } catch {
      // Last resort: single quotes, trailing commas, unquoted keys.
      try {
        const repaired = f.json
          .replace(/'/g, '"')
          .replace(/,\s*}/g, '}')
          .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
        calls.push({ toolName: f.toolName, arguments: JSON.parse(repaired) });
      } catch {
        console.warn(`[spidey] unparseable args for "${f.toolName}":`, f.json);
      }
    }
  }
  return calls;
}

/** Removes every tag-shaped thing, even ones we couldn't parse. */
export function stripActionTags(text: string): string {
  const found = scanTags(text);
  let out = text;
  for (let i = found.length - 1; i >= 0; i--) {
    out = out.slice(0, found[i].start) + out.slice(found[i].end);
  }
  // Belt and braces: any leftover opener with no valid JSON at all.
  out = out.replace(/\[\[?ACTION:[\s\S]*$/g, '');
  return out.replace(/\n{3,}/g, '\n\n').trim();
}