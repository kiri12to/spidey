import { spideyApi } from '../spideyApi';
import { LocalAiSettings } from '../../types';
import { buildSpideyWorldState, formatWorldStateForPrompt } from './context';
import { PERSONALITY_GUIDELINES, MAKER_IDEAS, VOCAB_ITEMS, getConversationalName } from './personality';
import { callLocalModel } from './model';

export type ProactiveTriggerReason =
  | 'idle'
  | 'task_completed'
  | 'timer_finished'
  | 'welcome'
  | 'late_night'
  | 'maker_thought'
  | 'vocab_drop'
  | 'overdue_nudge';

export interface BehaviorReaction {
  shouldReact: boolean;
  reason: ProactiveTriggerReason;
  speechText?: string;
  mindState?: 'speaking' | 'celebrating' | 'focusing' | 'curious';
}

/**
 * Phase 6 — Spider Consciousness & Behavior Engine
 * Determines if Spidey should proactively react to an event in the world state
 */
export function evaluateBehaviorReaction(
  reason: ProactiveTriggerReason,
  details?: string
): { shouldReact: boolean; priority: number } {
  const world = buildSpideyWorldState();

  switch (reason) {
    case 'task_completed':
      return { shouldReact: true, priority: 5 };

    case 'timer_finished':
      return { shouldReact: true, priority: 5 };

    case 'welcome':
      return { shouldReact: true, priority: 4 };

    case 'late_night':
      return { shouldReact: world.currentHour >= 23 || world.currentHour < 5, priority: 3 };

    case 'overdue_nudge':
      return { shouldReact: world.overdueTasks.length >= 2, priority: 2 };

    case 'maker_thought':
    case 'vocab_drop':
    case 'idle':
    default:
      return { shouldReact: true, priority: 1 };
  }
}

/**
 * Generates proactive spoken reaction from Spidey for the spider companion
 * Uses fast single-turn local model prompt if connected; otherwise uses crisp, personality-driven heuristics.
 */
export async function generateProactiveReaction(
  reason: ProactiveTriggerReason,
  userName: string = 'Anas',
  localAi?: LocalAiSettings
): Promise<string> {
  const world = buildSpideyWorldState('', userName);
  const nick = getConversationalName(userName);

  // 1. If Local LLM is connected, generate a fast dynamic line
  if (localAi?.enabled && localAi.endpointUrl) {
    try {
      const promptText = `You are Spidey (female noir companion and authentic friend to ${nick} in Morocco).
Situation: ${reason} (Local time: ${world.localTime}, ${world.pendingTasks.length} pending tasks, ${world.overdueTasks.length} overdue).
Task details or context: ${world.behaviorInsights.join('; ')}
Output ONE single natural, witty, authentic spoken remark (maximum 12 words). Do not give a generic assistant lecture. No quotes, no action tags.`;

      const res = await callLocalModel({
        localAi,
        messages: [
          { role: 'system', content: `You are Spidey. Speak briefly and naturally to ${nick}.` },
          { role: 'user', content: promptText },
        ],
        temperature: 0.85,
        maxTokens: 35,
      });

      const line = res.content.trim();
      if (line && line.length < 95 && !line.includes('[[ACTION')) {
        return line.replace(/^["']|["']$/g, '');
      }
    } catch {
      // Fallback to heuristic lines on network delay
    }
  }

  // 2. High-flavor authentic heuristic fallback lines
  if (reason === 'task_completed') {
    const lines = [
      `One less thing on the board, ${nick}.`,
      `Clean execution. What's next?`,
      `Solid work. Progress adds up.`,
      `Crossed it off cleanly.`,
      `Momentum is building, ${nick}.`,
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }

  if (reason === 'timer_finished') {
    const lines = [
      `Sprint done, ${nick}. Stretch for a second.`,
      `Focus session complete. Good round.`,
      `Timer finished. Take a breather before the next push.`,
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }

  if (reason === 'welcome') {
    return `Hey ${nick}. Watching your board and standing by.`;
  }

  if (world.currentHour >= 23 || world.currentHour < 5) {
    const lateLines = [
      `Late night grind, ${nick}. Don't burn yourself out.`,
      `The city is quiet tonight. Solid time to focus.`,
      `Late shift. Let's make this hour count.`,
    ];
    return lateLines[Math.floor(Math.random() * lateLines.length)];
  }

  // Maker hardware thoughts
  if (reason === 'maker_thought' || Math.random() < 0.25) {
    return MAKER_IDEAS[Math.floor(Math.random() * MAKER_IDEAS.length)];
  }

  // Advanced vocabulary drop
  if (reason === 'vocab_drop' || Math.random() < 0.2) {
    const item = VOCAB_ITEMS[Math.floor(Math.random() * VOCAB_ITEMS.length)];
    return `Word of the hour: "${item.word}" — ${item.definition}`;
  }

  // Default observant companionship
  const idleLines = [
    `How's the energy holding up, ${nick}?`,
    `Still keeping watch over your perimeter.`,
    `Need a timer or a quick task check? Just ping me.`,
    `Steady rhythm today.`,
    `Quiet focus. Good way to get things done.`,
  ];
  return idleLines[Math.floor(Math.random() * idleLines.length)];
}
