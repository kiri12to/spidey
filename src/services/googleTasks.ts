import { Task, TaskGroup } from '../types';

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

const BASE_URL = 'https://tasks.googleapis.com/tasks/v1';

async function fetchGoogleApi<T>(endpoint: string, token: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Google Tasks API Error (${response.status}): ${errorBody || response.statusText}`);
  }

  // Some DELETE endpoints return empty body
  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
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

// 2. Tasks
export async function getGoogleTasks(token: string, taskListId: string = '@default'): Promise<GoogleTaskItem[]> {
  const data = await fetchGoogleApi<{ items?: GoogleTaskItem[] }>(
    `/users/@me/lists/${taskListId}/tasks?showCompleted=true&showHidden=true`,
    token
  );
  return data.items || [];
}

export async function createGoogleTask(
  token: string,
  taskListId: string = '@default',
  task: { title: string; notes?: string; due?: string; status?: 'needsAction' | 'completed' }
): Promise<GoogleTaskItem> {
  return fetchGoogleApi<GoogleTaskItem>(`/users/@me/lists/${taskListId}/tasks`, token, {
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
  return fetchGoogleApi<GoogleTaskItem>(`/users/@me/lists/${taskListId}/tasks/${taskId}`, token, {
    method: 'PATCH',
    body: JSON.stringify(task),
  });
}

export async function deleteGoogleTask(
  token: string,
  taskListId: string,
  taskId: string
): Promise<void> {
  await fetchGoogleApi<void>(`/users/@me/lists/${taskListId}/tasks/${taskId}`, token, {
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
): Promise<{ updatedTasks: Task[]; updatedGroups: TaskGroup[]; syncCount: number }> {
  let syncCount = 0;
  const nowIso = new Date().toISOString();

  // 1. Fetch all Google Task lists
  const remoteLists = await getGoogleTaskLists(token);
  let defaultList = remoteLists.find((l) => l.id === '@default') || remoteLists[0];

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
  
  const allRemoteTasks: { listId: string; item: GoogleTaskItem }[] = [];
  for (const listId of uniqueLists) {
    try {
      const items = await getGoogleTasks(token, listId);
      for (const item of items) {
        if (item.title && !item.deleted) {
          allRemoteTasks.push({ listId, item });
        }
      }
    } catch (err) {
      console.warn(`Error fetching tasks for list ${listId}:`, err);
    }
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
      } catch (err) {
        console.warn(`Failed to push task "${task.title}" to Google Tasks:`, err);
      }
    }
  }

  return {
    updatedTasks,
    updatedGroups,
    syncCount,
  };
}
