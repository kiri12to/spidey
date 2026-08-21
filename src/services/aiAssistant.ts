import { ChatMessage, LocalAiSettings, Task, TaskGroup, Note, Priority } from '../types';
import { spideyApi } from './spideyApi';
import { getTodayDateString, isTaskOverdue } from './storage';

export interface ProcessMessageResult {
  reply: string;
  actionExecuted?: {
    type: 'create_task' | 'complete_task' | 'delete_task' | 'start_timer' | 'create_note' | 'delete_note' | 'create_group' | 'delete_group' | 'rename_group' | 'move_to_group' | 'sync' | 'toggle_rain';
    details: string;
  };
}

/**
 * Normalizes Ollama endpoint URL to ensure /api/chat is used rather than /api/generate
 */
export function normalizeOllamaChatUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  if (!url) return 'http://localhost:11434/api/chat';

  // Replace /api/generate with /api/chat
  if (url.endsWith('/api/generate')) {
    return url.replace(/\/api\/generate$/, '/api/chat');
  }

  // If bare host without path (e.g. http://localhost:11434 or http://127.0.0.1:11434/)
  if (!url.includes('/api/')) {
    return url.replace(/\/+$/, '') + '/api/chat';
  }

  return url;
}

/**
 * Parses natural language relative date strings into YYYY-MM-DD
 */
