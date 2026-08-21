import { Task, TaskGroup, Note, UserSettings, ChatMessage } from '../types';

const TASKS_KEY = 'spidey_tasks_v2';
const GROUPS_KEY = 'spidey_groups_v2';
const NOTES_KEY = 'spidey_notes_v2';
const MEMORIES_KEY = 'spidey_memories_v2';
const SETTINGS_KEY = 'spidey_settings_v2';
const CHAT_MESSAGES_KEY = 'spidey_chat_messages_v2';

export function getTodayDateString(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isTaskOverdue(task: Task): boolean {
  if (task.completed || !task.dueDate) return false;

  const todayStr = getTodayDateString();
  if (task.dueDate < todayStr) return true;

  if (task.dueDate === todayStr && task.dueTime) {
    const now = new Date();
    const currentHours = String(now.getHours()).padStart(2, '0');
    const currentMinutes = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${currentHours}:${currentMinutes}`;
    return task.dueTime < currentTimeStr;
  }

  return false;
}

export function getGreetingForUser(userName: string = 'Anas'): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) {
    return `Good morning, ${userName}.`;
  } else if (hour >= 12 && hour < 18) {
    return `Good afternoon, ${userName}.`;
  } else {
    return `Good evening, ${userName}.`;
  }
}

export const initialGroups: TaskGroup[] = [
  {
    id: 'group-workout',
    name: 'Workout',
    color: 'crimson',
    collapsed: false,
    order: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'group-study',
    name: 'Study',
    color: 'slate',
    collapsed: false,
    order: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export const initialTasks: Task[] = [
  {
    id: 'task-1',
    title: 'Study Mathematics',
    notes: 'Linear algebra, vector spaces & calculus problems',
    description: 'Linear algebra, vector spaces & calculus problems',
    dueDate: getTodayDateString(),
    dueTime: '14:00',
    completed: false,
    priority: 'high',
    groupId: null,
    order: 0,
    source: 'local',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    estimatedMinutes: 45,
  },
  {
    id: 'task-2',
    title: 'Work on Project',
    notes: 'Implement clean action layer and calendar sync',
    description: 'Implement clean action layer and calendar sync',
    dueDate: getTodayDateString(),
    dueTime: '16:30',
    completed: false,
    priority: 'high',
    groupId: null,
    order: 1,
    source: 'local',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    estimatedMinutes: 60,
  },
  {
    id: 'task-workout-1',
    title: 'Bench Press',
    notes: '4 sets of 8 reps',
    dueDate: getTodayDateString(),
    completed: false,
    priority: 'medium',
    groupId: 'group-workout',
    order: 0,
    source: 'local',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'task-workout-2',
    title: 'Incline Dumbbell Press',
    notes: '3 sets of 10-12 reps',
    dueDate: getTodayDateString(),
    completed: false,
    priority: 'medium',
    groupId: 'group-workout',
    order: 1,
    source: 'local',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'task-workout-3',
    title: 'Lateral Raises',
    notes: '4 sets of 15 reps',
    dueDate: getTodayDateString(),
    completed: true,
    completedAt: new Date().toISOString(),
    priority: 'low',
    groupId: 'group-workout',
    order: 2,
    source: 'local',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'task-study-1',
    title: 'Physics',
    notes: 'Electromagnetism problem set',
    dueDate: getTodayDateString(),
    completed: false,
    priority: 'medium',
    groupId: 'group-study',
    order: 0,
    source: 'local',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'task-study-2',
    title: 'Biology & Genetics',
    notes: 'Review molecular biology summary',
    dueDate: getTodayDateString(),
    completed: false,
    priority: 'low',
    groupId: 'group-study',
    order: 1,
    source: 'local',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export const initialNotes: Note[] = [
  {
    id: 'note-1',
    title: 'Project Architecture & Ideas',
    content: 'Building a clean, minimalist personal productivity companion.\n\nKey Principles:\n- Keep interface quiet and uncluttered\n- Local-first with Google Tasks synchronization\n- Action API ready for Spidey local assistant integration\n- Reliable date-based task queries',
    pinned: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'note-2',
    title: 'Study Topics & References',
    content: '1. Linear Algebra: Eigenvalues & Vector transformations\n2. Physics: Faraday\'s Law of induction\n3. Programming: Clean service architectures & local agent APIs',
    pinned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export const initialMemories: string[] = [
  'Anas (also goes by Kiri) is 22 years old and based in Morocco.',
  'Preparing to start a career as an English teacher, but his true dream is Site Reliability Engineering (SRE).',
  'Passionate about building software, maker hardware (Arduino, ESP32, small robotics, physical gadgets), and building this Spidey app.',
  'Loves expanding advanced English vocabulary and deep focus workflows.',
  'Prefers a direct, casual, no-fluff tone with zero corporate robotic clichés.',
];

export const defaultSettings: UserSettings = {
  pomodoroWorkDuration: 25,
  pomodoroBreakDuration: 5,
  soundEnabled: true,
  ambientRainEnabled: false,
  browserNotifications: false,
  autoSyncGoogleTasks: true,
  userName: 'Anas',
  spiderCompanionEnabled: true,
  spiderSize: 'medium',
  localAi: {
    enabled: true,
    endpointUrl: 'http://localhost:11434/api/chat',
    modelName: 'qwen3:8b',
    provider: 'ollama',
    customSystemPrompt: 'You are Spidey, a sharp, observant female AI companion and real friend to Anas in a noir-styled focus hub. You speak naturally, concisely, and with grounded confidence. No robot clichés or fake enthusiasm.',
  },
};

// Storage Loaders and Savers
export function loadStoredTasks(): Task[] {
  if (typeof window === 'undefined') return initialTasks;
  try {
    const raw = localStorage.getItem(TASKS_KEY) || localStorage.getItem('spidey_tasks_v1');
    if (!raw) {
      localStorage.setItem(TASKS_KEY, JSON.stringify(initialTasks));
      return initialTasks;
    }
    return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading stored tasks:', e);
    return initialTasks;
  }
}

export function saveStoredTasks(tasks: Task[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
  } catch (e) {
    console.error('Error saving tasks:', e);
  }
}

export function loadStoredGroups(): TaskGroup[] {
  if (typeof window === 'undefined') return initialGroups;
  try {
    const raw = localStorage.getItem(GROUPS_KEY) || localStorage.getItem('spidey_groups_v1');
    if (!raw) {
      localStorage.setItem(GROUPS_KEY, JSON.stringify(initialGroups));
      return initialGroups;
    }
    return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading stored groups:', e);
    return initialGroups;
  }
}

export function saveStoredGroups(groups: TaskGroup[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
  } catch (e) {
    console.error('Error saving groups:', e);
  }
}

export function loadStoredNotes(): Note[] {
  if (typeof window === 'undefined') return initialNotes;
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    if (!raw) {
      localStorage.setItem(NOTES_KEY, JSON.stringify(initialNotes));
      return initialNotes;
    }
    return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading stored notes:', e);
    return initialNotes;
  }
}

export function saveStoredNotes(notes: Note[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
  } catch (e) {
    console.error('Error saving notes:', e);
  }
}

export function loadStoredMemories(): string[] {
  if (typeof window === 'undefined') return initialMemories;
  try {
    const raw = localStorage.getItem(MEMORIES_KEY);
    if (!raw) {
      localStorage.setItem(MEMORIES_KEY, JSON.stringify(initialMemories));
      return initialMemories;
    }
    return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading stored memories:', e);
    return initialMemories;
  }
}

export function saveStoredMemories(memories: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MEMORIES_KEY, JSON.stringify(memories));
  } catch (e) {
    console.error('Error saving memories:', e);
  }
}

export function loadStoredSettings(): UserSettings {
  if (typeof window === 'undefined') return defaultSettings;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY) || localStorage.getItem('spidey_settings_v1');
    if (!raw) return defaultSettings;
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch (e) {
    console.error('Error loading stored settings:', e);
    return defaultSettings;
  }
}

export function saveStoredSettings(settings: UserSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Error saving settings:', e);
  }
}

export function loadStoredChatMessages(userName: string = 'Anas'): ChatMessage[] {
  if (typeof window === 'undefined') {
    return [
      {
        id: 'msg-init-1',
        sender: 'spidey',
        text: `Hey ${userName}. I'm here watching your timeline. What are we getting done?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ];
  }

  try {
    const raw = localStorage.getItem(CHAT_MESSAGES_KEY);
    if (!raw) {
      const initial: ChatMessage[] = [
        {
          id: 'msg-init-1',
          sender: 'spidey',
          text: `Hey ${userName}. I'm here watching your timeline. What are we getting done?`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ];
      localStorage.setItem(CHAT_MESSAGES_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (e) {
    console.error('Error loading stored chat messages:', e);
  }

  return [
    {
      id: 'msg-init-1',
      sender: 'spidey',
      text: `Hey ${userName}. I'm here watching your timeline. What are we getting done?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ];
}

export function saveStoredChatMessages(messages: ChatMessage[]): void {
  if (typeof window === 'undefined') return;
  try {
    // Keep max last 200 messages to prevent unbounded growth
    const capped = messages.slice(-200);
    localStorage.setItem(CHAT_MESSAGES_KEY, JSON.stringify(capped));
  } catch (e) {
    console.error('Error saving chat messages:', e);
  }
}

