export type Priority = 'low' | 'medium' | 'high';
export type TaskSource = 'local' | 'google_tasks';

export interface Task {
  id: string;
  title: string;
  notes?: string;
  description?: string; // alias for notes
  dueDate: string; // YYYY-MM-DD or empty
  dueTime?: string; // HH:MM or empty
  completed: boolean;
  completedAt?: string;
  priority: Priority;
  groupId?: string | null; // null for standalone task
  order: number;
  createdAt: string;
  updatedAt: string;
  source?: TaskSource;
  externalId?: string; // e.g. Google Task ID
  googleTaskId?: string;
  googleTaskListId?: string;
  syncedAt?: string;
  estimatedMinutes?: number;
}

export interface TaskGroup {
  id: string;
  name: string;
  color?: string;
  collapsed?: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
  googleTaskListId?: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  pinned?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type TimerMode = 'work' | 'break' | 'custom';

export interface TimerState {
  taskId?: string | null;
  taskTitle?: string | null;
  durationSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
  mode: TimerMode;
  startedAt?: number | null;
  originalDuration: number;
}

export interface LocalAiSettings {
  enabled: boolean;
  provider?: 'ollama' | 'openai';
  baseUrl: string;
  /** @deprecated legacy key still present in old localStorage payloads */
  endpointUrl?: string;
  modelName: string;
  contextSize?: number;
  temperature?: number;
  /**
   * Persona ONLY. This is layered on top of the tool contract, it does not
   * replace it. Editing this can change how Spidey talks; it can never
   * accidentally disable her hands.
   */
  personaPrompt?: string;
  /** @deprecated old field that used to nuke the whole system prompt */
  customSystemPrompt?: string;
}

export interface UserSettings {
  pomodoroWorkDuration: number; // in minutes (default 25)
  pomodoroBreakDuration: number; // in minutes (default 5)
  soundEnabled: boolean;
  ambientRainEnabled: boolean;
  browserNotifications: boolean;
  autoSyncGoogleTasks: boolean;
  userName: string; // "Anas"
  spiderCompanionEnabled: boolean;
  spiderSize: 'small' | 'medium' | 'large';
  localAi: LocalAiSettings;
}

export interface GoogleSyncState {
  isAuthenticated: boolean;
  userEmail?: string;
  userName?: string;
  userPhoto?: string;
  isSyncing: boolean;
  lastSyncedAt?: string;
  syncError?: string | null;
  /** Silent refresh failed — the user must click through consent again. */
  needsReauth?: boolean;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'spidey';
  text: string;
  timestamp: string;
  actionExecuted?: {
    type: 'create_task' | 'complete_task' | 'delete_task' | 'start_timer' | 'create_note' | 'delete_note' | 'create_group' | 'delete_group' | 'rename_group' | 'move_to_group' | 'sync' | 'toggle_rain' | 'web_search';
    details: string;
  };
  modelUsed?: string;
  isFallback?: boolean;
  isError?: boolean;
}

export type AppTab = 'today' | 'calendar' | 'notes' | 'timer' | 'assistant';