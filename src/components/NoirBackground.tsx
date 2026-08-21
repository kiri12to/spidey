import React, { useEffect, useRef } from 'react';

interface NoirBackgroundProps {
  rainEnabled: boolean;
}

export const NoirBackground: React.FC<NoirBackgroundProps> = ({ rainEnabled }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!rainEnabled) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    // Subtle rain drops
    const dropCount = Math.min(Math.floor(width / 24), 50);
    const drops = Array.from({ length: dropCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      length: Math.random() * 10 + 8,
      speed: Math.random() * 3 + 2,
      opacity: Math.random() * 0.08 + 0.02,
    }));

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      ctx.strokeStyle = 'rgba(210, 215, 225, 0.06)';
      ctx.lineWidth = 1;

      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - 0.4, d.y + d.length);
        ctx.stroke();

        d.y += d.speed;
        d.x -= 0.2;

        if (d.y > height) {
          d.y = -d.length;
          d.x = Math.random() * width;
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [rainEnabled]);

  return (
    <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden bg-[#09090b]">
      {/* Very faint background geometric radial thread watermark */}
      <svg
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] text-neutral-800/15 select-none opacity-40"
        viewBox="0 0 100 100"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.3"
      >
        <circle cx="50" cy="50" r="10" />
        <circle cx="50" cy="50" r="22" strokeDasharray="1 2" />
        <circle cx="50" cy="50" r="35" />
        <circle cx="50" cy="50" r="48" strokeDasharray="2 3" />
        <line x1="50" y1="2" x2="50" y2="98" />
        <line x1="2" y1="50" x2="98" y2="50" />
        <line x1="16" y1="16" x2="84" y2="84" />
        <line x1="16" y1="84" x2="84" y2="16" />
      </svg>

      {/* Subtle vignette */}
      <div className="absolute inset-0 bg-radial-vignette opacity-70" />

      {/* Subtle rain canvas */}
      {rainEnabled && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />
      )}
    </div>
  );
};
