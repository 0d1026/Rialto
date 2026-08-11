'use client';

import { useEffect, useId, useRef, useState } from 'react';

export function Mermaid({ chart }: { chart: string }) {
  const id = useId();
  const [svg, setSvg] = useState('');
  const [visible, setVisible] = useState(false);
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
    <div
      ref={containerRef}
      className={`mermaid-diagram my-4 flex justify-center overflow-x-auto [&_svg]:max-w-full ${
        visible ? 'mermaid-visible' : ''
      }`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
