import React, { useState } from 'react';
import { 
  ChevronDown, 
  ChevronRight, 
  Plus, 
  MoreHorizontal, 
  Trash2, 
  Edit2, 
  Folder
} from 'lucide-react';
import { Task, TaskGroup } from '../types';
import { TaskItem } from './TaskItem';

interface TaskGroupCardProps {
  group: TaskGroup;
  tasks: Task[];
  onToggleGroupCollapse: (groupId: string) => void;
  onAddTaskToGroup: (groupId: string) => void;
  onRenameGroup: (group: TaskGroup) => void;
  onDeleteGroup: (group: TaskGroup) => void;
  onToggleCompleteTask: (task: Task) => void;
  onStartTimer: (task: Task) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
  onReorderTasks: (groupId: string, fromIndex: number, toIndex: number) => void;
  soundEnabled: boolean;
}

export const TaskGroupCard: React.FC<TaskGroupCardProps> = ({
  group,
  tasks,
  onToggleGroupCollapse,
  onAddTaskToGroup,
  onRenameGroup,
  onDeleteGroup,
  onToggleCompleteTask,
  onStartTimer,
  onEditTask,
  onDeleteTask,
  onReorderTasks,
  soundEnabled,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const isCollapsed = group.collapsed ?? false;

  const completedCount = tasks.filter((t) => t.completed).length;
  const totalCount = tasks.length;

  const handleMoveTask = (task: Task, direction: 'up' | 'down') => {
    const currentIndex = tasks.findIndex((t) => t.id === task.id);
    if (currentIndex < 0) return;
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex >= 0 && targetIndex < tasks.length) {
      onReorderTasks(group.id, currentIndex, targetIndex);
    }
  };

  return (
    <div className="rounded-xl bg-[#0e0e12] border border-neutral-800/80 shadow-sm transition-all overflow-hidden">
      {/* Group Header */}
      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 sm:px-4 sm:py-3 bg-neutral-900/40 border-b border-neutral-800/50">
        <div
          onClick={() => onToggleGroupCollapse(group.id)}
          className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer select-none group"
        >
          <button
            className="p-1 rounded text-zinc-500 group-hover:text-zinc-300 transition"
            title={isCollapsed ? 'Expand group' : 'Collapse group'}
          >
            {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full bg-red-800/80" />
            <h3 className="font-heading font-semibold text-xs sm:text-sm text-zinc-200 uppercase tracking-wider truncate">
              {group.name}
            </h3>
          </div>

          <span className="text-[11px] font-mono-code text-zinc-500">
            ({completedCount}/{totalCount})
          </span>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-1.5">
          {/* Quick Add Task to this Group */}
          <button
            onClick={() => onAddTaskToGroup(group.id)}
            className="flex items-center gap-1 px-2 py-1 text-xs font-mono-code bg-neutral-900 hover:bg-neutral-800 text-zinc-300 hover:text-white rounded border border-neutral-800 transition cursor-pointer"
            title="Add task into this group"
          >
            <Plus className="w-3 h-3 text-red-400" />
            <span className="hidden sm:inline">Add</span>
          </button>

          {/* Group Options Menu */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 text-zinc-500 hover:text-zinc-300 hover:bg-neutral-800 rounded transition"
              title="Group options"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>

            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowMenu(false)}
                />
                <div className="absolute right-0 mt-1 w-32 bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl z-20 py-1 text-xs font-mono-code">
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onRenameGroup(group);
                    }}
                    className="w-full px-3 py-1.5 text-left text-zinc-300 hover:bg-neutral-800 hover:text-white flex items-center gap-2"
                  >
                    <Edit2 className="w-3 h-3" />
                    Rename
                  </button>
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onDeleteGroup(group);
                    }}
                    className="w-full px-3 py-1.5 text-left text-red-400 hover:bg-red-950/40 flex items-center gap-2"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Group Task Items */}
      {!isCollapsed && (
        <div className="p-3 space-y-2">
          {tasks.length === 0 ? (
            <div className="text-center py-4 border border-dashed border-neutral-800/60 rounded-lg">
              <p className="text-xs font-mono-code text-zinc-600 mb-1.5">No tasks in this group yet</p>
              <button
                onClick={() => onAddTaskToGroup(group.id)}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-neutral-900 hover:bg-neutral-800 text-zinc-300 text-xs font-mono-code rounded border border-neutral-800 transition"
              >
                <Plus className="w-3 h-3 text-red-400" />
                Add task
              </button>
            </div>
          ) : (
            tasks.map((task, idx) => (
              <TaskItem
                key={task.id}
                task={task}
                onToggleComplete={onToggleCompleteTask}
                onStartTimer={onStartTimer}
                onEditTask={onEditTask}
                onDeleteTask={onDeleteTask}
                onMoveUp={(t) => handleMoveTask(t, 'up')}
                onMoveDown={(t) => handleMoveTask(t, 'down')}
                soundEnabled={soundEnabled}
                isFirst={idx === 0}
                isLast={idx === tasks.length - 1}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};
