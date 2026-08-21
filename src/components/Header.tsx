import React from 'react';
import { 
  Plus, 
  RefreshCw, 
  Settings, 
  Cloud, 
  CloudOff, 
  CloudRain, 
  Volume2, 
  VolumeX, 
  Download,
  Bot
} from 'lucide-react';
import { GoogleSyncState, AppTab } from '../types';

interface HeaderProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  onOpenAddModal: () => void;
  onOpenSettings: () => void;
  onOpenAssistant: () => void;
  syncState: GoogleSyncState;
  onManualSync: () => void;
  ambientRainEnabled: boolean;
  onToggleRain: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  canInstallApp?: boolean;
  onInstallApp?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  onOpenAddModal,
  onOpenSettings,
  onOpenAssistant,
  syncState,
  onManualSync,
  ambientRainEnabled,
  onToggleRain,
  soundEnabled,
  onToggleSound,
  canInstallApp,
  onInstallApp,
}) => {
  return (
    <header className="sticky top-0 z-30 w-full bg-[#08080a]/95 backdrop-blur-md border-b border-neutral-800/60 transition-colors">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        {/* Left: Subtle Brand & Navigation */}
        <div className="flex items-center gap-4 sm:gap-6">
          {/* Subtle Brand Logo */}
          <div 
            onClick={() => onSelectTab('today')}
            className="flex items-center gap-2 cursor-pointer select-none group"
          >
            <div className="relative flex items-center justify-center w-7 h-7 rounded-md bg-neutral-900 border border-neutral-800 transition group-hover:border-neutral-700">
              {/* Minimal spider thread glyph */}
              <svg
                className="w-3.5 h-3.5 text-red-500/90 transition-transform duration-300 group-hover:scale-105"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="2" fill="currentColor" />
                <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M5.6 18.4L18.4 5.6" strokeWidth="1.2" opacity="0.5" />
              </svg>
            </div>
            <span className="font-heading font-bold text-sm tracking-widest text-zinc-100 uppercase">
              SPIDEY
            </span>
          </div>

          {/* Clean Main Navigation Tabs */}
          <nav className="flex items-center gap-1">
            <button
              onClick={() => onSelectTab('today')}
              className={`px-2.5 py-1 rounded-md text-xs font-mono-code transition ${
                activeTab === 'today'
                  ? 'bg-neutral-800 text-zinc-100 font-medium'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-neutral-900/60'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => onSelectTab('calendar')}
              className={`px-2.5 py-1 rounded-md text-xs font-mono-code transition ${
                activeTab === 'calendar'
                  ? 'bg-neutral-800 text-zinc-100 font-medium'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-neutral-900/60'
              }`}
            >
              Calendar
            </button>
            <button
              onClick={() => onSelectTab('notes')}
              className={`px-2.5 py-1 rounded-md text-xs font-mono-code transition ${
                activeTab === 'notes'
                  ? 'bg-neutral-800 text-zinc-100 font-medium'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-neutral-900/60'
              }`}
            >
              Notes
            </button>
            <button
              onClick={() => onSelectTab('timer')}
              className={`px-2.5 py-1 rounded-md text-xs font-mono-code transition ${
                activeTab === 'timer'
                  ? 'bg-neutral-800 text-zinc-100 font-medium'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-neutral-900/60'
              }`}
            >
              Timer
            </button>
          </nav>
        </div>

        {/* Right: Quick actions and controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Spidey Assistant Button */}
          <button
            onClick={onOpenAssistant}
            title="Talk with Spidey"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-neutral-900/90 hover:bg-neutral-800 border border-neutral-800 text-xs font-mono-code text-zinc-200 hover:border-neutral-700 transition cursor-pointer"
          >
            <Bot className="w-3.5 h-3.5 text-red-400" />
            <span className="hidden md:inline text-[11px] font-medium">Spidey</span>
          </button>

          {/* Install / Download App Button (for PC PWA) */}
          {onInstallApp && (
            <button
              onClick={onInstallApp}
              title="Install Spidey as Desktop App on PC"
              className="p-1.5 rounded-md bg-neutral-900/80 border border-neutral-800/80 text-zinc-400 hover:text-zinc-200 hover:border-neutral-700 transition"
            >
              <Download className="w-3.5 h-3.5 text-zinc-400 hover:text-zinc-100" />
            </button>
          )}

          {/* Ambient Rain Atmosphere Toggle */}
          <button
            onClick={onToggleRain}
            title={ambientRainEnabled ? 'Turn off ambient rain' : 'Turn on ambient rain'}
            className={`p-1.5 rounded-md border text-xs transition ${
              ambientRainEnabled
                ? 'bg-neutral-800 text-red-400 border-red-950/80'
                : 'bg-neutral-900/80 text-zinc-400 border-neutral-800/80 hover:text-zinc-200'
            }`}
          >
            <CloudRain className="w-3.5 h-3.5" />
          </button>

          {/* Sound Toggle */}
          <button
            onClick={onToggleSound}
            title={soundEnabled ? 'Mute chimes' : 'Enable chimes'}
            className={`p-1.5 rounded-md border text-xs transition ${
              soundEnabled
                ? 'bg-neutral-900/80 text-zinc-300 border-neutral-800/80 hover:text-white'
                : 'bg-neutral-900/40 text-zinc-600 border-neutral-900'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>

          {/* Google Tasks Sync Indicator */}
          <button
            onClick={onManualSync}
            disabled={syncState.isSyncing}
            title={
              syncState.isAuthenticated
                ? `Google Tasks Connected ${syncState.lastSyncedAt ? `(synced ${new Date(syncState.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` : ''}`
                : 'Google Tasks Sync (Offline)'
            }
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-mono-code transition ${
              syncState.isAuthenticated
                ? 'bg-neutral-900/80 text-zinc-300 border-neutral-800/80 hover:border-neutral-700'
                : 'bg-neutral-950/40 text-zinc-500 border-neutral-900'
            }`}
          >
            {syncState.isSyncing ? (
              <RefreshCw className="w-3 h-3 text-red-400 animate-spin" />
            ) : syncState.isAuthenticated ? (
              <Cloud className="w-3 h-3 text-emerald-400/80" />
            ) : (
              <CloudOff className="w-3 h-3 text-zinc-600" />
            )}
            <span className="hidden sm:inline text-[11px]">
              {syncState.isSyncing ? 'Syncing' : syncState.isAuthenticated ? 'Synced' : 'Offline'}
            </span>
          </button>

          {/* Settings Trigger */}
          <button
            onClick={onOpenSettings}
            title="Settings & Integrations"
            className="p-1.5 rounded-md bg-neutral-900/80 border border-neutral-800/80 text-zinc-400 hover:text-zinc-200 hover:border-neutral-700 transition"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>

          {/* Quick Add Button */}
          <button
            onClick={onOpenAddModal}
            className="flex items-center gap-1 px-2.5 py-1 bg-red-800 hover:bg-red-700 text-white text-xs font-medium rounded-md shadow transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="text-[11px] font-mono-code">Add</span>
          </button>
        </div>
      </div>
    </header>
  );
};

