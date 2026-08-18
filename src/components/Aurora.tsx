/**
 * The living backdrop.
 *
 * A single canvas doing four things at 60fps: a slow navy→orange aurora, a constellation
 * of nodes that wire themselves together when they drift close, a signal pulse that runs
 * down each wire, and a soft light that follows the pointer. It is one canvas and one
 * requestAnimationFrame loop — no libraries, no DOM churn — so it costs a few hundred KB
 * of nothing and never blocks the form.
 *
 * Rules it obeys:
 *   · prefers-reduced-motion       → renders one still frame and stops
 *   · tab hidden                   → loop parks itself
 *   · device pixel ratio           → capped at 2, because 3x on a phone buys nothing
 *   · node count scales with area  → a laptop is not asked to draw a billboard's worth
 */
import { useEffect, useRef } from 'react';

type Node = { x: number; y: number; vx: number; vy: number; r: number };
type Pulse = { from: number; to: number; t: number; speed: number };

const NAVY = [42, 78, 130] as const;
const ORANGE = [255, 107, 44] as const;

export function Aurora({ dark }: { dark: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Kept in a ref so a theme flip re-reads it without restarting the animation.
  const darkRef = useRef(dark);
  darkRef.current = dark;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    let width = 0;
    let height = 0;
    let nodes: Node[] = [];
    let pulses: Pulse[] = [];
    let frame = 0;
    let raf = 0;
    const pointer = { x: -999, y: -999 };

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      // One node per ~19k px², clamped: enough to feel alive, never enough to melt a laptop.
      const count = Math.round(Math.min(120, Math.max(28, (width * height) / 19000)));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        r: 1 + Math.random() * 1.8,
      }));
      pulses = [];
    };

    const onPointer = (event: PointerEvent) => {
      const box = canvas.getBoundingClientRect();
      pointer.x = event.clientX - box.left;
      pointer.y = event.clientY - box.top;
    };
    const onLeave = () => { pointer.x = -999; pointer.y = -999; };

    const rgba = (rgb: readonly number[], alpha: number) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;

    const draw = () => {
      const isDark = darkRef.current;
      frame++;
      context.clearRect(0, 0, width, height);

      // ---- aurora: three slow blobs, each its own drift ----
      const time = frame / 1000;
      const blobs = [
        { x: 0.22 + Math.sin(time * 0.7) * 0.10, y: 0.28 + Math.cos(time * 0.5) * 0.10, c: NAVY, s: 0.55 },
        { x: 0.78 + Math.cos(time * 0.6) * 0.09, y: 0.32 + Math.sin(time * 0.8) * 0.11, c: ORANGE, s: 0.42 },
        { x: 0.50 + Math.sin(time * 0.4 + 2) * 0.14, y: 0.78 + Math.cos(time * 0.55) * 0.08, c: NAVY, s: 0.60 },
      ];
      for (const blob of blobs) {
        const radius = Math.max(width, height) * blob.s;
        const gradient = context.createRadialGradient(blob.x * width, blob.y * height, 0, blob.x * width, blob.y * height, radius);
        gradient.addColorStop(0, rgba(blob.c, isDark ? 0.30 : 0.16));
        gradient.addColorStop(1, rgba(blob.c, 0));
        context.fillStyle = gradient;
        context.fillRect(0, 0, width, height);
      }

      // ---- constellation ----
      const linkDistance = Math.min(190, Math.max(120, width / 9));
      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;
        if (node.x < -20) node.x = width + 20;
        if (node.x > width + 20) node.x = -20;
        if (node.y < -20) node.y = height + 20;
        if (node.y > height + 20) node.y = -20;

        // The pointer pushes nodes gently aside, then they drift back.
        const dx = node.x - pointer.x;
        const dy = node.y - pointer.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 130 && distance > 0.1) {
          const push = (130 - distance) / 130 * 0.6;
          node.x += (dx / distance) * push;
          node.y += (dy / distance) * push;
        }
      }

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          if (distance > linkDistance) continue;
          const strength = 1 - distance / linkDistance;
          context.strokeStyle = rgba(isDark ? [120, 165, 225] : NAVY, strength * (isDark ? 0.26 : 0.20));
          context.lineWidth = 1;
          context.beginPath();
          context.moveTo(a.x, a.y);
          context.lineTo(b.x, b.y);
          context.stroke();

          // Occasionally send a signal down a fresh wire — the "something is happening" cue.
          if (!reduced && strength > 0.55 && pulses.length < 14 && Math.random() < 0.0016) {
            pulses.push({ from: i, to: j, t: 0, speed: 0.012 + Math.random() * 0.02 });
          }
        }
      }

      for (const node of nodes) {
        context.fillStyle = rgba(isDark ? [150, 190, 240] : NAVY, isDark ? 0.75 : 0.45);
        context.beginPath();
        context.arc(node.x, node.y, node.r, 0, Math.PI * 2);
        context.fill();
      }

      // ---- signal pulses ----
      pulses = pulses.filter(pulse => {
        pulse.t += pulse.speed;
        if (pulse.t >= 1) return false;
        const a = nodes[pulse.from];
        const b = nodes[pulse.to];
        if (!a || !b) return false;
        const x = a.x + (b.x - a.x) * pulse.t;
        const y = a.y + (b.y - a.y) * pulse.t;
        const fade = Math.sin(pulse.t * Math.PI);
        const glow = context.createRadialGradient(x, y, 0, x, y, 9);
        glow.addColorStop(0, rgba(ORANGE, 0.95 * fade));
        glow.addColorStop(1, rgba(ORANGE, 0));
        context.fillStyle = glow;
        context.beginPath();
        context.arc(x, y, 9, 0, Math.PI * 2);
        context.fill();
        return true;
      });

      // ---- the light that follows the pointer ----
      if (pointer.x > -100) {
        const halo = context.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 190);
        halo.addColorStop(0, rgba(ORANGE, isDark ? 0.16 : 0.10));
        halo.addColorStop(1, rgba(ORANGE, 0));
        context.fillStyle = halo;
        context.fillRect(0, 0, width, height);
      }

      raf = window.requestAnimationFrame(draw);
    };

    const start = () => {
      window.cancelAnimationFrame(raf);
      if (reduced) { draw(); window.cancelAnimationFrame(raf); return; }  // one still frame, then stop
      raf = window.requestAnimationFrame(draw);
    };

    const onVisibility = () => {
      if (document.hidden) window.cancelAnimationFrame(raf);
      else start();
    };

    resize();
    start();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onPointer);
    window.addEventListener('pointerleave', onLeave);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
    />
  );
}
