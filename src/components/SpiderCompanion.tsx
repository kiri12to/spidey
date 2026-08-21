import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LocalAiSettings } from '../types';
import { generateCompanionProactiveLine } from '../services/aiAssistant';
import { spideyApi, SpideyMindState } from '../services/spideyApi';

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
  | 'dragged';

interface Point {
  x: number;
  y: number;
}

export const SpiderCompanion: React.FC<SpiderCompanionProps> = ({
  enabled,
  size = 'medium',
  userName = 'Anas',
  localAi,
  proactiveTrigger,
  onSpiderClick,
}) => {
  if (!enabled) return null;

  // Pixel scale
  const sizePx = size === 'small' ? 38 : size === 'large' ? 58 : 48;

  // React State for rendering
  const [pos, setPos] = useState<Point>({ x: 140, y: 160 });
  const [angle, setAngle] = useState<number>(0);
  const [spiderState, setSpiderState] = useState<SpiderState>('resting');
  const [speechBubble, setSpeechBubble] = useState<string | null>(null);
  const [eyeGlint, setEyeGlint] = useState<boolean>(false);
  const [mindState, setMindState] = useState<SpideyMindState>('idle');

  // Core Simulation State in Refs for 60fps jitter-free physics
  const posRef = useRef<Point>({ x: 140, y: 160 });
  const velRef = useRef<Point>({ x: 0, y: 0 });
  const targetPosRef = useRef<Point>({ x: 140, y: 160 });
  const angleRef = useRef<number>(0);
  const spiderStateRef = useRef<SpiderState>('resting');
  const legFrameRef = useRef<number>(0);

  // Dragging state
  const isDraggingRef = useRef<boolean>(false);
  const dragOffsetRef = useRef<Point>({ x: 0, y: 0 });

  // Mouse & User Activity tracking
  const mousePosRef = useRef<Point>({ x: -1000, y: -1000 });
  const lastMouseMoveTimeRef = useRef<number>(Date.now());
  const lastUserInteractionTimeRef = useRef<number>(Date.now());
  const lastIdleSpeechTimeRef = useRef<number>(Date.now());

  // Sync state ref
  useEffect(() => {
    spiderStateRef.current = spiderState;
  }, [spiderState]);

  // Subscribe to Spidey Mind State in spideyApi
  useEffect(() => {
    return spideyApi.subscribe(() => {
      const mind = spideyApi.getMindState();
      setMindState(mind.state);

      if (mind.state === 'thinking') {
        setSpiderState('thinking');
        setEyeGlint(true);
      } else if (mind.state === 'celebrating') {
        setSpiderState('celebrating');
        setEyeGlint(true);
        setTimeout(() => setEyeGlint(false), 2000);
      } else if (mind.state === 'speaking') {
        setEyeGlint(true);
        setTimeout(() => setEyeGlint(false), 1200);
      }
    });
  }, []);

  // Window mouse move & keydown listener for idle detection
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mousePosRef.current = { x: e.clientX, y: e.clientY };
      lastMouseMoveTimeRef.current = Date.now();
      lastUserInteractionTimeRef.current = Date.now();
    };

    const handleKeyDown = () => {
      lastUserInteractionTimeRef.current = Date.now();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Pick smooth target location on screen bounds with safe margins
  const pickNewRoamTarget = useCallback(() => {
    const margin = 80;
    const w = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const h = typeof window !== 'undefined' ? window.innerHeight : 800;

    const tx = margin + Math.random() * (w - margin * 2);
    const ty = margin + Math.random() * (h - margin * 2);

    targetPosRef.current = { x: tx, y: ty };
  }, []);

  // Spider Speech Lines (Supports AI dynamic generation or manual customText)
  const triggerSpiderSpeech = useCallback(async (customText?: string, reason: 'idle' | 'task_completed' | 'timer_finished' | 'welcome' = 'idle') => {
    let quote = customText;

    if (!quote) {
      quote = await generateCompanionProactiveLine(reason, userName, localAi);
    }

    setSpeechBubble(quote);
    setEyeGlint(true);

    setTimeout(() => {
      setSpeechBubble(null);
    }, 4800);

    setTimeout(() => {
      setEyeGlint(false);
    }, 1200);
  }, [userName, localAi]);

  // React to proactive trigger events (e.g. task completed or timer finished)
  useEffect(() => {
    if (proactiveTrigger) {
      triggerSpiderSpeech(proactiveTrigger.customText, proactiveTrigger.reason);
    }
  }, [proactiveTrigger, triggerSpiderSpeech]);

  // Main 60FPS Physics and Autonomous AI Engine
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();
    let stateTimer = 0;

    const loop = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.05); // cap dt to avoid jump when tab switches
      lastTime = time;
      stateTimer += dt;
      legFrameRef.current += dt * 14;

      const curState = spiderStateRef.current;
      const currentPos = posRef.current;
      const mouse = mousePosRef.current;

      // Check Idle Time for Proactive Spidey Speech
      const now = Date.now();
      if (
        now - lastUserInteractionTimeRef.current > 45000 && // 45s user idle
        now - lastIdleSpeechTimeRef.current > 75000 && // at least 75s between unprompted lines
        curState === 'resting'
      ) {
        lastIdleSpeechTimeRef.current = now;
        triggerSpiderSpeech(undefined, 'idle');
      }

      // 1. DRAGGED STATE
      if (curState === 'dragged') {
        posRef.current = {
          x: mouse.x - dragOffsetRef.current.x,
          y: mouse.y - dragOffsetRef.current.y,
        };
        setPos({ ...posRef.current });
        animId = requestAnimationFrame(loop);
        return;
      }

      // 2. THINKING STATE (Paused, observant, pulsing)
      if (curState === 'thinking') {
        velRef.current = { x: 0, y: 0 };
        if (stateTimer > 4.0) {
          setSpiderState('resting');
          stateTimer = 0;
        }
        animId = requestAnimationFrame(loop);
        return;
      }

      // 3. CELEBRATING STATE (Cheery little spin)
      if (curState === 'celebrating') {
        angleRef.current += dt * 8.0;
        setAngle(angleRef.current);
        if (stateTimer > 1.5) {
          setSpiderState('resting');
          stateTimer = 0;
        }
        animId = requestAnimationFrame(loop);
        return;
      }

      // 4. CURSOR PROXIMITY CHECK (Curious crawl toward nearby cursor if quiet)
      const distToMouse = Math.hypot(mouse.x - currentPos.x, mouse.y - currentPos.y);
      const isMouseRecent = Date.now() - lastMouseMoveTimeRef.current < 2000;

      if (curState !== 'resting' && isMouseRecent && distToMouse < 220 && distToMouse > 70) {
        if (curState !== 'following_cursor') {
          setSpiderState('following_cursor');
        }
        targetPosRef.current = {
          x: mouse.x + Math.sin(time * 0.002) * 40,
          y: mouse.y + Math.cos(time * 0.002) * 40,
        };
      }

      // 5. AUTONOMOUS STATE TRANSITIONS
      if (curState === 'resting') {
        if (stateTimer > 3.0 + Math.random() * 4.0) {
          // Transition smoothly to a new roaming destination
          stateTimer = 0;
          pickNewRoamTarget();
          setSpiderState('crawling');
        }
      } else if (curState === 'crawling' || curState === 'following_cursor') {
        const dx = targetPosRef.current.x - currentPos.x;
        const dy = targetPosRef.current.y - currentPos.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 25 || stateTimer > 8.0) {
          // Reached target smoothly
          setSpiderState('resting');
          velRef.current = { x: 0, y: 0 };
          stateTimer = 0;
        } else {
          // Rotate smoothly towards movement direction
          const targetAngle = Math.atan2(dy, dx) + Math.PI / 2;
          let diffAngle = targetAngle - angleRef.current;
          while (diffAngle < -Math.PI) diffAngle += Math.PI * 2;
          while (diffAngle > Math.PI) diffAngle -= Math.PI * 2;

          angleRef.current += diffAngle * Math.min(dt * 5.0, 1.0);
          setAngle(angleRef.current);

          // Crawl acceleration
          const speed = curState === 'following_cursor' ? 85 : 65;
          const moveAngle = angleRef.current - Math.PI / 2;
          const targetVx = Math.cos(moveAngle) * speed;
          const targetVy = Math.sin(moveAngle) * speed;

          velRef.current.x += (targetVx - velRef.current.x) * dt * 4.0;
          velRef.current.y += (targetVy - velRef.current.y) * dt * 4.0;

          // Apply continuous step
          posRef.current.x += velRef.current.x * dt;
          posRef.current.y += velRef.current.y * dt;

          // Boundary clamp with margin
          const margin = 30;
          const maxW = typeof window !== 'undefined' ? window.innerWidth - margin : 1200;
          const maxH = typeof window !== 'undefined' ? window.innerHeight - margin : 800;
          posRef.current.x = Math.max(margin, Math.min(maxW, posRef.current.x));
          posRef.current.y = Math.max(margin, Math.min(maxH, posRef.current.y));

          setPos({ ...posRef.current });
        }
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [pickNewRoamTarget, sizePx, triggerSpiderSpeech]);

  // Handle Drag Start
  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    isDraggingRef.current = true;
    dragOffsetRef.current = {
      x: e.clientX - posRef.current.x,
      y: e.clientY - posRef.current.y,
    };
    setSpiderState('dragged');
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.touches.length === 1) {
      isDraggingRef.current = true;
      const t = e.touches[0];
      dragOffsetRef.current = {
        x: t.clientX - posRef.current.x,
        y: t.clientY - posRef.current.y,
      };
      setSpiderState('dragged');
    }
  };

  const handleMouseUp = () => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      setSpiderState('resting');
      triggerSpiderSpeech(`Watching your perimeter.`);
    }
  };

  const handleTouchEnd = () => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      setSpiderState('resting');
      triggerSpiderSpeech(`Standing guard.`);
    }
  };

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchend', handleTouchEnd);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  // Compute Animated Leg Points based on current gait cycle
  const legCycle = legFrameRef.current;
  const isMoving = spiderState === 'crawling' || spiderState === 'following_cursor';
  const legAmp = isMoving ? 6.5 : 1.2;

  return (
    <>
      {/* Interactive Noir Spider Entity */}
      <div
        id="spidey-companion"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onClick={(e) => {
          e.stopPropagation();
          triggerSpiderSpeech();
          if (onSpiderClick) onSpiderClick();
        }}
        style={{
          transform: `translate3d(${pos.x - sizePx / 2}px, ${pos.y - sizePx / 2}px, 0) rotate(${angle}rad)`,
          width: `${sizePx}px`,
          height: `${sizePx}px`,
          cursor: isDraggingRef.current ? 'grabbing' : 'grab',
        }}
        className="fixed top-0 left-0 z-[90] select-none group"
        title="Spidey — Click to talk or drag around"
      >
        {/* SVG Detailed Noir Spider Anatomy */}
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)] filter transition-all"
        >
          <defs>
            {/* Dark Metallic Noir Gradients */}
            <radialGradient id="abdomenGrad" cx="45%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#2c2d30" />
              <stop offset="60%" stopColor="#131416" />
              <stop offset="100%" stopColor="#08080a" />
            </radialGradient>

            <radialGradient id="cephalothoraxGrad" cx="50%" cy="35%" r="55%">
              <stop offset="0%" stopColor="#383a3f" />
              <stop offset="70%" stopColor="#1a1b1e" />
              <stop offset="100%" stopColor="#0d0d0f" />
            </radialGradient>

            {/* Glowing Ruby Spider Emblem */}
            <filter id="rubyGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* 8 Articulated Spider Legs (4 Left, 4 Right) */}
          <g stroke="#1b1c20" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
            {/* Left Leg 1 */}
            <path
              d={`M 40 40 Q ${20 + Math.sin(legCycle) * legAmp} ${18 + Math.cos(legCycle) * legAmp} ${10 + Math.sin(legCycle) * (legAmp * 1.4)} ${12 + Math.cos(legCycle) * legAmp}`}
            />
            {/* Left Leg 2 */}
            <path
              d={`M 38 46 Q ${14 - Math.cos(legCycle) * legAmp} ${34 + Math.sin(legCycle) * legAmp} ${4 - Math.cos(legCycle) * (legAmp * 1.2)} ${38 + Math.sin(legCycle) * legAmp}`}
            />
            {/* Left Leg 3 */}
            <path
              d={`M 38 54 Q ${15 + Math.sin(legCycle) * legAmp} ${62 - Math.cos(legCycle) * legAmp} ${6 + Math.sin(legCycle) * (legAmp * 1.2)} ${70 - Math.cos(legCycle) * legAmp}`}
            />
            {/* Left Leg 4 */}
            <path
              d={`M 42 62 Q ${22 - Math.cos(legCycle) * legAmp} ${82 + Math.sin(legCycle) * legAmp} ${14 - Math.cos(legCycle) * (legAmp * 1.4)} ${94 + Math.sin(legCycle) * legAmp}`}
            />

            {/* Right Leg 1 */}
            <path
              d={`M 60 40 Q ${80 - Math.sin(legCycle) * legAmp} ${18 - Math.cos(legCycle) * legAmp} ${90 - Math.sin(legCycle) * (legAmp * 1.4)} ${12 - Math.cos(legCycle) * legAmp}`}
            />
            {/* Right Leg 2 */}
            <path
              d={`M 62 46 Q ${86 + Math.cos(legCycle) * legAmp} ${34 - Math.sin(legCycle) * legAmp} ${96 + Math.cos(legCycle) * (legAmp * 1.2)} ${38 - Math.sin(legCycle) * legAmp}`}
            />
            {/* Right Leg 3 */}
            <path
              d={`M 62 54 Q ${85 - Math.sin(legCycle) * legAmp} ${62 + Math.cos(legCycle) * legAmp} ${94 - Math.sin(legCycle) * (legAmp * 1.2)} ${70 + Math.cos(legCycle) * legAmp}`}
            />
            {/* Right Leg 4 */}
            <path
              d={`M 58 62 Q ${78 + Math.cos(legCycle) * legAmp} ${82 - Math.sin(legCycle) * legAmp} ${86 + Math.cos(legCycle) * (legAmp * 1.4)} ${94 - Math.sin(legCycle) * legAmp}`}
            />
          </g>

          {/* Abdomen (Posterior Body) */}
          <ellipse cx="50" cy="65" rx="16" ry="21" fill="url(#abdomenGrad)" stroke="#09090b" strokeWidth="1.5" />

          {/* Stylized Crimson Spider Hourglass / Emblem on Abdomen */}
          <path
            d="M 47 52 L 53 52 L 50 63 Z M 50 64 L 54 75 L 46 75 Z"
            fill="#e11d48"
            opacity="0.9"
            filter="url(#rubyGlow)"
          />

          {/* Spinneret Node at Abdomen Tail */}
          <circle cx="50" cy="86" r="2.2" fill="#27272a" />

          {/* Cephalothorax (Head & Torso) */}
          <ellipse cx="50" cy="42" rx="12" ry="11" fill="url(#cephalothoraxGrad)" stroke="#09090b" strokeWidth="1.5" />

          {/* 4 Ocelli Eyes (Ruby Glint Optics) */}
          <g>
            <circle cx="46.5" cy="35" r="2.2" fill="#ef4444" opacity={eyeGlint ? 1 : 0.85} filter={eyeGlint ? 'url(#rubyGlow)' : undefined} />
            <circle cx="53.5" cy="35" r="2.2" fill="#ef4444" opacity={eyeGlint ? 1 : 0.85} filter={eyeGlint ? 'url(#rubyGlow)' : undefined} />

            <circle cx="43.5" cy="37.5" r="1.4" fill="#991b1b" />
            <circle cx="56.5" cy="37.5" r="1.4" fill="#991b1b" />

            <circle cx="46" cy="34.5" r="0.6" fill="#ffffff" opacity="0.9" />
            <circle cx="53" cy="34.5" r="0.6" fill="#ffffff" opacity="0.9" />
          </g>

          {/* Chelicerae (Front Jaws) */}
          <path d="M 47 32 L 45 28 L 48 30 Z" fill="#27272a" />
          <path d="M 53 32 L 55 28 L 52 30 Z" fill="#27272a" />
        </svg>

        {/* Speech Bubble popout above spider (oriented straight up) */}
        {speechBubble && (
          <div
            style={{
              transform: `rotate(${-angle}rad)`,
            }}
            className="absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap bg-neutral-950/95 border border-red-900/80 px-3 py-1 rounded-lg text-red-200 text-xs font-mono-code shadow-2xl pointer-events-none z-50 backdrop-blur-xs"
          >
            <span>{speechBubble}</span>
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-950" />
          </div>
        )}
      </div>
    </>
  );
};

