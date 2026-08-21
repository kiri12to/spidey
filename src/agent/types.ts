// Clean Architecture Core Types for Local AI & Agent Engine
import { Priority, Task, TaskGroup, Note, TimerState, LocalAiSettings, UserSettings, ChatMessage } from '../types';

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ModelCallPayload {
  messages: ModelMessage[];
  localAi: LocalAiSettings;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface ModelResponse {
  content: string;
  toolCalls: ToolCall[];
  raw?: any;
}

export interface ToolCall {
  toolName: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  toolName: string;
  success: boolean;
  message: string;
  data?: any;
  actionType?: 'create_task' | 'complete_task' | 'delete_task' | 'start_timer' | 'create_note' | 'delete_note' | 'create_group' | 'delete_group' | 'rename_group' | 'move_to_group' | 'sync' | 'toggle_rain' | 'web_search';
  actionDetails?: string;
}

export type RoutingTier = 'fast' | 'deep';

export interface AgentContext {
  currentTime: string;
  todayDate: string;
  dayOfWeek: string;
  currentHour: number;
  userName: string;
  tasks: Task[];
  groups: TaskGroup[];
  notes: Note[];
  timer: TimerState;
  memories: string[];
}
