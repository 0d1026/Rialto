'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { Reveal, Stagger, StaggerItem } from './Reveal';

type Status = {
  resourcesIndexed: number;
  peerCount: number;
  facilitatorLive: boolean;
};

/** Counts a number up to its target once, respecting reduced-motion. */
function useCountUp(target: number, run: boolean): number {
  const [value, setValue] = useState(0);
  const reduce = useReducedMotion();
  const started = useRef(false);

  useEffect(() => {
    if (!run || started.current) return;
    started.current = true;
    if (reduce || target <= 0) {
      setValue(target);
      return;
    }
    const duration = 1200;
    let raf = 0;
    let start = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, target, reduce]);

  return value;
}

export default function LiveStats() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    fetch('/api/status')
      .then((r) => r.json())
      .then((d) =>
        setStatus({
          resourcesIndexed: Number(d.resourcesIndexed ?? 0),
          peerCount: Number(d.peerCount ?? 0),
          facilitatorLive: Boolean(d.facilitatorLive),
        }),
      )
      .catch(() => setStatus({ resourcesIndexed: 0, peerCount: 0, facilitatorLive: false }));
  }, []);

  const ready = status !== null;
  const services = useCountUp(status?.resourcesIndexed ?? 0, ready);
  const peers = useCountUp(status?.peerCount ?? 0, ready);

  return (
    <section className="rialto-section" style={{ paddingTop: 0 }}>
      <Reveal>
        <p className="rialto-livestats-kicker">Live on Stellar testnet, right now</p>
      </Reveal>
      <Stagger className="rialto-livestats-grid">
        <StaggerItem>
          <div className="rialto-stat">
            <span className="rialto-stat-num">{ready ? services.toLocaleString() : '—'}</span>
            <span className="rialto-stat-label">services indexed</span>
          </div>
        </StaggerItem>
        <StaggerItem>
          <div className="rialto-stat">
            <span className="rialto-stat-num">{ready ? peers : '—'}</span>
            <span className="rialto-stat-label">federation peers</span>
          </div>
        </StaggerItem>
        <StaggerItem>
          <div className="rialto-stat">
            <span className="rialto-stat-num rialto-stat-live">
              <span className="rialto-live-dot" aria-hidden />
              {status?.facilitatorLive ? 'live' : '…'}
            </span>
            <span className="rialto-stat-label">facilitator settling</span>
          </div>
        </StaggerItem>
      </Stagger>
    </section>
  );
}
