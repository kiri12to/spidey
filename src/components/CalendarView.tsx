import React, { useState } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Calendar as CalendarIcon, 
  Check, 
  Clock, 
  AlertCircle,
  Play,
  Edit2,
  Trash2
} from 'lucide-react';
import { Task } from '../types';
import { spideyApi, CalendarDaySummary } from '../services/spideyApi';
import { isTaskOverdue, getTodayDateString } from '../services/storage';

interface CalendarViewProps {
  tasks: Task[];
  onToggleComplete: (task: Task) => void;
  onStartTimer: (task: Task) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
  onAddTaskForDate: (dateStr: string) => void;
  soundEnabled: boolean;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export const CalendarView: React.FC<CalendarViewProps> = ({
  tasks,
  onToggleComplete,
  onStartTimer,
  onEditTask,
  onDeleteTask,
  onAddTaskForDate,
  soundEnabled,
}) => {
  const todayStr = getTodayDateString();
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDateStr, setSelectedDateStr] = useState<string>(todayStr);

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const handleGoToday = () => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDateStr(todayStr);
  };

  // Compute calendar grid matrix from the API service
  const days = spideyApi.getCalendarData(currentYear, currentMonth);

  // Get tasks for the selected date
  const selectedDayTasks = tasks.filter((t) => t.dueDate === selectedDateStr);

  const formattedSelectedDate = () => {
    try {
      const [y, m, d] = selectedDateStr.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      return new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      }).format(dateObj);
    } catch {
      return selectedDateStr;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Calendar Card */}
      <div className="rounded-xl bg-[#0e0e12] border border-neutral-800/80 p-4 sm:p-6 shadow-md">
        {/* Month Navigation Header */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-neutral-800/70">
          <div className="flex items-center gap-3">
            <h2 className="font-heading font-bold text-lg sm:text-xl text-zinc-100 tracking-wider uppercase">
              {MONTH_NAMES[currentMonth]} {currentYear}
            </h2>
            <button
              onClick={handleGoToday}
              className="text-[11px] font-mono-code px-2 py-0.5 rounded bg-neutral-900 hover:bg-neutral-800 text-zinc-400 hover:text-zinc-200 border border-neutral-800 transition"
            >
              Today
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-neutral-900 border border-neutral-800/60 transition"
              title="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleNextMonth}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-neutral-900 border border-neutral-800/60 transition"
              title="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Days of Week Header */}
        <div className="grid grid-cols-7 gap-1 text-center mb-2">
          {WEEKDAY_NAMES.map((dayName) => (
            <div
              key={dayName}
              className="text-[11px] font-mono-code font-semibold tracking-wider text-zinc-500 py-1"
            >
              {dayName}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {days.map((day: CalendarDaySummary) => {
            const isSelected = day.date === selectedDateStr;
            const hasOverdue = day.tasks.some((t) => isTaskOverdue(t));
            const allCompleted = day.tasks.length > 0 && day.tasks.every((t) => t.completed);

            return (
              <button
                key={day.date}
                onClick={() => setSelectedDateStr(day.date)}
                className={`group relative h-14 sm:h-18 p-1.5 sm:p-2 rounded-lg border text-left flex flex-col justify-between transition-all select-none ${
                  isSelected
                    ? 'bg-neutral-800/90 border-neutral-600 ring-1 ring-neutral-500/40 shadow-sm'
                    : day.isCurrentMonth
                    ? 'bg-[#131318]/70 border-neutral-800/60 hover:bg-neutral-800/40 hover:border-neutral-700/60'
                    : 'bg-[#0b0b0e]/40 border-neutral-900 text-zinc-600'
                }`}
              >
                {/* Day Number and Today Badge */}
                <div className="flex items-center justify-between w-full">
                  <span
                    className={`text-xs font-mono-code ${
                      day.isToday
                        ? 'text-red-400 font-bold'
                        : isSelected
                        ? 'text-zinc-100 font-semibold'
                        : day.isCurrentMonth
                        ? 'text-zinc-300'
                        : 'text-zinc-600'
                    }`}
                  >
                    {day.dayNumber}
                  </span>

                  {day.isToday && (
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" title="Today" />
                  )}
                </div>

                {/* Task Indicators (Dots / Overdue) */}
                <div className="flex items-center gap-1 mt-auto">
                  {day.tasks.length > 0 && (
                    <div className="flex items-center gap-0.5">
                      {hasOverdue ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500/80" title="Overdue task" />
                      ) : allCompleted ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/60" title="All completed" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" title={`${day.tasks.length} tasks`} />
                      )}

                      {day.tasks.length > 1 && (
                        <span className="text-[9px] font-mono-code text-zinc-500 ml-0.5">
                          {day.tasks.length}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Day Agenda / Task List */}
      <div className="rounded-xl bg-[#0e0e12] border border-neutral-800/80 p-4 sm:p-5 shadow-md space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800/70">
          <div>
            <span className="text-[10px] font-mono-code uppercase tracking-wider text-zinc-500">
              Selected Date
            </span>
            <h3 className="font-heading font-bold text-base text-zinc-100">
              {formattedSelectedDate()}
            </h3>
          </div>

          <button
            onClick={() => onAddTaskForDate(selectedDateStr)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-zinc-200 hover:text-white border border-neutral-700/80 rounded-lg text-xs font-mono-code transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-red-400" />
            <span>Add Task</span>
          </button>
        </div>

        {/* Tasks on this day */}
        {selectedDayTasks.length === 0 ? (
          <div className="py-8 text-center border border-dashed border-neutral-800/60 rounded-lg">
            <p className="text-xs font-mono-code text-zinc-500">No tasks scheduled for this day.</p>
            <button
              onClick={() => onAddTaskForDate(selectedDateStr)}
              className="mt-2 text-xs font-mono-code text-zinc-400 hover:text-red-300 transition"
            >
              + Create task for {selectedDateStr}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {selectedDayTasks.map((task) => {
              const overdue = isTaskOverdue(task);

              return (
                <div
                  key={task.id}
                  id={`task-item-${task.id}`}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                    task.completed
                      ? 'bg-neutral-950/40 border-neutral-900 opacity-60'
                      : overdue
                      ? 'bg-[#141012] border-red-950/70'
                      : 'bg-[#121217] border-neutral-800/70 hover:border-neutral-700'
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <button
                      onClick={() => onToggleComplete(task)}
                      className={`w-4 h-4 rounded border transition flex items-center justify-center cursor-pointer ${
                        task.completed
                          ? 'bg-red-900 border-red-700 text-white'
                          : 'border-neutral-700 hover:border-red-500 bg-neutral-950'
                      }`}
                    >
                      {task.completed && <Check className="w-3 h-3 stroke-[3]" />}
                    </button>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          id={`task-title-${task.id}`}
                          className={`text-xs sm:text-sm font-medium ${
                            task.completed ? 'line-through text-zinc-500' : 'text-zinc-100'
                          }`}
                        >
                          {task.title}
                        </span>

                        {overdue && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-mono-code text-red-400/90 bg-red-950/40 px-1 py-0.2 rounded border border-red-900/40">
                            <AlertCircle className="w-2.5 h-2.5" />
                            Overdue
                          </span>
                        )}
                      </div>

                      {task.dueTime && (
                        <span className="text-[11px] font-mono-code text-zinc-500 flex items-center gap-1 mt-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {task.dueTime}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {!task.completed && (
                      <button
                        onClick={() => onStartTimer(task)}
                        className="p-1.5 text-zinc-400 hover:text-red-300 hover:bg-neutral-800 rounded transition"
                        title="Start timer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                      </button>
                    )}
                    <button
                      onClick={() => onEditTask(task)}
                      className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-neutral-800 rounded transition"
                      title="Edit"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onDeleteTask(task)}
                      className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-neutral-800 rounded transition"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
