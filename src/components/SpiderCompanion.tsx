import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LocalAiSettings } from '../types';
import { generateCompanionProactiveLine } from '../services/aiAssistant';
import { spideyApi, SpideyMindState } from '../services/spideyApi';
import { spiderControl, resolvePlace } from '../services/spiderControl';

/**
 * =============================================================================
 * SPIDEY — procedural spider companion
 * =============================================================================
 *
 * WHY THIS WAS REWRITTEN
 *
 * The old version drove the gait off a clock:
 *
 *     legFrameRef.current += dt * 14;   // constant, regardless of speed
 *
 * so the legs waved at a fixed rate while the body translated at whatever
 * speed it liked. That mismatch IS foot-sliding — the same reason a badly
 * animated game character looks like it's on ice.
 *
 * It also couldn't be fixed in place: the legs lived INSIDE the small rotated
 * SVG, so a "foot" rotated along with the body. Feet that move with the body
 * can never be planted, and planted feet are the entire trick.
 *
 * HOW IT WORKS NOW
 *
 *   - one fixed full-viewport SVG; legs are drawn in SCREEN space
 *   - each foot is a world coordinate that STAYS PUT while the body moves
 *   - a foot only steps once it has drifted too far from where it wants to be,
 *     so step frequency emerges from body speed and sliding is impossible
 *   - alternating tetrapod gait: half the legs airborne at most
 *   - every frame writes straight to the DOM from refs, so React never
 *     re-renders during motion (that's what made her stutter when the chat
 *     drawer mounted)
 * =============================================================================
 */

export interface SpiderCompanionProps {
  enabled: boolean;
  size?: 'small' | 'medium' | 'large';
  userName?: string;
  localAi?: LocalAiSettings;
  proactiveTrigger?: {
    id: number;
    reason: 'task_completed' | 'timer_finished' | 'welcome';
    customText?: string;
  } | null;
  onSpiderClick?: () => void;
}

type SpiderState =
  | 'resting'
  | 'crawling'
  | 'following_cursor'
  | 'thinking'
  | 'celebrating'
  | 'dragged'
  | 'descending'
  | 'hanging'
  | 'ascending';

interface Point {
  x: number;
  y: number;
}

interface Leg {
  /** Shoulder attachment, body-local px (unrotated). */
  anchor: Point;
  /** Where this foot wants to sit, body-local. */
  rest: Point;
  /** Current foot position — WORLD space. This is what stays planted. */
  foot: Point;
  stepping: boolean;
  stepT: number;
  stepFrom: Point;
  stepTo: Point;
  /** 0 or 1 — alternating tetrapod groups. */
  group: 0 | 1;
}

const TAU = Math.PI * 2;

