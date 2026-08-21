/**
 * Spidey AI Action & Service Layer
 * 
 * Clean, decoupled API surface designed for both the application UI 
 * and future integration with local Spidey AI agents.
 * 
 * Allows local AI models (e.g. running on laptop) to query and control tasks,
 * groups, notes, timers, and calendar dates programmatically.
 */

import { Task, TaskGroup, Note, TimerState, Priority } from '../types';
import { 
  loadStoredTasks, 
  saveStoredTasks, 
  loadStoredGroups, 
  saveStoredGroups, 
  loadStoredNotes, 
  saveStoredNotes,
  loadStoredMemories,
  saveStoredMemories,
  isTaskOverdue,
  getTodayDateString 
} from './storage';

export interface CreateTaskParams {
  title: string;
  notes?: string;
  description?: string;
  dueDate?: string; // YYYY-MM-DD
  dueTime?: string; // HH:MM
  priority?: Priority;
  groupId?: string | null;
  estimatedMinutes?: number;
  source?: 'local' | 'google_tasks';
}

export interface UpdateTaskParams {
  title?: string;
  notes?: string;
  description?: string;
  dueDate?: string;
  dueTime?: string;
  priority?: Priority;
  groupId?: string | null;
  completed?: boolean;
  estimatedMinutes?: number;
}

export interface CreateNoteParams {
  title: string;
  content: string;
  pinned?: boolean;
}

export interface UpdateNoteParams {
  title?: string;
  content?: string;
  pinned?: boolean;
}

export interface StartTimerParams {
  taskId?: string | null;
  taskTitle?: string | null;
  minutes?: number;
  mode?: 'work' | 'break' | 'custom';
}

export interface CalendarDaySummary {
  date: string; // YYYY-MM-DD
  isCurrentMonth: boolean;
  isToday: boolean;
  dayNumber: number;
  tasks: Task[];
  hasTasks: boolean;
  completedCount: number;
  totalCount: number;
  hasOverdue: boolean;
}

export type SpideyMindState = 'idle' | 'thinking' | 'speaking' | 'focusing' | 'celebrating' | 'curious';

type Listener = () => void;

class SpideyApiService {
  private tasks: Task[] = [];
  private groups: TaskGroup[] = [];
  private notes: Note[] = [];
  private memories: string[] = [];
  private mindState: {
    state: SpideyMindState;
    details?: string;
    timestamp: number;
  } = {
    state: 'idle',
    timestamp: Date.now(),
  };
  private timer: TimerState = {
    taskId: null,
    taskTitle: null,
    durationSeconds: 25 * 60,
    remainingSeconds: 25 * 60,
    isRunning: false,
    mode: 'work',
    originalDuration: 25 * 60,
  };
  private listeners: Set<Listener> = new Set();

  constructor() {
    this.reloadFromStorage();
  }

  public reloadFromStorage() {
    this.tasks = loadStoredTasks();
    this.groups = loadStoredGroups();
    this.notes = loadStoredNotes();
    this.memories = loadStoredMemories();
    this.notify();
  }

