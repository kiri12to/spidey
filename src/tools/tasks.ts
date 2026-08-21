import { spideyApi } from '../services/spideyApi';
import { ToolResult } from '../agent/types';

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

      const matched = spideyApi.findTaskByTitle(query);
      if (!matched) return { toolName, success: false, message: `Task matching "${query}" not found` };

      const updated = spideyApi.completeTask(matched.id, true);
      spideyApi.setMindState('celebrating', `Done: ${matched.title}`);

      return {
        toolName,
        success: true,
        message: `Completed "${matched.title}"`,
        data: updated,
        actionType: 'complete_task',
        actionDetails: matched.title,
      };
    }

    case 'delete_task': {
      const query = args.query || args.title || args.task;
      if (!query) return { toolName, success: false, message: 'Missing task query' };

      const matched = spideyApi.findTaskByTitle(query);
      if (!matched) return { toolName, success: false, message: `Task matching "${query}" not found` };

      spideyApi.deleteTask(matched.id);
      return {
        toolName,
        success: true,
        message: `Deleted "${matched.title}"`,
        actionType: 'delete_task',
        actionDetails: matched.title,
      };
    }

    default:
      return null;
  }
}
