import { Task, TaskGroup } from '../types';
import { tombstones } from './tombstones';

export interface GoogleTaskList {
  id: string;
  title: string;
  updated?: string;
  selfLink?: string;
}

export interface GoogleTaskItem {
  id: string;
  title?: string;
  notes?: string;
  status: 'needsAction' | 'completed';
  due?: string; // RFC 3339 date string (e.g. 2026-08-20T00:00:00.000Z)
  completed?: string; // RFC 3339 date string
  deleted?: boolean;
  hidden?: boolean;
  parent?: string;
  position?: string;
  updated?: string;
}

/**
 * All Google Tasks calls go through our own Express server at /api/google-tasks.
 *
 * WHY: the browser is blocked from calling the tasks endpoints directly --
 * tasks.googleapis.com sends no Access-Control-Allow-Origin on
 * /lists/{id}/tasks, so Chrome kills the request at preflight with
 * "No 'Access-Control-Allow-Origin' header is present". The /users/@me/lists
 * endpoint happens to allow it, which is why groups synced fine and tasks
 * silently never worked.
 *
 * CORS restricts browsers, not servers. Relaying through our own origin makes
 * the whole class of problem disappear.
 */
const PROXY_URL = '/api/google-tasks';

/** Resolved once per session: the real id behind the '@default' alias. */
let DEFAULT_LIST_ID_CACHE: string | null = null;

async function resolveDefaultList(
  token: string,
  remoteLists: GoogleTaskList[]
): Promise<GoogleTaskList | undefined> {
  try {
    const real = await fetchGoogleApi<GoogleTaskList>('/users/@me/lists/@default', token);
    if (real?.id) {
      DEFAULT_LIST_ID_CACHE = real.id;
      return remoteLists.find((l) => l.id === real.id) || real;
    }
  } catch (err) {
    console.warn('[spidey] could not resolve @default task list:', err);
  }
  return remoteLists[0];
}

async function fetchGoogleApi<T>(
  endpoint: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const parsedBody = options.body ? JSON.parse(options.body as string) : undefined;

  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: endpoint, method, token, body: parsedBody }),
  });

  if (response.status === 204) {
    return {} as T;
  }

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const errJson = await response.json();
      detail = errJson?.error || detail;
    } catch {
      // non-JSON error body
    }
    throw new Error(`Google Tasks API Error (${response.status}): ${detail}`);
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
}

// 1. TaskLists
export async function getGoogleTaskLists(token: string): Promise<GoogleTaskList[]> {
  const data = await fetchGoogleApi<{ items?: GoogleTaskList[] }>('/users/@me/lists', token);
  return data.items || [];
}

