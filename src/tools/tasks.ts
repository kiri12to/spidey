import { spideyApi } from "../services/spideyApi";
import { ToolCall, ToolResult } from "../agent/types";

/**
 * Normalize text so task searching is more forgiving.
 *
 * Example:
 *
 * "Study Networking!"
 *
 * becomes:
 *
 * "study networking"
 */
function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find tasks using a forgiving search instead of requiring
 * an exact title match.
 */
async function searchTasks(query: string) {
  const tasks = await spideyApi.getTasks();

  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) {
    return [];
  }

  const queryWords = normalizedQuery.split(" ");

  return tasks
    .map((task) => {
      const title = normalizeText(task.title);

      let score = 0;

      // Exact title match.
      if (title === normalizedQuery) {
        score += 100;
      }

      // Title contains the complete query.
      if (title.includes(normalizedQuery)) {
        score += 50;
      }

      // Count matching words.
      for (const word of queryWords) {
        if (word.length >= 2 && title.includes(word)) {
          score += 10;
        }
      }

      return {
        task,
        score,
      };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score);
}

/**
 * CREATE TASK
 */
async function createTask(args: Record<string, any>): Promise<ToolResult> {
  const title = String(args.title || "").trim();

  if (!title) {
    return {
      success: false,
      message: "I need a task name before I can create it.",
    };
  }

  try {
    const task = await spideyApi.createTask({
      title,
      group: args.group || undefined,
      due: args.due || undefined,
      time: args.time || undefined,
      priority: args.priority || "medium",
      notes: args.notes || undefined,
    });

    return {
      success: true,
      message: `Created the task "${task.title}".`,
      actionType: "task_created",
      actionDetails: {
        taskId: task.id,
        title: task.title,
      },
    };
  } catch (error) {
    console.error("create_task failed:", error);

    return {
      success: false,
      message: `I couldn't create "${title}".`,
    };
  }
}

/**
 * COMPLETE TASK
 */
async function completeTask(args: Record<string, any>): Promise<ToolResult> {
  const query = String(args.query || "").trim();

  if (!query) {
    return {
      success: false,
      message: "I need to know which task you want completed.",
    };
  }

  const matches = await searchTasks(query);

  if (matches.length === 0) {
    return {
      success: false,
      message: `I couldn't find a task matching "${query}".`,
    };
  }

  if (matches.length > 1 && matches[0].score < 100) {
    const names = matches
      .slice(0, 4)
      .map((match) => `"${match.task.title}"`)
      .join(", ");

    return {
      success: false,
      message: `I found multiple possible tasks: ${names}. Which one do you mean?`,
    };
  }

  const task = matches[0].task;

  try {
    await spideyApi.completeTask(task.id);

    return {
      success: true,
      message: `Marked "${task.title}" as completed.`,
      actionType: "task_completed",
      actionDetails: {
        taskId: task.id,
        title: task.title,
      },
    };
  } catch (error) {
    console.error("complete_task failed:", error);

    return {
      success: false,
      message: `I couldn't complete "${task.title}".`,
    };
  }
}

/**
 * DELETE TASK
 */
async function deleteTask(args: Record<string, any>): Promise<ToolResult> {
  const query = String(args.query || "").trim();

  if (!query) {
    return {
      success: false,
      message: "I need to know which task you want deleted.",
    };
  }

  const matches = await searchTasks(query);

  if (matches.length === 0) {
    return {
      success: false,
      message: `I couldn't find a task matching "${query}".`,
    };
  }

  /**
   * If there are multiple plausible matches and none is an
   * exact title match, DO NOT delete anything.
   */
  if (matches.length > 1 && matches[0].score < 100) {
    const names = matches
      .slice(0, 4)
      .map((match) => `"${match.task.title}"`)
      .join(", ");

    return {
      success: false,
      message: `I found multiple possible tasks: ${names}. I don't want to delete the wrong one. Which one do you mean?`,
    };
  }

  const task = matches[0].task;

  try {
    /**
     * IMPORTANT:
     *
     * We keep the task information in actionDetails.
     * This will allow us to implement UNDO later.
     */
    await spideyApi.deleteTask(task.id);

    return {
      success: true,
      message: `Deleted "${task.title}".`,
      actionType: "task_deleted",
      actionDetails: {
        taskId: task.id,
        title: task.title,
        deletedTask: task,
      },
    };
  } catch (error) {
    console.error("delete_task failed:", error);

    return {
      success: false,
      message: `I couldn't delete "${task.title}".`,
    };
  }
}

/**
 * Execute a task-related tool call.
 */
/**
 * Execute a task-related tool call.
 */
export async function executeTaskTools(
  call: ToolCall
): Promise<ToolResult> {
  switch (call.toolName) {
    case "create_task":
      return createTask(call.arguments);

    case "complete_task":
      return completeTask(call.arguments);

    case "delete_task":
      return deleteTask(call.arguments);

    default:
      return {
        success: false,
        message: `Unknown task tool: ${call.toolName}`,
      };
  }
}