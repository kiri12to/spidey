import { spideyApi } from '../services/spideyApi';
import { ToolResult } from '../agent/types';

export function executeGroupTools(toolName: string, args: Record<string, any>): ToolResult | null {
  switch (toolName) {
    case 'create_group': {
      const name = args.name || args.group || args.title;
      if (!name) return { toolName, success: false, message: 'Missing group name' };

      const existing = spideyApi.findGroupByName(name);
      if (existing) return { toolName, success: true, message: `Group "${existing.name}" already exists`, data: existing };

      const grp = spideyApi.createTaskGroup(name, args.color);
      return {
        toolName,
        success: true,
        message: `Created group "${grp.name}"`,
        data: grp,
        actionType: 'create_group',
        actionDetails: grp.name,
      };
    }

    case 'delete_group': {
      const name = args.name || args.group;
      if (name && (name.toLowerCase() === 'all' || name.toLowerCase() === 'every group')) {
        const count = spideyApi.deleteAllTaskGroups();
        return {
          toolName,
          success: true,
          message: `Cleared all ${count} group${count === 1 ? '' : 's'}`,
          actionType: 'delete_group',
          actionDetails: `All groups (${count})`,
        };
      }
      if (!name) return { toolName, success: false, message: 'Missing group name' };

      const grp = spideyApi.findGroupByName(name);
      if (!grp) return { toolName, success: false, message: `Group "${name}" not found` };

      spideyApi.deleteTaskGroup(grp.id);
      return {
        toolName,
        success: true,
        message: `Deleted group "${grp.name}"`,
        actionType: 'delete_group',
        actionDetails: grp.name,
      };
    }

    case 'delete_all_groups': {
      const count = spideyApi.deleteAllTaskGroups();
      return {
        toolName,
        success: true,
        message: `Deleted all ${count} task group${count === 1 ? '' : 's'}`,
        actionType: 'delete_group',
        actionDetails: `All (${count})`,
      };
    }

    case 'rename_group': {
      const oldName = args.oldName || args.old;
      const newName = args.newName || args.new;
      if (!oldName || !newName) return { toolName, success: false, message: 'Missing old or new group name' };

      const grp = spideyApi.findGroupByName(oldName);
      if (!grp) return { toolName, success: false, message: `Group "${oldName}" not found` };

      const updated = spideyApi.renameTaskGroup(grp.id, newName);
      return {
        toolName,
        success: true,
        message: `Renamed "${oldName}" to "${newName}"`,
        data: updated,
        actionType: 'rename_group',
        actionDetails: `${oldName} -> ${newName}`,
      };
    }

    case 'move_to_group': {
      const taskQuery = args.task || args.query;
      const groupQuery = args.group || args.targetGroup;
      if (!taskQuery || !groupQuery) return { toolName, success: false, message: 'Missing task or group target' };

      const task = spideyApi.findTaskByTitle(taskQuery);
      if (!task) return { toolName, success: false, message: `Task "${taskQuery}" not found` };

      let group = spideyApi.findGroupByName(groupQuery);
      if (!group) group = spideyApi.createTaskGroup(groupQuery);

      const updated = spideyApi.moveTaskToGroup(task.id, group.id);
      return {
        toolName,
        success: true,
        message: `Moved "${task.title}" to "${group.name}"`,
        data: updated,
        actionType: 'move_to_group',
        actionDetails: `${task.title} -> ${group.name}`,
      };
    }

    default:
      return null;
  }
}