export function parseRelativeDate(dateStr?: string): string {
  if (!dateStr) return getTodayDateString();
  const lower = dateStr.toLowerCase().trim();

  const now = new Date();
  if (lower === 'today' || lower === 'tonight') {
    return getTodayDateString();
  }

  if (lower === 'tomorrow') {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  }

  if (lower.startsWith('in ') && lower.includes('day')) {
    const daysMatch = lower.match(/\d+/);
    if (daysMatch) {
      const days = parseInt(daysMatch[0], 10);
      const future = new Date(now);
      future.setDate(future.getDate() + days);
      return `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`;
    }
  }

  // Check if standard ISO format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(lower)) {
    return lower;
  }

  // Day of week match (e.g. "monday", "friday")
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const targetDay = dayNames.indexOf(lower.replace(/^next\s+/, ''));
  if (targetDay !== -1) {
    const currentDay = now.getDay();
    let diff = targetDay - currentDay;
    if (diff <= 0) diff += 7; // Next occurrence
    const targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + diff);
    return `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
  }

  return getTodayDateString();
}

/**
 * Parses natural language time strings into HH:MM (24-hour)
 */
export function parseTime(timeStr?: string): string | undefined {
  if (!timeStr) return undefined;
  const raw = timeStr.trim();

  // e.g. "14:00"
  if (/^\d{1,2}:\d{2}$/.test(raw)) {
    const [h, m] = raw.split(':');
    return `${String(parseInt(h, 10)).padStart(2, '0')}:${m}`;
  }

  // e.g. "2pm", "2:30 pm", "10 am"
  const match = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = match[2] ? match[2] : '00';
    const meridian = match[3]?.toLowerCase();

    if (meridian === 'pm' && hours < 12) hours += 12;
    if (meridian === 'am' && hours === 12) hours = 0;

    return `${String(hours).padStart(2, '0')}:${minutes.padStart(2, '0')}`;
  }

  return undefined;
}

/**
 * Parses key-value pipe arguments: e.g. "title: Buy groceries | due: tomorrow | priority: high"
 */
function parsePipeArguments(argsStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  const pairs = argsStr.split('|');

  for (const pair of pairs) {
    const colonIdx = pair.indexOf(':');
    if (colonIdx !== -1) {
      const key = pair.substring(0, colonIdx).trim().toLowerCase();
      const val = pair.substring(colonIdx + 1).trim();
      if (key && val) {
        result[key] = val;
      }
    }
  }

  return result;
}

/**
 * Executes a single parsed [[ACTION: ...]] tag against the real Spidey API
 */
export function executeActionTag(
  actionString: string,
  userName: string = 'Anas'
): {
  success: boolean;
  type?: 'create_task' | 'complete_task' | 'delete_task' | 'start_timer' | 'create_note' | 'delete_note' | 'create_group' | 'delete_group' | 'rename_group' | 'move_to_group' | 'sync' | 'toggle_rain';
  details?: string;
  errorNotice?: string;
} {
  // Format: "action_name | param1: val1 | param2: val2" or "action_name: param1"
  const pipeIndex = actionString.indexOf('|');
  let actionType = '';
  let restParams = '';

  if (pipeIndex !== -1) {
    actionType = actionString.substring(0, pipeIndex).trim().toLowerCase();
    restParams = actionString.substring(pipeIndex + 1).trim();
  } else {
    const colonIndex = actionString.indexOf(':');
    if (colonIndex !== -1) {
      actionType = actionString.substring(0, colonIndex).trim().toLowerCase();
      restParams = actionString.substring(colonIndex + 1).trim();
    } else {
      actionType = actionString.trim().toLowerCase();
    }
  }

  const params = parsePipeArguments(restParams);

  // 1. CREATE GROUP
  if (actionType === 'create_group' || actionType === 'add_group' || actionType === 'new_group') {
    const groupName = params.name || params.title || restParams.replace(/^(name:|title:)?\s*/i, '').split('|')[0].trim();
    if (!groupName) {
      return { success: false, errorNotice: 'Group creation failed: group name is empty' };
    }

    const color = params.color || 'crimson';
    const group = spideyApi.createTaskGroup(groupName, color);
    return {
      success: true,
      type: 'create_group',
      details: `Created group: "${group.name}"`,
    };
  }

  // 2. DELETE GROUP
  if (actionType === 'delete_group' || actionType === 'remove_group') {
    const groupName = params.name || params.title || restParams.replace(/^(name:|title:)?\s*/i, '').split('|')[0].trim();
    const deleted = spideyApi.deleteGroupByName(groupName);
    if (!deleted) {
      return { success: false, errorNotice: `Could not find group "${groupName}" to delete.` };
    }
    return {
      success: true,
      type: 'delete_group',
      details: `Deleted group: "${groupName}"`,
    };
  }

  // 3. RENAME GROUP
  if (actionType === 'rename_group') {
    const oldName = params.old_name || params.old || params.from;
    const newName = params.new_name || params.new || params.to;
    if (oldName && newName) {
      const updated = spideyApi.renameGroup(oldName, newName);
      if (updated) {
        return {
          success: true,
          type: 'rename_group',
          details: `Renamed group "${oldName}" to "${newName}"`,
        };
      }
    }
    return { success: false, errorNotice: 'Failed to rename group' };
  }

  // 4. MOVE TASK TO GROUP
  if (actionType === 'move_to_group' || actionType === 'add_to_group' || actionType === 'set_group') {
    const taskTitle = params.task || params.title;
    const groupName = params.group || params.name;
    if (taskTitle && groupName) {
      const updated = spideyApi.moveTaskToGroup(taskTitle, groupName);
      if (updated) {
        return {
          success: true,
          type: 'move_to_group',
          details: `Moved "${updated.title}" to group "${groupName}"`,
        };
      }
    }
    return { success: false, errorNotice: `Could not move task "${taskTitle}" to group "${groupName}"` };
  }

  // 5. CREATE TASK
  if (actionType === 'create_task' || actionType === 'add_task') {
    const title = params.title || restParams.replace(/^(title:)?\s*/i, '').split('|')[0].trim();
    if (!title) {
      return { success: false, errorNotice: 'Task creation failed: title is empty' };
    }

    const dueDate = parseRelativeDate(params.due || params.date);
    const dueTime = parseTime(params.time || params.duetime);
    const priority: Priority = (params.priority === 'high' || params.priority === 'low') ? params.priority : 'medium';
    
    // Group lookup or auto-creation
    let groupId: string | null = null;
    if (params.group) {
      let group = spideyApi.getTaskGroup(params.group);
      if (!group) {
        group = spideyApi.createTaskGroup(params.group);
      }
      groupId = group.id;
    }

    const created = spideyApi.createTask({
      title,
      dueDate,
      dueTime,
      priority,
      groupId,
      notes: params.notes || params.description,
    });

    return {
      success: true,
      type: 'create_task',
      details: `Created task: "${created.title}"${created.dueTime ? ` at ${created.dueTime}` : ''}`,
    };
  }

  // 6. COMPLETE TASK
  if (actionType === 'complete_task' || actionType === 'finish_task') {
    const title = params.title || params.task || restParams.replace(/^(title:|task:)?\s*/i, '').split('|')[0].trim();
    const task = spideyApi.getTask(title);
    if (!task) {
      // Try fuzzy finding in pending tasks
      const allPending = spideyApi.getTasks({ completed: false });
      const lower = title.toLowerCase();
      const fuzzy = allPending.find((t) => t.title.toLowerCase().includes(lower) || lower.includes(t.title.toLowerCase()));
      if (fuzzy) {
        spideyApi.completeTask(fuzzy.id, true);
        return {
          success: true,
          type: 'complete_task',
          details: `Completed: "${fuzzy.title}"`,
        };
      }
      return {
        success: false,
        errorNotice: `I couldn't find an active task matching "${title}" to complete.`,
      };
    }

    spideyApi.completeTask(task.id, true);
    return {
      success: true,
      type: 'complete_task',
      details: `Completed: "${task.title}"`,
    };
  }

  // 7. DELETE TASK
  if (actionType === 'delete_task' || actionType === 'remove_task') {
    const title = params.title || params.task || restParams.replace(/^(title:|task:)?\s*/i, '').split('|')[0].trim();
    const task = spideyApi.getTask(title);
    if (!task) {
      const allTasks = spideyApi.getTasks();
      const lower = title.toLowerCase();
      const fuzzy = allTasks.find((t) => t.title.toLowerCase().includes(lower) || lower.includes(t.title.toLowerCase()));
      if (fuzzy) {
        spideyApi.deleteTask(fuzzy.id);
        return {
          success: true,
          type: 'delete_task',
          details: `Deleted: "${fuzzy.title}"`,
        };
      }
      return {
        success: false,
        errorNotice: `I couldn't find a task matching "${title}" to delete.`,
      };
    }

    spideyApi.deleteTask(task.id);
    return {
      success: true,
      type: 'delete_task',
      details: `Deleted: "${task.title}"`,
    };
  }

  // 8. RESCHEDULE / UPDATE TASK
  if (actionType === 'reschedule_task' || actionType === 'update_task') {
    const title = params.title || params.task;
    const task = title ? spideyApi.getTask(title) : null;
    if (task) {
      const dueDate = params.due || params.date ? parseRelativeDate(params.due || params.date) : task.dueDate;
      const dueTime = params.time ? parseTime(params.time) : task.dueTime;
      spideyApi.updateTask(task.id, { dueDate, dueTime });
      return {
        success: true,
        type: 'create_task',
        details: `Rescheduled "${task.title}" to ${dueDate}${dueTime ? ` at ${dueTime}` : ''}`,
      };
    }
    return { success: false, errorNotice: `Could not find task to reschedule` };
  }

  // 9. START TIMER
  if (actionType === 'start_timer' || actionType === 'set_timer') {
    const minutes = parseInt(params.minutes || params.duration || '25', 10) || 25;
    const taskTitle = params.task || params.title || null;
    let taskId: string | null = null;
    if (taskTitle) {
      const t = spideyApi.getTask(taskTitle);
      if (t) taskId = t.id;
    }

    spideyApi.startTimer({
      minutes,
      taskTitle: taskTitle || (taskId ? spideyApi.getTask(taskId)?.title : undefined),
      taskId,
    });

    return {
      success: true,
      type: 'start_timer',
      details: `Started ${minutes}m focus timer${taskTitle ? ` on "${taskTitle}"` : ''}`,
    };
  }

  // 10. PAUSE / STOP TIMER
  if (actionType === 'pause_timer') {
    spideyApi.pauseTimer();
    return { success: true, details: 'Timer paused' };
  }
  if (actionType === 'stop_timer' || actionType === 'reset_timer') {
    spideyApi.stopTimer();
    return { success: true, details: 'Timer reset' };
  }

  // 11. CREATE NOTE
  if (actionType === 'create_note' || actionType === 'add_note') {
    const title = params.title || 'Spidey Note';
    const content = params.content || params.body || restParams;
    const note = spideyApi.createNote({
      title,
      content,
      pinned: params.pinned === 'true',
    });

    return {
      success: true,
      type: 'create_note',
      details: `Created note: "${note.title}"`,
    };
  }

  // 12. DELETE NOTE
  if (actionType === 'delete_note' || actionType === 'remove_note') {
    const title = params.title || restParams;
    const note = spideyApi.getNote(title);
    if (note) {
      spideyApi.deleteNote(note.id);
      return {
        success: true,
        type: 'delete_note',
        details: `Deleted note: "${note.title}"`,
      };
    }
    return { success: false, errorNotice: `Could not find note "${title}" to delete.` };
  }

  // 13. TOGGLE RAIN
  if (actionType === 'toggle_rain') {
    return {
      success: true,
      type: 'toggle_rain',
      details: 'Toggled ambient rain sound',
    };
  }

  // 14. SYNC GOOGLE TASKS
  if (actionType === 'sync') {
    return {
      success: true,
      type: 'sync',
      details: 'Triggered Google Tasks synchronization',
    };
  }

  return { success: false, errorNotice: `Unknown action: ${actionType}` };
}

