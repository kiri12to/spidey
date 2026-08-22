import { spideyApi } from '../services/spideyApi';
import { memoryStore } from '../services/spidey/memory';
import { AgentContext } from './types';

/**
 * Builds a lean, efficient context snapshot of the workspace
 * Specially formatted to minimize prompt tokens for 4GB VRAM / 16GB RAM setups.
 */
export function buildAgentContext(query: string = '', userName: string = 'Anas'): AgentContext {
  const now = new Date();
  const todayDate = now.toISOString().split('T')[0];
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return {
    currentTime: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    todayDate,
    dayOfWeek: days[now.getDay()],
    currentHour: now.getHours(),
    userName: userName || 'Anas',
    tasks: spideyApi.getTasks(),
    groups: spideyApi.getTaskGroups(),
    notes: spideyApi.getNotes().slice(0, 4),
    timer: spideyApi.getTimer(),
    memories: memoryStore.retrieveRelevantMemories(query, 6),
  };
}

/**
 * Formats minimal context block for local small models (Qwen 8B, Llama 3)
 */
export function formatMinimalContext(ctx: AgentContext): string {
  const groupNames = ctx.groups.map((g) => g.name).join(', ') || 'None';
  const pendingTasks = ctx.tasks
    .filter((t) => !t.completed)
    .slice(0, 5)
    .map((t) => `"${t.title}"${t.dueTime ? ` @ ${t.dueTime}` : ''}`)
    .join(', ') || 'None';

  const timerStatus = ctx.timer.isRunning
    ? `Running (${Math.ceil(ctx.timer.remainingSeconds / 60)}m on "${ctx.timer.taskTitle || 'Focus'}")`
    : 'Idle';

  return `TIME: ${ctx.currentTime} (${ctx.dayOfWeek}, ${ctx.todayDate})
BOARD: Groups: [${groupNames}] | Pending: [${pendingTasks}] | Timer: ${timerStatus}
CONTEXT: Anas (Kiri), 22, Morocco. Aspiring SRE, building Spidey.
MEMORIES: ${ctx.memories.join('; ') || 'None'}`;
}