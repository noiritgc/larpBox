import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../../lib/prefs';
import { readItem, writeItem } from '../../lib/storage';

const COLORS = ['#1747E7', '#E9FF70', '#171717', '#FFFFFF', '#B42318', '#C9F2D4'];
const PARTICLES = 80;
const DURATION_MS = 2_000;

/** Original canvas confetti: at most 80 particles, two seconds, once per final screen. */
export function Confetti({ burstId }: { burstId: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const key = `larpbox:confetti:${burstId}`;
    if (prefersReducedMotion() || readItem('session', key)) return undefined;
    writeItem('session', key, '1');
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return undefined;
    const width = (canvas.width = window.innerWidth);
    const height = (canvas.height = window.innerHeight);
    const particles = Array.from({ length: PARTICLES }, (_, i) => ({
      x: (width / PARTICLES) * i + Math.random() * 40,
      y: -20 - Math.random() * height * 0.4,
      vx: (Math.random() - 0.5) * 3,
      vy: 3 + Math.random() * 5,
      size: 8 + Math.random() * 10,
      spin: Math.random() * Math.PI,
      vspin: (Math.random() - 0.5) * 0.3,
      color: COLORS[i % COLORS.length] ?? '#1747E7',
    }));
    const started = performance.now();
    let frame = 0;
    const draw = (now: number) => {
      const t = now - started;
      ctx.clearRect(0, 0, width, height);
      if (t > DURATION_MS) return;
      const fade = t > DURATION_MS - 400 ? (DURATION_MS - t) / 400 : 1;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.spin += p.vspin;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.spin);
        ctx.fillStyle = p.color;
        ctx.strokeStyle = '#171717';
        ctx.lineWidth = 1.5;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.strokeRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [burstId]);
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-30" aria-hidden="true" />;
}
