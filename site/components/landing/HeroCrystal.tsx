'use client';

import { useEffect, useRef } from 'react';

const MAX_AZIMUTH_DEG = 45;
const BASE_ELEVATION_DEG = 72;
const MAX_ELEVATION_SWING_DEG = 18;

/**
 * A real 3D asset (CC0 low-poly crystal cluster from Kenney's Tower Defense
 * Kit, public/models/rialto-crystal.glb) rendered with <model-viewer>, tinted
 * toward the brand's dark blue with a CSS `filter` on the element itself —
 * a full-bleed `mix-blend-mode` overlay looked right in theory but actually
 * paints every pixel opaque (blend mode changes the color math, not the
 * alpha), flattening the transparent background into a solid box. `filter`
 * operates per-pixel including alpha, so transparent stays transparent. The
 * camera orbits toward the cursor for the same "it's looking at you" feel
 * the old hand-drawn mascot had, but driven by a real 3D scene.
 */
export default function HeroCrystal() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLElement & { cameraOrbit?: string }>(null);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    import('@google/model-viewer');
  }, []);

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    function handleMove(e: MouseEvent) {
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        const wrap = wrapRef.current;
        const model = modelRef.current;
        if (!wrap || !model) return;

        const rect = wrap.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const nx = Math.max(-1, Math.min(1, (e.clientX - cx) / (rect.width / 2)));
        const ny = Math.max(-1, Math.min(1, (e.clientY - cy) / (rect.height / 2)));

        const azimuth = nx * MAX_AZIMUTH_DEG;
        const elevation = BASE_ELEVATION_DEG - ny * MAX_ELEVATION_SWING_DEG;
        model.cameraOrbit = `${azimuth.toFixed(1)}deg ${elevation.toFixed(1)}deg 105%`;
      });
    }

    window.addEventListener('mousemove', handleMove);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', maxWidth: 340, aspectRatio: '1 / 1', margin: '0 auto' }}>
      <model-viewer
        ref={modelRef}
        src="/models/rialto-crystal.glb"
        alt="A rotating crystal cluster"
        camera-orbit={`0deg ${BASE_ELEVATION_DEG}deg 105%`}
        field-of-view="28deg"
        exposure="1.15"
        shadow-intensity="0.9"
        environment-image="neutral"
        interaction-prompt="none"
        disable-zoom
        loading="eager"
        reveal="auto"
        style={
          {
            width: '100%',
            height: '100%',
            display: 'block',
            background: 'transparent',
            '--poster-color': 'transparent',
            filter: 'grayscale(1) sepia(1) hue-rotate(190deg) saturate(4.5) brightness(0.72) contrast(1.15)',
          } as React.CSSProperties
        }
      />
    </div>
  );
}
