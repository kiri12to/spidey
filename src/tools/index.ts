import { ToolCall, ToolResult } from '../agent/types';
import { executeTaskTools } from './tasks';
import { executeGroupTools } from './groups';
import { executeTimerTools } from './timer';
import { executeNotesAndMemoryTools } from './notes';
import { executeWebTool } from './web';

/**
 * Central tool dispatcher: isolates application mutation operations from AI presentation
 */
export async function dispatchToolCall(call: ToolCall): Promise<ToolResult> {
  const { toolName, arguments: args } = call;

  try {
    // 1. Task tools
    const taskRes = executeTaskTools(toolName, args);
    if (taskRes) return taskRes;

    // 2. Group tools
    const groupRes = executeGroupTools(toolName, args);
    if (groupRes) return groupRes;

    // 3. Timer tools
    const timerRes = executeTimerTools(toolName, args);
    if (timerRes) return timerRes;

    // 4. Notes & Memory tools
    const noteRes = executeNotesAndMemoryTools(toolName, args);
    if (noteRes) return noteRes;

    // 5. Web tools
    const webRes = await executeWebTool(toolName, args);
    if (webRes) return webRes;

    return {
      toolName,
      success: false,
      message: `Unknown action: ${toolName}`,
    };
  } catch (err: any) {
    console.error(`Tool execution error [${toolName}]:`, err);
    return {
      toolName,
      success: false,
      message: err.message || 'Execution error',
    };
  }
}
