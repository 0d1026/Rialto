'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

function MermaidModal({ svg, onClose }: { svg: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP));
      if (e.key === '-') setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP));
    }
    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      <div
        className="relative flex h-full w-full items-center justify-center overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="[&_svg]:h-auto! [&_svg]:max-h-[85vh]! [&_svg]:w-auto! [&_svg]:max-w-[90vw]! [&_svg]:min-w-[60vw]!"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Close"
        className="fixed top-4 right-4 z-[1001] flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg text-white hover:bg-white/20"
      >
        ✕
      </button>

      <div
        className="fixed right-4 bottom-4 z-[1001] flex items-center gap-1 rounded-lg bg-white/10 p-1 backdrop-blur"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))}
          className="flex h-9 w-9 items-center justify-center rounded-md text-lg text-white hover:bg-white/20"
        >
          −
        </button>
        <span className="w-12 text-center text-xs text-white">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))}
          className="flex h-9 w-9 items-center justify-center rounded-md text-lg text-white hover:bg-white/20"
        >
          +
        </button>
      </div>
    </div>,
    document.body,
  );
}

export function Mermaid({ chart }: { chart: string }) {
  const id = useId();
  const [svg, setSvg] = useState('');
  const [visible, setVisible] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      const { default: mermaid } = await import('mermaid');
      const isDark = document.documentElement.classList.contains('dark');
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: isDark ? 'dark' : 'neutral',
        fontFamily: 'inherit',
      });
      try {
        const { svg: rendered } = await mermaid.render(
          id.replace(/[^a-zA-Z0-9]/g, ''),
          chart,
        );
        if (!cancelled) setSvg(rendered);
      } catch {
        if (!cancelled) setSvg('');
      }
    }

    void render();
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !svg) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0, rootMargin: '0px 0px -10% 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [svg]);

  if (!svg) {
    return (
      <pre className="overflow-x-auto rounded-lg border p-4 text-xs">
        <code>{chart}</code>
      </pre>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        role="button"
        tabIndex={0}
        aria-label="Open diagram in zoomable view"
        onClick={() => setModalOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setModalOpen(true);
          }
        }}
        className={`mermaid-diagram my-4 flex cursor-zoom-in justify-center overflow-x-auto [&_svg]:max-w-full ${
          visible ? 'mermaid-visible' : ''
        }`}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {modalOpen && <MermaidModal svg={svg} onClose={() => setModalOpen(false)} />}
    </>
  );
}
