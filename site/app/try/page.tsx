'use client';

import { Fragment, useEffect, useState, type FormEvent } from 'react';
import { Reveal, RevealMask } from '@/components/landing/Reveal';
import { REPO_URL } from '@/components/landing/content';
import './try.css';

const NODES = [
  { key: 'discover', label: 'Discover' },
  { key: 'sign', label: 'Sign' },
  { key: 'settle', label: 'Settle' },
  { key: 'listed', label: 'Listed' },
] as const;

type Supported = {
  kinds?: { scheme: string; network: string; extra?: { areFeesSponsored?: boolean } }[];
  extensions?: string[];
};
type StatusData = {
  supported: Supported | null;
  peers: { name: string; base_url: string }[];
};
type SearchItem = {
  resource: string;
  accepts?: { network?: string; amount?: string }[];
};
type Rate = { limit: number; remaining: number };
type Stepped = { key: string; label: string; ms: number };
type DemoResult = {
  ok: boolean;
  payer: string;
  resource: string;
  txHash: string;
  explorer: string;
  baseCount: number;
  newCount: number;
  provenance: string | null;
  steps: Stepped[];
  rateLimit?: Rate;
};
type Federation = {
  peers: { name: string; base_url: string; catalog_url: string }[];
  ingestedCount: number;
  examples: { resource: string; source: string }[];
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function TryPage() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [query, setQuery] = useState('weather');
  const [results, setResults] = useState<SearchItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [federation, setFederation] = useState<Federation | null>(null);

  const [running, setRunning] = useState(false);
  const [demo, setDemo] = useState<DemoResult | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [rate, setRate] = useState<Rate | null>(null);
  const [nodeStates, setNodeStates] = useState<string[]>(NODES.map(() => 'idle'));
  const [segFilled, setSegFilled] = useState<boolean[]>(NODES.slice(1).map(() => false));
  const [stepMs, setStepMs] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch('/api/status')
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
    fetch('/api/federation')
      .then((r) => r.json())
      .then(setFederation)
      .catch(() => setFederation({ peers: [], ingestedCount: 0, examples: [] }));
  }, []);

  async function runSearch(e?: FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setResults(null);
    try {
      const r = await fetch(`/api/discovery/search?query=${encodeURIComponent(q)}&limit=8`);
      const body = await r.json();
      setResults(body.resources ?? []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function revealRun(steps: Stepped[]) {
    const total = steps.reduce((a, s) => a + (s.ms || 0), 0) || 1;
    const BUDGET = 2400;
    for (let i = 0; i < NODES.length; i++) {
      const st = steps.find((s) => s.key === NODES[i].key);
      await sleep(st ? Math.max(220, (st.ms / total) * BUDGET) : 300);
      setNodeStates((prev) => {
        const n = [...prev];
        n[i] = 'done';
        if (i + 1 < n.length) n[i + 1] = 'active';
        return n;
      });
      setSegFilled((prev) => {
        const s = [...prev];
        if (i < s.length) s[i] = true;
        return s;
      });
    }
  }

  async function revealError(steps: Stepped[], failedStep: string | null) {
    const done = new Set(steps.map((s) => s.key));
    for (let i = 0; i < NODES.length; i++) {
      if (done.has(NODES[i].key)) {
        setNodeStates((prev) => {
          const n = [...prev];
          n[i] = 'done';
          return n;
        });
        setSegFilled((prev) => {
          const s = [...prev];
          if (i < s.length) s[i] = true;
          return s;
        });
        await sleep(200);
      } else if (NODES[i].key === failedStep) {
        setNodeStates((prev) => {
          const n = [...prev];
          n[i] = 'error';
          return n;
        });
        break;
      }
    }
  }

  async function runDemo() {
    setRunning(true);
    setDemo(null);
    setDemoError(null);
    // dead-air fix: first node pulses immediately, nothing claimed done yet
    setNodeStates(['active', 'idle', 'idle', 'idle']);
    setSegFilled(NODES.slice(1).map(() => false));
    setStepMs({});
    try {
      const r = await fetch('/api/demo/settle', { method: 'POST' });
      const body = await r.json();
      if (body.rateLimit) setRate(body.rateLimit);
      const steps: Stepped[] = body.steps ?? [];
      setStepMs(Object.fromEntries(steps.map((s) => [s.key, s.ms])));
      if (!r.ok) {
        setDemoError(body.detail ? `${body.error}: ${body.detail}` : (body.error ?? 'demo failed'));
        if (!steps.length && !body.failedStep) {
          // pre-flight rejection (e.g. rate limit): nothing ran, clear the track
          setNodeStates(NODES.map(() => 'idle'));
        } else {
          await revealError(steps, body.failedStep ?? null);
        }
      } else {
        setDemo(body);
        await revealRun(steps);
      }
    } catch {
      setDemoError('could not reach the demo service');
      setNodeStates((prev) => prev.map((s) => (s === 'active' ? 'error' : s)));
    } finally {
      setRunning(false);
    }
  }

  const sup = status?.supported?.kinds?.[0];
  const facilitatorText = sup
    ? `${sup.scheme} on ${sup.network}${sup.extra?.areFeesSponsored ? ', fees sponsored' : ''}${
        status?.supported?.extensions?.length ? `, ${status.supported.extensions.join(', ')}` : ''
      }`
    : 'checking…';
  const started = running || demo !== null || demoError !== null;

  return (
    <>
    <header className="try-nav">
      <a href="/" className="try-nav__brand">
        <img src="/logo-mark-transparent.png" alt="Rialto" />
        Rialto
      </a>
      <div className="try-nav__links">
        <a href="/" className="try-nav__link">
          Home
        </a>
        <a href="/docs" className="try-nav__link">
          Docs
        </a>
        <a href={REPO_URL} className="try-nav__gh" target="_blank" rel="noreferrer">
          GitHub ↗
        </a>
      </div>
    </header>
    <main className="try-page">
      <Reveal>
        <p className="try-eyebrow">Live on Stellar testnet</p>
        <RevealMask>
          <h1 className="try-h1">Try Rialto live</h1>
        </RevealMask>
        <p className="try-lede">
          x402 lets software pay for a service with an on chain payment instead of an API key.
          Rialto adds the missing piece, discovery, on one rule. Being paid is what gets a
          service listed, so the catalog gets smarter every time a payment settles.
        </p>
        <p className="try-lede">
          Click the button to watch our funded testnet payment run end to end, no wallet
          needed. You see a real Stellar transaction you can verify yourself.
        </p>
      </Reveal>

      {/* live services */}
      <Reveal>
        <section className="try-section">
          <p className="try-label">Live services</p>
          <div className="try-status-grid">
            <div className="try-status-card">
              <div className="try-status-card__label">
                <span className="try-dot" aria-hidden /> Facilitator
              </div>
              <div className="try-status-card__value">{facilitatorText}</div>
            </div>
            <div className="try-status-card">
              <div className="try-status-card__label">Federation peers</div>
              <div className="try-status-card__value">
                {status
                  ? status.peers.length
                    ? status.peers.map((p) => p.name).join(', ')
                    : 'none yet'
                  : 'checking…'}
              </div>
            </div>
          </div>
        </section>
      </Reveal>

      {/* search */}
      <Reveal>
        <section className="try-section">
          <h2 className="try-h2">Search the live catalog</h2>
          <form onSubmit={runSearch} className="try-searchbar">
            <input
              className="try-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="weather, translation, image generation…"
            />
            <button type="submit" disabled={searching} className="rialto-cta try-btn">
              {searching ? 'Searching…' : 'Search'}
            </button>
          </form>
          {results && (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {results.length === 0 && <p className="try-status-card__value">No results.</p>}
              {results.map((r, i) => (
                <div key={i} className="try-result">
                  <div className="try-result__url">{r.resource}</div>
                  {r.accepts?.[0] && (
                    <div className="try-result__meta">
                      {r.accepts[0].amount ? `${r.accepts[0].amount} ` : ''}
                      {r.accepts[0].network ?? ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </Reveal>

      {/* one-click demo */}
      <Reveal>
        <section className="try-section">
          <div className="try-panel">
            <h2 className="try-h2">Run a live payment</h2>
            <p className="try-lede" style={{ marginTop: 10 }}>
              One click. A real 0.01 USDC payment settles on Stellar testnet through the live
              facilitator, and the service it paid for is listed in the catalog.
            </p>
            <button
              onClick={runDemo}
              disabled={running}
              className="rialto-cta try-btn try-btn--lg"
              style={{ marginTop: 18 }}
            >
              {running ? 'Running…' : demo || demoError ? 'Run it again' : 'Run a live payment'}
            </button>

            {started && (
              <div className="try-track">
                {NODES.map((node, i) => (
                  <Fragment key={node.key}>
                    <div className={`try-track__node ${stateClass(nodeStates[i])}`}>
                      <div className="try-track__dot">{dot(nodeStates[i], i)}</div>
                      <div className="try-track__label">{node.label}</div>
                      <div className="try-track__ms">
                        {nodeStates[i] === 'done' && stepMs[node.key] != null
                          ? `${stepMs[node.key]} ms`
                          : nodeStates[i] === 'active'
                            ? '…'
                            : ''}
                      </div>
                    </div>
                    {i < NODES.length - 1 && (
                      <div className={`try-track__seg ${segFilled[i] ? 'is-filled' : ''}`} />
                    )}
                  </Fragment>
                ))}
              </div>
            )}

            <div className="try-props">
              <div className="try-prop">
                <span className="try-prop__ic">✓</span> Fees sponsored
              </div>
              <div className="try-prop">
                <span className="try-prop__ic">✓</span> No wallet needed
              </div>
              <div className="try-prop">
                <span className="try-prop__ic">✓</span> Verifiable on chain
              </div>
            </div>

            {rate && (
              <p className="try-rate">
                {rate.remaining} of {rate.limit} runs left this hour, per visitor, so the
                sponsor key is never drained.
              </p>
            )}

            {demoError && <p className="try-error">{demoError}</p>}

            {demo && (
              <div className="try-panel try-panel--receipt" style={{ marginTop: 22 }}>
                <div className="try-receipt__head">
                  <span className="try-check" aria-hidden>
                    ✓
                  </span>
                  <h2 className="try-h2" style={{ fontSize: 18 }}>
                    Proven by payment
                  </h2>
                </div>
                <p className="try-status-card__value" style={{ marginTop: 8 }}>
                  This service is in the catalog because it was paid, and you can verify the
                  settlement on chain yourself.
                </p>
                <div className="try-receipt__grid">
                  <div>
                    <div className="try-receipt__k">Provenance</div>
                    <div className="try-receipt__v">
                      {demo.provenance ?? 'observed-settlement'}
                    </div>
                  </div>
                  <div>
                    <div className="try-receipt__k">Settlement count</div>
                    <div className="try-receipt__v">
                      {demo.baseCount} → {demo.newCount}
                    </div>
                  </div>
                </div>
                <a
                  href={demo.explorer}
                  target="_blank"
                  rel="noreferrer"
                  className="rialto-cta try-btn"
                  style={{ display: 'inline-block', marginTop: 18 }}
                >
                  Verify on Stellar Expert ↗
                </a>
              </div>
            )}
          </div>
        </section>
      </Reveal>

      {/* federation */}
      <Reveal>
        <section className="try-section">
          <div className="try-panel">
            <h2 className="try-h2">Federation, checkable</h2>
            <p className="try-lede" style={{ marginTop: 10 }}>
              Independent catalogs register as peers and their listings are ingested into one
              index. Each entry keeps the source it came from, so you can verify it, not take
              our word.
            </p>
            {federation && (
              <>
                <div className="try-fed-stat">
                  <span className="try-fed-stat__num">{federation.ingestedCount}</span>
                  <span className="try-fed-stat__text">
                    listings ingested from an independent catalog, each traceable to the
                    source it came from
                  </span>
                </div>

                <div style={{ marginTop: 22 }}>
                  <div className="try-label">Registered peer</div>
                  {federation.peers.length === 0 ? (
                    <p className="try-status-card__value" style={{ marginTop: 8 }}>
                      none yet
                    </p>
                  ) : (
                    federation.peers.map((p) => (
                      <div key={p.base_url} className="try-peer">
                        <span className="try-peer__name">{p.name}</span>
                        <a
                          href={p.catalog_url}
                          target="_blank"
                          rel="noreferrer"
                          className="try-link"
                        >
                          {p.catalog_url}
                        </a>
                      </div>
                    ))
                  )}
                </div>

                {federation.examples.length > 0 && (
                  <div style={{ marginTop: 22 }}>
                    <div className="try-label">Example ingested listings</div>
                    <div
                      style={{
                        marginTop: 12,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 14,
                      }}
                    >
                      {federation.examples.map((it) => (
                        <div key={it.resource} className="try-fed-item">
                          <div className="try-fed-item__src">
                            via{' '}
                            <a
                              href={it.source}
                              target="_blank"
                              rel="noreferrer"
                              className="try-link"
                            >
                              {federation.peers[0]?.name ?? 'peer'}
                            </a>
                          </div>
                          <div className="try-fed-item__url">{it.resource}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </Reveal>

      <p className="try-note">
        Testnet only. The facilitator uses a disposable testnet key funded from Friendbot and
        holds no real funds.
      </p>
    </main>
    </>
  );
}

function stateClass(state: string): string {
  return state === 'done'
    ? 'is-done'
    : state === 'active'
      ? 'is-active'
      : state === 'error'
        ? 'is-error'
        : '';
}

function dot(state: string, i: number): string {
  if (state === 'done') return '✓';
  if (state === 'error') return '×';
  return String(i + 1);
}