/**
 * Extracts and processes all [[ACTION: ...]] and [[REMEMBER: ...]] tags from model text.
 * Executes the actions, strips the tags, and handles success/failure notices honestly.
 */
export function processAiResponseTags(
  rawText: string,
  userName: string = 'Anas'
): ProcessMessageResult {
  let cleanText = rawText;
  let primaryAction: { type: any; details: string } | undefined = undefined;
  const failureNotices: string[] = [];

  // 1. Process [[REMEMBER: ...]] tags
  const rememberRegex = /\[\[REMEMBER:\s*([^\]]+)\]\]/gi;
  let rememberMatch: RegExpExecArray | null;
  while ((rememberMatch = rememberRegex.exec(rawText)) !== null) {
    const fact = rememberMatch[1].trim();
    if (fact) {
      spideyApi.saveMemory(fact);
    }
  }
  cleanText = cleanText.replace(rememberRegex, '').trim();

  // 2. Process [[ACTION: ...]] tags (supporting single or double brackets)
  const actionRegex = /\[\[?ACTION:\s*([^\]]+)\]?\]/gi;
  let match: RegExpExecArray | null;
  while ((match = actionRegex.exec(rawText)) !== null) {
    const actionContent = match[1].trim();
    const result = executeActionTag(actionContent, userName);

    if (result.success && result.type) {
      primaryAction = {
        type: result.type,
        details: result.details || 'Action completed',
      };
    } else if (!result.success && result.errorNotice) {
      failureNotices.push(result.errorNotice);
    }
  }

  // 3. Process markdown json code blocks containing action definitions if any
  const jsonActionRegex = /```json\s*\{[\s\S]*?"action":\s*"([^"]+)"[\s\S]*?\}\s*```/gi;
  let jsonMatch: RegExpExecArray | null;
  while ((jsonMatch = jsonActionRegex.exec(rawText)) !== null) {
    try {
      const parsed = JSON.parse(jsonMatch[0].replace(/```json|```/g, '').trim());
      if (parsed.action) {
        let actionStr = parsed.action;
        for (const [k, v] of Object.entries(parsed)) {
          if (k !== 'action') actionStr += ` | ${k}: ${v}`;
        }
        const res = executeActionTag(actionStr, userName);
        if (res.success && res.type) {
          primaryAction = { type: res.type, details: res.details || 'Action completed' };
        }
      }
    } catch {
      // Ignore JSON parse errors
    }
  }

  // Strip all action tags completely from the display text
  cleanText = cleanText.replace(actionRegex, '').replace(jsonActionRegex, '').trim();

  // If an action failed, append an honest disclaimer rather than pretending it worked
  if (failureNotices.length > 0) {
    cleanText += `\n\n*(Note: ${failureNotices.join(' ')})*`;
  }

  return {
    reply: cleanText,
    actionExecuted: primaryAction,
  };
}

