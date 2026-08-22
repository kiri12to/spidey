import React, { useState, useEffect, useCallback } from 'react';
import { 
  Plus, 
  Search, 
  Layers, 
  FolderPlus,
  Play,
  RotateCcw,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { 
  Task, 
  TaskGroup, 
  Note,
  TimerState, 
  UserSettings, 
  GoogleSyncState,
  AppTab 
} from './types';
import { 
  loadStoredTasks, 
  saveStoredTasks, 
  loadStoredGroups, 
  saveStoredGroups, 
  loadStoredNotes,
  saveStoredNotes,
  loadStoredSettings, 
  saveStoredSettings, 
  getTodayDateString,
  getGreetingForUser,
  isTaskOverdue,
  initialTasks,
  initialGroups,
  initialNotes
} from './services/storage';
import { spideyApi } from './services/spideyApi';
import { 
  initAuth, 
  googleSignIn, 
  reauthorize,
  logout, 
  getAccessToken 
} from './services/auth';
import { 
  performFullSync, 
  deleteGoogleTask, 
  deleteGoogleTaskList 
} from './services/googleTasks';
import { 
  toggleAmbientRain,
  playTimerCompleteSound 
} from './services/sound';
import { 
  sendBrowserNotification 
} from './services/notifications';

import { Header } from './components/Header';
import { NoirBackground } from './components/NoirBackground';
import { ActiveTimerWidget } from './components/ActiveTimerWidget';
import { TaskItem } from './components/TaskItem';
import { TaskGroupCard } from './components/TaskGroupCard';
import { CalendarView } from './components/CalendarView';
import { NotesView } from './components/NotesView';
import { AddTaskModal } from './components/AddTaskModal';
import { EditTaskModal } from './components/EditTaskModal';
import { RenameGroupModal } from './components/RenameGroupModal';
import { SettingsModal } from './components/SettingsModal';
import { ConfirmationModal } from './components/ConfirmationModal';
import { SpiderCompanion } from './components/SpiderCompanion';
import { SpideyAssistantDrawer } from './components/SpideyAssistantDrawer';
import { InstallDesktopModal } from './components/InstallDesktopModal';

export default function App() {
  // 1. Core State
  const [tasks, setTasks] = useState<Task[]>(loadStoredTasks);
  const [groups, setGroups] = useState<TaskGroup[]>(loadStoredGroups);
  const [notes, setNotes] = useState<Note[]>(loadStoredNotes);
  const [settings, setSettings] = useState<UserSettings>(loadStoredSettings);
  const [activeTab, setActiveTab] = useState<AppTab>('today');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroupIdForAdd, setSelectedGroupIdForAdd] = useState<string | null>(null);
  const [selectedDateForAdd, setSelectedDateForAdd] = useState<string | undefined>(undefined);

  // 2. Timer State
  const [timer, setTimer] = useState<TimerState>({
    taskId: null,
    taskTitle: null,
    durationSeconds: settings.pomodoroWorkDuration * 60,
    remainingSeconds: settings.pomodoroWorkDuration * 60,
    isRunning: false,
    mode: 'work',
    originalDuration: settings.pomodoroWorkDuration * 60,
  });

  // 3. Google Sync State
  const [syncState, setSyncState] = useState<GoogleSyncState>({
    isAuthenticated: false,
    isSyncing: false,
    syncError: null,
  });

  // 4. Modal & Drawer States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [renamingGroup, setRenamingGroup] = useState<TaskGroup | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    type: 'task' | 'group';
    item: Task | TaskGroup;
  } | null>(null);

  // 5. PWA Install Prompt Handler (for Desktop PC Installation)
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(null);
  const [proactiveTrigger, setProactiveTrigger] = useState<{
    id: number;
    reason: 'task_completed' | 'timer_finished' | 'welcome';
    customText?: string;
  } | null>(null);

  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallApp = async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setDeferredInstallPrompt(null);
      }
    } else {
      setIsInstallModalOpen(true);
    }
  };

  // 5. Sync state with storage and API layer
  useEffect(() => {
    saveStoredTasks(tasks);
  }, [tasks]);

  useEffect(() => {
    saveStoredGroups(groups);
  }, [groups]);

  useEffect(() => {
    saveStoredNotes(notes);
  }, [notes]);

  useEffect(() => {
    saveStoredSettings(settings);
  }, [settings]);

  // Subscribe to Spidey API mutations (e.g. from local AI assistant actions)
  useEffect(() => {
    const unsub = spideyApi.subscribe(() => {
      setTasks(spideyApi.getTasks());
      setGroups(spideyApi.getTaskGroups());
      setNotes(spideyApi.getNotes());
      setTimer(spideyApi.getTimer());
    });
    return () => unsub();
  }, []);

  // 6. Timer Countdown Engine
  useEffect(() => {
    let interval: any = null;
    if (timer.isRunning && timer.remainingSeconds > 0) {
      interval = setInterval(() => {
        setTimer((prev) => {
          if (prev.remainingSeconds <= 1) {
            if (settings.soundEnabled) playTimerCompleteSound();
            if (settings.browserNotifications) {
              sendBrowserNotification('Timer Finished', {
                body: prev.taskTitle ? `Session for "${prev.taskTitle}" complete.` : 'Your focus session is complete.',
              });
            }
            setProactiveTrigger({ id: Date.now(), reason: 'timer_finished' });
            return {
              ...prev,
              remainingSeconds: 0,
              isRunning: false,
            };
          }
          return {
            ...prev,
            remainingSeconds: prev.remainingSeconds - 1,
          };
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timer.isRunning, timer.remainingSeconds, settings.soundEnabled, settings.browserNotifications]);

  // 7. Initialize Auth & Google Tasks sync
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setSyncState((prev) => ({
          ...prev,
          isAuthenticated: true,
          userEmail: user.email || undefined,
          userName: user.displayName || undefined,
          userPhoto: user.photoURL || undefined,
          syncError: null,
        }));

        triggerSync(token);
      },
      () => {
        setSyncState((prev) => ({
          ...prev,
          isAuthenticated: false,
          userEmail: undefined,
          userName: undefined,
          userPhoto: undefined,
        }));
      }
    );

    return () => unsubscribe();
  }, []);

  // Periodic auto-sync from Google Tasks (e.g. from mobile phone changes) and on window focus
  useEffect(() => {
    if (!syncState.isAuthenticated || !settings.autoSyncGoogleTasks) return;

    // Sync on tab focus
    const handleFocus = () => {
      triggerSync();
    };
    window.addEventListener('focus', handleFocus);

    // Sync periodically every 45 seconds
    const interval = setInterval(() => {
      if (!syncState.isSyncing) {
        triggerSync();
      }
    }, 45000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, [syncState.isAuthenticated, syncState.isSyncing, settings.autoSyncGoogleTasks, tasks, groups]);

  // 8. Ambient Rain Sound
  useEffect(() => {
    toggleAmbientRain(settings.ambientRainEnabled);
  }, [settings.ambientRainEnabled]);

  // Periodic Reminder
  useEffect(() => {
    const checkDeadlines = () => {
      const now = new Date();
      const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const todayStr = getTodayDateString();

      tasks.forEach((t) => {
        if (!t.completed && t.dueDate === todayStr && t.dueTime) {
          // Exact Match Browser Notification
          if (t.dueTime === currentTimeStr) {
            if (settings.browserNotifications) {
              sendBrowserNotification(`Reminder: ${t.title}`, {
                body: t.notes || `Your task scheduled for ${t.dueTime} is due now.`,
              });
            }
          }
        }
      });
    };

    const interval = setInterval(checkDeadlines, 30000);
    checkDeadlines();
    return () => clearInterval(interval);
  }, [tasks, settings.browserNotifications]);

  // Sync Handler
  const triggerSync = async (overrideToken?: string) => {
    const token = overrideToken || (await getAccessToken());

    // The old code did `if (!token) return;` here -- a silent no-op. Once the
    // hour-long token expired, sync died without ever telling anyone. Now the
    // failure is visible and offers a way back.
    if (!token) {
      setSyncState((prev) => ({
        ...prev,
        isSyncing: false,
        needsReauth: true,
        syncError: 'Google session expired. Reconnect to resume syncing.',
      }));
      return;
    }

    setSyncState((prev) => ({ ...prev, isSyncing: true, syncError: null }));

    try {
      const currentTasks = spideyApi.getTasks();
      const currentGroups = spideyApi.getTaskGroups();
      const { updatedTasks, updatedGroups } = await performFullSync(token, currentTasks, currentGroups);
      
      // Update local storage and in-memory singletons
      spideyApi.updateAllTasksAndGroups(updatedTasks, updatedGroups);
      setTasks(updatedTasks);
      setGroups(updatedGroups);

      setSyncState((prev) => ({
        ...prev,
        isSyncing: false,
        lastSyncedAt: new Date().toISOString(),
        needsReauth: false,
        syncError: null,
      }));
    } catch (err: any) {
      console.error('Google Tasks Sync error:', err);
      const msg = String(err?.message || '');
      // 401/403 => the token died between our check and the request.
      const expired = /\b(401|403)\b/.test(msg) || /invalid.credentials|unauthenticated/i.test(msg);

      if (expired) {
        const refreshed = await getAccessToken();
        if (refreshed) {
          setSyncState((prev) => ({ ...prev, isSyncing: false }));
          return triggerSync(refreshed);
        }
      }

      setSyncState((prev) => ({
        ...prev,
        isSyncing: false,
        needsReauth: expired,
        syncError: expired
          ? 'Google session expired. Reconnect to resume syncing.'
          : msg || 'Sync failed',
      }));
    }
  };

  /** Opens the consent popup when silent refresh can't recover the session. */
  const handleReconnect = async () => {
    try {
      const token = await reauthorize();
      if (token) {
        setSyncState((prev) => ({ ...prev, needsReauth: false, syncError: null }));
        await triggerSync(token);
      } else {
        setSyncState((prev) => ({ ...prev, syncError: 'Reconnect was cancelled or blocked.' }));
      }
    } catch (err: any) {
      setSyncState((prev) => ({ ...prev, syncError: err?.message || 'Reconnect failed' }));
    }
  };

  const handleGoogleConnect = async () => {
    try {
      const result = await googleSignIn();
      if (result) {
        setSyncState((prev) => ({
          ...prev,
          isAuthenticated: true,
          userEmail: result.user.email || undefined,
          userName: result.user.displayName || undefined,
          userPhoto: result.user.photoURL || undefined,
        }));
        await triggerSync(result.accessToken);
      }
    } catch (err: any) {
      console.error('Google Sign In Error:', err);
      const code = err?.code || '';
      const msg =
        code === 'auth/popup-blocked'
          ? 'Your browser blocked the sign-in popup. Allow popups for this site and try again.'
          : code === 'auth/popup-closed-by-user'
          ? 'Sign-in window was closed before finishing.'
          : code === 'auth/unauthorized-domain'
          ? 'This domain is not authorized in Firebase. Add it under Authentication > Settings > Authorized domains.'
          : err?.message || 'Sign-in failed.';
      setSyncState((prev) => ({ ...prev, syncError: msg }));
    }
  };

  const handleGoogleDisconnect = async () => {
    await logout();
    setSyncState({
      isAuthenticated: false,
      isSyncing: false,
      syncError: null,
    });
  };

  // Task Operations
  const handleAddTask = (taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'order'>) => {
    const newTask = spideyApi.createTask(taskData);
    setTasks(spideyApi.getTasks());

    if (syncState.isAuthenticated && settings.autoSyncGoogleTasks) {
      setTimeout(() => triggerSync(), 500);
    }
  };

  const handleToggleComplete = (task: Task) => {
    const isNowCompleted = !task.completed;
    spideyApi.completeTask(task.id, isNowCompleted);
    setTasks(spideyApi.getTasks());

    if (isNowCompleted) {
      setProactiveTrigger({ id: Date.now(), reason: 'task_completed' });
    }

    if (syncState.isAuthenticated && settings.autoSyncGoogleTasks) {
      setTimeout(() => triggerSync(), 500);
    }
  };

  const handleSaveTask = (updatedTask: Task) => {
    spideyApi.updateTask(updatedTask.id, updatedTask);
    setTasks(spideyApi.getTasks());

    if (syncState.isAuthenticated && settings.autoSyncGoogleTasks) {
      setTimeout(() => triggerSync(), 500);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;

    if (confirmDelete.type === 'task') {
      const task = confirmDelete.item as Task;
      spideyApi.deleteTask(task.id);
      setTasks(spideyApi.getTasks());

      if (syncState.isAuthenticated && task.googleTaskId && task.googleTaskListId) {
        const token = await getAccessToken();
        if (token) {
          try {
            await deleteGoogleTask(token, task.googleTaskListId, task.googleTaskId);
          } catch (err) {
            console.warn('Could not delete task from Google Tasks:', err);
          }
        }
      }
    } else if (confirmDelete.type === 'group') {
      const group = confirmDelete.item as TaskGroup;
      spideyApi.deleteTaskGroup(group.id);
      setGroups(spideyApi.getTaskGroups());
      setTasks(spideyApi.getTasks());

      if (syncState.isAuthenticated && group.googleTaskListId) {
        const token = await getAccessToken();
        if (token) {
          try {
            await deleteGoogleTaskList(token, group.googleTaskListId);
          } catch (err) {
            console.warn('Could not delete group list from Google Tasks:', err);
          }
        }
      }
    }

    setConfirmDelete(null);
  };

  // Group Operations
  const handleAddGroup = (name: string) => {
    spideyApi.createTaskGroup(name);
    setGroups(spideyApi.getTaskGroups());

    if (syncState.isAuthenticated && settings.autoSyncGoogleTasks) {
      setTimeout(() => triggerSync(), 500);
    }
  };

  const handleToggleGroupCollapse = (groupId: string) => {
    const target = groups.find((g) => g.id === groupId);
    if (target) {
      spideyApi.updateTaskGroup(groupId, { collapsed: !target.collapsed });
      setGroups(spideyApi.getTaskGroups());
    }
  };

  const handleRenameGroup = (groupId: string, newName: string) => {
    spideyApi.updateTaskGroup(groupId, { name: newName });
    setGroups(spideyApi.getTaskGroups());
  };

  const handleReorderTasks = (groupId: string, fromIndex: number, toIndex: number) => {
    const groupTasks = tasks.filter((t) => t.groupId === groupId);
    const otherTasks = tasks.filter((t) => t.groupId !== groupId);

    const moved = [...groupTasks];
    const [removed] = moved.splice(fromIndex, 1);
    moved.splice(toIndex, 0, removed);

    const updated = moved.map((t, idx) => ({ ...t, order: idx }));
    const all = [...otherTasks, ...updated];
    saveStoredTasks(all);
    setTasks(all);
    spideyApi.reloadFromStorage();
  };

  // Timer controls
  const handleStartTimerForTask = (task: Task) => {
    const minutes = task.estimatedMinutes || settings.pomodoroWorkDuration;
    const duration = minutes * 60;
    const nextState: TimerState = {
      taskId: task.id,
      taskTitle: task.title,
      durationSeconds: duration,
      remainingSeconds: duration,
      originalDuration: duration,
      isRunning: true,
      mode: 'work',
    };
    setTimer(nextState);
    spideyApi.setTimerState(nextState);
  };

  const handlePauseTimer = () => {
    const next = { ...timer, isRunning: false };
    setTimer(next);
    spideyApi.setTimerState(next);
  };

  const handleResumeTimer = () => {
    const next = { ...timer, isRunning: true };
    setTimer(next);
    spideyApi.setTimerState(next);
  };

  const handleResetTimer = () => {
    const next = { ...timer, isRunning: false, remainingSeconds: timer.originalDuration };
    setTimer(next);
    spideyApi.setTimerState(next);
  };

  const handleSetTimerDuration = (minutes: number) => {
    const duration = minutes * 60;
    const next: TimerState = {
      ...timer,
      durationSeconds: duration,
      remainingSeconds: duration,
      originalDuration: duration,
      isRunning: true,
      mode: minutes <= 10 ? 'break' : 'work',
    };
    setTimer(next);
    spideyApi.setTimerState(next);
  };

      {/* Periodic Background Google Tasks Synchronizer */}
  useEffect(() => {
    if (!syncState.isAuthenticated || !settings.autoSyncGoogleTasks) return;

    const interval = setInterval(() => {
      triggerSync();
    }, 60000); // Check for changes in Google Tasks every 60 seconds

    return () => clearInterval(interval);
  }, [syncState.isAuthenticated, settings.autoSyncGoogleTasks]);

  const handleAiActionTrigger = (actionType: string) => {
    if (actionType === 'toggle_rain') {
      setSettings((prev) => ({ ...prev, ambientRainEnabled: !prev.ambientRainEnabled }));
    } else if (actionType === 'sync') {
      triggerSync();
    }
  };

  // Filter tasks
  const todayStr = getTodayDateString();
  const greeting = getGreetingForUser(settings.userName || 'Anas');

  const filteredTasks = tasks.filter((task) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = task.title.toLowerCase().includes(q);
      const matchNotes = task.notes?.toLowerCase().includes(q);
      if (!matchTitle && !matchNotes) return false;
    }

    if (activeTab === 'today') {
      return task.dueDate === todayStr || !task.dueDate;
    }

    return true;
  });

  const standaloneTasks = filteredTasks.filter((t) => !t.groupId);
  const totalTodayTasks = tasks.filter((t) => t.dueDate === todayStr || !t.dueDate);
  const completedTodayTasks = totalTodayTasks.filter((t) => t.completed);
  const overdueTasks = spideyApi.getOverdueTasks();

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col relative font-sans selection:bg-red-900 selection:text-white">
      {/* Subtle Noir Background Atmosphere */}
      <NoirBackground rainEnabled={settings.ambientRainEnabled} />

      {/* Roaming Interactive Spider Companion */}
      <SpiderCompanion
        enabled={settings.spiderCompanionEnabled}
        size={settings.spiderSize}
        userName={settings.userName || 'Anas'}
        localAi={settings.localAi}
        proactiveTrigger={proactiveTrigger}
        onSpiderClick={() => setIsAssistantOpen(true)}
      />

      {/* Sync problem banner.
          Previously an expired Google session produced no UI at all -- the app
          still looked connected while sync quietly did nothing. */}
      {(syncState.needsReauth || syncState.syncError) && (
        <div
          className={`relative z-30 px-4 py-2.5 text-sm flex items-center justify-between gap-3 border-b ${
            syncState.needsReauth
              ? 'bg-amber-950/60 border-amber-800/60 text-amber-100'
              : 'bg-red-950/60 border-red-900/60 text-red-100'
          }`}
        >
          <span className="truncate">{syncState.syncError || 'Google sync needs attention.'}</span>
          <div className="flex items-center gap-2 shrink-0">
            {syncState.needsReauth && (
              <button
                onClick={handleReconnect}
                className="px-3 py-1 rounded bg-amber-600/80 hover:bg-amber-500 text-white text-xs font-semibold transition"
              >
                Reconnect
              </button>
            )}
            <button
              onClick={() => setSyncState((prev) => ({ ...prev, syncError: null, needsReauth: false }))}
              className="px-2 py-1 rounded hover:bg-white/10 text-xs opacity-70"
              aria-label="Dismiss"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Top Header */}
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenAddModal={() => {
          setSelectedGroupIdForAdd(null);
          setSelectedDateForAdd(undefined);
          setIsAddModalOpen(true);
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenAssistant={() => setIsAssistantOpen(true)}
        canInstallApp={true}
        onInstallApp={handleInstallApp}
        syncState={syncState}
        onManualSync={() => triggerSync()}
        ambientRainEnabled={settings.ambientRainEnabled}
        onToggleRain={() =>
          setSettings((prev) => ({ ...prev, ambientRainEnabled: !prev.ambientRainEnabled }))
        }
        soundEnabled={settings.soundEnabled}
        onToggleSound={() =>
          setSettings((prev) => ({ ...prev, soundEnabled: !prev.soundEnabled }))
        }
      />

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* ========================================================================= */}
        {/* TAB 1: TODAY VIEW */}
        {/* ========================================================================= */}
        {activeTab === 'today' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Spidey Greeting & Today Header */}
            <section className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-2 border-b border-neutral-800/60">
              <div>
                <h1 className="font-heading font-medium text-lg sm:text-xl text-zinc-100 tracking-wide">
                  {greeting}
                </h1>
                <p className="text-xs font-mono-code text-zinc-500 mt-0.5">
                  {completedTodayTasks.length} of {totalTodayTasks.length} objectives completed today
                  {overdueTasks.length > 0 && ` • ${overdueTasks.length} overdue`}
                </p>
              </div>

              <div className="text-[11px] font-mono-code text-zinc-500 self-start sm:self-auto">
                {new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date())}
              </div>
            </section>

            {/* Active Timer Widget (if running or assigned) */}
            {(timer.isRunning || timer.taskId) && (
              <section aria-label="Active Timer">
                <ActiveTimerWidget
                  timer={timer}
                  onPause={handlePauseTimer}
                  onResume={handleResumeTimer}
                  onReset={handleResetTimer}
                  onClose={() => setTimer((prev) => ({ ...prev, isRunning: false, taskId: null, taskTitle: null }))}
                  onSetDuration={handleSetTimerDuration}
                />
              </section>
            )}

            {/* Search & Fast Add Bar */}
            <div className="flex items-center gap-2.5">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter tasks..."
                  className="w-full pl-8 pr-3 py-1.5 bg-[#0e0e12] border border-neutral-800/80 rounded-lg text-xs font-mono-code text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-neutral-700"
                />
              </div>

              <button
                onClick={() => {
                  setSelectedGroupIdForAdd(null);
                  setSelectedDateForAdd(todayStr);
                  setIsAddModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-zinc-200 border border-neutral-800 rounded-lg text-xs font-mono-code transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-red-400" />
                <span>Add Task</span>
              </button>
            </div>

            {/* Standalone Tasks Section */}
            <section className="space-y-2">
              <div className="flex items-center justify-between pb-1">
                <span className="text-xs font-mono-code uppercase tracking-wider text-zinc-400 font-semibold">
                  Tasks
                </span>
                <span className="text-[11px] font-mono-code text-zinc-500">
                  {standaloneTasks.filter((t) => t.completed).length}/{standaloneTasks.length}
                </span>
              </div>

              {standaloneTasks.length === 0 ? (
                <div className="p-6 rounded-lg bg-[#0e0e12]/60 border border-dashed border-neutral-800/70 text-center">
                  <p className="text-xs font-mono-code text-zinc-500">
                    {searchQuery ? 'No tasks match your search' : 'No standalone tasks for today.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {standaloneTasks.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      onToggleComplete={handleToggleComplete}
                      onStartTimer={handleStartTimerForTask}
                      onEditTask={(t) => setEditingTask(t)}
                      onDeleteTask={(t) => setConfirmDelete({ type: 'task', item: t })}
                      soundEnabled={settings.soundEnabled}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Task Groups Section (e.g. WORKOUT, STUDY) */}
            <section className="space-y-3 pt-2">
              <div className="flex items-center justify-between pb-1 border-b border-neutral-800/50">
                <span className="text-xs font-mono-code uppercase tracking-wider text-zinc-400 font-semibold">
                  Groups
                </span>

                <button
                  onClick={() => {
                    setSelectedGroupIdForAdd(null);
                    setIsAddModalOpen(true);
                  }}
                  className="text-xs font-mono-code text-zinc-500 hover:text-zinc-300 transition flex items-center gap-1"
                >
                  <Plus className="w-3 h-3 text-red-400" />
                  <span>New Group</span>
                </button>
              </div>

              {groups.length === 0 ? (
                <div className="p-6 rounded-lg bg-[#0e0e12]/60 border border-dashed border-neutral-800/70 text-center">
                  <p className="text-xs font-mono-code text-zinc-500">No task groups yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {groups.map((group) => {
                    const groupTasks = filteredTasks.filter((t) => t.groupId === group.id);
                    return (
                      <TaskGroupCard
                        key={group.id}
                        group={group}
                        tasks={groupTasks}
                        onToggleGroupCollapse={handleToggleGroupCollapse}
                        onAddTaskToGroup={(gId) => {
                          setSelectedGroupIdForAdd(gId);
                          setIsAddModalOpen(true);
                        }}
                        onRenameGroup={(g) => setRenamingGroup(g)}
                        onDeleteGroup={(g) => setConfirmDelete({ type: 'group', item: g })}
                        onToggleCompleteTask={handleToggleComplete}
                        onStartTimer={handleStartTimerForTask}
                        onEditTask={(t) => setEditingTask(t)}
                        onDeleteTask={(t) => setConfirmDelete({ type: 'task', item: t })}
                        onReorderTasks={handleReorderTasks}
                        soundEnabled={settings.soundEnabled}
                      />
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: CALENDAR VIEW */}
        {/* ========================================================================= */}
        {activeTab === 'calendar' && (
          <CalendarView
            tasks={tasks}
            onToggleComplete={handleToggleComplete}
            onStartTimer={handleStartTimerForTask}
            onEditTask={(t) => setEditingTask(t)}
            onDeleteTask={(t) => setConfirmDelete({ type: 'task', item: t })}
            onAddTaskForDate={(dateStr) => {
              setSelectedGroupIdForAdd(null);
              setSelectedDateForAdd(dateStr);
              setIsAddModalOpen(true);
            }}
            soundEnabled={settings.soundEnabled}
          />
        )}

        {/* ========================================================================= */}
        {/* TAB 3: NOTES VIEW */}
        {/* ========================================================================= */}
        {activeTab === 'notes' && (
          <NotesView
            notes={notes}
            onNotesUpdated={() => setNotes(spideyApi.getNotes())}
          />
        )}

        {/* ========================================================================= */}
        {/* TAB 4: TIMER VIEW */}
        {/* ========================================================================= */}
        {activeTab === 'timer' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <ActiveTimerWidget
              timer={timer}
              onPause={handlePauseTimer}
              onResume={handleResumeTimer}
              onReset={handleResetTimer}
              onClose={() => {}}
              onSetDuration={handleSetTimerDuration}
            />

            {/* Select a task to attach to timer */}
            <div className="rounded-xl bg-[#0e0e12] border border-neutral-800/80 p-4 sm:p-5 shadow-md space-y-3">
              <span className="text-xs font-mono-code uppercase tracking-wider text-zinc-400 font-semibold block">
                Attach Task to Timer
              </span>

              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {tasks.filter((t) => !t.completed).length === 0 ? (
                  <p className="text-xs font-mono-code text-zinc-500 py-4 text-center">
                    All tasks completed!
                  </p>
                ) : (
                  tasks
                    .filter((t) => !t.completed)
                    .map((t) => (
                      <div
                        key={t.id}
                        onClick={() => handleStartTimerForTask(t)}
                        className={`p-2.5 rounded-lg border text-xs font-mono-code flex items-center justify-between cursor-pointer transition ${
                          timer.taskId === t.id
                            ? 'bg-neutral-800/90 border-neutral-600 text-zinc-100'
                            : 'bg-[#121217] border-neutral-800 hover:border-neutral-700 text-zinc-300'
                        }`}
                      >
                        <span className="truncate">{t.title}</span>
                        <Play className="w-3 h-3 fill-current text-red-400 flex-shrink-0 ml-2" />
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      <AddTaskModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setSelectedDateForAdd(undefined);
        }}
        groups={groups}
        defaultGroupId={selectedGroupIdForAdd}
        defaultDueDate={selectedDateForAdd}
        onAddTask={handleAddTask}
        onAddGroup={handleAddGroup}
      />

      <EditTaskModal
        isOpen={!!editingTask}
        onClose={() => setEditingTask(null)}
        task={editingTask}
        groups={groups}
        onSaveTask={handleSaveTask}
      />

      <RenameGroupModal
        isOpen={!!renamingGroup}
        onClose={() => setRenamingGroup(null)}
        group={renamingGroup}
        onRename={handleRenameGroup}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        syncState={syncState}
        onConnectGoogle={handleGoogleConnect}
        onDisconnectGoogle={handleGoogleDisconnect}
        onManualSync={() => triggerSync()}
        settings={settings}
        onUpdateSettings={(newVals) => setSettings((prev) => ({ ...prev, ...newVals }))}
        allTasks={tasks}
        allGroups={groups}
        onImportData={(importedTasks, importedGroups) => {
          setTasks(importedTasks);
          setGroups(importedGroups);
          saveStoredTasks(importedTasks);
          saveStoredGroups(importedGroups);
          spideyApi.reloadFromStorage();
        }}
        onResetData={() => {
          setTasks(initialTasks);
          setGroups(initialGroups);
          setNotes(initialNotes);
          saveStoredTasks(initialTasks);
          saveStoredGroups(initialGroups);
          saveStoredNotes(initialNotes);
          spideyApi.reloadFromStorage();
        }}
      />

      <ConfirmationModal
        isOpen={!!confirmDelete}
        title={confirmDelete?.type === 'group' ? 'Delete Task Group?' : 'Delete Task?'}
        message={
          confirmDelete?.type === 'group'
            ? `Are you sure you want to delete the group "${(confirmDelete?.item as TaskGroup)?.name}"? Contained tasks will become standalone.`
            : `Are you sure you want to delete "${(confirmDelete?.item as Task)?.title}"?`
        }
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* Spidey Assistant Drawer (Female Companion) */}
      <SpideyAssistantDrawer
        isOpen={isAssistantOpen}
        onClose={() => setIsAssistantOpen(false)}
        settings={settings}
        onUpdateSettings={(newVals) => setSettings((prev) => ({ ...prev, ...newVals }))}
        onExecuteActionTrigger={handleAiActionTrigger}
      />

      {/* Desktop PC PWA Install Modal */}
      <InstallDesktopModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
        onInstallClick={handleInstallApp}
        hasNativePrompt={!!deferredInstallPrompt}
      />
    </div>
  );
}
