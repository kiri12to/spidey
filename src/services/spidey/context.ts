import { spideyApi } from '../spideyApi';
import { memoryStore } from './memory';
import { SpideyWorldState } from './types';
import { getConversationalName } from './personality';

/**
 * Gathers complete, real-time world state from the app ledger & memory
 */
export function buildSpideyWorldState(query: string = '', preferredUserName: string = 'Anas'): SpideyWorldState {
  const now = new Date();
  const todayDate = now.toISOString().split('T')[0];
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayOfWeek = days[now.getDay()];
  const currentHour = now.getHours();

  const groups = spideyApi.getTaskGroups();
  const allTasks = spideyApi.getTasks();
  const pendingTasks = allTasks.filter((t) => !t.completed);
  const completedTodayTasks = allTasks.filter(
    (t) => t.completed && (!t.completedAt || t.completedAt.startsWith(todayDate))
  );
  const overdueTasks = spideyApi.getOverdueTasks();
  const activeTimer = spideyApi.getTimer();
  const recentNotes = spideyApi.getNotes().slice(0, 3);
  const behaviorInsights = spideyApi.getBehaviorInsights();

  // Phase 4: Retrieval-based relevant memories
  const relevantMemories = memoryStore.retrieveRelevantMemories(query, 5);

  return {
    timestamp: Date.now(),
    localTime: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    todayDate,
    dayOfWeek,
    currentHour,
    userName: preferredUserName,
    nickname: getConversationalName(preferredUserName),
    groups,
    pendingTasks,
    completedTodayTasks,
    overdueTasks,
    activeTimer,
    relevantMemories,
    behaviorInsights,
    recentNotes,
  };
}

/**
 * Formats world state into a crisp, readable context block for LLM prompts
 */
export function formatWorldStateForPrompt(state: SpideyWorldState): string {
  const groupNames = state.groups.map((g) => g.name).join(', ') || 'None';
  const pendingList = state.pendingTasks.slice(0, 6).map((t) => `"${t.title}"${t.dueTime ? ` @ ${t.dueTime}` : ''}`).join(', ') || 'None';
  const overdueList = state.overdueTasks.slice(0, 4).map((t) => `"${t.title}" (due ${t.dueDate || 'past'})`).join(', ') || 'None';
  const completedCount = state.completedTodayTasks.length;
  const timerStatus = state.activeTimer.isRunning
    ? `Running (${Math.ceil(state.activeTimer.remainingSeconds / 60)}m left on "${state.activeTimer.taskTitle || 'Focus'}")`
    : 'Idle';

  return `
APP SITUATIONAL STATE:
- Local Time: ${state.localTime} (${state.dayOfWeek}, ${state.todayDate})
- Groups (${state.groups.length}): ${groupNames}
- Pending Tasks (${state.pendingTasks.length}): ${pendingList}
- Overdue (${state.overdueTasks.length}): ${overdueList}
- Completed Today: ${completedCount}
- Timer: ${timerStatus}
- Observed Habits: ${state.behaviorInsights.join(' | ') || 'Steady baseline'}
- Retrieved Relevant Context:
${state.relevantMemories.map((m) => `  * ${m}`).join('\n') || '  * None'}
`;
}
