import { ToolCall, ToolResult } from '../agent/types';
import { executeTaskTools } from './tasks';
import { executeGroupTools } from './groups';
import { executeTimerTools } from './timer';
import { executeNotesAndMemoryTools } from './notes';
import { executeWebTool } from './web';
import { executeSpiderTools } from './spider';

/**
 * ============================================================================
 * THE BUG THAT ATE YOUR GROUP COMMANDS
 * ============================================================================
 * Old code:
 *
 *   const taskRes = executeTaskTools(toolName, args);   // wrong arity
 *   if (taskRes) return taskRes;                        // Promise is truthy
 *
 * `executeTaskTools` is `async`, so it returns a Promise. A Promise is ALWAYS
 * truthy. So `dispatchToolCall` returned on the very first line, every single
 * call, and the group / timer / note / web handlers below it were unreachable
 * dead code. `create_group` and `delete_group` literally could not run.
 *
 * On top of that it was called as (toolName, args) while the function takes a
 * single ToolCall object, so `call.toolName` was undefined and it fell into
 * `default:` anyway.
 *
 * Fix: await, pass the ToolCall, and only return on a real result.
 * ============================================================================
 */

type Handler = (call: ToolCall) => Promise<ToolResult | null> | ToolResult | null;

const HANDLERS: Handler[] = [
  (call) => executeTaskTools(call),
  (call) => executeGroupTools(call.toolName, call.arguments),
  (call) => executeTimerTools(call.toolName, call.arguments),
  (call) => executeNotesAndMemoryTools(call.toolName, call.arguments),
  (call) => executeWebTool(call.toolName, call.arguments),
  (call) => executeSpiderTools(call.toolName, call.arguments),
];

export async function dispatchToolCall(call: ToolCall): Promise<ToolResult> {
  const args = call.arguments || {};
  const normalized: ToolCall = { toolName: call.toolName, arguments: args };

  for (const handler of HANDLERS) {
    try {
      const res = await handler(normalized);
      // null == "not my tool, keep looking". A ToolResult == handled, stop.
      if (res) return { ...res, toolName: res.toolName || call.toolName };
    } catch (err: any) {
      console.error(`[spidey] tool "${call.toolName}" threw:`, err);
      return {
        toolName: call.toolName,
        success: false,
        message: err?.message || 'That blew up on my end.',
      };
    }
  }

  return {
    toolName: call.toolName,
    success: false,
    message: `I don't have a tool called "${call.toolName}".`,
  };
}