export async function createGoogleTaskList(token: string, title: string): Promise<GoogleTaskList> {
  return fetchGoogleApi<GoogleTaskList>('/users/@me/lists', token, {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
}

export async function deleteGoogleTaskList(token: string, taskListId: string): Promise<void> {
  await fetchGoogleApi<void>(`/users/@me/lists/${taskListId}`, token, {
    method: 'DELETE',
  });
}

/**
 * ============================================================================
 * ENDPOINT ROOTS -- THESE ARE DIFFERENT AND IT MATTERS
 * ============================================================================
 * Task LISTS live under:  /tasks/v1/users/@me/lists
 * Task ITEMS live under:  /tasks/v1/lists/{tasklist}/tasks     <- no users/@me
 *
 * Every task method below used to say `/users/@me/lists/${id}/tasks`, which is
 * not a real endpoint. Google returned 404 for all of them -- and because a
 * 404 path carries no CORS headers, the browser reported it as
 * "No 'Access-Control-Allow-Origin' header is present", which sent us chasing
 * a CORS problem that never existed.
 *
 * Task lists used the correct root, which is exactly why groups always synced
 * and individual tasks never did.
 * ============================================================================
 */

// 2. Tasks
/**
 * Fetches ALL tasks in a list, following pagination.
 *
 * THE BUG THIS FIXES
 * ------------------
 * The old version requested the endpoint with no maxResults and no paging:
 *
 *   /lists/{id}/tasks?showCompleted=true&showHidden=true
 *
 * Google defaults to 20 results per page. Combined with showCompleted +
 * showHidden -- which drag in the entire archive of finished and cleared
 * tasks -- those 20 slots fill with old completed items and genuinely new
 * tasks fall off the end. Groups never hit this because task LISTS are few.
 *
 * Now: 100 per page (the API max) and follow nextPageToken to the end.
 */
export async function getGoogleTasks(
  token: string,
  taskListId: string = '@default'
): Promise<GoogleTaskItem[]> {
  const all: GoogleTaskItem[] = [];
  let pageToken: string | undefined;
  let pages = 0;

  do {
    const params = new URLSearchParams({
      showCompleted: 'true',
      showHidden: 'true',
      maxResults: '100',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const data = await fetchGoogleApi<{ items?: GoogleTaskItem[]; nextPageToken?: string }>(
      `/lists/${taskListId}/tasks?${params.toString()}`,
      token
    );

    if (data.items) all.push(...data.items);
    pageToken = data.nextPageToken;
    pages++;
  } while (pageToken && pages < 20); // hard stop so a bad token can't loop forever

  return all;
}

export async function createGoogleTask(
  token: string,
  taskListId: string = '@default',
  task: { title: string; notes?: string; due?: string; status?: 'needsAction' | 'completed' }
): Promise<GoogleTaskItem> {
  return fetchGoogleApi<GoogleTaskItem>(`/lists/${taskListId}/tasks`, token, {
    method: 'POST',
    body: JSON.stringify(task),
  });
}

export async function updateGoogleTask(
  token: string,
  taskListId: string,
  taskId: string,
  task: { title: string; notes?: string; due?: string | null; status: 'needsAction' | 'completed' }
): Promise<GoogleTaskItem> {
  return fetchGoogleApi<GoogleTaskItem>(`/lists/${taskListId}/tasks/${taskId}`, token, {
    method: 'PATCH',
    body: JSON.stringify(task),
  });
}

export async function deleteGoogleTask(
  token: string,
  taskListId: string,
  taskId: string
): Promise<void> {
  await fetchGoogleApi<void>(`/lists/${taskListId}/tasks/${taskId}`, token, {
    method: 'DELETE',
  });
}

/**
 * Bidirectional Synchronizer
 * - Fetches Google Task lists and tasks
 * - Merges and reconciles with local Spidey tasks and groups
 * - Returns updated lists with synced metadata
 */
export async function performFullSync(
  token: string,
  localTasks: Task[],
  localGroups: TaskGroup[]
): Promise<{
  updatedTasks: Task[];
  updatedGroups: TaskGroup[];
  syncCount: number;
  pushErrors: string[];
}> {
  let syncCount = 0;
  const nowIso = new Date().toISOString();

  // 1. Fetch all Google Task lists
  const remoteLists = await getGoogleTaskLists(token);
  // NOTE: '@default' is a URL alias, not an id Google ever returns, so the old
  // `find(l => l.id === '@default')` never matched and silently fell through to
  // remoteLists[0] -- whichever list happened to sort first. Google returns the
  // real default list first, so resolve it by asking for it directly.
  let defaultList =
    remoteLists.find((l) => l.id === DEFAULT_LIST_ID_CACHE) ||
    (await resolveDefaultList(token, remoteLists));

  if (!defaultList && remoteLists.length === 0) {
    defaultList = await createGoogleTaskList(token, 'Spidey Tasks');
  }
  const defaultListId = defaultList ? defaultList.id : '@default';

  // 2. Map groups to task lists or create missing ones
  const updatedGroups: TaskGroup[] = [...localGroups];
  const listIdToGroupIdMap: Record<string, string> = {};

  for (let i = 0; i < updatedGroups.length; i++) {
    const group = updatedGroups[i];
    let matchedList = remoteLists.find(
      (rl) => (group.googleTaskListId && rl.id === group.googleTaskListId) || rl.title.toLowerCase() === group.name.toLowerCase()
    );

    if (!matchedList) {
      try {
        matchedList = await createGoogleTaskList(token, group.name);
        syncCount++;
      } catch (err) {
        console.warn(`Could not create Google Task list for group "${group.name}":`, err);
      }
    }

    if (matchedList) {
      updatedGroups[i] = {
        ...group,
        googleTaskListId: matchedList.id,
      };
      listIdToGroupIdMap[matchedList.id] = group.id;
    }
  }

  // Also import any Google Task Lists that don't exist locally as groups (except default)
  for (const rList of remoteLists) {
    // Don't re-import a list the user just deleted here.
    if (tombstones.isListDeleted(rList.id)) continue;
    if (rList.id !== defaultListId && !updatedGroups.some((g) => g.googleTaskListId === rList.id || g.name.toLowerCase() === rList.title.toLowerCase())) {
      const newGroupId = `group-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      updatedGroups.push({
        id: newGroupId,
        name: rList.title,
        color: 'crimson',
        collapsed: false,
        order: updatedGroups.length,
        createdAt: nowIso,
        updatedAt: nowIso,
        googleTaskListId: rList.id,
      });
      listIdToGroupIdMap[rList.id] = newGroupId;
      syncCount++;
    }
  }

  // 3. Collect all Google Tasks across lists
  const listsToFetch = [defaultListId, ...Object.keys(listIdToGroupIdMap)];
  const uniqueLists = Array.from(new Set(listsToFetch));
  
  // ---- Push local deletions up BEFORE pulling, or we'd just re-import
  // everything we deleted a moment ago.
  for (const t of tombstones.pendingTasks()) {
    if (!t.listId) {
      tombstones.clearTask(t.remoteId);
      continue;
    }
    try {
      await deleteGoogleTask(token, t.listId, t.remoteId);
      tombstones.clearTask(t.remoteId);
    } catch (err: any) {
      // 404/410 means Google already lost it — job done either way.
      if (/\b(404|410)\b/.test(String(err?.message))) tombstones.clearTask(t.remoteId);
      else console.warn('[spidey sync] could not delete remote task:', err?.message);
    }
  }

  for (const l of tombstones.pendingLists()) {
    try {
      await deleteGoogleTaskList(token, l.remoteId);
      tombstones.clearList(l.remoteId);
    } catch (err: any) {
      if (/\b(404|410)\b/.test(String(err?.message))) tombstones.clearList(l.remoteId);
      else console.warn('[spidey sync] could not delete remote list:', err?.message);
    }
  }

  const allRemoteTasks: { listId: string; item: GoogleTaskItem }[] = [];
  const fetchErrors: string[] = [];

  for (const listId of uniqueLists) {
    try {
      const items = await getGoogleTasks(token, listId);
      let kept = 0;
      for (const item of items) {
        // Skip anything we deleted locally whose removal hasn't landed on
        // Google yet, otherwise it comes straight back.
        if (item.title && !item.deleted && !tombstones.isTaskDeleted(item.id)) {
          allRemoteTasks.push({ listId, item });
          kept++;
        }
      }
      console.debug(`[spidey sync] list ${listId}: ${items.length} fetched, ${kept} usable`);
    } catch (err: any) {
      // These used to be console.warn only, so a list that consistently
      // failed looked identical to a list with nothing in it.
      const msg = err?.message || String(err);
      console.error(`[spidey sync] failed to fetch tasks for list ${listId}:`, msg);
      fetchErrors.push(msg);
    }
  }

  // If EVERY list failed, this isn't an empty account -- it's a broken sync,
  // and the caller needs to know so it can show the error and re-auth.
  if (fetchErrors.length > 0 && fetchErrors.length === uniqueLists.length) {
    throw new Error(`Could not read any task lists. ${fetchErrors[0]}`);
  }

  // 4. Reconcile Tasks
  let updatedTasks: Task[] = [...localTasks];
  const processedGoogleTaskIds = new Set<string>();

  // A. Process remote Google Tasks -> Spidey
  for (const { listId, item } of allRemoteTasks) {
    processedGoogleTaskIds.add(item.id);
    const existingIndex = updatedTasks.findIndex((t) => t.googleTaskId === item.id);

    const isCompleted = item.status === 'completed';
    const dueDateFormatted = item.due ? item.due.split('T')[0] : '';
    const assignedGroupId = listId === defaultListId ? null : (listIdToGroupIdMap[listId] || null);

    if (existingIndex >= 0) {
      const local = updatedTasks[existingIndex];
      // Check if remote is newer or status differed
      if (local.completed !== isCompleted || (item.title && local.title !== item.title) || (item.notes && local.notes !== item.notes)) {
        updatedTasks[existingIndex] = {
          ...local,
          title: item.title || local.title,
          notes: item.notes || local.notes || '',
          completed: isCompleted,
          completedAt: isCompleted ? (item.completed || local.completedAt || nowIso) : undefined,
          dueDate: dueDateFormatted || local.dueDate,
          groupId: assignedGroupId !== undefined ? assignedGroupId : local.groupId,
          googleTaskListId: listId,
          syncedAt: nowIso,
          updatedAt: nowIso,
        };
        syncCount++;
      }
    } else {
      // Check if there is a local task with matching title and no googleTaskId yet
      const matchByTitle = updatedTasks.find(
        (t) => !t.googleTaskId && t.title.trim().toLowerCase() === (item.title || '').trim().toLowerCase()
      );

      if (matchByTitle) {
        const idx = updatedTasks.indexOf(matchByTitle);
        updatedTasks[idx] = {
          ...matchByTitle,
          googleTaskId: item.id,
          googleTaskListId: listId,
          completed: isCompleted,
          syncedAt: nowIso,
        };
        syncCount++;
      } else {
        // Create brand new local task from Google Task
        const newTask: Task = {
          id: `task-gt-${item.id}`,
          title: item.title || 'Untitled Task',
          notes: item.notes || '',
          dueDate: dueDateFormatted || new Date().toISOString().split('T')[0],
          completed: isCompleted,
          completedAt: isCompleted ? (item.completed || nowIso) : undefined,
          priority: 'medium',
          groupId: assignedGroupId,
          order: updatedTasks.length,
          createdAt: item.updated || nowIso,
          updatedAt: item.updated || nowIso,
          googleTaskId: item.id,
          googleTaskListId: listId,
          syncedAt: nowIso,
        };
        updatedTasks.push(newTask);
        syncCount++;
      }
    }
  }

  // B. Process Spidey tasks -> Google Tasks (push un-synced local tasks)
  const pushErrors: string[] = [];
  for (let i = 0; i < updatedTasks.length; i++) {
    const task = updatedTasks[i];
    if (!task.googleTaskId) {
      // Create in Google Tasks
      const targetListId = task.groupId
        ? updatedGroups.find((g) => g.id === task.groupId)?.googleTaskListId || defaultListId
        : defaultListId;

      try {
        const dueIso = task.dueDate ? `${task.dueDate}T00:00:00.000Z` : undefined;
        const createdRemote = await createGoogleTask(token, targetListId, {
          title: task.title,
          notes: task.notes,
          due: dueIso,
          status: task.completed ? 'completed' : 'needsAction',
        });

        updatedTasks[i] = {
          ...task,
          googleTaskId: createdRemote.id,
          googleTaskListId: targetListId,
          syncedAt: nowIso,
        };
        syncCount++;
      } catch (err: any) {
        console.error(
          `[spidey sync] failed to push task "${task.title}" to list ${targetListId}:`,
          err?.message || err
        );
        pushErrors.push(task.title);
      }
    }
  }

  if (pushErrors.length > 0) {
    console.warn(`[spidey sync] ${pushErrors.length} task(s) failed to upload:`, pushErrors);
  }

  console.debug(
    `[spidey sync] done — ${allRemoteTasks.length} remote tasks across ${uniqueLists.length} list(s), ${syncCount} change(s)`
  );

  return {
    updatedTasks,
    updatedGroups,
    syncCount,
    pushErrors,
  };
}
