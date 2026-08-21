import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Calendar, Clock, Flag, FolderPlus } from 'lucide-react';
import { Task, TaskGroup, Priority } from '../types';
import { getTodayDateString } from '../services/storage';

interface AddTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  groups: TaskGroup[];
  defaultGroupId?: string | null;
  defaultDueDate?: string;
  onAddTask: (taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'order'>) => void;
  onAddGroup: (name: string) => void;
}

export const AddTaskModal: React.FC<AddTaskModalProps> = ({
  isOpen,
  onClose,
  groups,
  defaultGroupId,
  defaultDueDate,
  onAddTask,
  onAddGroup,
}) => {
  const [mode, setMode] = useState<'task' | 'group'>('task');
  
  // Task form state
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState(defaultDueDate || getTodayDateString());
  const [dueTime, setDueTime] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(defaultGroupId || null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Group form state
  const [groupName, setGroupName] = useState('');

  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setNotes('');
      setGroupName('');
      setDueDate(defaultDueDate || getTodayDateString());
      setDueTime('');
      setPriority('medium');
      setSelectedGroupId(defaultGroupId || null);
      setShowAdvanced(false);

      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, defaultGroupId, defaultDueDate]);

  if (!isOpen) return null;

  const handleSubmitTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onAddTask({
      title: title.trim(),
      notes: notes.trim() || undefined,
      description: notes.trim() || undefined,
      dueDate: dueDate || getTodayDateString(),
      dueTime: dueTime.trim() || undefined,
      completed: false,
      priority,
      groupId: selectedGroupId,
      source: 'local',
    });

    onClose();
  };

  const handleSubmitGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;

    onAddGroup(groupName.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg rounded-2xl bg-[#101014] border border-neutral-800 p-5 sm:p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-neutral-800 transition"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Mode Selector Tabs (Task vs Group) */}
        <div className="flex items-center gap-2 mb-5 border-b border-neutral-800/80 pb-3">
          <button
            type="button"
            onClick={() => setMode('task')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono-code font-semibold tracking-wider uppercase transition ${
              mode === 'task'
                ? 'bg-neutral-800 text-zinc-100 border border-neutral-700'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            New Task
          </button>
          <button
            type="button"
            onClick={() => setMode('group')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono-code font-semibold tracking-wider uppercase transition ${
              mode === 'group'
                ? 'bg-neutral-800 text-zinc-100 border border-neutral-700'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            New Group
          </button>
        </div>

        {/* Task Form */}
        {mode === 'task' ? (
          <form onSubmit={handleSubmitTask} className="space-y-4">
            <div>
              <input
                ref={inputRef}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What needs to be done?"
                className="w-full px-3.5 py-2.5 bg-neutral-950/80 border border-neutral-800 rounded-xl text-zinc-100 placeholder-zinc-600 text-sm focus:outline-none focus:border-neutral-600 transition"
                required
              />
            </div>

            {/* Group Selector & Priority */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-mono-code text-zinc-400 mb-1">
                  Assign Group
                </label>
                <select
                  value={selectedGroupId || ''}
                  onChange={(e) => setSelectedGroupId(e.target.value ? e.target.value : null)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs font-mono-code text-zinc-200 focus:outline-none focus:border-neutral-700"
                >
                  <option value="">Standalone (No group)</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono-code text-zinc-400 mb-1">
                  Priority
                </label>
                <div className="flex items-center gap-1.5">
                  {(['low', 'medium', 'high'] as Priority[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={`flex-1 py-1.5 text-xs font-mono-code capitalize rounded border transition ${
                        priority === p
                          ? p === 'high'
                            ? 'bg-red-950/70 text-red-300 border-red-900 font-semibold'
                            : 'bg-neutral-800 text-zinc-100 border-neutral-700 font-semibold'
                          : 'bg-neutral-950 text-zinc-500 border-neutral-800 hover:text-zinc-300'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Date & Time fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-mono-code text-zinc-400 mb-1 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                  Due Date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs font-mono-code text-zinc-200 focus:outline-none focus:border-neutral-700"
                />
              </div>

              <div>
                <label className="block text-xs font-mono-code text-zinc-400 mb-1 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-zinc-500" />
                  Due Time (Optional)
                </label>
                <input
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs font-mono-code text-zinc-200 focus:outline-none focus:border-neutral-700"
                />
              </div>
            </div>

            {/* Notes Expandable */}
            <div>
              {!showAdvanced ? (
                <button
                  type="button"
                  onClick={() => setShowAdvanced(true)}
                  className="text-xs font-mono-code text-zinc-500 hover:text-zinc-300 transition flex items-center gap-1"
                >
                  <Plus className="w-3 h-3 text-red-400" />
                  Add description / details
                </button>
              ) : (
                <div>
                  <label className="block text-xs font-mono-code text-zinc-400 mb-1">
                    Details & Notes
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Details, references or sub-tasks..."
                    className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs font-mono-code text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-neutral-700"
                  />
                </div>
              )}
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800/80">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-zinc-300 text-xs font-mono-code rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-red-800 hover:bg-red-700 text-white text-xs font-medium uppercase tracking-wider font-mono-code rounded-lg shadow transition cursor-pointer"
              >
                Add Task
              </button>
            </div>
          </form>
        ) : (
          /* Group Form */
          <form onSubmit={handleSubmitGroup} className="space-y-4">
            <div>
              <label className="block text-xs font-mono-code text-zinc-400 mb-1">
                Group Name
              </label>
              <input
                ref={inputRef}
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g. WORKOUT, STUDY, READ"
                className="w-full px-3.5 py-2.5 bg-neutral-950/80 border border-neutral-800 rounded-xl text-zinc-100 placeholder-zinc-600 text-sm focus:outline-none focus:border-neutral-600"
                required
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800/80">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-zinc-300 text-xs font-mono-code rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-red-800 hover:bg-red-700 text-white text-xs font-medium uppercase tracking-wider font-mono-code rounded-lg shadow transition cursor-pointer"
              >
                Create Group
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