function rotate(p: Point, a: number): Point {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

export const SpiderCompanion: React.FC<SpiderCompanionProps> = ({
  enabled,
  size = 'medium',
  userName = 'Kiri',
  localAi,
  proactiveTrigger,
  onSpiderClick,
}) => {
  const scale = size === 'small' ? 0.78 : size === 'large' ? 1.2 : 1;
  const LEG_BONE = 17 * scale;
  const STEP_THRESHOLD = 15 * scale;
  const STEP_DURATION = 0.11;

  const [speechBubble, setSpeechBubble] = useState<string | null>(null);
  const [eyeGlint, setEyeGlint] = useState(false);
  const [, setMindState] = useState<SpideyMindState>('idle');

  // ---- refs: everything the loop touches ---------------------------------
  const posRef = useRef<Point>({ x: 200, y: 220 });
  const velRef = useRef<Point>({ x: 0, y: 0 });
  const targetRef = useRef<Point>({ x: 200, y: 220 });
  const angleRef = useRef(0);
  const stateRef = useRef<SpiderState>('resting');
  const legsRef = useRef<Leg[]>([]);
  const activeGroupRef = useRef<0 | 1>(0);

  const anchorRef = useRef<Point>({ x: 200, y: 0 });
  const swayRef = useRef(0);
  const swayVelRef = useRef(0);
  const hangDepthRef = useRef(0);

  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef<Point>({ x: 0, y: 0 });
  const mouseRef = useRef<Point>({ x: -9999, y: -9999 });
  const lastMouseMoveRef = useRef(Date.now());
  const lastInteractionRef = useRef(Date.now());
  const lastIdleSpeechRef = useRef(Date.now());
  const pendingDropRef = useRef<string | null>(null);

  // Callbacks live in refs so the rAF loop can mount ONCE and never restart.
  // Previously they were effect dependencies, so every App re-render tore the
  // loop down and reset its state timer -- she never got the ~3 uninterrupted
  // seconds she needs to decide to go for a walk, so she just sat there.
  const speakRef = useRef<(t?: string, r?: any) => void>(() => {});
  const dropRef = useRef<(t?: string) => void>(() => {});

  // Locomotion envelope: real spiders dart and freeze, they don't glide.
  const stateTimerRef = useRef(0);
  const burstRef = useRef(0);
  const burstDurRef = useRef(0);
  const pauseRef = useRef(0);
  const curveRef = useRef(0);
  const restDwellRef = useRef(2.5);
  const lastSeenPosRef = useRef<Point>({ x: 200, y: 220 });
  const lastHangRef = useRef(Date.now());
  const silentHangRef = useRef(false);
  const stuckSinceRef = useRef(0);
  const idleSwayRef = useRef(0);

  const bodyRef = useRef<SVGGElement | null>(null);
  const legPathRefs = useRef<(SVGPathElement | null)[]>([]);
  const threadRef = useRef<SVGPathElement | null>(null);
  const silkGlowRef = useRef<SVGPathElement | null>(null);
  const anchorTuftRef = useRef<SVGGElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const hitRef = useRef<HTMLDivElement | null>(null);

  const reducedMotion =
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- build legs once ----------------------------------------------------
  if (legsRef.current.length === 0) {
    const layout = [
      { ax: -6, ay: -7, rx: -24, ry: -26 },
      { ax: -8, ay: -2, rx: -31, ry: -7 },
      { ax: -8, ay: 3, rx: -30, ry: 12 },
      { ax: -6, ay: 8, rx: -22, ry: 28 },
      { ax: 6, ay: -7, rx: 24, ry: -26 },
      { ax: 8, ay: -2, rx: 31, ry: -7 },
      { ax: 8, ay: 3, rx: 30, ry: 12 },
      { ax: 6, ay: 8, rx: 22, ry: 28 },
    ];
    // Alternating tetrapod: L1 R2 L3 R4 / R1 L2 R3 L4
    const groups: (0 | 1)[] = [0, 1, 0, 1, 1, 0, 1, 0];

    legsRef.current = layout.map((l, i) => {
      const rest = { x: l.rx * scale, y: l.ry * scale };
      const world = { x: posRef.current.x + rest.x, y: posRef.current.y + rest.y };
      return {
        anchor: { x: l.ax * scale, y: l.ay * scale },
        rest,
        foot: { ...world },
        stepping: false,
        stepT: 0,
        stepFrom: { ...world },
        stepTo: { ...world },
        group: groups[i],
      };
    });
  }

  // ---- speech -------------------------------------------------------------
  const triggerSpiderSpeech = useCallback(
    async (
      customText?: string,
      reason: 'idle' | 'task_completed' | 'timer_finished' | 'welcome' = 'idle'
    ) => {
      const quote = customText || (await generateCompanionProactiveLine(reason, userName, localAi));
      setSpeechBubble(quote);
      setEyeGlint(true);
      setTimeout(() => setSpeechBubble(null), 4800);
      setTimeout(() => setEyeGlint(false), 1200);
    },
    [userName, localAi]
  );

  /**
   * She drops in on a silk line when she has something to say, so the descent
   * carries meaning instead of being decoration that fires at random.
   */
  const dropInAndSpeak = useCallback(
    (text?: string) => {
      if (reducedMotion) {
        triggerSpiderSpeech(text);
        return;
      }
      const s = stateRef.current;
      if (s === 'descending' || s === 'hanging' || s === 'ascending' || s === 'dragged') return;

      pendingDropRef.current = text ?? '';
      lastHangRef.current = Date.now();
      const anchorX = Math.max(90, Math.min(window.innerWidth - 90, posRef.current.x));
      anchorRef.current = { x: anchorX, y: 0 };
      posRef.current = { x: anchorX, y: -30 };
      velRef.current = { x: 0, y: 0 };
      angleRef.current = 0;
      swayRef.current = 0.16;
      swayVelRef.current = 0;
      hangDepthRef.current = 120 + Math.random() * 130;

      for (const leg of legsRef.current) {
        leg.foot = { x: posRef.current.x + leg.rest.x, y: posRef.current.y + leg.rest.y };
        leg.stepping = false;
      }
      stateRef.current = 'descending';
    },
    [reducedMotion, triggerSpiderSpeech]
  );

  // ---- mind state ---------------------------------------------------------
  useEffect(() => {
    return spideyApi.subscribe(() => {
      const mind = spideyApi.getMindState();
      setMindState(mind.state);
      const s = stateRef.current;

      if (mind.state === 'thinking') {
        if (s === 'crawling' || s === 'resting' || s === 'following_cursor') {
          stateRef.current = 'thinking';
        }
        setEyeGlint(true);
      } else if (mind.state === 'celebrating') {
        if (s === 'crawling' || s === 'resting' || s === 'following_cursor') {
          stateRef.current = 'celebrating';
        }
        setEyeGlint(true);
        setTimeout(() => setEyeGlint(false), 2000);
      } else if (mind.state === 'speaking') {
        setEyeGlint(true);
        setTimeout(() => setEyeGlint(false), 1200);
      }
    });
  }, []);

  useEffect(() => {
    if (proactiveTrigger) dropInAndSpeak(proactiveTrigger.customText);
  }, [proactiveTrigger, dropInAndSpeak]);

  /**
   * Spidey driving her own body.
   *
   * She emits a tool call, it arrives here, and the spider does it. Movement
   * she chose reads completely differently from movement on a timer -- when
   * she walks over because you asked, the same animation means something.
   */
  useEffect(() => {
    return spiderControl.subscribe((cmd) => {
      const busy =
        stateRef.current === 'descending' ||
        stateRef.current === 'hanging' ||
        stateRef.current === 'ascending' ||
        stateRef.current === 'dragged';

      switch (cmd.type) {
        case 'goto':
        case 'come_here': {
          if (busy) return;
          const where =
            cmd.type === 'come_here'
              ? { x: mouseRef.current.x, y: mouseRef.current.y + 60 }
              : resolvePlace(cmd.place, mouseRef.current);
          const m = 45;
          targetRef.current = {
            x: Math.max(m, Math.min(window.innerWidth - m, where.x)),
            y: Math.max(m, Math.min(window.innerHeight - m, where.y)),
          };
          curveRef.current = (Math.random() - 0.5) * 0.5;
          stateTimerRef.current = 0;
          // Commanded trips get no dawdling pauses -- she's going somewhere.
          burstRef.current = 0;
          burstDurRef.current = 4;
          pauseRef.current = 0;
          stateRef.current = 'crawling';
          break;
        }
        case 'drop_in':
          dropInAndSpeak(cmd.text);
          break;
        case 'say':
          triggerSpiderSpeech(cmd.text);
          break;
        case 'celebrate':
          if (!busy) {
            stateRef.current = 'celebrating';
            stateTimerRef.current = 0;
          }
          break;
        case 'rest':
          if (!busy) {
            stateRef.current = 'resting';
            stateTimerRef.current = 0;
            restDwellRef.current = 8 + Math.random() * 8;
          }
          break;
      }
    });
  }, [dropInAndSpeak, triggerSpiderSpeech]);

  // ---- input --------------------------------------------------------------
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
      lastMouseMoveRef.current = Date.now();
      lastInteractionRef.current = Date.now();
      if (isDraggingRef.current) {
        posRef.current = {
          x: e.clientX - dragOffsetRef.current.x,
          y: e.clientY - dragOffsetRef.current.y,
        };
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current || e.touches.length !== 1) return;
      const t = e.touches[0];
      posRef.current = {
        x: t.clientX - dragOffsetRef.current.x,
        y: t.clientY - dragOffsetRef.current.y,
      };
    };
    const onKey = () => {
      lastInteractionRef.current = Date.now();
    };
    const onUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        stateRef.current = 'resting';
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('keydown', onKey);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchend', onUp);
    };
  }, []);

  useEffect(() => {
    speakRef.current = triggerSpiderSpeech;
    dropRef.current = dropInAndSpeak;
  }, [triggerSpiderSpeech, dropInAndSpeak]);

  const pickRoamTarget = useCallback(() => {
    const m = 90;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const from = posRef.current;

    // Try a few candidates and take one that's actually a trip. Pure random
    // often lands 40px away, which reads as twitching rather than roaming.
    let best = { x: m + Math.random() * (w - m * 2), y: m + Math.random() * (h - m * 2) };
    let bestD = 0;
    for (let i = 0; i < 5; i++) {
      const c = { x: m + Math.random() * (w - m * 2), y: m + Math.random() * (h - m * 2) };
      const d = Math.hypot(c.x - from.x, c.y - from.y);
      if (d > bestD) {
        bestD = d;
        best = c;
      }
      if (bestD > Math.min(w, h) * 0.45) break;
    }
    targetRef.current = best;
    // Bias the route to one side so she arcs instead of ruling a straight line.
    curveRef.current = (Math.random() - 0.5) * 0.9;
  }, []);

  // ---- the loop -----------------------------------------------------------
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let last = performance.now();

    /**
     * THE ANTI-SLIDE ENGINE.
     *
     * A foot does nothing at all while the body moves over it. Only when it
     * has drifted past STEP_THRESHOLD from where it *should* be does it lift
     * and plant somewhere new. Step frequency therefore falls out of body
     * speed automatically — walk slowly, few steps; hurry, many. There is no
     * clock anywhere in here, which is precisely why it cannot slide.
     */
    const updateLegs = (dt: number) => {
      const pos = posRef.current;
      const ang = angleRef.current;
      const vel = velRef.current;
      const speed = Math.hypot(vel.x, vel.y);
      const legs = legsRef.current;

      // Feet land slightly ahead when moving, so she walks INTO her stride
      // rather than dragging her legs behind her.
      const lead = Math.min(speed * 0.14, 22);
      const leadV =
        speed > 1 ? { x: (vel.x / speed) * lead, y: (vel.y / speed) * lead } : { x: 0, y: 0 };

      const groupBusy = legs.some((l) => l.stepping && l.group === activeGroupRef.current);
      if (!groupBusy) activeGroupRef.current = activeGroupRef.current === 0 ? 1 : 0;

      // Faster body -> shorter time in the air, or the legs can never catch up.
      const stepDur = Math.max(0.055, STEP_DURATION - speed * 0.00035);

      for (const leg of legs) {
        const r = rotate(leg.rest, ang);
        const ideal = { x: pos.x + r.x + leadV.x, y: pos.y + r.y + leadV.y };

        // Aim where the body WILL be when the foot lands. Without this the
        // foot touches down already behind the body and drift compounds until
        // the leg is permanently overstretched.
        const plant = { x: ideal.x + vel.x * stepDur, y: ideal.y + vel.y * stepDur };

        if (leg.stepping) {
          leg.stepT += dt / stepDur;
          if (leg.stepT >= 1) {
            leg.stepT = 1;
            leg.stepping = false;
            leg.foot = { ...leg.stepTo };
          } else {
            const t = leg.stepT;
            const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            leg.foot = {
              x: leg.stepFrom.x + (leg.stepTo.x - leg.stepFrom.x) * e,
              y: leg.stepFrom.y + (leg.stepTo.y - leg.stepFrom.y) * e,
            };
          }
          continue;
        }

        const drift = Math.hypot(leg.foot.x - ideal.x, leg.foot.y - ideal.y);

        // Normally a leg waits its turn in the gait. But if it has fallen so
        // far behind that it would visibly stretch, it steps immediately --
        // a broken gait beat reads as a stumble, a stretched leg reads as a bug.
        const desperate = drift > STEP_THRESHOLD * 2.2;

        if (drift > STEP_THRESHOLD && (leg.group === activeGroupRef.current || desperate)) {
          leg.stepping = true;
          leg.stepT = 0;
          leg.stepFrom = { ...leg.foot };
          leg.stepTo = { ...plant };
        }
      }
    };

    /**
     * Two-bone IK per leg, drawn in screen space. Equal-length bones, so the
     * knee sits on the perpendicular bisector of shoulder->foot. A compressed
     * leg pushes the knee high — that's the hunched spider silhouette.
     */
    const draw = () => {
      const pos = posRef.current;
      const ang = angleRef.current;
      const legs = legsRef.current;

      for (let i = 0; i < legs.length; i++) {
        const el = legPathRefs.current[i];
        if (!el) continue;
        const leg = legs[i];

        const sa = rotate(leg.anchor, ang);
        const S = { x: pos.x + sa.x, y: pos.y + sa.y };

        let dx = leg.foot.x - S.x;
        let dy = leg.foot.y - S.y;
        let d = Math.hypot(dx, dy);
        const reach = LEG_BONE * 2 - 0.5;
        if (d > reach) {
          dx *= reach / d;
          dy *= reach / d;
          d = reach;
        }
        const half = d / 2;
        const lift = Math.sqrt(Math.max(0, LEG_BONE * LEG_BONE - half * half));

        // Perpendicular, flipped so knees always bow AWAY from the body.
        const side = leg.rest.x < 0 ? 1 : -1;
        const px = (-dy / (d || 1)) * side;
        const py = (dx / (d || 1)) * side;

        const kx = S.x + dx / 2 + px * lift;
        const ky = S.y + dy / 2 + py * lift;

        el.setAttribute(
          'd',
          'M ' + S.x.toFixed(1) + ' ' + S.y.toFixed(1) +
          ' Q ' + kx.toFixed(1) + ' ' + ky.toFixed(1) +
          ' ' + (S.x + dx).toFixed(1) + ' ' + (S.y + dy).toFixed(1)
        );
      }

      if (bodyRef.current) {
        bodyRef.current.setAttribute(
          'transform',
          'translate(' + pos.x.toFixed(1) + ' ' + pos.y.toFixed(1) + ') rotate(' +
            ((ang * 180) / Math.PI).toFixed(1) + ') scale(' + scale + ')'
        );
      }

      const s = stateRef.current;
      const onSilk = s === 'descending' || s === 'hanging' || s === 'ascending';
      if (threadRef.current) {
        if (onSilk) {
          const a = anchorRef.current;
          const tipY = pos.y - 12 * scale;

          // A hanging thread is a CATENARY, not a straight line or a single
          // arc. Sampling the curve and letting the sag trail the swing is
          // what makes silk look like silk instead of wire: the middle lags
          // behind the ends, so it whips slightly as she settles.
          const segs = 14;
          let d = 'M ' + a.x.toFixed(1) + ' ' + a.y.toFixed(1);
          for (let i = 1; i <= segs; i++) {
            const t = i / segs;
            const bx = a.x + (pos.x - a.x) * t;
            const by = a.y + (tipY - a.y) * t;
            // sin(pi*t) peaks mid-span and vanishes at both anchors
            const lag = Math.sin(Math.PI * t) * swayVelRef.current * 9;
            const droop = Math.sin(Math.PI * t) * 3.5;
            d += ' L ' + (bx + lag).toFixed(1) + ' ' + (by + droop).toFixed(1);
          }
          threadRef.current.setAttribute('d', d);
          threadRef.current.setAttribute('opacity', '0.75');
          if (silkGlowRef.current) {
            silkGlowRef.current.setAttribute('d', d);
            silkGlowRef.current.setAttribute('opacity', '0.28');
          }
          if (anchorTuftRef.current) {
            anchorTuftRef.current.setAttribute(
              'transform',
              'translate(' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) + ')'
            );
            anchorTuftRef.current.setAttribute('opacity', '0.5');
          }
        } else {
          threadRef.current.setAttribute('opacity', '0');
          if (silkGlowRef.current) silkGlowRef.current.setAttribute('opacity', '0');
          if (anchorTuftRef.current) anchorTuftRef.current.setAttribute('opacity', '0');
        }
      }

      if (bubbleRef.current) {
        bubbleRef.current.style.transform =
          'translate3d(' + (pos.x - 100).toFixed(1) + 'px,' + (pos.y - 58 * scale).toFixed(1) + 'px,0)';
      }
      if (hitRef.current) {
        hitRef.current.style.transform =
          'translate3d(' + (pos.x - 22 * scale).toFixed(1) + 'px,' + (pos.y - 22 * scale).toFixed(1) + 'px,0)';
      }
    };

    const step = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      stateTimerRef.current += dt;

      const st = stateRef.current;
      const pos = posRef.current;
      const mouse = mouseRef.current;

      // WATCHDOG. If she's been in one spot too long without being dragged or
      // busy, force a trip. A companion that can silently get stuck is worse
      // than one that occasionally wanders at a bad moment.
      if (Math.hypot(pos.x - lastSeenPosRef.current.x, pos.y - lastSeenPosRef.current.y) > 20) {
        lastSeenPosRef.current = { x: pos.x, y: pos.y };
        stuckSinceRef.current = now;
      } else if (
        now - stuckSinceRef.current > 12000 &&
        (st === 'resting' || st === 'crawling' || st === 'following_cursor')
      ) {
        stuckSinceRef.current = now;
        stateTimerRef.current = 0;
        pickRoamTarget();
        stateRef.current = 'crawling';
      }

      // AMBIENT HANG. Every so often she climbs up and just dangles there --
      // no message, no reason. Movement with no purpose is what makes a
      // creature feel alive rather than scripted; every drop meaning
      // "she needs something" would turn the silk into a notification.
      const tNow = Date.now();
      if (
        st === 'resting' &&
        tNow - lastHangRef.current > 70000 &&
        Math.random() < 0.004
      ) {
        lastHangRef.current = tNow;
        silentHangRef.current = true;
        dropRef.current(undefined);
      }

      const t = Date.now();
      if (
        t - lastInteractionRef.current > 45000 &&
        t - lastIdleSpeechRef.current > 90000 &&
        st === 'resting'
      ) {
        lastIdleSpeechRef.current = t;
        dropRef.current();
      }

      // ================= WEB DESCENT =================
      if (st === 'descending' || st === 'hanging' || st === 'ascending') {
        const anchor = anchorRef.current;

        // Damped pendulum on the silk: gravity pulls the swing back to centre,
        // damping bleeds it off so she settles instead of swinging forever.
        const len = Math.max(40, Math.abs(pos.y - anchor.y));
        swayVelRef.current += -((9.8 * 2.2) / len) * Math.sin(swayRef.current) * dt;
        swayVelRef.current *= 0.985;
        swayRef.current += swayVelRef.current * dt;

        if (st === 'descending') {
          // Ease out near the bottom — spiders pay out silk, they don't
          // free-fall and stop dead.
          const remaining = hangDepthRef.current - (pos.y - anchor.y);
          pos.y += Math.max(45, Math.min(420, remaining * 3.2)) * dt;
          if (remaining < 2) {
            stateRef.current = 'hanging';
            stateTimerRef.current = 0;
            const line = pendingDropRef.current;
            pendingDropRef.current = null;
            if (silentHangRef.current) {
              silentHangRef.current = false; // just hanging out, nothing to say
            } else if (line) {
              speakRef.current(line);
            } else if (line === '') {
              speakRef.current();
            }
          }
        } else if (st === 'hanging') {
          // A silent hang lingers -- she's not waiting for you to read anything.
          if (stateTimerRef.current > (silentHangRef.current ? 11 : 5.2)) {
            stateRef.current = 'ascending';
            stateTimerRef.current = 0;
          }
        } else {
          pos.y -= 190 * dt;
          if (pos.y - anchor.y < 10) {
            stateRef.current = 'resting';
            stateTimerRef.current = 0;
            pos.x = anchor.x;
            pos.y = 80;
            for (const leg of legsRef.current) {
              leg.foot = { x: pos.x + leg.rest.x, y: pos.y + leg.rest.y };
              leg.stepping = false;
            }
          }
        }

        const swingLen = pos.y - anchor.y;
        pos.x = anchor.x + Math.sin(swayRef.current) * swingLen * 0.55;
        // Head points back up the thread.
        angleRef.current = Math.atan2(anchor.y - pos.y, anchor.x - pos.x) + Math.PI / 2;

        // Legs tuck loosely under her while airborne.
        for (const leg of legsRef.current) {
          const want = rotate({ x: leg.rest.x * 0.62, y: leg.rest.y * 0.62 }, angleRef.current);
          leg.foot.x += (pos.x + want.x - leg.foot.x) * Math.min(1, dt * 9);
          leg.foot.y += (pos.y + want.y - leg.foot.y) * Math.min(1, dt * 9);
        }

        draw();
        raf = requestAnimationFrame(step);
        return;
      }

      // ================= GROUND =================
      if (st === 'dragged') {
        // position set by the pointer handlers
      } else if (st === 'thinking') {
        velRef.current.x *= 0.8;
        velRef.current.y *= 0.8;
        pos.x += velRef.current.x * dt;
        pos.y += velRef.current.y * dt;
        if (stateTimerRef.current > 4) {
          stateRef.current = 'resting';
          stateTimerRef.current = 0;
        }
      } else if (st === 'celebrating') {
        angleRef.current += dt * 6;
        if (stateTimerRef.current > 1.5) {
          stateRef.current = 'resting';
          stateTimerRef.current = 0;
        }
      } else if (st === 'resting') {
        velRef.current.x *= 0.86;
        velRef.current.y *= 0.86;

        // Never perfectly still. A tiny breathing turn keeps her feeling alive
        // and, because the gait is drift-driven, it makes a foot re-plant now
        // and then all on its own.
        idleSwayRef.current += dt * 0.7;
        angleRef.current += Math.sin(idleSwayRef.current) * dt * 0.09;

        // reduced-motion used to gate this entirely, which meant she idled
        // forever on any machine with Windows animation effects turned off.
        // She still roams -- just slower and less often.
        if (stateTimerRef.current > restDwellRef.current) {
          stateTimerRef.current = 0;
          restDwellRef.current = reducedMotion
            ? 9 + Math.random() * 12
            : 1.6 + Math.random() * 4.5;
          pickRoamTarget();
          burstRef.current = 0;
          burstDurRef.current = 0.5 + Math.random() * 0.7;
          pauseRef.current = 0;
          stateRef.current = 'crawling';
        }
      } else {
        const distMouse = Math.hypot(mouse.x - pos.x, mouse.y - pos.y);
        if (Date.now() - lastMouseMoveRef.current < 2000 && distMouse < 230 && distMouse > 75) {
          stateRef.current = 'following_cursor';
          targetRef.current = {
            x: mouse.x + Math.sin(now * 0.002) * 45,
            y: mouse.y + Math.cos(now * 0.002) * 45,
          };
        }

        const dx = targetRef.current.x - pos.x;
        const dy = targetRef.current.y - pos.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 26 || stateTimerRef.current > 14) {
          stateRef.current = 'resting';
          stateTimerRef.current = 0;
          restDwellRef.current = 1.6 + Math.random() * 4.5;
        } else {
          // ---- DART / FREEZE ENVELOPE ----
          // Constant velocity is what makes a creature read as a sliding
          // sprite. Real spiders scuttle in bursts, stop dead, then go again.
          if (pauseRef.current > 0) {
            pauseRef.current -= dt;
            velRef.current.x *= 0.82;
            velRef.current.y *= 0.82;
          } else {
            burstRef.current += dt;
            if (burstRef.current > burstDurRef.current && dist > 120) {
              burstRef.current = 0;
              burstDurRef.current = 0.45 + Math.random() * 0.8;
              // Brief freeze -- the pause is what sells the dart before it.
              pauseRef.current = 0.12 + Math.random() * 0.4;
            }
          }

          // Arc toward the target instead of ruling a straight line. The bias
          // decays as she closes in so she still arrives cleanly.
          const closing = Math.min(1, dist / 260);
          const want = Math.atan2(dy, dx) + Math.PI / 2 + curveRef.current * closing;
          let diff = want - angleRef.current;
          while (diff < -Math.PI) diff += TAU;
          while (diff > Math.PI) diff -= TAU;
          // Turn faster when the correction is small: crisp, not floaty.
          angleRef.current += diff * Math.min(dt * (4 + 4 * (1 - Math.abs(diff) / Math.PI)), 1);

          const base = stateRef.current === 'following_cursor' ? 96 : 78;
          // Slow into the target rather than braking at the last moment.
          const arrive = Math.min(1, dist / 90);
          // Sharp turns cost speed, exactly like a body with mass.
          const turnCost = 1 - Math.min(0.55, Math.abs(diff) * 0.7);
          const target = pauseRef.current > 0 ? 0 : base * arrive * turnCost;

          const ma = angleRef.current - Math.PI / 2;
          // Accelerate hard, decelerate soft -- that asymmetry is the dart.
          const accel = target > Math.hypot(velRef.current.x, velRef.current.y) ? 9 : 5;
          velRef.current.x += (Math.cos(ma) * target - velRef.current.x) * Math.min(dt * accel, 1);
          velRef.current.y += (Math.sin(ma) * target - velRef.current.y) * Math.min(dt * accel, 1);

          pos.x += velRef.current.x * dt;
          pos.y += velRef.current.y * dt;

          const m = 34;
          pos.x = Math.max(m, Math.min(window.innerWidth - m, pos.x));
          pos.y = Math.max(m, Math.min(window.innerHeight - m, pos.y));
        }
      }

      updateLegs(dt);
      draw();
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // Intentionally mounts once. Everything mutable is in a ref -- adding
    // deps here is what stopped her walking in the first place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  if (!enabled) return null;

  const onPointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    const c: { clientX: number; clientY: number } =
      'touches' in e ? e.touches[0] : (e as React.MouseEvent);
    isDraggingRef.current = true;
    dragOffsetRef.current = {
      x: c.clientX - posRef.current.x,
      y: c.clientY - posRef.current.y,
    };
    stateRef.current = 'dragged';
  };

  return (
    <>
      <svg
        className="fixed inset-0 w-screen h-screen z-[90] pointer-events-none"
        style={{ overflow: 'visible' }}
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="sp-abdomen" cx="42%" cy="34%" r="62%">
            <stop offset="0%" stopColor="#2e2f33" />
            <stop offset="58%" stopColor="#131416" />
            <stop offset="100%" stopColor="#08080a" />
          </radialGradient>
          <radialGradient id="sp-thorax" cx="50%" cy="32%" r="58%">
            <stop offset="0%" stopColor="#3a3c41" />
            <stop offset="70%" stopColor="#1a1b1e" />
            <stop offset="100%" stopColor="#0d0d0f" />
          </radialGradient>
          <linearGradient id="sp-silk" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#71717a" stopOpacity="0.15" />
            <stop offset="45%" stopColor="#d4d4d8" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#f4f4f5" stopOpacity="0.95" />
          </linearGradient>
          <filter id="sp-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.6" result="b" />
            <feComposite in="SourceGraphic" in2="b" operator="over" />
          </filter>
        </defs>

        {/* Silk: a soft wide pass underneath catches the light, a crisp
            hairline on top reads as the actual filament. One stroke alone
            looks like a drawn line; two look like thread. */}
        <path
          ref={silkGlowRef}
          d=""
          stroke="#e4e4e7"
          strokeWidth={3.2}
          fill="none"
          opacity="0"
          strokeLinecap="round"
          style={{ filter: 'blur(2px)' }}
        />
        <path
          ref={threadRef}
          d=""
          stroke="url(#sp-silk)"
          strokeWidth={0.9}
          fill="none"
          opacity="0"
          strokeLinecap="round"
        />

        {/* Where the silk is anchored: a few short radial threads, like she
            actually attached it to something up there. */}
        <g ref={anchorTuftRef} opacity="0" stroke="#d4d4d8" strokeWidth="0.7" fill="none">
          <path d="M -11 5 L 0 0 L 11 5" opacity="0.55" />
          <path d="M -7 9 L 0 0 L 7 9" opacity="0.4" />
          <path d="M -13 1 L 0 0 L 13 1" opacity="0.3" />
          <path d="M -9 4 Q 0 8 9 4" opacity="0.3" />
        </g>

        {/* Legs live out here in screen space so their feet can stay planted */}
        <g
          stroke="#17181c"
          strokeWidth={3.1 * scale}
          strokeLinecap="round"
          fill="none"
          style={{ filter: 'drop-shadow(0 3px 5px rgba(0,0,0,0.75))' }}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <path
              key={i}
              ref={(el) => {
                legPathRefs.current[i] = el;
              }}
              d=""
            />
          ))}
        </g>

        {/* Body rotates; legs do not */}
        <g ref={bodyRef} style={{ filter: 'drop-shadow(0 4px 9px rgba(0,0,0,0.8))' }}>
          <ellipse cx="0" cy="9" rx="11.5" ry="15" fill="url(#sp-abdomen)" stroke="#09090b" strokeWidth="1.2" />
          <path
            d="M -2.2 -1 L 2.2 -1 L 0 7 Z M 0 8 L 3 16 L -3 16 Z"
            fill="#e11d48"
            opacity="0.92"
            filter="url(#sp-glow)"
          />
          <circle cx="0" cy="24" r="1.6" fill="#27272a" />
          <ellipse cx="0" cy="-6" rx="8.5" ry="8" fill="url(#sp-thorax)" stroke="#09090b" strokeWidth="1.2" />
          <circle cx="-2.6" cy="-11" r="1.7" fill="#ef4444" opacity={eyeGlint ? 1 : 0.8} filter={eyeGlint ? 'url(#sp-glow)' : undefined} />
          <circle cx="2.6" cy="-11" r="1.7" fill="#ef4444" opacity={eyeGlint ? 1 : 0.8} filter={eyeGlint ? 'url(#sp-glow)' : undefined} />
          <circle cx="-4.9" cy="-9" r="1" fill="#991b1b" />
          <circle cx="4.9" cy="-9" r="1" fill="#991b1b" />
          <circle cx="-2.9" cy="-11.5" r="0.45" fill="#fff" opacity="0.9" />
          <circle cx="2.3" cy="-11.5" r="0.45" fill="#fff" opacity="0.9" />
          <path d="M -2.4 -13.5 L -3.8 -16.8 L -1.4 -15 Z" fill="#27272a" />
          <path d="M 2.4 -13.5 L 3.8 -16.8 L 1.4 -15 Z" fill="#27272a" />
        </g>
      </svg>

      {/* Hit area — the SVG ignores pointers so the page stays usable */}
      <div
        ref={hitRef}
        onMouseDown={onPointerDown}
        onTouchStart={onPointerDown}
        onClick={(e) => {
          e.stopPropagation();
          onSpiderClick?.();
        }}
        className="fixed top-0 left-0 z-[91] cursor-grab active:cursor-grabbing"
        style={{ width: 44 * scale, height: 44 * scale }}
        title="Spidey — click to talk, drag to move"
      />

      {/* Speech bubble */}
      <div
        ref={bubbleRef}
        className="fixed top-0 left-0 z-[92] w-[200px] flex justify-center pointer-events-none"
      >
        {speechBubble && (
          <div className="relative whitespace-nowrap bg-neutral-950/95 border border-red-900/70 px-3 py-1.5 rounded-lg text-red-200 text-xs shadow-2xl backdrop-blur-sm">
            {speechBubble}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-950" />
          </div>
        )}
      </div>
    </>
  );
};
