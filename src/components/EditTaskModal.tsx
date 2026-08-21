import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, Flag, Folder } from 'lucide-react';
import { Task, TaskGroup, Priority } from '../types';

interface EditTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  groups: TaskGroup[];
  onSaveTask: (updatedTask: Task) => void;
}

export const EditTaskModal: React.FC<EditTaskModalProps> = ({
  isOpen,
  onClose,
  task,
  groups,
  onSaveTask,
}) => {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [groupId, setGroupId] = useState<string | null>(null);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setNotes(task.notes || '');
      setDueDate(task.dueDate || '');
      setDueTime(task.dueTime || '');
      setPriority(task.priority || 'medium');
      setGroupId(task.groupId || null);
    }
  }, [task]);

  if (!isOpen || !task) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onSaveTask({
      ...task,
      title: title.trim(),
      notes: notes.trim() || undefined,
      description: notes.trim() || undefined,
      dueDate,
      dueTime: dueTime.trim() || undefined,
      priority,
      groupId: groupId || null,
      updatedAt: new Date().toISOString(),
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg rounded-2xl bg-[#101014] border border-neutral-800 p-5 sm:p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-neutral-800 transition"
        >
          <X className="w-4 h-4" />
        </button>

        <h3 className="font-heading font-semibold text-sm text-zinc-200 uppercase tracking-wider mb-4">
          Edit Task
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono-code text-zinc-400 mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-zinc-100 text-sm focus:outline-none focus:border-neutral-600"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono-code text-zinc-400 mb-1">
                Group
              </label>
              <select
                value={groupId || ''}
                onChange={(e) => setGroupId(e.target.value ? e.target.value : null)}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono-code text-zinc-400 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-zinc-500" /> Due Date
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
                <Clock className="w-3.5 h-3.5 text-zinc-500" /> Due Time
              </label>
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs font-mono-code text-zinc-200 focus:outline-none focus:border-neutral-700"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono-code text-zinc-400 mb-1">
              Details & Notes
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add details..."
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs font-mono-code text-zinc-200 focus:outline-none focus:border-neutral-700"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-800/80">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-zinc-300 text-xs font-mono-code rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-red-800 hover:bg-red-700 text-white text-xs font-medium uppercase tracking-wider font-mono-code rounded-lg transition"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
