import { ToolResult } from '../agent/types';
import { spiderControl, SpiderPlace } from '../services/spiderControl';

const PLACES: SpiderPlace[] = [
  'cursor', 'center', 'top', 'bottom', 'left', 'right',
  'corner', 'header', 'tasks', 'notes', 'chat',
];

/**
 * Spidey's control over her own body.
 *
 * These are the only tools where the "result" is purely expressive -- nothing
 * on the board changes. That's the point: it's how she occupies the room
 * rather than just the chat box.
 */
export async function executeSpiderTools(
  toolName: string,
  args: Record<string, any>
): Promise<ToolResult | null> {
  const known = ['spider_come', 'spider_go', 'spider_drop', 'spider_celebrate', 'spider_rest'];
  if (!known.includes(toolName)) return null;

  if (!spiderControl.isAvailable) {
    // Honest failure -- she must not claim to have moved a spider that the
    // user has switched off in settings.
    return {
      toolName,
      success: false,
      message: 'The spider companion is turned off in settings, so I have no body to move right now.',
    };
  }

  switch (toolName) {
    case 'spider_come':
      spiderControl.send({ type: 'come_here' });
      return { toolName, success: true, message: 'Walked over to the cursor.' };

    case 'spider_go': {
      const raw = String(args.place || args.where || '').trim().toLowerCase();
      const place = PLACES.find((p) => p === raw);
      if (!place) {
        return {
          toolName,
          success: false,
          message: `I can go to: ${PLACES.join(', ')}. Not "${raw}".`,
        };
      }
      spiderControl.send({ type: 'goto', place });
      return { toolName, success: true, message: `Moved to ${place}.` };
    }

    case 'spider_drop':
      spiderControl.send({ type: 'drop_in', text: args.say || args.text || undefined });
      return { toolName, success: true, message: 'Dropped down on a line.' };

    case 'spider_celebrate':
      spiderControl.send({ type: 'celebrate' });
      return { toolName, success: true, message: 'Did a little spin.' };

    case 'spider_rest':
      spiderControl.send({ type: 'rest' });
      return { toolName, success: true, message: 'Settled down and stopped roaming.' };

    default:
      return null;
  }
}
