import { spideyApi } from "../services/spideyApi";
import { ToolCall, ToolResult } from "../agent/types";

function fail(toolName: string, message: string): ToolResult {
  return { toolName, success: false, message };
}

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
function searchTasks(query: string) {
  const tasks = spideyApi.getTasks();

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
  const TOOL = "create_task";
  const title = String(args.title || "").trim();

  if (!title) {
    return fail(TOOL, "I need a task name before I can create it.");
  }

  try {
    // Resolve the group NAME the model gave us into a real groupId,
    // creating the group if it doesn't exist yet. The old code passed
    // `group`, `due` and `time` — none of which spideyApi.createTask reads,
    // so every task landed ungrouped and undated, silently.
    let groupId: string | null = null;
    const groupName = String(args.group || args.groupName || "").trim();
    if (groupName) {
      const existing = spideyApi.findGroupByName(groupName);
      groupId = (existing || spideyApi.createTaskGroup(groupName)).id;
    }

    const task = spideyApi.createTask({
      title,
      groupId,
      dueDate: resolveDueDate(args.due),
      dueTime: args.time || args.dueTime || undefined,
      priority: args.priority || "medium",
      notes: args.notes || undefined,
    });

    return {
      toolName: "create_task",
      success: true,
      message: `Created "${task.title}"${groupName ? ` in ${groupName}` : ""}.`,
      data: task,
      actionType: "create_task",
      actionDetails: task.title,
    };
  } catch (error) {
    console.error("create_task failed:", error);
    return fail("create_task", `I couldn't create "${title}".`);
  }
}

/** Turns "today" / "tomorrow" / "2026-08-24" into YYYY-MM-DD. */
function resolveDueDate(due: any): string | undefined {
  const v = String(due || "").trim().toLowerCase();
  if (!v) return undefined;
  const d = new Date();
  if (v === "today") return d.toISOString().split("T")[0];
  if (v === "tomorrow") {
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return undefined;
}

/**
 * COMPLETE TASK
 */
async function completeTask(args: Record<string, any>): Promise<ToolResult> {
  const TOOL = "complete_task";
  const query = String(args.query || "").trim();

  if (!query) {
    return fail(TOOL, "I need to know which task you want completed.");
  }

  const matches = searchTasks(query);

  if (matches.length === 0) {
    return fail(TOOL, `I couldn't find a task matching "${query}".`);
  }

  if (matches.length > 1 && matches[0].score < 100) {
    const names = matches
      .slice(0, 4)
      .map((match) => `"${match.task.title}"`)
      .join(", ");

    return fail(TOOL, `I found multiple possible tasks: ${names}. Which one do you mean?`);
  }

  const task = matches[0].task;

  try {
    spideyApi.completeTask(task.id);

    return {
      success: true,
      message: `Marked "${task.title}" as completed.`,
      toolName: "complete_task",
      actionType: "complete_task",
      actionDetails: task.title,
    };
  } catch (error) {
    console.error("complete_task failed:", error);

    return fail(TOOL, `I couldn't complete "${task.title}".`);
  }
}

/**
 * DELETE TASK
 */
async function deleteTask(args: Record<string, any>): Promise<ToolResult> {
  const TOOL = "delete_task";
  const query = String(args.query || "").trim();

  if (!query) {
    return fail(TOOL, "I need to know which task you want deleted.");
  }

  const matches = searchTasks(query);

  if (matches.length === 0) {
    return fail(TOOL, `I couldn't find a task matching "${query}".`);
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

    return fail(TOOL, `I found multiple possible tasks: ${names}. I don't want to delete the wrong one. Which one do you mean?`);
  }

  const task = matches[0].task;

  try {
    /**
     * IMPORTANT:
     *
     * We keep the task information in actionDetails.
     * This will allow us to implement UNDO later.
     */
    spideyApi.deleteTask(task.id);

    return {
      success: true,
      message: `Deleted "${task.title}".`,
      toolName: "delete_task",
      actionType: "delete_task",
      actionDetails: task.title,
      data: task,
    };
  } catch (error) {
    console.error("delete_task failed:", error);

    return fail(TOOL, `I couldn't delete "${task.title}".`);
  }
}

/**
 * Bulk deletes.
 *
 * These didn't exist. "delete all my tasks" had no tool behind it, so Spidey
 * agreed, said "Got it," and nothing happened -- which looked like her losing
 * the ability to delete rather than never having had it.
 */
async function deleteAllTasks(): Promise<ToolResult> {
  const tasks = spideyApi.getTasks();
  if (tasks.length === 0) {
    return { toolName: "delete_all_tasks", success: true, message: "Your task list was already empty." };
  }
  let n = 0;
  for (const t of [...tasks]) {
    if (spideyApi.deleteTask(t.id)) n++;
  }
  return {
    toolName: "delete_all_tasks",
    success: true,
    message: `Deleted ${n} task${n === 1 ? "" : "s"}.`,
    actionType: "delete_all_tasks",
    actionDetails: `${n} tasks`,
  };
}

async function clearBoard(): Promise<ToolResult> {
  const tasks = spideyApi.getTasks();
  const groups = spideyApi.getTaskGroups();
  let tn = 0;
  let gn = 0;
  for (const t of [...tasks]) if (spideyApi.deleteTask(t.id)) tn++;
  for (const g of [...groups]) if (spideyApi.deleteTaskGroup(g.id)) gn++;
  return {
    toolName: "clear_board",
    success: true,
    message: `Cleared the board — ${tn} task${tn === 1 ? "" : "s"} and ${gn} group${gn === 1 ? "" : "s"} gone.`,
    actionType: "clear_board",
    actionDetails: `${tn} tasks, ${gn} groups`,
  };
}

/**
 * Execute a task-related tool call.
 */
export async function executeTaskTools(
  call: ToolCall
): Promise<ToolResult | null> {
  switch (call.toolName) {
    case "create_task":
      return createTask(call.arguments);

    case "complete_task":
      return completeTask(call.arguments);

    case "delete_task":
      return deleteTask(call.arguments);

    case "delete_all_tasks":
      return deleteAllTasks();

    case "clear_board":
      return clearBoard();

    default:
      // null = "not a task tool" so the dispatcher tries groups/timer/notes next.
      return null;
  }
}