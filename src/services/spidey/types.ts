import { Task, TaskGroup, Note, TimerState, LocalAiSettings, ChatMessage } from '../../types';

export interface SpideyMemoryItem {
  id: string;
  fact: string;
  tags?: string[];
  importance?: number; // 1-5
  createdAt: string;
  lastAccessedAt?: string;
  hitCount?: number;
}

export interface SpideyToolParam {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array';
  description: string;
  required?: boolean;
  enum?: string[];
}

export interface SpideyToolDefinition {
  name: string;
  description: string;
  parameters: SpideyToolParam[];
}

export interface SpideyToolCall {
  toolName: string;
  arguments: Record<string, any>;
}

export interface SpideyExecutionResult {
  toolName: string;
  success: boolean;
  message: string;
  data?: any;
  actionType?: ChatMessage['actionExecuted']['type'];
  actionDetails?: string;
}

export interface SpideyWorldState {
  timestamp: number;
  localTime: string;
  todayDate: string;
  dayOfWeek: string;
  currentHour: number;
  userName: string;
  nickname: string;
  groups: TaskGroup[];
  pendingTasks: Task[];
  completedTodayTasks: Task[];
  overdueTasks: Task[];
  activeTimer: TimerState;
  relevantMemories: string[];
  behaviorInsights: string[];
  recentNotes: Note[];
}

export type SpideyMindState = 'idle' | 'thinking' | 'speaking' | 'focusing' | 'celebrating' | 'curious';

export interface SpideyOrchestrationResult {
  reply: string;
  toolsExecuted: SpideyExecutionResult[];
  actionExecuted?: ChatMessage['actionExecuted'];
  modelUsed?: string;
  isFallback?: boolean;
  fallbackReason?: string;
}
