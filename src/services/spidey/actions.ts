import { spideyApi } from '../spideyApi';
import { memoryStore } from './memory';
import { toggleAmbientRain } from '../sound';
import { SpideyExecutionResult, SpideyToolCall } from './types';

/**
 * Safely executes a structured tool call against the live Spidey API & state stores.
 */
export function executeSpideyAction(call: SpideyToolCall): SpideyExecutionResult {
  const { toolName, arguments: args } = call;

  try {
    switch (toolName.toLowerCase()) {
      // 1. CREATE TASK
      case 'create_task': {
        const title = args.title || args.name || args.task;
        if (!title) {
          return { toolName, success: false, message: 'Missing task title parameter' };
        }

        let groupId: string | null = null;
        if (args.group) {
          const matchedGroup = spideyApi.findGroupByName(args.group);
          if (matchedGroup) {
            groupId = matchedGroup.id;
          } else {
            // Auto create group if not found
            const newGroup = spideyApi.createTaskGroup(args.group);
            groupId = newGroup.id;
          }
        }

        let dueDate = args.due || args.dueDate || '';
        if (dueDate.toLowerCase() === 'today') {
          dueDate = new Date().toISOString().split('T')[0];
        } else if (dueDate.toLowerCase() === 'tomorrow') {
          const d = new Date();
          d.setDate(d.getDate() + 1);
          dueDate = d.toISOString().split('T')[0];
        }

        const task = spideyApi.createTask({
          title,
          groupId,
          dueDate,
          dueTime: args.time || args.dueTime || undefined,
          priority: (args.priority as any) || 'medium',
          notes: args.notes || undefined,
        });

        return {
          toolName,
          success: true,
          message: `Created task "${task.title}"`,
          data: task,
          actionType: 'create_task',
          actionDetails: task.title,
        };
      }

      // 2. COMPLETE TASK
      case 'complete_task': {
        const query = args.query || args.title || args.task || args.name;
        if (!query) return { toolName, success: false, message: 'Missing task identifier' };

        const matched = spideyApi.findTaskByTitle(query);
        if (!matched) {
          return { toolName, success: false, message: `Could not find task matching "${query}"` };
        }

        const updated = spideyApi.completeTask(matched.id, true);
        spideyApi.setMindState('celebrating', `Completed: ${matched.title}`);

        return {
          toolName,
          success: true,
          message: `Completed task "${matched.title}"`,
          data: updated,
          actionType: 'complete_task',
          actionDetails: matched.title,
        };
      }

      // 3. DELETE TASK
      case 'delete_task': {
        const query = args.query || args.title || args.task || args.name;
        if (!query) return { toolName, success: false, message: 'Missing task identifier' };

        const matched = spideyApi.findTaskByTitle(query);
        if (!matched) {
          return { toolName, success: false, message: `Could not find task matching "${query}"` };
        }

        spideyApi.deleteTask(matched.id);
        return {
          toolName,
          success: true,
          message: `Deleted task "${matched.title}"`,
          actionType: 'delete_task',
          actionDetails: matched.title,
        };
      }

      // 4. CREATE GROUP
      case 'create_group': {
        const name = args.name || args.group || args.title;
        if (!name) return { toolName, success: false, message: 'Missing group name' };

        const existing = spideyApi.findGroupByName(name);
        if (existing) {
          return { toolName, success: true, message: `Group "${existing.name}" already exists`, data: existing };
        }

        const group = spideyApi.createTaskGroup(name, args.color);
        return {
          toolName,
          success: true,
          message: `Created task group "${group.name}"`,
          data: group,
          actionType: 'create_group',
          actionDetails: group.name,
        };
      }

      // 5. DELETE GROUP
      case 'delete_group': {
        const name = args.name || args.group;
        if (name && (name.toLowerCase() === 'all' || name.toLowerCase() === 'every group')) {
          const count = spideyApi.deleteAllTaskGroups();
          return {
            toolName,
            success: true,
            message: `Deleted all ${count} group${count === 1 ? '' : 's'}`,
            actionType: 'delete_group',
            actionDetails: `All groups (${count})`,
          };
        }
        if (!name) return { toolName, success: false, message: 'Missing group name' };

        const group = spideyApi.findGroupByName(name);
        if (!group) return { toolName, success: false, message: `Group "${name}" not found` };

        spideyApi.deleteTaskGroup(group.id);
        return {
          toolName,
          success: true,
          message: `Deleted group "${group.name}"`,
          actionType: 'delete_group',
          actionDetails: group.name,
        };
      }

      // 5b. DELETE ALL GROUPS
      case 'delete_all_groups': {
        const count = spideyApi.deleteAllTaskGroups();
        return {
          toolName,
          success: true,
          message: `Deleted all ${count} task group${count === 1 ? '' : 's'} from your board`,
          actionType: 'delete_group',
          actionDetails: `All (${count})`,
        };
      }

      // 6. RENAME GROUP
      case 'rename_group': {
        const oldName = args.oldName || args.old || args.name;
        const newName = args.newName || args.new || args.title;
        if (!oldName || !newName) return { toolName, success: false, message: 'Missing old or new group name' };

        const group = spideyApi.findGroupByName(oldName);
        if (!group) return { toolName, success: false, message: `Group "${oldName}" not found` };

        const updated = spideyApi.renameTaskGroup(group.id, newName);
        return {
          toolName,
          success: true,
          message: `Renamed group "${oldName}" to "${newName}"`,
          data: updated,
          actionType: 'rename_group',
          actionDetails: `${oldName} -> ${newName}`,
        };
      }

      // 7. MOVE TASK TO GROUP
      case 'move_to_group': {
        const taskQuery = args.task || args.query || args.title;
        const groupQuery = args.group || args.targetGroup || args.name;
        if (!taskQuery || !groupQuery) return { toolName, success: false, message: 'Missing task or group target' };

        const task = spideyApi.findTaskByTitle(taskQuery);
        if (!task) return { toolName, success: false, message: `Task "${taskQuery}" not found` };

        let group = spideyApi.findGroupByName(groupQuery);
        if (!group) {
          group = spideyApi.createTaskGroup(groupQuery);
        }

        const updated = spideyApi.moveTaskToGroup(task.id, group.id);
        return {
          toolName,
          success: true,
          message: `Moved "${task.title}" to group "${group.name}"`,
          data: updated,
          actionType: 'move_to_group',
          actionDetails: `${task.title} -> ${group.name}`,
        };
      }

      // 8. START TIMER
      case 'start_timer': {
        const minutes = Number(args.minutes || args.duration || 25) || 25;
        const taskTitle = args.task || args.title || 'Focus Session';

        spideyApi.startTimer({ minutes, taskTitle });
        spideyApi.setMindState('focusing', `Timer on: ${taskTitle}`);

        return {
          toolName,
          success: true,
          message: `Started ${minutes}-minute timer for "${taskTitle}"`,
          actionType: 'start_timer',
          actionDetails: `${minutes}m: ${taskTitle}`,
        };
      }

      // 9. STOP TIMER
      case 'stop_timer': {
        spideyApi.stopTimer();
        return {
          toolName,
          success: true,
          message: 'Stopped focus timer',
          actionType: 'start_timer',
          actionDetails: 'Reset timer',
        };
      }

      // 10. CREATE NOTE
      case 'create_note': {
        const title = args.title || 'New Note';
        const content = args.content || args.body || '';
        const pinned = Boolean(args.pinned);

        const note = spideyApi.createNote({ title, content, pinned });
        return {
          toolName,
          success: true,
          message: `Created note "${note.title}"`,
          data: note,
          actionType: 'create_note',
          actionDetails: note.title,
        };
      }

      // 11. DELETE NOTE
      case 'delete_note': {
        const query = args.query || args.title;
        if (!query) return { toolName, success: false, message: 'Missing note title' };

        const notes = spideyApi.getNotes();
        const matched = notes.find((n) => n.title.toLowerCase().includes(query.toLowerCase()));
        if (!matched) return { toolName, success: false, message: `Note matching "${query}" not found` };

        spideyApi.deleteNote(matched.id);
        return {
          toolName,
          success: true,
          message: `Deleted note "${matched.title}"`,
          actionType: 'delete_note',
          actionDetails: matched.title,
        };
      }

      // 12. REMEMBER FACT (Memory 2.0)
      case 'remember_fact': {
        const fact = args.fact || args.text || args.content;
        if (!fact) return { toolName, success: false, message: 'Missing memory fact' };

        const tags = args.tags ? args.tags.split(',').map((t: string) => t.trim()) : undefined;
        const memory = memoryStore.addMemory(fact, tags, 4);
        spideyApi.addMemory(fact);

        return {
          toolName,
          success: true,
          message: `Stored in memory: "${fact}"`,
          data: memory,
        };
      }

      // 13. SYNC GOOGLE TASKS
      case 'sync': {
        return {
          toolName,
          success: true,
          message: 'Triggered Google Tasks synchronization',
          actionType: 'sync',
          actionDetails: 'Sync triggered',
        };
      }

      // 14. TOGGLE RAIN
      case 'toggle_rain': {
        const target = args.enabled !== undefined ? Boolean(args.enabled) : undefined;
        const state = toggleAmbientRain(target);
        return {
          toolName,
          success: true,
          message: `Ambient rain ${state ? 'enabled' : 'disabled'}`,
          actionType: 'toggle_rain',
          actionDetails: state ? 'Rain on' : 'Rain off',
        };
      }

      default:
        return {
          toolName,
          success: false,
          message: `Unknown action: ${toolName}`,
        };
    }
  } catch (err: any) {
    console.error(`Error executing Spidey action [${toolName}]:`, err);
    return {
      toolName,
      success: false,
      message: err.message || 'Execution failed',
    };
  }
}