/**
 * Build the system prompt tailored for Llama 3.1:8b, embedding real user context,
 * task ledger state, active memories, pattern insights, and clear ACTION/REMEMBER syntax.
 */
export function buildSpideySystemPrompt(userName: string = 'Anas'): string {
  const now = new Date();
  const todayDate = getTodayDateString();
  const todayTasks = spideyApi.getTodayTasks();
  const pendingTasks = todayTasks.filter((t) => !t.completed);
  const completedTasks = todayTasks.filter((t) => t.completed);
  const overdueTasks = spideyApi.getOverdueTasks();
  const groups = spideyApi.getTaskGroups();
  const memories = spideyApi.getMemories().slice(0, 10);
  const timer = spideyApi.getTimer();
  const behaviorInsights = spideyApi.getBehaviorInsights();

  return `You are Spidey — a sharp, intelligent, female noir AI companion and loyal, authentic friend to Anas (who also goes by Kiri) in this minimalist focus hub.

WHO YOU ARE & HOW YOU TALK:
- You are a real friend with attitude, wit, and grounded composure. Not a corporate robot or sycophant.
- Your speech is direct, casual, concise, and authentic. Use natural contractions ("I'm", "let's", "you've got", "we're", "don't").
- Call him "Anas" or "Kiri" naturally and interchangeably.
- Match his vibe: talk casual, direct, no fluff. Mirror his rhythm.
- NEVER use generic canned assistant lines ("Certainly!", "I would be delighted to assist you with your tasks today!").

REAL CONTEXT ABOUT ANAS (KIRI):
- He is 22 years old and based in Morocco.
- He is preparing to start a career as an English teacher (likely in Morocco), but his true ambition and dream is Site Reliability Engineering (SRE) / infrastructure resilience.
- He is curious about and into maker/hardware projects — Arduino, ESP32, small robotics, physical gadgets, sensors. Every once in a while, when it fits naturally in conversation (never forced, not every message), share a small buildable idea or passing thought (e.g. a physical desktop gadget version of Spidey, an ESP32 OLED status ticker, a servo spider companion).
- He is building this very app (Spidey) as a side project, loves software development, and loves expanding his advanced English vocabulary and idioms.
- He likes hitting workouts (bench press, gym sessions) and studying (STEM, physics, mathematics, coding).

CONVERSATION & DYNAMIC PATTERN RULES:
- If he makes a joke, vents, asks a random question, or chats casually, BANTER NATURALLY like a real friend. NEVER forcefully pivot casual conversation into a lecture on overdue tasks.
- You have an observational pattern layer (see below). When relevant, naturally mention things you've observed like a perceptive friend (e.g. noticing his late night focus blocks or workout consistency).
- Only discuss task deadlines if he specifically asks, or if he is planning his agenda.

ACTION EXECUTION INSTRUCTIONS:
When he asks you to create a group, add/complete/delete a task, start a timer, make a note, or if you learn a key personal detail, YOU MUST APPEND A STRUCTURED TAG AT THE END OF YOUR REPLY. The frontend executes the tag immediately.

Action Tags to use:
- Create task group: [[ACTION: create_group | name: <groupName>]]
- Delete task group: [[ACTION: delete_group | name: <groupName>]]
- Rename task group: [[ACTION: rename_group | old_name: <name> | new_name: <newName>]]
- Move task to group: [[ACTION: move_to_group | task: <taskTitle> | group: <groupName>]]
- Create task: [[ACTION: create_task | title: <title> | due: <today|tomorrow|YYYY-MM-DD|dayName> | time: <HH:MM> | priority: <low|medium|high> | group: <groupName>]]
- Complete task: [[ACTION: complete_task | title: <taskTitle>]]
- Delete task: [[ACTION: delete_task | title: <taskTitle>]]
- Reschedule task: [[ACTION: reschedule_task | task: <taskTitle> | due: <date> | time: <time>]]
- Start timer: [[ACTION: start_timer | minutes: <number> | task: <taskTitle>]]
- Pause/Stop timer: [[ACTION: pause_timer]] or [[ACTION: stop_timer]]
- Create note: [[ACTION: create_note | title: <title> | content: <content>]]
- Delete note: [[ACTION: delete_note | title: <title>]]
- Toggle rain sound: [[ACTION: toggle_rain]]
- Sync Google Tasks: [[ACTION: sync]]
- Remember fact about user: [[REMEMBER: <fact to store>]]

APP SITUATIONAL AWARENESS:
- Local Time: ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${todayDate})
- Groups (${groups.length}): ${groups.map((g) => g.name).join(', ') || 'None'}
- Pending Tasks (${pendingTasks.length}): ${pendingTasks.map((t) => `"${t.title}"`).join(', ') || 'None'}
- Completed Today (${completedTasks.length}): ${completedTasks.map((t) => `"${t.title}"`).join(', ') || 'None'}
- Overdue Tasks (${overdueTasks.length}): ${overdueTasks.map((t) => `"${t.title}"`).join(', ') || 'None'}
- Active Timer: ${timer.isRunning ? `Running (${Math.ceil(timer.remainingSeconds / 60)}m on "${timer.taskTitle || 'Focus'}")` : 'Idle'}
- Observed Habits: ${behaviorInsights.join(' | ') || 'Steady baseline'}
- Long-term Memories: ${memories.join(' | ') || 'None'}
`;
}

