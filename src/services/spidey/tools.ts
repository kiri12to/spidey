import { SpideyToolDefinition } from './types';

export const SPIDEY_TOOLS: SpideyToolDefinition[] = [
  {
    name: 'create_task',
    description: 'Creates a new task in the ledger with optional group, due date, time, and priority.',
    parameters: [
      { name: 'title', type: 'string', description: 'Title or description of the task', required: true },
      { name: 'group', type: 'string', description: 'Name of the task group/category to assign this to (e.g. "Workout", "Study", "Work")' },
      { name: 'due', type: 'string', description: 'Due date keyword: "today", "tomorrow", or ISO YYYY-MM-DD' },
      { name: 'time', type: 'string', description: 'Due time in 24h format HH:MM (e.g. "16:00", "09:30")' },
      { name: 'priority', type: 'string', description: 'Priority level', enum: ['low', 'medium', 'high'] },
      { name: 'notes', type: 'string', description: 'Optional additional notes or description' },
    ],
  },
  {
    name: 'complete_task',
    description: 'Marks an existing task as completed.',
    parameters: [
      { name: 'query', type: 'string', description: 'Task title or keywords matching the task to mark done', required: true },
    ],
  },
  {
    name: 'delete_task',
    description: 'Deletes a task permanently from the board.',
    parameters: [
      { name: 'query', type: 'string', description: 'Task title or keywords matching the task to delete', required: true },
    ],
  },
  {
    name: 'create_group',
    description: 'Creates a new task group / category section.',
    parameters: [
      { name: 'name', type: 'string', description: 'Name of the new task group', required: true },
      { name: 'color', type: 'string', description: 'Optional hex color or Tailwind color' },
    ],
  },
  {
    name: 'delete_group',
    description: 'Deletes a task group and detaches its contained tasks.',
    parameters: [
      { name: 'name', type: 'string', description: 'Name of the task group to delete', required: true },
    ],
  },
  {
    name: 'delete_all_groups',
    description: 'Deletes all task groups / categories from the board while preserving tasks as ungrouped.',
    parameters: [
      { name: 'confirm', type: 'boolean', description: 'True to confirm deleting all groups' },
    ],
  },
  {
    name: 'rename_group',
    description: 'Renames an existing task group.',
    parameters: [
      { name: 'oldName', type: 'string', description: 'Current group name', required: true },
      { name: 'newName', type: 'string', description: 'New name for the group', required: true },
    ],
  },
  {
    name: 'move_to_group',
    description: 'Moves a task into a specific task group.',
    parameters: [
      { name: 'task', type: 'string', description: 'Title or keywords of the task to move', required: true },
      { name: 'group', type: 'string', description: 'Target group name to move into', required: true },
    ],
  },
  {
    name: 'start_timer',
    description: 'Starts a focus pomodoro or countdown timer for a task.',
    parameters: [
      { name: 'minutes', type: 'number', description: 'Duration in minutes (e.g. 25, 45, 10)', required: true },
      { name: 'task', type: 'string', description: 'Optional task title or subject to tie the timer to' },
    ],
  },
  {
    name: 'stop_timer',
    description: 'Stops or resets the active running focus timer.',
    parameters: [],
  },
  {
    name: 'create_note',
    description: 'Creates a new reference note in the notes hub.',
    parameters: [
      { name: 'title', type: 'string', description: 'Note title or topic', required: true },
      { name: 'content', type: 'string', description: 'Full body content of the note', required: true },
      { name: 'pinned', type: 'boolean', description: 'Whether to pin the note to the top' },
    ],
  },
  {
    name: 'delete_note',
    description: 'Deletes a note matching the title or query.',
    parameters: [
      { name: 'query', type: 'string', description: 'Title of the note to delete', required: true },
    ],
  },
  {
    name: 'remember_fact',
    description: 'Stores a key personal fact or preference about Anas/Kiri in long-term memory.',
    parameters: [
      { name: 'fact', type: 'string', description: 'The personal fact or observation to remember', required: true },
      { name: 'tags', type: 'string', description: 'Comma separated tags (e.g. "maker, career, habit")' },
    ],
  },
  {
    name: 'sync',
    description: 'Triggers synchronization with Google Tasks if connected.',
    parameters: [],
  },
  {
    name: 'toggle_rain',
    description: 'Toggles the ambient background rain sound for focus.',
    parameters: [
      { name: 'enabled', type: 'boolean', description: 'True to enable, false to disable. If omitted, toggles.' },
    ],
  },
];

/**
 * Formats tool definitions for insertion into system prompt
 */
export function formatToolsForPrompt(): string {
  return `
AVAILABLE TOOLS & ACTIONS:
You have direct control over the app hub. To execute an action, end your message with a structured tool call tag in this exact format:
[[ACTION: <tool_name> | <param1>: <value1> | <param2>: <value2>]]

Tool Specifications:
${SPIDEY_TOOLS.map((t) => {
  const params = t.parameters.map((p) => `${p.name}${p.required ? '*' : ''} (${p.type}): ${p.description}`).join('; ');
  return `- ${t.name}: ${t.description}${params ? ` [Params: ${params}]` : ''}`;
}).join('\n')}

- For storing key memories: [[REMEMBER: <fact to store>]]

Tool Call Examples:
- User: "Create a group called Workout"
  Spidey: "Created the Workout group. What are we putting on the board? [[ACTION: create_group | name: Workout]]"

- User: "Add task Bench Press under Workout for today at 4pm"
  Spidey: "Locked in Bench Press for 4:00 PM today in Workout. [[ACTION: create_task | title: Bench Press | group: Workout | due: today | time: 16:00]]"

- User: "Start a 25 min timer for study"
  Spidey: "25 minutes on the clock for Study. Let's get it. [[ACTION: start_timer | minutes: 25 | task: Study]]"
`;
}
