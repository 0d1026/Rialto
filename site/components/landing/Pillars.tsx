import { facilitatorBullets, discoveryPipeline } from './content';

export default function Pillars() {
  return (
    <section id="pillars" className="rialto-section">
      <div className="rialto-section-eyebrow-block">
        <p className="rialto-eyebrow">What ships</p>
        <h2 className="rialto-section-heading">Three packages, not marketing categories</h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 'var(--rialto-grid-gap-card)' }}>
        {/* Facilitator */}
        <div className="rialto-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 9,
              background: 'var(--rialto-accent-soft)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                width: 14,
                height: 14,
                background: 'var(--rialto-accent)',
                clipPath: 'polygon(50% 0%,100% 100%,0% 100%)',
              }}
            />
          </div>
          <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 21, color: '#FFFFFF', margin: 0, fontWeight: 600 }}>
            Facilitator
          </h3>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--rialto-text-body-3)', margin: 0 }}>
            Canonical <code className="rialto-code-chip">/verify</code>, <code className="rialto-code-chip">/settle</code>,{' '}
            <code className="rialto-code-chip">/supported</code> — built on the Apache-2.0{' '}
            <code className="rialto-code-chip">@x402/stellar</code> package. We compose settlement, we do not
            reimplement it.
          </p>
          <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 9 }}>
            {facilitatorBullets.map((bullet) => (
              <li key={bullet} style={{ fontSize: 14, color: 'var(--rialto-text-muted-1)', paddingLeft: 16, position: 'relative' }}>
                {bullet}
                <span
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 8,
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: 'var(--rialto-accent)',
                  }}
                />
              </li>
            ))}
          </ul>
        </div>

        {/* Discovery */}
        <div
          className="rialto-card"
          style={{
            border: '1px solid var(--rialto-accent-alt-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 20,
              right: 20,
              fontSize: 11,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--rialto-accent-alt)',
              fontWeight: 700,
            }}
          >
            The bazaar
          </div>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 9,
              background: 'var(--rialto-accent-alt-soft)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ width: 14, height: 14, borderRadius: '50%', border: '2.5px solid var(--rialto-accent-alt)', display: 'block' }} />
          </div>
          <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 21, color: '#FFFFFF', margin: 0, fontWeight: 600 }}>
            Discovery
          </h3>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--rialto-text-body-3)', margin: 0 }}>
            Postgres-backed catalog with hybrid search and settlement-history ranking, so agents can tell
            proven endpoints from stale ones.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 4, fontSize: 12.5, fontWeight: 600 }}>
            {discoveryPipeline.map((item, i) =>
              item.variant === 'connector' ? (
                <span key={i} className="rialto-pipeline-connector">
                  {item.label}
                </span>
              ) : (
                <span
                  key={i}
                  className={
                    item.variant === 'violet-soft'
                      ? 'rialto-pipeline-chip rialto-pipeline-chip--violet-soft'
                      : item.variant === 'violet-strong'
                      ? 'rialto-pipeline-chip rialto-pipeline-chip--violet-strong'
                      : 'rialto-pipeline-chip'
                  }
                >
                  {item.label}
                </span>
              ),
            )}
          </div>
        </div>

        {/* Federation */}
        <div className="rialto-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 9,
              background: 'var(--rialto-accent-soft)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                background: 'var(--rialto-accent)',
                borderRadius: '50%',
                boxShadow: '-11px 0 0 0 rgba(255,255,255,0.35), 11px 0 0 0 rgba(255,255,255,0.35)',
              }}
            />
          </div>
          <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 21, color: '#FFFFFF', margin: 0, fontWeight: 600 }}>
            Federation
          </h3>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--rialto-text-body-3)', margin: 0 }}>
            Independent facilitators register. External catalogs are ingested and cross-published.
          </p>
          <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, color: 'var(--rialto-accent)', margin: '6px 0 0', fontWeight: 600 }}>
            Settles anywhere. Findable everywhere.
          </p>
        </div>
      </div>
    </section>
  );
}
