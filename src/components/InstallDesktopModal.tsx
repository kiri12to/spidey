import React from 'react';
import { X, Download, Monitor, CheckCircle, ArrowRight, Chrome, ShieldCheck } from 'lucide-react';

interface InstallDesktopModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInstallClick?: () => void;
  hasNativePrompt?: boolean;
}

export const InstallDesktopModal: React.FC<InstallDesktopModalProps> = ({
  isOpen,
  onClose,
  onInstallClick,
  hasNativePrompt,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="w-full max-w-lg bg-[#0d0d10] border border-neutral-800 rounded-xl shadow-2xl p-6 relative text-zinc-200 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-neutral-800 transition"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header with Spidey Icon */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-red-500 shadow-md">
            <Monitor className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold font-heading text-zinc-100 uppercase tracking-wider">
              Install Spidey on Desktop PC
            </h3>
            <p className="text-xs font-mono-code text-zinc-400">
              Run as a standalone, native-speed desktop application
            </p>
          </div>
        </div>

        {/* Desktop Highlights */}
        <div className="grid grid-cols-2 gap-2.5 mb-5 text-xs font-mono-code">
          <div className="p-2.5 rounded-lg bg-neutral-950/70 border border-neutral-800/80 flex items-start gap-2">
            <CheckCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
            <span className="text-zinc-300">Dedicated Window & Taskbar Icon</span>
          </div>
          <div className="p-2.5 rounded-lg bg-neutral-950/70 border border-neutral-800/80 flex items-start gap-2">
            <CheckCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
            <span className="text-zinc-300">100% Offline Capable</span>
          </div>
          <div className="p-2.5 rounded-lg bg-neutral-950/70 border border-neutral-800/80 flex items-start gap-2">
            <CheckCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
            <span className="text-zinc-300">Google Tasks Realtime Sync</span>
          </div>
          <div className="p-2.5 rounded-lg bg-neutral-950/70 border border-neutral-800/80 flex items-start gap-2">
            <CheckCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
            <span className="text-zinc-300">Local AI / Ollama Ready</span>
          </div>
        </div>

        {/* Action button if native prompt ready */}
        {hasNativePrompt ? (
          <div className="mb-5">
            <button
              onClick={() => {
                if (onInstallClick) onInstallClick();
                onClose();
              }}
              className="w-full py-2.5 px-4 rounded-lg bg-red-900/80 hover:bg-red-800 text-zinc-100 text-sm font-medium font-mono-code flex items-center justify-center gap-2 border border-red-800/80 shadow-lg transition"
            >
              <Download className="w-4 h-4" />
              <span>Install Spidey Desktop App Now</span>
            </button>
          </div>
        ) : null}

        {/* Browser Installation Guide */}
        <div className="space-y-2.5 pt-3 border-t border-neutral-800/80">
          <p className="text-xs font-semibold text-zinc-200 font-heading">
            Manual Installation on Windows / macOS / Linux:
          </p>

          <div className="space-y-2 text-xs font-mono-code text-zinc-400">
            <div className="p-2 rounded bg-neutral-950/50 border border-neutral-800/60 flex items-center justify-between">
              <span className="text-zinc-300">Chrome / Brave</span>
              <span className="text-[11px] text-zinc-400">
                Click the <strong className="text-zinc-200">Install icon (⊕)</strong> in the URL address bar
              </span>
            </div>

            <div className="p-2 rounded bg-neutral-950/50 border border-neutral-800/60 flex items-center justify-between">
              <span className="text-zinc-300">Microsoft Edge</span>
              <span className="text-[11px] text-zinc-400">
                Menu (⋯) &gt; <strong className="text-zinc-200">Apps &gt; Install this site as an app</strong>
              </span>
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-xs font-mono-code text-zinc-300 border border-neutral-800 transition"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
