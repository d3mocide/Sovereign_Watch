import { useRef, useEffect } from 'react';

interface StarFieldProps {
  active: boolean;
  contained?: boolean;
}

interface Star {
  x: number;       // 0-1 normalized
  y: number;       // 0-1 normalized
  size: number;
  baseOpacity: number;
  twinkleSpeed: number;
  twinklePhase: number;
}

export function StarField({ active, contained = false }: StarFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Generate stars once — mix of faint background stars and brighter foreground ones
    const stars: Star[] = Array.from({ length: 320 }, () => ({
      x: Math.random(),
      y: Math.random(),
      size: Math.random() < 0.15 ? Math.random() * 1.2 + 1.0 : Math.random() * 0.8 + 0.2,
      baseOpacity: Math.random() * 0.55 + 0.2,
      twinkleSpeed: Math.random() * 0.012 + 0.002,
      twinklePhase: Math.random() * Math.PI * 2,
    }));

    let frame = 0;
    let animId: number;
    let lastW = 0;
    let lastH = 0;

    const render = () => {
      const W = contained ? canvas.parentElement?.clientWidth || window.innerWidth : window.innerWidth;
      const H = contained ? canvas.parentElement?.clientHeight || window.innerHeight : window.innerHeight;

      // Only resize canvas when dimensions actually change
      if (W !== lastW || H !== lastH) {
        canvas.width = W;
        canvas.height = H;
        lastW = W;
        lastH = H;
      }

      ctx.clearRect(0, 0, W, H);

      // Draw stars with subtle twinkling
      for (const star of stars) {
        const t = Math.sin(frame * star.twinkleSpeed + star.twinklePhase);
        const opacity = star.baseOpacity * (0.65 + 0.35 * t);
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(star.x * W, star.y * H, star.size, 0, Math.PI * 2);
        ctx.fill();
      }

      frame++;
      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [active, contained]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: contained ? 'absolute' : 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
}
