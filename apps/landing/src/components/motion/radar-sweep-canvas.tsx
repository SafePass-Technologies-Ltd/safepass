'use client';

import { useEffect, useRef } from 'react';
import { gsap } from '@/lib/motion/gsap';
import { durationSec, gsapEase } from '@/lib/motion/constants';
import { useReducedMotion } from '@/lib/motion/use-reduced-motion';
import { cn } from '@/lib/utils';

/**
 * Radar-sweep motif — the hero's ambient "always watching" cue.
 *
 * branding.md §6 assigns this a `duration-ambient` loop with
 * `ease-in-out-smooth` ("symmetric, no bounce"), and §8 requires ambient motion
 * stay "subliminal, reinforcing 'always watching' without becoming
 * distracting" — hence the low opacity, thin rings, and single slow revolution
 * rather than anything that reads as a spinner.
 *
 * This is the ONE piece of motion on the page not driven by scroll. That is
 * deliberate and documented: branding.md §6 lists the radar sweep under
 * `duration-ambient` as a loop, separately from the scroll-indexed sequences.
 * It still runs on the shared `gsap.ticker` (via a normal GSAP tween) — there
 * is no second requestAnimationFrame loop here.
 *
 * Canvas 2D rather than Lottie, per the scope decision in IMPLEMENTATION.md
 * (risk_log.md R-005/R-006).
 */

/** Drawing geometry in normalized (0-1) units of the canvas's smaller edge. */
const RADAR = {
  /** Concentric range rings. */
  rings: [0.35, 0.62, 0.9],
  /** Angular width of the sweep wedge, in radians. */
  wedge: Math.PI / 3,
  /** Ring stroke width in CSS px — 2px line art, branding.md §7. */
  strokeWidth: 2,
  /** Ring opacity: present, but never competing with the headline. */
  ringAlpha: 0.18,
  /** Peak opacity of the sweep wedge's leading edge. */
  sweepAlpha: 0.35,
  /** Angle the static (reduced-motion) composed frame rests at. */
  staticAngle: -Math.PI / 4,
};

function readToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function RadarSweepCanvas({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Surface creation failure falls back silently to nothing rendered — the
    // Error state in `screens/01-homepage.md`. No console noise, no broken box.
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const state = { angle: RADAR.staticAngle };

    function draw() {
      if (!canvas || !ctx) return;

      const { width, height } = canvas.getBoundingClientRect();
      if (width === 0 || height === 0) return;

      const primary = readToken('--sp-primary');
      ctx.clearRect(0, 0, width, height);
      if (!primary) return;

      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width, height) / 2;

      ctx.save();
      ctx.globalAlpha = RADAR.ringAlpha;
      ctx.strokeStyle = primary;
      ctx.lineWidth = RADAR.strokeWidth;
      for (const ring of RADAR.rings) {
        ctx.beginPath();
        ctx.arc(cx, cy, radius * ring, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      // The sweep: a wedge fading back from its leading edge, so the eye reads
      // a direction of travel rather than a rotating pie slice.
      const outer = radius * RADAR.rings[RADAR.rings.length - 1];
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(state.angle);
      const wedge = ctx.createLinearGradient(outer, 0, 0, 0);
      wedge.addColorStop(0, primary);
      wedge.addColorStop(1, 'transparent');
      ctx.globalAlpha = RADAR.sweepAlpha;
      ctx.fillStyle = wedge;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, outer, -RADAR.wedge, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function resize() {
      if (!canvas || !ctx) return;
      const { width, height } = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    // Reduced motion: the composed frame is drawn once and left. Not a
    // zero-duration tween — that is still an animation (branding.md §8).
    if (reducedMotion) {
      return () => observer.disconnect();
    }

    const tween = gsap.to(state, {
      angle: RADAR.staticAngle + Math.PI * 2,
      duration: durationSec('ambient'),
      ease: gsapEase('inOutSmooth'),
      repeat: -1,
      onUpdate: draw,
    });

    return () => {
      tween.kill();
      observer.disconnect();
    };
  }, [reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="radar-sweep-canvas"
      className={cn('block h-full w-full', className)}
    />
  );
}