  public updateAllTasksAndGroups(tasks: Task[], groups: TaskGroup[]) {
    this.tasks = tasks;
    this.groups = groups;
    saveStoredTasks(tasks);
    saveStoredGroups(groups);
    this.notify();
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.error('Spidey API listener error:', e);
      }
    });
  }

  // ==========================================
  // 1. TASK ACTIONS
  // ==========================================

  /**
   * Get all tasks, with optional filtering
   */
  public getTasks(filter?: {
    completed?: boolean;
    groupId?: string | null;
    priority?: Priority;
    date?: string;
  }): Task[] {
    let result = [...this.tasks];
    if (filter) {
      if (filter.completed !== undefined) {
        result = result.filter((t) => t.completed === filter.completed);
      }
      if (filter.groupId !== undefined) {
        result = result.filter((t) => t.groupId === filter.groupId);
      }
      if (filter.priority !== undefined) {
        result = result.filter((t) => t.priority === filter.priority);
      }
      if (filter.date !== undefined) {
        result = result.filter((t) => t.dueDate === filter.date);
      }
    }
    return result;
  }

  /**
   * Get a single task by ID or title match
   */
  public getTask(idOrTitle: string): Task | undefined {
    const byId = this.tasks.find((t) => t.id === idOrTitle);
    if (byId) return byId;
    return this.tasks.find((t) => t.title.toLowerCase().trim() === idOrTitle.toLowerCase().trim());
  }

  public findTaskByTitle(title: string): Task | undefined {
    return this.getTask(title);
  }

  /**
   * Get tasks scheduled for a specific date (YYYY-MM-DD)
   */
  public getTasksForDate(dateStr: string): Task[] {
    return this.tasks.filter((t) => t.dueDate === dateStr);
  }

  /**
   * Get all tasks scheduled for today or unscheduled
   */
  public getTodayTasks(): Task[] {
    const todayStr = getTodayDateString();
    return this.tasks.filter((t) => t.dueDate === todayStr || !t.dueDate);
  }

  /**
   * Get all currently overdue, uncompleted tasks
   */
  public getOverdueTasks(): Task[] {
    return this.tasks.filter((t) => isTaskOverdue(t));
  }

  /**
   * Create a new task
   */
  public createTask(params: CreateTaskParams): Task {
    const nowIso = new Date().toISOString();
    const notesContent = params.notes ?? params.description ?? '';
    const newTask: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      title: params.title.trim(),
      notes: notesContent || undefined,
      description: notesContent || undefined,
      dueDate: params.dueDate || getTodayDateString(),
      dueTime: params.dueTime || undefined,
      completed: false,
      priority: params.priority || 'medium',
      groupId: params.groupId || null,
      order: this.tasks.length,
      source: params.source || 'local',
      estimatedMinutes: params.estimatedMinutes,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.tasks = [newTask, ...this.tasks];
    saveStoredTasks(this.tasks);
    this.notify();
    return newTask;
  }

  /**
   * Update an existing task
   */
  public updateTask(id: string, params: UpdateTaskParams): Task | null {
    const index = this.tasks.findIndex((t) => t.id === id);
    if (index === -1) return null;

    const current = this.tasks[index];
    const nowIso = new Date().toISOString();
    const updatedNotes = params.notes ?? params.description ?? current.notes;

    const updatedTask: Task = {
      ...current,
      title: params.title !== undefined ? params.title.trim() : current.title,
      notes: updatedNotes,
      description: updatedNotes,
      dueDate: params.dueDate !== undefined ? params.dueDate : current.dueDate,
      dueTime: params.dueTime !== undefined ? params.dueTime : current.dueTime,
      priority: params.priority !== undefined ? params.priority : current.priority,
      groupId: params.groupId !== undefined ? params.groupId : current.groupId,
      completed: params.completed !== undefined ? params.completed : current.completed,
      completedAt: params.completed ? (current.completedAt || nowIso) : (params.completed === false ? undefined : current.completedAt),
      estimatedMinutes: params.estimatedMinutes !== undefined ? params.estimatedMinutes : current.estimatedMinutes,
      updatedAt: nowIso,
    };

    this.tasks[index] = updatedTask;
    saveStoredTasks(this.tasks);
    this.notify();
    return updatedTask;
  }

  /**
   * Mark a task as completed or uncompleted
   */
  public completeTask(id: string, completed: boolean = true): Task | null {
    return this.updateTask(id, { completed });
  }

  /**
   * Delete a task by ID
   */
  public deleteTask(id: string): boolean {
    const initialLen = this.tasks.length;
    this.tasks = this.tasks.filter((t) => t.id !== id);
    if (this.tasks.length !== initialLen) {
      saveStoredTasks(this.tasks);
      this.notify();
      return true;
    }
    return false;
  }

  // ==========================================
  // 2. TASK GROUP ACTIONS
  // ==========================================

  public getTaskGroups(): TaskGroup[] {
    return [...this.groups];
  }

  public getTaskGroup(idOrName: string): TaskGroup | undefined {
    return this.groups.find(
      (g) => g.id === idOrName || g.name.toLowerCase().trim() === idOrName.toLowerCase().trim()
    );
  }

  public findGroupByName(name: string): TaskGroup | undefined {
    return this.getTaskGroup(name);
  }

  public createTaskGroup(name: string, color: string = 'crimson'): TaskGroup {
    // Check if group already exists with this name (case-insensitive)
    const existing = this.groups.find((g) => g.name.toLowerCase().trim() === name.toLowerCase().trim());
    if (existing) return existing;

    const nowIso = new Date().toISOString();
    const newGroup: TaskGroup = {
      id: `group-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: name.trim(),
      color,
      collapsed: false,
      order: this.groups.length,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.groups = [...this.groups, newGroup];
    saveStoredGroups(this.groups);
    this.notify();
    return newGroup;
  }

  public renameGroup(oldNameOrId: string, newName: string): TaskGroup | null {
    const group = this.getTaskGroup(oldNameOrId);
    if (!group) return null;
    return this.updateTaskGroup(group.id, { name: newName });
  }

  public renameTaskGroup(idOrName: string, newName: string): TaskGroup | null {
    return this.renameGroup(idOrName, newName);
  }

  public deleteGroupByName(nameOrId: string): boolean {
    const group = this.getTaskGroup(nameOrId);
    if (!group) return false;
    return this.deleteTaskGroup(group.id);
  }

  public moveTaskToGroup(taskTitleOrId: string, groupNameOrId: string | null): Task | null {
    const task = this.getTask(taskTitleOrId);
    if (!task) return null;

    let targetGroupId: string | null = null;
    if (groupNameOrId) {
      let group = this.getTaskGroup(groupNameOrId);
      if (!group) {
        // Automatically create the group if it doesn't exist
        group = this.createTaskGroup(groupNameOrId);
      }
      targetGroupId = group.id;
    }

    return this.updateTask(task.id, { groupId: targetGroupId });
  }

  public updateTaskGroup(id: string, params: { name?: string; color?: string; collapsed?: boolean }): TaskGroup | null {
    const index = this.groups.findIndex((g) => g.id === id);
    if (index === -1) return null;

    const current = this.groups[index];
    const updated: TaskGroup = {
      ...current,
      name: params.name !== undefined ? params.name.trim() : current.name,
      color: params.color !== undefined ? params.color : current.color,
      collapsed: params.collapsed !== undefined ? params.collapsed : current.collapsed,
      updatedAt: new Date().toISOString(),
    };

    this.groups[index] = updated;
    saveStoredGroups(this.groups);
    this.notify();
    return updated;
  }

  public deleteTaskGroup(id: string): boolean {
    const initialLen = this.groups.length;
    this.groups = this.groups.filter((g) => g.id !== id);
    if (this.groups.length !== initialLen) {
      // Detach tasks from this group
      this.tasks = this.tasks.map((t) => (t.groupId === id ? { ...t, groupId: null } : t));
      saveStoredGroups(this.groups);
      saveStoredTasks(this.tasks);
      this.notify();
      return true;
    }
    return false;
  }

  public deleteAllTaskGroups(): number {
    const count = this.groups.length;
    this.groups = [];
    // Detach all tasks from groups
    this.tasks = this.tasks.map((t) => ({ ...t, groupId: null }));
    saveStoredGroups(this.groups);
    saveStoredTasks(this.tasks);
    this.notify();
    return count;
  }

  // ==========================================
  // 3. NOTES ACTIONS
  // ==========================================

  public getNotes(): Note[] {
    return [...this.notes];
  }

  public getNote(idOrTitle: string): Note | undefined {
    return this.notes.find(
      (n) => n.id === idOrTitle || n.title.toLowerCase().trim() === idOrTitle.toLowerCase().trim()
    );
  }

  public searchNotes(query: string): Note[] {
    if (!query.trim()) return [...this.notes];
    const q = query.toLowerCase();
    return this.notes.filter(
      (n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
    );
  }

  public createNote(params: CreateNoteParams): Note {
    const nowIso = new Date().toISOString();
    const newNote: Note = {
      id: `note-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      title: params.title.trim() || 'Untitled Note',
      content: params.content || '',
      pinned: params.pinned || false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.notes = [newNote, ...this.notes];
    saveStoredNotes(this.notes);
    this.notify();
    return newNote;
  }

  public updateNote(id: string, params: UpdateNoteParams): Note | null {
    const index = this.notes.findIndex((n) => n.id === id);
    if (index === -1) return null;

    const current = this.notes[index];
    const updated: Note = {
      ...current,
      title: params.title !== undefined ? params.title.trim() : current.title,
      content: params.content !== undefined ? params.content : current.content,
      pinned: params.pinned !== undefined ? params.pinned : current.pinned,
      updatedAt: new Date().toISOString(),
    };

    this.notes[index] = updated;
    saveStoredNotes(this.notes);
    this.notify();
    return updated;
  }

  public deleteNote(id: string): boolean {
    const initialLen = this.notes.length;
    this.notes = this.notes.filter((n) => n.id !== id);
    if (this.notes.length !== initialLen) {
      saveStoredNotes(this.notes);
      this.notify();
      return true;
    }
    return false;
  }

  // ==========================================
  // 4. TIMER ACTIONS
  // ==========================================

  public getTimer(): TimerState {
    return { ...this.timer };
  }

  public startTimer(params?: StartTimerParams): TimerState {
    const minutes = params?.minutes || 25;
    const durationSec = minutes * 60;
    this.timer = {
      taskId: params?.taskId || null,
      taskTitle: params?.taskTitle || null,
      durationSeconds: durationSec,
      remainingSeconds: durationSec,
      originalDuration: durationSec,
      mode: params?.mode || 'work',
      isRunning: true,
      startedAt: Date.now(),
    };
    this.notify();
    return { ...this.timer };
  }

  public pauseTimer(): TimerState {
    this.timer = { ...this.timer, isRunning: false };
    this.notify();
    return { ...this.timer };
  }

  public resumeTimer(): TimerState {
    this.timer = { ...this.timer, isRunning: true };
    this.notify();
    return { ...this.timer };
  }

  public stopTimer(): TimerState {
    this.timer = {
      ...this.timer,
      isRunning: false,
      remainingSeconds: this.timer.originalDuration,
    };
    this.notify();
    return { ...this.timer };
  }

  public setTimerState(state: TimerState) {
    this.timer = state;
    this.notify();
  }

  // ==========================================
  // 5. MEMORY ACTIONS (Long-term Context)
  // ==========================================

  public getMemories(): string[] {
    return [...this.memories];
  }

  public saveMemory(fact: string): boolean {
    const trimmed = fact.trim();
    if (!trimmed) return false;
    // Prevent exact duplicates
    if (this.memories.some((m) => m.toLowerCase() === trimmed.toLowerCase())) {
      return false;
    }
    this.memories = [trimmed, ...this.memories].slice(0, 50); // Keep most recent 50 memories
    saveStoredMemories(this.memories);
    this.notify();
    return true;
  }

  public addMemory(fact: string): boolean {
    return this.saveMemory(fact);
  }

  public deleteMemory(target: string | number): boolean {
    const initialLen = this.memories.length;
    if (typeof target === 'number') {
      this.memories = this.memories.filter((_, idx) => idx !== target);
    } else {
      const lower = target.toLowerCase();
      this.memories = this.memories.filter((m) => !m.toLowerCase().includes(lower));
    }
    if (this.memories.length !== initialLen) {
      saveStoredMemories(this.memories);
      this.notify();
      return true;
    }
    return false;
  }

  public clearMemories(): void {
    this.memories = [];
    saveStoredMemories(this.memories);
    this.notify();
  }

  // ==========================================
  // 6. MIND & BEHAVIOR OBSERVATIONS
  // ==========================================

  public getMindState() {
    return { ...this.mindState };
  }

  public setMindState(state: SpideyMindState, details?: string) {
    this.mindState = {
      state,
      details,
      timestamp: Date.now(),
    };
    this.notify();
  }

  /**
   * Lightweight pattern-recognition layer:
   * Analyzes tasks and workflow history to compute observant insights about Anas/Kiri.
   */
  public getBehaviorInsights(): string[] {
    const insights: string[] = [];
    const now = new Date();
    const currentHour = now.getHours();

    // 1. Completion rate / momentum
    const completedTasks = this.tasks.filter((t) => t.completed);
    const overdueTasks = this.getOverdueTasks();

    if (completedTasks.length >= 3 && overdueTasks.length === 0) {
      insights.push('Has maintained solid execution momentum with zero overdue tasks lingering.');
    } else if (overdueTasks.length >= 3) {
      insights.push(`Has ${overdueTasks.length} tasks currently overdue carrying over.`);
    }

    // 2. Workout & Study frequency
    const workoutTasks = this.tasks.filter((t) => 
      t.title.toLowerCase().includes('workout') || 
      t.title.toLowerCase().includes('press') || 
      t.title.toLowerCase().includes('gym') ||
      t.groupId === 'group-workout'
    );
    if (workoutTasks.length > 0) {
      const completedWorkouts = workoutTasks.filter((t) => t.completed).length;
      insights.push(`Active workout habits tracked (${completedWorkouts}/${workoutTasks.length} sessions completed).`);
    }

    const studyTasks = this.tasks.filter((t) =>
      t.groupId === 'group-study' ||
      /math|physics|biology|english|sre|code|programming|algorithm|esp32|arduino/i.test(t.title)
    );
    if (studyTasks.length > 0) {
      insights.push(`Consistent study & engineering topics in rotation (STEM, SRE prep, maker hardware, advanced language).`);
    }

    // 3. Time pattern
    if (currentHour >= 23 || currentHour < 5) {
      insights.push('Currently working during a late-night / midnight focus block.');
    }

    return insights;
  }

  // ==========================================
  // 7. CALENDAR DATA AGGREGATION
  // ==========================================

  /**
   * Computes a full matrix of calendar days for a given year and month (0-indexed month)
   */
  public getCalendarData(year: number, month: number): CalendarDaySummary[] {
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();
    const startDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7; // Monday = 0

    const todayStr = getTodayDateString();
    const days: CalendarDaySummary[] = [];

    // Previous month padding
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const dayNum = prevMonthLastDay - i;
      const prevDate = new Date(year, month - 1, dayNum);
      const dateStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      const dayTasks = this.getTasksForDate(dateStr);
      days.push({
        date: dateStr,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        dayNumber: dayNum,
        tasks: dayTasks,
        hasTasks: dayTasks.length > 0,
        completedCount: dayTasks.filter((t) => t.completed).length,
        totalCount: dayTasks.length,
        hasOverdue: dayTasks.some((t) => isTaskOverdue(t)),
      });
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayTasks = this.getTasksForDate(dateStr);
      days.push({
        date: dateStr,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        dayNumber: day,
        tasks: dayTasks,
        hasTasks: dayTasks.length > 0,
        completedCount: dayTasks.filter((t) => t.completed).length,
        totalCount: dayTasks.length,
        hasOverdue: dayTasks.some((t) => isTaskOverdue(t)),
      });
    }

    // Next month padding to complete 35 or 42 grid cells
    const totalCells = days.length <= 35 ? 35 : 42;
    const remaining = totalCells - days.length;
    for (let day = 1; day <= remaining; day++) {
      const nextDate = new Date(year, month + 1, day);
      const dateStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayTasks = this.getTasksForDate(dateStr);
      days.push({
        date: dateStr,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        dayNumber: day,
        tasks: dayTasks,
        hasTasks: dayTasks.length > 0,
        completedCount: dayTasks.filter((t) => t.completed).length,
        totalCount: dayTasks.length,
        hasOverdue: dayTasks.some((t) => isTaskOverdue(t)),
      });
    }

    return days;
  }
}

// Export singleton instance
export const spideyApi = new SpideyApiService();

// Expose on window for direct access by local AI scripts/devtools
if (typeof window !== 'undefined') {
  (window as any).spidey = spideyApi;
}
