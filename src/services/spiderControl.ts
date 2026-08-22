/**
 * Spidey's body.
 *
 * The spider used to be decoration that wandered on its own. This turns it
 * into something Spidey actually drives: she can walk it somewhere, bring it
 * to the cursor, drop in on a silk line to say something, or have it react.
 *
 * The AI emits a tool call -> a command lands here -> SpiderCompanion picks it
 * up and performs it. The component stays the only thing that knows about
 * physics; this is just the wire between them.
 */

export type SpiderCommand =
  | { type: 'goto'; place: SpiderPlace }
  | { type: 'come_here' }
  | { type: 'drop_in'; text?: string }
  | { type: 'say'; text: string }
  | { type: 'celebrate' }
  | { type: 'rest' };

export type SpiderPlace =
  | 'cursor'
  | 'center'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'corner'
  | 'header'
  | 'tasks'
  | 'notes'
  | 'chat';

type Listener = (cmd: SpiderCommand) => void;

class SpiderControl {
  private listeners = new Set<Listener>();
  /** Commands issued before the spider mounted, replayed on subscribe. */
  private queue: SpiderCommand[] = [];

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    if (this.queue.length) {
      const pending = this.queue;
      this.queue = [];
      // Let the component finish mounting before it gets told to move.
      setTimeout(() => pending.forEach((c) => fn(c)), 0);
    }
    return () => this.listeners.delete(fn);
  }

  send(cmd: SpiderCommand) {
    if (this.listeners.size === 0) {
      // Spider is disabled or not mounted -- hold a few so nothing is lost.
      if (this.queue.length < 5) this.queue.push(cmd);
      return;
    }
    this.listeners.forEach((fn) => {
      try {
        fn(cmd);
      } catch (err) {
        console.error('[spidey] spider command failed:', err);
      }
    });
  }

  /** True when a spider is actually listening — lets tools answer honestly. */
  get isAvailable(): boolean {
    return this.listeners.size > 0;
  }
}

export const spiderControl = new SpiderControl();

/** Named places resolve against the real DOM where possible. */
export function resolvePlace(place: SpiderPlace, cursor: { x: number; y: number }) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const m = 70;

  const fromEl = (selector: string) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0) return null;
    return { x: r.left + r.width / 2, y: Math.max(m, r.top + r.height / 2) };
  };

  switch (place) {
    case 'cursor':
      return { x: cursor.x, y: cursor.y + 60 };
    case 'center':
      return { x: w / 2, y: h / 2 };
    case 'top':
      return { x: w / 2, y: m };
    case 'bottom':
      return { x: w / 2, y: h - m };
    case 'left':
      return { x: m, y: h / 2 };
    case 'right':
      return { x: w - m, y: h / 2 };
    case 'corner':
      return { x: w - m, y: h - m };
    case 'header':
      return fromEl('header') || { x: w / 2, y: m };
    case 'tasks':
      return fromEl('[data-spidey="tasks"]') || { x: w * 0.3, y: h * 0.4 };
    case 'notes':
      return fromEl('[data-spidey="notes"]') || { x: w * 0.7, y: h * 0.4 };
    case 'chat':
      return fromEl('[data-spidey="chat"]') || { x: w - m, y: h - m };
    default:
      return { x: w / 2, y: h / 2 };
  }
}
