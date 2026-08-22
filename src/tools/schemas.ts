/**
 * Native tool schemas.
 *
 * WHY THIS EXISTS
 * ---------------
 * Tools used to be described in prose inside the system prompt, and the model
 * had to reproduce a bracket syntax exactly:
 *
 *     [[ACTION:create_group:{"name":"Gym"}]]
 *
 * A 7B holds maybe half a dozen constraints reliably. Past twenty tools it
 * stops emitting syntax and starts narrating instead ("Spidey's doing a
 * circle around the screen") or mangles it (", ACTION:create_group:{...}]]"
 * with the opening brackets missing).
 *
 * Qwen2.5-instruct is TRAINED on this schema format. Passing tools here
 * instead of in the prompt means the model emits structured calls it already
 * knows, and frees roughly 700 tokens of system prompt for personality.
 */

export interface ToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

const str = (description: string) => ({ type: 'string', description });

function tool(
  name: string,
  description: string,
  properties: Record<string, any> = {},
  required: string[] = []
): ToolSchema {
  return {
    type: 'function',
    function: { name, description, parameters: { type: 'object', properties, required } },
  };
}

export const TOOL_SCHEMAS: ToolSchema[] = [
  // ---- tasks ----
  tool(
    'create_task',
    'Add a task to the board.',
    {
      title: str('What the task is'),
      group: str('Group name to file it under. Must be an existing group.'),
      due: str('"today", "tomorrow", or YYYY-MM-DD'),
      time: str('Time of day, HH:MM'),
    },
    ['title']
  ),
  tool('complete_task', 'Mark a task done.', { query: str('Title or part of it') }, ['query']),
  tool('delete_task', 'Remove a task permanently.', { query: str('Title or part of it') }, ['query']),

  // ---- groups ----
  tool('create_group', 'Create a new group (a folder for tasks).', { name: str('Group name') }, ['name']),
  tool('delete_group', 'Delete a group and its tasks.', { name: str('Exact existing group name') }, ['name']),
  tool(
    'rename_group',
    'Rename an existing group.',
    { oldName: str('Current name'), newName: str('New name') },
    ['oldName', 'newName']
  ),
  tool(
    'move_to_group',
    'Move a task into a different group.',
    { task: str('Task title'), group: str('Destination group name') },
    ['task', 'group']
  ),
  tool('delete_all_groups', 'Delete EVERY group and all their tasks. Destructive — only on a clear request.'),
  tool(
    'delete_all_tasks',
    'Delete EVERY task on the board, leaving the groups. Use for "delete all my tasks" or "clear my tasks".'
  ),
  tool(
    'clear_board',
    'Wipe everything — every task AND every group. Use for "clear everything" or "wipe my board".'
  ),

  // ---- notes ----
  tool(
    'create_note',
    'Save a note. Put the real content in "content", never leave it empty.',
    { title: str('Short title'), content: str('The full text of the note') },
    ['title', 'content']
  ),
  tool('delete_note', 'Delete a note.', { query: str('Note title or part of it') }, ['query']),

  // ---- timer ----
  tool(
    'start_timer',
    'Start a focus timer.',
    { minutes: { type: 'number', description: 'Length in minutes' }, task: str('What it is for') },
    ['minutes']
  ),
  tool('stop_timer', 'Stop the running timer.'),

  // ---- memory ----
  tool(
    'remember_fact',
    'Save something durable about Kiri so you still know it next session. Write it in plain third person.',
    { fact: str('The fact, e.g. "Kiri\'s name comes from Kirito in Sword Art Online."') },
    ['fact']
  ),
  tool('forget_fact', 'Forget something you saved.', { query: str('What to forget') }, ['query']),
  tool('recall', 'Search your own memory about Kiri.', { query: str('What to look up') }, ['query']),

  // ---- web ----
  tool(
    'web_search',
    'Search the live web. Use for anything current or past your training. Results come back before you reply.',
    { query: str('Search query') },
    ['query']
  ),

  // ---- body ----
  tool('spider_come', 'Walk the spider over to wherever his cursor is.'),
  tool(
    'spider_go',
    'Walk the spider to a place on screen.',
    {
      place: {
        type: 'string',
        enum: ['cursor', 'center', 'top', 'bottom', 'left', 'right', 'corner', 'header', 'tasks', 'notes', 'chat'],
        description: 'Where to go',
      },
    },
    ['place']
  ),
  tool(
    'spider_drop',
    'Abseil down on a silk line. Use to get his attention.',
    { say: str('Optional line to say on arrival') }
  ),
  tool('spider_celebrate', 'Quick celebratory spin.'),
  tool('spider_rest', 'Settle down and stop roaming for a while.'),
];
