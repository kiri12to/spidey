import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  isDestructive = true,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-md rounded-2xl bg-[#111114] border border-neutral-800 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-neutral-800 transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-4">
          <div className="p-2.5 rounded-xl bg-red-950/70 border border-red-900 text-red-400 flex-shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-heading font-bold text-base text-zinc-100 uppercase tracking-wide">
              {title}
            </h3>
            <p className="mt-2 text-xs font-mono-code text-zinc-400 leading-relaxed">
              {message}
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-neutral-800/80">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-zinc-300 text-xs font-mono-code rounded-lg transition"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-white text-xs font-mono-code font-semibold uppercase rounded-lg shadow-lg transition ${
              isDestructive
                ? 'bg-red-700 hover:bg-red-600 shadow-[0_0_12px_rgba(185,28,28,0.4)]'
                : 'bg-zinc-800 hover:bg-zinc-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