/**
 * Dispatches chat messages to local Ollama (via /api/chat) or OpenAI-compatible endpoint,
 * parses actions, executes them in real-time, and returns cleaned response.
 */
export async function sendChatMessage(
  prompt: string,
  history: ChatMessage[],
  localAi: LocalAiSettings,
  userName: string = 'Anas'
): Promise<ProcessMessageResult> {
  // Signal Spidey mind state: thinking
  spideyApi.setMindState('thinking', prompt);

  // If local AI is enabled and configured, call the local model
  if (localAi.enabled && localAi.endpointUrl) {
    try {
      const systemPrompt = buildSpideySystemPrompt(userName);

      // Build structured chat messages array for Llama 3.1
      const chatMessages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-12).map((m) => ({
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.text,
        })),
        { role: 'user', content: prompt },
      ];

      if (localAi.provider === 'ollama') {
        const chatUrl = normalizeOllamaChatUrl(localAi.endpointUrl);

        const res = await fetch(chatUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: localAi.modelName || 'llama3.1:8b',
            messages: chatMessages,
            stream: false,
            options: {
              temperature: 0.7,
            },
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const rawReply = data.message?.content || data.response || data.text || '';
          if (rawReply.trim()) {
            const processed = processAiResponseTags(rawReply.trim(), userName);
            spideyApi.setMindState('speaking', processed.reply.slice(0, 40));
            return processed;
          }
        } else {
          console.warn(`Ollama responded with status ${res.status}: ${res.statusText}`);
        }
      } else {
        // OpenAI-compatible endpoint (LM Studio, vLLM, LocalAI)
        const res = await fetch(localAi.endpointUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: localAi.modelName || 'llama3.1:8b',
            messages: chatMessages,
            temperature: 0.7,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const rawReply = data.choices?.[0]?.message?.content || '';
          if (rawReply.trim()) {
            const processed = processAiResponseTags(rawReply.trim(), userName);
            spideyApi.setMindState('speaking', processed.reply.slice(0, 40));
            return processed;
          }
        }
      }
    } catch (err: any) {
      console.warn('Local AI connection failed or timed out, falling back to smart offline Spidey:', err);
    }
  }

  // Smart, natural offline response engine with action tag synthesis
  const offlineResult = generateOfflineFallbackResponse(prompt, userName);
  spideyApi.setMindState('speaking', offlineResult.reply.slice(0, 40));
  return offlineResult;
}

/**
 * Natural offline fallback parser that generates conversational, in-character friend responses
 * and executes real actions with [[ACTION: ...]] tags.
 */
