/**
 * Deletion tombstones.
 *
 * THE BUG THIS FIXES
 * ------------------
 * spideyApi.deleteTask() only removed the task from localStorage. Google still
 * had it, so the next sync pulled it back down, failed to match any local
 * googleTaskId, and re-imported it as a brand new task. Delete, refresh, it's
 * back. Same for groups.
 *
 * A local delete now leaves a marker. Sync reads the markers, deletes those
 * items on Google's side, and refuses to re-import them in the meantime.
 */

const TASK_KEY = 'spidey_deleted_tasks_v1';
const LIST_KEY = 'spidey_deleted_lists_v1';

interface Tombstone {
  /** Google's id for the thing that was deleted. */
  remoteId: string;
  /** For tasks: which list it lived in (needed for the DELETE call). */
  listId?: string;
  at: number;
}

function read(key: string): Tombstone[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

function write(key: string, items: Tombstone[]) {
  if (typeof window === 'undefined') return;
  // Anything older than a week has certainly been reconciled by now.
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  localStorage.setItem(key, JSON.stringify(items.filter((t) => t.at > cutoff)));
}

export const tombstones = {
  markTaskDeleted(remoteId: string, listId?: string) {
    if (!remoteId) return;
    const all = read(TASK_KEY);
    if (all.some((t) => t.remoteId === remoteId)) return;
    all.push({ remoteId, listId, at: Date.now() });
    write(TASK_KEY, all);
  },

  markListDeleted(remoteId: string) {
    if (!remoteId) return;
    const all = read(LIST_KEY);
    if (all.some((t) => t.remoteId === remoteId)) return;
    all.push({ remoteId, at: Date.now() });
    write(LIST_KEY, all);
  },

  pendingTasks: () => read(TASK_KEY),
  pendingLists: () => read(LIST_KEY),

  clearTask(remoteId: string) {
    write(TASK_KEY, read(TASK_KEY).filter((t) => t.remoteId !== remoteId));
  },

  clearList(remoteId: string) {
    write(LIST_KEY, read(LIST_KEY).filter((t) => t.remoteId !== remoteId));
  },

  /** Guards the import path so a deleted item can't sneak back in. */
  isTaskDeleted(remoteId?: string): boolean {
    if (!remoteId) return false;
    return read(TASK_KEY).some((t) => t.remoteId === remoteId);
  },

  isListDeleted(remoteId?: string): boolean {
    if (!remoteId) return false;
    return read(LIST_KEY).some((t) => t.remoteId === remoteId);
  },
};
