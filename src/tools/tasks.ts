import { spideyApi } from '../services/spideyApi';
import { ToolResult } from '../agent/types';

/**
 * Finds a task from natural language without silently choosing a weak match.
 * Exact matches win. Otherwise, the title must contain the meaningful words
 * from the user's query. If several tasks are equally plausible, we refuse to
 * guess and tell Spidey to ask the user for clarification.
 */
function findTaskSafely(query: string) {
  const normalized = query.toLowerCase().trim();
  if (!normalized) return { task: undefined, ambiguous: false };

  const tasks = spideyApi.getTasks();

  const exact = tasks.find((task) => task.title.toLowerCase().trim() === normalized);
  if (exact) return { task: exact, ambiguous: false };

  const words = normalized
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9]/g, ''))
    .filter((word) => word.length >= 2);

  if (words.length === 0) return { task: undefined, ambiguous: false };

  const scored = tasks
    .map((task) => {
      const title = task.title.toLowerCase();
      const matchedWords = words.filter((word) => title.includes(word));
      return {
        task,
        score: matchedWords.length / words.length,
        matchedWords: matchedWords.length,
      };
    })
    .filter((entry) => entry.matchedWords > 0)
    .sort((a, b) => b.score - a.score || b.matchedWords - a.matchedWords);

  if (scored.length === 0 || scored[0].score < 0.5) {
    return { task: undefined, ambiguous: false };
  }

  const best = scored[0];
  const second = scored[1];
  const ambiguous = Boolean(second && second.score === best.score);

  return { task: ambiguous ? undefined : best.task, ambiguous };
}

function taskNotFoundMessage(query: string, ambiguous: boolean): string {
  if (ambiguous) {
    return `I found multiple tasks that could match "${query}". Tell me which one you mean.`;
  }
  return `I couldn't find a task matching "${query}".`;
}

export function executeTaskTools(toolName: string, args: Record<string, any>): ToolResult | null {
  switch (toolName) {
    case 'create_task': {
      const title = args.title || args.task || args.name;
      if (!title) return { toolName, success: false, message: 'Missing task title' };

      let groupId: string | null = null;
      if (args.group) {
        const found = spideyApi.findGroupByName(args.group);
        if (found) groupId = found.id;
        else groupId = spideyApi.createTaskGroup(args.group).id;
      }

      let dueDate = args.due || args.dueDate || '';
      if (dueDate.toLowerCase() === 'today') dueDate = new Date().toISOString().split('T')[0];
      else if (dueDate.toLowerCase() === 'tomorrow') {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        dueDate = d.toISOString().split('T')[0];
      }

      const task = spideyApi.createTask({
        title,
        groupId,
        dueDate,
        dueTime: args.time || args.dueTime || undefined,
        priority: args.priority || 'medium',
        notes: args.notes || undefined,
      });

      return {
        toolName,
        success: true,
        message: `Added "${task.title}"`,
        data: task,
        actionType: 'create_task',
        actionDetails: task.title,
      };
    }

    case 'complete_task': {
      const query = args.query || args.title || args.task;
      if (!query) return { toolName, success: false, message: 'Missing task query' };

      const match = findTaskSafely(query);
      if (!match.task) {
        return { toolName, success: false, message: taskNotFoundMessage(query, match.ambiguous) };
      }

      const updated = spideyApi.completeTask(match.task.id, true);
      if (!updated) {
        return { toolName, success: false, message: `I couldn't complete "${match.task.title}".` };
      }

      spideyApi.setMindState('celebrating', `Done: ${match.task.title}`);

      return {
        toolName,
        success: true,
        message: `Completed "${match.task.title}"`,
        data: updated,
        actionType: 'complete_task',
        actionDetails: match.task.title,
      };
    }

    case 'delete_task': {
      const query = args.query || args.title || args.task;
      if (!query) return { toolName, success: false, message: 'Missing task query' };

      const match = findTaskSafely(query);
      if (!match.task) {
        return { toolName, success: false, message: taskNotFoundMessage(query, match.ambiguous) };
      }

      const deleted = spideyApi.deleteTask(match.task.id);
      if (!deleted) {
        return { toolName, success: false, message: `I couldn't delete "${match.task.title}".` };
      }

      return {
        toolName,
        success: true,
        message: `Deleted "${match.task.title}"`,
        data: { deletedTask: match.task },
        actionType: 'delete_task',
        actionDetails: match.task.title,
      };
    }

    default:
      return null;
  }
}