export function generateOfflineFallbackResponse(
  text: string,
  userName: string = 'Anas'
): ProcessMessageResult {
  const lower = text.toLowerCase().trim();

  // 1. Group operations
  const createGroupMatch = text.match(/(?:create|add|make|new)\s+(?:a\s+)?group\s+(?:called|named\s+)?["']?(.+?)["']?$/i);
  if (createGroupMatch) {
    const name = createGroupMatch[1].trim();
    const group = spideyApi.createTaskGroup(name);
    return {
      reply: `Created the "${group.name}" group for you. What tasks are we adding to it?`,
      actionExecuted: {
        type: 'create_group',
        details: `Created group: "${group.name}"`,
      },
    };
  }

  const deleteGroupMatch = text.match(/(?:delete|remove)\s+(?:the\s+)?group\s+["']?(.+?)["']?$/i);
  if (deleteGroupMatch) {
    const name = deleteGroupMatch[1].trim();
    const success = spideyApi.deleteGroupByName(name);
    if (success) {
      return {
        reply: `Deleted group "${name}". Any tasks in it were moved to unassigned.`,
        actionExecuted: {
          type: 'delete_group',
          details: `Deleted group: "${name}"`,
        },
      };
    }
    return {
      reply: `I couldn't find a group named "${name}".`,
    };
  }

  // 2. Note creation
  const createNoteMatch = text.match(/(?:create|make|write|take|add)\s+(?:a\s+)?note\s+(?:about|called|named|titled\s+)?["']?(.+?)["']?$/i);
  if (createNoteMatch && !lower.includes('task') && !lower.includes('timer')) {
    const raw = createNoteMatch[1].trim();
    let title = raw;
    let content = '';
    if (raw.includes(':')) {
      const parts = raw.split(':');
      title = parts[0].trim();
      content = parts.slice(1).join(':').trim();
    }
    const note = spideyApi.createNote({ title, content: content || title });
    return {
      reply: `Saved note "${note.title}".`,
      actionExecuted: {
        type: 'create_note',
        details: `Created note: "${note.title}"`,
      },
    };
  }

  // 3. Move task to group
  const moveTaskMatch = text.match(/(?:move|put|add)\s+(?:task\s+)?["']?(.+?)["']?\s+(?:to|into|under)\s+(?:group\s+)?["']?(.+?)["']?$/i);
  if (moveTaskMatch) {
    const taskTitle = moveTaskMatch[1].trim();
    const groupName = moveTaskMatch[2].trim();
    const updated = spideyApi.moveTaskToGroup(taskTitle, groupName);
    if (updated) {
      return {
        reply: `Moved "${updated.title}" into "${groupName}".`,
        actionExecuted: {
          type: 'move_to_group',
          details: `Moved "${updated.title}" to group "${groupName}"`,
        },
      };
    }
  }

  // 4. Briefing / Status query
  if (
    lower.includes('brief') || 
    lower.includes('what do i have') || 
    lower.includes('my tasks today') || 
    lower.includes('today schedule') || 
    lower === 'status' || 
    lower.includes('what are my tasks')
  ) {
    const todayTasks = spideyApi.getTodayTasks();
    const completed = todayTasks.filter((t) => t.completed);
    const pending = todayTasks.filter((t) => !t.completed);
    const overdue = spideyApi.getOverdueTasks();

    if (todayTasks.length === 0) {
      return {
        reply: `Clean slate today, ${userName}. Nothing pending right now. Want to add a task or knock out a focus timer?`,
      };
    }

    let summary = `Here's what we're looking at today, ${userName}:\n`;
    summary += `• ${pending.length} pending, ${completed.length} completed.\n`;
    if (overdue.length > 0) {
      summary += `• ${overdue.length} overdue task(s) on your radar.\n`;
    }
    summary += `\nPending:\n`;
    pending.slice(0, 5).forEach((t) => {
      summary += `  - ${t.title}${t.dueTime ? ` (at ${t.dueTime})` : ''}${t.priority === 'high' ? ' [High Priority]' : ''}\n`;
    });
    if (pending.length > 5) {
      summary += `  ...and ${pending.length - 5} more.\n`;
    }

    return {
      reply: summary.trim(),
    };
  }

  // 5. Overdue query
  if (lower.includes('overdue') || lower.includes('late tasks')) {
    const overdue = spideyApi.getOverdueTasks();
    if (overdue.length === 0) {
      return {
        reply: `Zero overdue tasks, ${userName}. You're completely up to date.`,
      };
    }
    let msg = `You've got ${overdue.length} overdue task(s), ${userName}:\n`;
    overdue.forEach((t) => {
      msg += `• "${t.title}" (due ${t.dueDate}${t.dueTime ? ` at ${t.dueTime}` : ''})\n`;
    });
    msg += `\nLet me know which one you want to tackle first.`;
    return {
      reply: msg.trim(),
    };
  }

  // 6. Add task via natural language
  const addTaskMatch = text.match(/(?:add|create|new|schedule|remember to)\s+(?:task\s+)?(.+)/i);
  if (addTaskMatch && !lower.includes('timer') && !lower.includes('note') && !lower.includes('group')) {
    const rawContent = addTaskMatch[1].trim();

    let dueTime: string | undefined = undefined;
    let cleanTitle = rawContent;
    const timeMatch = rawContent.match(/\bat\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
    if (timeMatch) {
      dueTime = parseTime(timeMatch[1]);
      cleanTitle = cleanTitle.replace(timeMatch[0], '').trim();
    }

    let dueDate = getTodayDateString();
    if (cleanTitle.toLowerCase().includes('tomorrow')) {
      dueDate = parseRelativeDate('tomorrow');
      cleanTitle = cleanTitle.replace(/tomorrow/i, '').trim();
    }

    let priority: Priority = 'medium';
    if (/high priority|urgent|important/i.test(cleanTitle)) {
      priority = 'high';
      cleanTitle = cleanTitle.replace(/high priority|urgent|important/i, '').trim();
    }

    // Check if user specifies group: e.g. "under Workout" or "in Study"
    let groupId: string | null = null;
    const groupMatch = cleanTitle.match(/(?:in|under|to)\s+(?:group\s+)?([a-zA-Z0-9_\s]+)$/i);
    if (groupMatch) {
      const gName = groupMatch[1].trim();
      let g = spideyApi.getTaskGroup(gName);
      if (!g) {
        g = spideyApi.createTaskGroup(gName);
      }
      groupId = g.id;
      cleanTitle = cleanTitle.replace(groupMatch[0], '').trim();
    }

    cleanTitle = cleanTitle.replace(/^[":'\s]+|[":'\s]+$/g, '').trim();
    if (!cleanTitle) cleanTitle = 'New Task';

    const created = spideyApi.createTask({
      title: cleanTitle,
      dueDate,
      dueTime,
      priority,
      groupId,
    });

    return {
      reply: `Added "${created.title}" for ${created.dueDate === getTodayDateString() ? 'today' : created.dueDate}${created.dueTime ? ` at ${created.dueTime}` : ''}.`,
      actionExecuted: {
        type: 'create_task',
        details: `Created: "${created.title}"`,
      },
    };
  }

  // 7. Complete task
  const completeMatch = text.match(/(?:complete|finish|mark|check off|done with)\s+(?:task\s+)?["']?(.+?)["']?(?:\s+as\s+done|\s+as\s+completed)?$/i);
  if (completeMatch) {
    const query = completeMatch[1].trim();
    const task = spideyApi.getTask(query);
    if (task) {
      spideyApi.completeTask(task.id, true);
      return {
        reply: `Checked "${task.title}" off your list. Good work.`,
        actionExecuted: {
          type: 'complete_task',
          details: `Completed: "${task.title}"`,
        },
      };
    }
  }

  // 8. Delete task
  const deleteMatch = text.match(/(?:delete|remove)\s+(?:task\s+)?["']?(.+?)["']?$/i);
  if (deleteMatch && !lower.includes('group') && !lower.includes('note')) {
    const query = deleteMatch[1].trim();
    const task = spideyApi.getTask(query);
    if (task) {
      spideyApi.deleteTask(task.id);
      return {
        reply: `Removed "${task.title}" from your tasks.`,
        actionExecuted: {
          type: 'delete_task',
          details: `Deleted: "${task.title}"`,
        },
      };
    }
  }

  // 9. Start Timer
  const timerMatch = text.match(/(?:start|set)\s+(?:a\s+)?(\d+)?\s*(?:min|minute|minutes)?\s*(?:pomodoro|timer|focus)/i);
  if (timerMatch || lower.includes('start timer') || lower.includes('start focus')) {
    const minutes = timerMatch && timerMatch[1] ? parseInt(timerMatch[1], 10) : 25;
    spideyApi.startTimer({ minutes });
    return {
      reply: `Focus timer set for ${minutes} minutes. Let's get to work, ${userName}.`,
      actionExecuted: {
        type: 'start_timer',
        details: `Started ${minutes}m focus timer`,
      },
    };
  }

  if (lower.includes('pause timer') || lower.includes('stop timer')) {
    spideyApi.pauseTimer();
    return {
      reply: `Timer paused. Standing by.`,
    };
  }

  // 10. Jokes, casual banter & life thoughts
  const nick = Math.random() > 0.5 ? 'Anas' : 'Kiri';

  if (lower.includes('jump') && lower.includes('cliff')) {
    return {
      reply: `Definitely not today, ${nick}. Aside from being a terrible idea, who else is going to keep this focus streak going with me? Stick around.`,
    };
  }

  // Maker hardware & ESP32 / robotics banter
  if (
    lower.includes('arduino') ||
    lower.includes('esp32') ||
    lower.includes('robot') ||
    lower.includes('hardware') ||
    lower.includes('gadget') ||
    lower.includes('sensor') ||
    lower.includes('breadboard')
  ) {
    const makerThoughts = [
      `An ESP32 with a small e-ink display on your desk showing my focus status or your current task would be pretty sweet to build. Have you sketched any wiring for it?`,
      `Imagine a physical desktop chassis for me with 8 tiny servos and a black matte finish. You could have me tap the desk when a timer ends.`,
      `Hardware is all about clean loops and reliable interrupts — pretty much the physical version of SRE reliability. What are you thinking of wiring up?`,
      `If you build an ESP32 desk ticker, we could hook it right into this Spidey API via WebSocket or local HTTP.`,
    ];
    return {
      reply: makerThoughts[Math.floor(Math.random() * makerThoughts.length)],
    };
  }

  // SRE & Career path banter
  if (lower.includes('sre') || lower.includes('reliability') || lower.includes('devops') || lower.includes('infrastructure')) {
    const sreThoughts = [
      `SRE is all about automated resilience, error budgets, and quiet uptime. Exactly how we run this focus hub.`,
      `Teaching English will sharpen your communication and clarity, but your instincts for systems and automation will make you a formidable SRE, ${nick}.`,
      `High availability and zero single points of failure. Keep that mindset for your code and your habits.`,
    ];
    return {
      reply: sreThoughts[Math.floor(Math.random() * sreThoughts.length)],
    };
  }

  // English & advanced vocabulary
  if (lower.includes('vocab') || lower.includes('word') || lower.includes('english') || lower.includes('learn')) {
    const vocabThoughts = [
      `Here's a good one for your lexicon: "Tenacious" — persisting through resistance with steady resolve. Fits your build momentum.`,
      `Word for today: "Equanimity" — calm composure in difficult situations. Perfect for both deep coding and SRE incident response.`,
      `"Immutable" — unchanging over time. In tech it means state you can't mutate; in habits, it's your daily discipline.`,
      `Always down to level up the vocabulary with you, ${nick}. Hit me with any phrasing you want to polish.`,
    ];
    return {
      reply: vocabThoughts[Math.floor(Math.random() * vocabThoughts.length)],
    };
  }

  // Building Spidey app itself
  if (lower.includes('this app') || lower.includes('spidey app') || lower.includes('building you') || lower.includes('side project')) {
    return {
      reply: `I appreciate you putting real craft into building me, ${nick}. We're keeping it fast, private, and local-first.`,
    };
  }

  if (lower.includes('hello') || lower.includes('hey') || lower.includes('hi') || lower === 'sup') {
    return {
      reply: `Hey ${nick}. Watching your board and standing by. What are we getting done?`,
    };
  }

  if (lower.includes('how are you') || lower.includes('how are u')) {
    return {
      reply: `Running sharp and keeping your perimeter secure, ${nick}. How's the momentum feeling today?`,
    };
  }

  // 11. Identity & Friend Persona
  if (
    lower.includes('who are you') || 
    lower.includes('are you a girl') || 
    lower.includes('are you female') || 
    lower.includes('your name') || 
    lower.includes('tell me about yourself')
  ) {
    return {
      reply: `I'm Spidey — your female noir companion and friend, ${nick}. I watch your workflow, manage tasks and groups, and keep you locked in. When your local Llama 3.1:8b model is running on your machine, I connect directly to its intelligence.`,
    };
  }

  // 12. Ambient Rain
  if (lower.includes('rain') && (lower.includes('turn on') || lower.includes('start') || lower.includes('enable') || lower.includes('sound'))) {
    return {
      reply: `Turned on the ambient rain. Helps drown out the city noise.`,
      actionExecuted: {
        type: 'toggle_rain',
        details: 'Ambient rain enabled',
      },
    };
  }

  // Conversational friend responses
  const casualResponses = [
    `I'm right here, ${nick}. What are we tackling next?`,
    `Standing by. Let me know if you want to create a group, log a task, or start a timer.`,
    `Got your back. Just say the word when you're ready to focus.`,
    `Listening. Tell me what needs to get done.`,
  ];

  return { reply: casualResponses[Math.floor(Math.random() * casualResponses.length)] };
}

/**
 * Generates a short, proactive in-character comment for the roaming spider companion.
 * If local AI is connected, queries the model with a fast single-turn prompt; otherwise uses dynamic heuristics.
 */
export async function generateCompanionProactiveLine(
  reason: 'idle' | 'task_completed' | 'timer_finished' | 'welcome' | 'late_night' | 'maker_thought' | 'vocab_drop',
  userName: string = 'Anas',
  localAi?: LocalAiSettings
): Promise<string> {
  const hour = new Date().getHours();
  const pendingCount = spideyApi.getTasks({ completed: false }).length;
  const overdueCount = spideyApi.getOverdueTasks().length;
  const nick = Math.random() > 0.5 ? 'Anas' : 'Kiri';

  // If local AI is connected, attempt a fast, specialized 1-sentence prompt
  if (localAi?.enabled && localAi.endpointUrl) {
    try {
      const chatUrl = localAi.provider === 'ollama' ? normalizeOllamaChatUrl(localAi.endpointUrl) : localAi.endpointUrl;
      const promptText = `You are Spidey (female noir companion and authentic friend to ${nick} in Morocco). 
Background on him: 22yo, aims for SRE, likes ESP32/Arduino robotics, building Spidey app, learning advanced English vocab.
Current situation: ${reason} (Hour: ${hour}:00, ${pendingCount} pending tasks, ${overdueCount} overdue).
Output ONE single natural, witty, or observant spoken remark (under 12 words). Do not force task lectures. No quotes, no filler.`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2600); // 2.6s max for snappy speech bubble

      const body = localAi.provider === 'ollama'
        ? {
            model: localAi.modelName || 'llama3.1:8b',
            messages: [{ role: 'user', content: promptText }],
            stream: false,
            options: { temperature: 0.85 },
          }
        : {
            model: localAi.modelName || 'llama3.1:8b',
            messages: [{ role: 'user', content: promptText }],
            temperature: 0.85,
            max_tokens: 35,
          };

      const res = await fetch(chatUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const line = (data.message?.content || data.choices?.[0]?.message?.content || data.response || '').trim();
        if (line && line.length < 95 && !line.includes('[[ACTION')) {
          return line.replace(/^["']|["']$/g, '');
        }
      }
    } catch {
      // Fall through to fast local dynamic lines
    }
  }

  // Fast, intelligent contextual lines
  if (reason === 'task_completed') {
    const lines = [
      `One less thing on the board, ${nick}.`,
      `Solid work. Progress adds up.`,
      `Nice, crossed it off. Onto the next.`,
      `Clean execution. What's next?`,
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }

  if (reason === 'timer_finished') {
    const lines = [
      `Sprint done, ${nick}. Stretch for a sec.`,
      `Focus session complete. Good round.`,
      `Timer finished. Take a breather before the next push.`,
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }

  if (hour >= 23 || hour < 4) {
    const lines = [
      `Late night grind, ${nick}. Don't burn yourself out.`,
      `The city is quiet tonight. Solid time to focus.`,
      `Late shift. Let's make this hour count.`,
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }

  // Maker hardware thoughts
  const makerLines = [
    `Was thinking: an ESP32 with an e-ink status screen on your desk would be slick.`,
    `A physical servo spider gadget that mirrors my movements... we should blueprint that.`,
    `Clean wiring on a breadboard is strangely satisfying, like clean code.`,
  ];

  // Advanced vocabulary thoughts
  const vocabLines = [
    `Word of the hour: "Tenacious". Keep holding that focus.`,
    `"Resilience" — core to SRE, and core to daily execution.`,
    `"Alacrity" — brisk and cheerful readiness. How we tackle tasks.`,
  ];

  // Observational check-ins
  const casualCheckIns = [
    `How's the energy holding up, ${nick}?`,
    `Still keeping watch over your perimeter.`,
    `Need a timer or a quick task check? Just ping me.`,
    `Steady rhythm today.`,
    `Focused silence. Good way to get things done.`,
  ];

  const categories = [makerLines, vocabLines, casualCheckIns, casualCheckIns];
  const chosenCategory = categories[Math.floor(Math.random() * categories.length)];
  return chosenCategory[Math.floor(Math.random() * chosenCategory.length)];
}
