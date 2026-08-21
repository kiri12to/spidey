import React, { useState, useEffect } from 'react';
import { X, FolderEdit } from 'lucide-react';
import { TaskGroup } from '../types';

interface RenameGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: TaskGroup | null;
  onRename: (groupId: string, newName: string) => void;
}

export const RenameGroupModal: React.FC<RenameGroupModalProps> = ({
  isOpen,
  onClose,
  group,
  onRename,
}) => {
  const [name, setName] = useState('');

  useEffect(() => {
    if (group) {
      setName(group.name);
    }
  }, [group]);

  if (!isOpen || !group) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onRename(group.id, name.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-md rounded-2xl bg-[#111114] border border-neutral-800 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-neutral-800 transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 mb-4">
          <FolderEdit className="w-5 h-5 text-red-400" />
          <h3 className="font-heading font-bold text-base text-zinc-100 uppercase tracking-wide">
            Rename Group
          </h3>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono-code text-zinc-400 mb-1">
              Group Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-700 rounded-xl text-zinc-100 text-sm focus:outline-none focus:border-red-600"
              required
              autoFocus
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-zinc-300 text-xs font-mono-code rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-red-700 hover:bg-red-600 text-white text-xs font-semibold uppercase tracking-wider font-mono-code rounded-lg transition"
            >
              Rename
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
