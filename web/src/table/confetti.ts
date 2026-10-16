import { PLAYER_COLORS } from '@cartolina/shared';

/** Confete simples em canvas; devolve uma função que interrompe a animação. */
export function confetti(canvas: HTMLCanvasElement | null, colors: readonly string[] = PLAYER_COLORS): () => void {
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return () => {};
  const dpr = window.devicePixelRatio || 1;
  const W = window.innerWidth;
  const H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const parts = Array.from({ length: 140 }, () => ({
    x: W / 2 + (Math.random() - 0.5) * 200,
    y: H * 0.3,
    vx: (Math.random() - 0.5) * 900,
    vy: -300 - Math.random() * 700,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 12,
    w: 6 + Math.random() * 6,
    h: 10 + Math.random() * 8,
    c: colors[Math.floor(Math.random() * colors.length)]!,
  }));
  let last = performance.now();
  let raf = 0;
  const step = (now: number) => {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    for (const p of parts) {
      p.vy += 900 * dt;
      p.vx *= 0.99;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += p.vr * dt;
      if (p.y < H + 40) alive++;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.strokeStyle = '#3B2F2F';
      ctx.lineWidth = 1.5;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (alive > 0) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}
