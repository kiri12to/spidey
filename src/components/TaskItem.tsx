import React, { useState } from 'react';
import { 
  Check, 
  Play, 
  Clock, 
  Calendar, 
  Trash2, 
  Edit2, 
  ArrowUp, 
  ArrowDown, 
  Cloud, 
  AlignLeft,
  AlertCircle
} from 'lucide-react';
import { Task, Priority } from '../types';
import { playTaskCompleteSound } from '../services/sound';
import { isTaskOverdue } from '../services/storage';

interface TaskItemProps {
  task: Task;
  onToggleComplete: (task: Task) => void;
  onStartTimer: (task: Task) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
  onMoveUp?: (task: Task) => void;
  onMoveDown?: (task: Task) => void;
  soundEnabled: boolean;
  isFirst?: boolean;
  isLast?: boolean;
}

export const TaskItem: React.FC<TaskItemProps> = ({
  task,
  onToggleComplete,
  onStartTimer,
  onEditTask,
  onDeleteTask,
  onMoveUp,
  onMoveDown,
  soundEnabled,
  isFirst,
  isLast,
}) => {
  const [showNotes, setShowNotes] = useState(false);
  const overdue = isTaskOverdue(task);

  const handleToggle = () => {
    if (!task.completed && soundEnabled) {
      playTaskCompleteSound();
    }
    onToggleComplete(task);
  };

  const getPriorityBadge = (priority: Priority) => {
    switch (priority) {
      case 'high':
        return (
          <span className="text-[10px] font-mono-code text-red-300/90 bg-red-950/40 border border-red-900/40 px-1.5 py-0.5 rounded">
            High
          </span>
        );
      case 'medium':
        return (
          <span className="text-[10px] font-mono-code text-zinc-400 bg-neutral-900 border border-neutral-800 px-1.5 py-0.5 rounded">
            Med
          </span>
        );
      case 'low':
      default:
        return null;
    }
  };

  return (
    <div
      id={`task-item-${task.id}`}
      className={`group relative rounded-lg border transition-all duration-150 ${
        task.completed
          ? 'bg-neutral-950/40 border-neutral-900 opacity-60'
          : overdue
          ? 'bg-[#130f11] border-red-950/80 hover:border-red-900/80'
          : 'bg-[#111115] border-neutral-800/80 hover:border-neutral-700/80 hover:bg-[#141419]'
      }`}
    >
      <div className="flex items-center gap-3 p-2.5 sm:p-3">
        {/* Subtle Checkbox */}
        <button
          onClick={handleToggle}
          className={`relative flex-shrink-0 w-4 h-4 rounded border transition-all flex items-center justify-center cursor-pointer ${
            task.completed
              ? 'bg-red-900 border-red-700 text-white'
              : 'border-neutral-700 hover:border-red-500 bg-neutral-950'
          }`}
          title={task.completed ? 'Mark as incomplete' : 'Mark as completed'}
        >
          {task.completed && <Check className="w-3 h-3 stroke-[3]" />}
        </button>

        {/* Task Title & Metadata */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              id={`task-title-${task.id}`}
              onClick={handleToggle}
              className={`text-xs sm:text-sm font-medium cursor-pointer transition-colors ${
                task.completed
                  ? 'line-through text-zinc-500'
                  : overdue
                  ? 'text-red-200 hover:text-white'
                  : 'text-zinc-100 hover:text-red-200'
              }`}
            >
              {task.title}
            </span>

            {/* Overdue Warning Indicator */}
            {overdue && (
              <span 
                className="inline-flex items-center gap-1 text-[10px] font-mono-code text-red-400 bg-red-950/50 border border-red-900/50 px-1.5 py-0.2 rounded"
                title="This task is past its scheduled due date/time"
              >
                <AlertCircle className="w-2.5 h-2.5 text-red-400" />
                <span>Overdue</span>
              </span>
            )}

            {getPriorityBadge(task.priority)}

            {/* Google Tasks Synced Tag */}
            {task.googleTaskId && (
              <span
                title="Synced with Google Tasks"
                className="inline-flex items-center gap-1 text-[10px] font-mono-code text-zinc-400 bg-neutral-900 border border-neutral-800 px-1.5 py-0.5 rounded"
              >
                <Cloud className="w-2.5 h-2.5 text-emerald-400/80" />
                <span className="hidden sm:inline">G-Tasks</span>
              </span>
            )}
          </div>

          {/* Secondary info: due date, due time, notes preview */}
          <div className="flex items-center gap-3 mt-1 text-[11px] font-mono-code text-zinc-500">
            {task.dueDate && (
              <span className={`flex items-center gap-1 ${overdue ? 'text-red-400/80' : 'text-zinc-400'}`}>
                <Calendar className="w-2.5 h-2.5" />
                {task.dueDate}
              </span>
            )}

            {task.dueTime && (
              <span className={`flex items-center gap-1 ${overdue ? 'text-red-400/80' : 'text-zinc-400'}`}>
                <Clock className="w-2.5 h-2.5" />
                {task.dueTime}
              </span>
            )}

            {task.notes && (
              <button
                onClick={() => setShowNotes(!showNotes)}
                className="flex items-center gap-1 text-zinc-500 hover:text-zinc-300 transition"
              >
                <AlignLeft className="w-2.5 h-2.5" />
                <span>{showNotes ? 'Hide note' : 'Note'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          {/* Start Timer for this Task */}
          {!task.completed && (
            <button
              onClick={() => onStartTimer(task)}
              title="Start Timer for this task"
              className="flex items-center gap-1 px-2 py-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700/80 text-zinc-200 rounded text-xs font-mono-code transition cursor-pointer"
            >
              <Play className="w-2.5 h-2.5 fill-current text-red-400" />
              <span className="hidden sm:inline">Timer</span>
            </button>
          )}

          {/* Reordering Controls */}
          {onMoveUp && !isFirst && (
            <button
              onClick={() => onMoveUp(task)}
              title="Move up"
              className="p-1 text-zinc-500 hover:text-zinc-200 hover:bg-neutral-800 rounded transition"
            >
              <ArrowUp className="w-3 h-3" />
            </button>
          )}
          {onMoveDown && !isLast && (
            <button
              onClick={() => onMoveDown(task)}
              title="Move down"
              className="p-1 text-zinc-500 hover:text-zinc-200 hover:bg-neutral-800 rounded transition"
            >
              <ArrowDown className="w-3 h-3" />
            </button>
          )}

          {/* Edit */}
          <button
            onClick={() => onEditTask(task)}
            title="Edit task"
            className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-neutral-800 rounded transition"
          >
            <Edit2 className="w-3 h-3" />
          </button>

          {/* Delete */}
          <button
            onClick={() => onDeleteTask(task)}
            title="Delete task"
            className="p-1 text-zinc-400 hover:text-red-400 hover:bg-neutral-800 rounded transition"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Expanded Notes Section */}
      {showNotes && task.notes && (
        <div className="px-3 pb-2.5 pt-1 border-t border-neutral-800/60 text-xs font-mono-code text-zinc-300 leading-relaxed bg-neutral-950/50 rounded-b-lg">
          <p className="whitespace-pre-wrap text-[11px] text-zinc-400">{task.notes}</p>
        </div>
      )}
    </div>
  );
};
