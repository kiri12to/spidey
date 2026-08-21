import { spideyApi } from '../services/spideyApi';
import { toggleAmbientRain } from '../services/sound';
import { ToolResult } from '../agent/types';

export function executeTimerTools(toolName: string, args: Record<string, any>): ToolResult | null {
  switch (toolName) {
    case 'start_timer': {
      const minutes = Number(args.minutes || args.duration || 25) || 25;
      const task = args.task || args.title || 'Focus Session';

      spideyApi.startTimer({ minutes, taskTitle: task });
      spideyApi.setMindState('focusing', `Timer: ${task}`);

      return {
        toolName,
        success: true,
        message: `Started ${minutes}m timer for "${task}"`,
        actionType: 'start_timer',
        actionDetails: `${minutes}m: ${task}`,
      };
    }

    case 'stop_timer': {
      spideyApi.stopTimer();
      return {
        toolName,
        success: true,
        message: 'Stopped focus timer',
        actionType: 'start_timer',
        actionDetails: 'Reset timer',
      };
    }

    case 'toggle_rain': {
      const state = toggleAmbientRain(args.enabled !== undefined ? Boolean(args.enabled) : undefined);
      return {
        toolName,
        success: true,
        message: `Ambient rain ${state ? 'enabled' : 'disabled'}`,
        actionType: 'toggle_rain',
        actionDetails: state ? 'Rain on' : 'Rain off',
      };
    }

    default:
      return null;
  }
}
