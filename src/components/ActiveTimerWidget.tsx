import React from 'react';
import { Play, Pause, RotateCcw, X, Clock, Coffee, Sparkles } from 'lucide-react';
import { TimerState } from '../types';

interface ActiveTimerWidgetProps {
  timer: TimerState;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onClose: () => void;
  onSetDuration: (minutes: number) => void;
}

export const ActiveTimerWidget: React.FC<ActiveTimerWidgetProps> = ({
  timer,
  onPause,
  onResume,
  onReset,
  onClose,
  onSetDuration,
}) => {
  const minutes = Math.floor(timer.remainingSeconds / 60);
  const seconds = timer.remainingSeconds % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const progressPercent =
    timer.originalDuration > 0
      ? ((timer.originalDuration - timer.remainingSeconds) / timer.originalDuration) * 100
      : 0;

  return (
    <div className="rounded-xl bg-[#0e0e12] border border-neutral-800/80 p-4 sm:p-5 shadow-md">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-neutral-800/70">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-red-400" />
          <span className="text-xs font-mono-code uppercase tracking-wider text-zinc-300 font-semibold">
            {timer.mode === 'break' ? 'Break Timer' : 'Focus Timer'}
          </span>
          {timer.taskTitle && (
            <span className="text-xs font-mono-code text-zinc-500 truncate max-w-[200px] sm:max-w-xs">
              — {timer.taskTitle}
            </span>
          )}
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-neutral-800 transition"
          title="Minimize timer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Timer Display & Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Large digital time readout */}
        <div className="flex items-baseline gap-3">
          <span className="font-mono-code text-3xl sm:text-4xl font-bold tracking-tight text-zinc-100">
            {formattedTime}
          </span>
          <span className="text-xs font-mono-code text-zinc-500">
            {timer.isRunning ? 'Running' : 'Paused'}
          </span>
        </div>

        {/* Action buttons & Presets */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Quick presets */}
          <div className="flex items-center gap-1 border-r border-neutral-800 pr-2 mr-1">
            <button
              onClick={() => onSetDuration(25)}
              className="px-2 py-1 bg-neutral-900 hover:bg-neutral-800 text-[11px] font-mono-code text-zinc-400 hover:text-zinc-200 rounded border border-neutral-800 transition"
            >
              25m
            </button>
            <button
              onClick={() => onSetDuration(50)}
              className="px-2 py-1 bg-neutral-900 hover:bg-neutral-800 text-[11px] font-mono-code text-zinc-400 hover:text-zinc-200 rounded border border-neutral-800 transition"
            >
              50m
            </button>
            <button
              onClick={() => onSetDuration(5)}
              className="px-2 py-1 bg-neutral-900 hover:bg-neutral-800 text-[11px] font-mono-code text-zinc-400 hover:text-zinc-200 rounded border border-neutral-800 transition"
            >
              5m break
            </button>
          </div>

          {/* Pause / Resume */}
          {timer.isRunning ? (
            <button
              onClick={onPause}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-zinc-200 rounded-lg text-xs font-mono-code border border-neutral-700 transition cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>Pause</span>
            </button>
          ) : (
            <button
              onClick={onResume}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-800 hover:bg-red-700 text-white rounded-lg text-xs font-mono-code shadow transition cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Resume</span>
            </button>
          )}

          {/* Reset */}
          <button
            onClick={onReset}
            className="p-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-zinc-400 hover:text-zinc-200 border border-neutral-800 transition"
            title="Reset timer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Subtle Progress Bar */}
      <div className="w-full h-1 bg-neutral-900 rounded-full mt-4 overflow-hidden">
        <div
          className="h-full bg-red-800/80 transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
};
