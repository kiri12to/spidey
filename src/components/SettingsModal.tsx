import React, { useState } from 'react';
import { X, Cloud, CloudOff, RefreshCw, Bell, Volume2, Download, Upload, RotateCcw, Check, LogOut, User as UserIcon } from 'lucide-react';
import { GoogleSyncState, UserSettings, Task, TaskGroup } from '../types';
import { requestNotificationPermission, getNotificationPermission, sendBrowserNotification } from '../services/notifications';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  syncState: GoogleSyncState;
  onConnectGoogle: () => void;
  onDisconnectGoogle: () => void;
  onManualSync: () => void;
  settings: UserSettings;
  onUpdateSettings: (newSettings: Partial<UserSettings>) => void;
  allTasks: Task[];
  allGroups: TaskGroup[];
  onImportData: (tasks: Task[], groups: TaskGroup[]) => void;
  onResetData: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  syncState,
  onConnectGoogle,
  onDisconnectGoogle,
  onManualSync,
  settings,
  onUpdateSettings,
  allTasks,
  allGroups,
  onImportData,
  onResetData,
}) => {
  const [notificationStatus, setNotificationStatus] = useState<string>(getNotificationPermission());
  const [copiedExport, setCopiedExport] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  if (!isOpen) return null;

  const handleRequestNotifications = async () => {
    const res = await requestNotificationPermission();
    setNotificationStatus(res);
    if (res === 'granted') {
      onUpdateSettings({ browserNotifications: true });
      sendBrowserNotification('Spidey Notifications Active', {
        body: 'You will now receive timely task reminders and timer alerts.',
      });
    }
  };

  const handleGoogleConnect = async () => {
    setIsLoggingIn(true);
    try {
      await onConnectGoogle();
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleExportData = () => {
    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      tasks: allTasks,
      groups: allGroups,
      settings,
    };
    const jsonStr = JSON.stringify(backup, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spidey-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setCopiedExport(true);
    setTimeout(() => setCopiedExport(false), 2500);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed.tasks) && Array.isArray(parsed.groups)) {
          onImportData(parsed.tasks, parsed.groups);
          alert('Spidey data imported successfully!');
        } else {
          alert('Invalid backup format.');
        }
      } catch (err) {
        alert('Could not parse JSON backup.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[#111114] border border-neutral-800 p-6 shadow-2xl space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
          <div className="flex items-center gap-2">
            <span className="font-heading font-bold text-lg text-zinc-100 uppercase tracking-widest">
              Settings & Integrations
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-neutral-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 1. Google Tasks Integration Section */}
        <div className="rounded-xl bg-neutral-950/60 border border-neutral-800 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-red-950/50 border border-red-900/60 text-red-400">
                <Cloud className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-zinc-100 font-heading tracking-wide">
                  Google Tasks Synchronization
                </h4>
                <p className="text-xs font-mono-code text-zinc-400">
                  Two-way sync tasks, lists & completion with your Google account.
                </p>
              </div>
            </div>

            {syncState.isAuthenticated && (
              <span className="px-2 py-0.5 rounded text-[11px] font-mono-code bg-emerald-950 text-emerald-400 border border-emerald-900">
                Connected
              </span>
            )}
          </div>

          {syncState.isAuthenticated ? (
            <div className="pt-2 border-t border-neutral-800/80 space-y-3">
              <div className="flex items-center justify-between text-xs font-mono-code text-zinc-300">
                <div className="flex items-center gap-2">
                  {syncState.userPhoto ? (
                    <img
                      src={syncState.userPhoto}
                      alt="Avatar"
                      className="w-6 h-6 rounded-full border border-neutral-700"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <UserIcon className="w-5 h-5 text-zinc-400" />
                  )}
                  <span className="truncate max-w-[200px]">{syncState.userEmail || syncState.userName}</span>
                </div>

                {syncState.lastSyncedAt && (
                  <span className="text-zinc-500 text-[11px]">
                    Synced: {new Date(syncState.lastSyncedAt).toLocaleTimeString()}
                  </span>
                )}
              </div>

              {syncState.syncError && (
                <p className="text-xs font-mono-code text-red-400 bg-red-950/40 p-2 rounded border border-red-900/50">
                  {syncState.syncError}
                </p>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={onManualSync}
                  disabled={syncState.isSyncing}
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-neutral-800 hover:bg-neutral-700 text-zinc-200 text-xs font-mono-code rounded-lg border border-neutral-700 transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncState.isSyncing ? 'animate-spin text-red-400' : ''}`} />
                  <span>{syncState.isSyncing ? 'Syncing...' : 'Sync Now'}</span>
                </button>

                <button
                  onClick={onDisconnectGoogle}
                  className="px-3 py-2 bg-neutral-900 hover:bg-red-950/60 text-zinc-400 hover:text-red-300 text-xs font-mono-code rounded-lg border border-neutral-800 transition flex items-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Disconnect</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="pt-2 border-t border-neutral-800/80">
              {/* Official Google Sign-in Styled Button */}
              <button
                type="button"
                onClick={handleGoogleConnect}
                disabled={isLoggingIn}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl bg-white hover:bg-zinc-100 text-zinc-900 font-medium text-xs sm:text-sm shadow-md transition-all active:scale-[0.99] cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
                <span>{isLoggingIn ? 'Connecting...' : 'Sign in with Google to Sync Tasks'}</span>
              </button>
            </div>
          )}
        </div>

        {/* 2. Notifications Section */}
        <div className="rounded-xl bg-neutral-950/60 border border-neutral-800 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-neutral-900 border border-neutral-800 text-zinc-300">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-zinc-100 font-heading">
                  Notifications & Reminders
                </h4>
                <p className="text-xs font-mono-code text-zinc-400">
                  Timer finish sounds and task due time alerts.
                </p>
              </div>
            </div>

            <span className={`text-[11px] font-mono-code px-2 py-0.5 rounded border ${
              notificationStatus === 'granted'
                ? 'bg-emerald-950 text-emerald-400 border-emerald-900'
                : 'bg-neutral-900 text-zinc-500 border-neutral-800'
            }`}>
              {notificationStatus === 'granted' ? 'Allowed' : 'Disabled'}
            </span>
          </div>

          <div className="pt-2 border-t border-neutral-800/80 flex items-center justify-between gap-3">
            <span className="text-xs font-mono-code text-zinc-400">
              Desktop Notifications
            </span>
            {notificationStatus !== 'granted' ? (
              <button
                onClick={handleRequestNotifications}
                className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-xs font-mono-code rounded-lg transition"
              >
                Enable Notifications
              </button>
            ) : (
              <button
                onClick={() => {
                  sendBrowserNotification('Spidey Test Alert', { body: 'Notifications are working perfectly!' });
                }}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-zinc-200 text-xs font-mono-code rounded-lg transition"
              >
                Test Notification
              </button>
            )}
          </div>
        </div>

        {/* 3. Interactive Spider Companion */}
        <div className="rounded-xl bg-neutral-950/60 border border-neutral-800 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-zinc-100 font-heading">
                Roaming Spider Companion
              </h4>
              <p className="text-xs font-mono-code text-zinc-400">
                Interactive noir spider that wanders, webs down, and can be dragged anywhere.
              </p>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.spiderCompanionEnabled}
                onChange={(e) => onUpdateSettings({ spiderCompanionEnabled: e.target.checked })}
                className="rounded bg-neutral-900 border-neutral-700 text-red-600 focus:ring-0"
              />
              <span className="text-xs font-mono-code text-zinc-300">
                {settings.spiderCompanionEnabled ? 'Active' : 'Disabled'}
              </span>
            </label>
          </div>

          {settings.spiderCompanionEnabled && (
            <div className="pt-2 border-t border-neutral-800/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono-code text-zinc-400">Spider Scale</span>
                <div className="flex items-center gap-1.5">
                  {(['small', 'medium', 'large'] as const).map((sz) => (
                    <button
                      key={sz}
                      onClick={() => onUpdateSettings({ spiderSize: sz })}
                      className={`px-2.5 py-1 rounded text-xs font-mono-code capitalize transition ${
                        settings.spiderSize === sz
                          ? 'bg-neutral-800 text-red-400 border border-neutral-700 font-semibold'
                          : 'bg-neutral-900 text-zinc-400 border border-neutral-800 hover:text-zinc-200'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 4. Spidey Assistant & Local LLM Integration */}
        <div className="rounded-xl bg-neutral-950/60 border border-neutral-800 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-zinc-100 font-heading flex items-center gap-1.5">
                <span>Local AI (Qwen3 / Ollama)</span>
              </h4>
              <p className="text-xs font-mono-code text-zinc-400">
                Connect your local Ollama or OpenAI-compatible model server.
              </p>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.localAi?.enabled !== false}
                onChange={(e) =>
                  onUpdateSettings({
                    localAi: {
                      ...(settings.localAi || {
                        endpointUrl: 'http://localhost:11434/api/chat',
                        modelName: 'qwen3:8b',
                        provider: 'ollama',
                      }),
                      enabled: e.target.checked,
                    },
                  })
                }
                className="rounded bg-neutral-900 border-neutral-700 text-red-600 focus:ring-0"
              />
              <span className="text-xs font-mono-code text-zinc-300">
                {settings.localAi?.enabled !== false ? 'Enabled' : 'Disabled'}
              </span>
            </label>
          </div>

          <div className="pt-2 border-t border-neutral-800/80 space-y-2">
            <div>
              <label className="block text-[11px] font-mono-code text-zinc-400 mb-1">
                Local AI Server URL
              </label>
              <input
                type="text"
                value={settings.localAi?.endpointUrl || 'http://localhost:11434/api/chat'}
                onChange={(e) =>
                  onUpdateSettings({
                    localAi: { ...settings.localAi, endpointUrl: e.target.value },
                  })
                }
                placeholder="http://localhost:11434/api/chat"
                className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-lg text-xs font-mono-code text-zinc-200"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-mono-code text-zinc-400 mb-1">
                  Format
                </label>
                <select
                  value={settings.localAi?.provider || 'ollama'}
                  onChange={(e) =>
                    onUpdateSettings({
                      localAi: { ...settings.localAi, provider: e.target.value as any },
                    })
                  }
                  className="w-full px-2 py-1.5 bg-neutral-900 border border-neutral-800 rounded-lg text-xs font-mono-code text-zinc-200"
                >
                  <option value="ollama">Ollama (/api/chat)</option>
                  <option value="openai_compatible">OpenAI / LM Studio</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-mono-code text-zinc-400 mb-1">
                  Model Tag
                </label>
                <input
                  type="text"
                  value={settings.localAi?.modelName || 'qwen3:8b'}
                  onChange={(e) =>
                    onUpdateSettings({
                      localAi: { ...settings.localAi, modelName: e.target.value },
                    })
                  }
                  placeholder="qwen3:8b"
                  className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-lg text-xs font-mono-code text-zinc-200"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 5. Timer Preferences */}
        <div className="rounded-xl bg-neutral-950/60 border border-neutral-800 p-4 space-y-3">
          <h4 className="text-sm font-semibold text-zinc-100 font-heading">
            Timer & Focus Preferences
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="block text-xs font-mono-code text-zinc-400 mb-1">
                Default Work Duration (mins)
              </label>
              <input
                type="number"
                min="1"
                max="180"
                value={settings.pomodoroWorkDuration}
                onChange={(e) => onUpdateSettings({ pomodoroWorkDuration: parseInt(e.target.value, 10) || 25 })}
                className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-lg text-xs font-mono-code text-zinc-200"
              />
            </div>

            <div>
              <label className="block text-xs font-mono-code text-zinc-400 mb-1">
                Default Break Duration (mins)
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={settings.pomodoroBreakDuration}
                onChange={(e) => onUpdateSettings({ pomodoroBreakDuration: parseInt(e.target.value, 10) || 5 })}
                className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-lg text-xs font-mono-code text-zinc-200"
              />
            </div>
          </div>
        </div>

        {/* 6. Desktop PC App Installation */}
        <div className="rounded-xl bg-neutral-950/60 border border-neutral-800 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-zinc-100 font-heading">
                Download & Install on PC
              </h4>
              <p className="text-xs font-mono-code text-zinc-400">
                Run Spidey as a native desktop application with window controls and offline caching.
              </p>
            </div>
            <span className="text-[11px] font-mono-code px-2 py-0.5 rounded bg-neutral-900 text-zinc-400 border border-neutral-800">
              PWA Ready
            </span>
          </div>

          <div className="pt-2 border-t border-neutral-800/80">
            <p className="text-xs font-mono-code text-zinc-400 leading-relaxed">
              To install as a dedicated desktop app on your PC: In Chrome / Edge / Brave, click the <span className="text-zinc-200 font-semibold">Install Spidey</span> icon in your address bar, or open the browser menu (⋮) and select <span className="text-zinc-200 font-semibold">"Install Spidey"</span> or <span className="text-zinc-200 font-semibold">"Save and Share &gt; Install as app"</span>.
            </p>
          </div>
        </div>

        {/* 7. Backup & Reset */}
        <div className="rounded-xl bg-neutral-950/60 border border-neutral-800 p-4 space-y-3">
          <h4 className="text-sm font-semibold text-zinc-100 font-heading">
            Data Storage & Backup
          </h4>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              onClick={handleExportData}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-zinc-300 text-xs font-mono-code rounded-lg border border-neutral-800 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{copiedExport ? 'Downloaded!' : 'Export Backup'}</span>
            </button>

            <label className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-zinc-300 text-xs font-mono-code rounded-lg border border-neutral-800 transition cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>Import Backup</span>
              <input
                type="file"
                accept=".json"
                onChange={handleImportFile}
                className="hidden"
              />
            </label>

            <button
              onClick={() => {
                if (window.confirm('Reset all tasks and groups to default template?')) {
                  onResetData();
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 hover:bg-red-950/50 text-zinc-400 hover:text-red-400 text-xs font-mono-code rounded-lg border border-neutral-800 transition ml-auto"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Data</span>
            </button>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-neutral-800 hover:bg-neutral-700 text-zinc-200 text-xs font-mono-code rounded-lg transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
