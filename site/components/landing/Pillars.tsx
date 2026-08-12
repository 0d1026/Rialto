import type { CSSProperties } from 'react';
import { facilitatorBullets, discoveryPipeline } from './content';
import { Parallax, Reveal, Stagger, StaggerItem, RevealMask } from './Reveal';

export default function Pillars() {
  return (
    <section id="pillars" className="rialto-section">
      <Parallax speed={75} className="rialto-section-decor" style={{ top: -30, right: 20 }}>
        <svg width="180" height="180" viewBox="0 0 180 180" style={{ opacity: 0.35 }}>
          <polygon points="90,10 170,90 90,170 10,90" fill="none" stroke="var(--rialto-accent)" strokeWidth="1" />
          <polygon points="90,50 130,90 90,130 50,90" fill="none" stroke="var(--rialto-accent-alt)" strokeWidth="1" opacity="0.6" />
        </svg>
      </Parallax>

      <Reveal>
        <div className="rialto-section-eyebrow-block">
          <p className="rialto-eyebrow rialto-eyebrow--pill">What ships</p>
          <RevealMask>
            <h2 className="rialto-section-heading">Three packages, not marketing categories</h2>
          </RevealMask>
        </div>
      </Reveal>

      <Stagger className="rialto-row-list" staggerDelay={0.1}>
        {/* Facilitator */}
        <StaggerItem>
          <div className="rialto-row">
            <div className="rialto-row-head">
              <span className="rialto-row-marker" />
              <h3 className="rialto-row-name">Facilitator</h3>
            </div>
            <div className="rialto-row-body">
              <p style={{ fontSize: 'clamp(15px,1vw,17px)', lineHeight: 1.6, color: 'var(--rialto-text-body-3)', margin: '0 0 14px' }}>
                Canonical <code className="rialto-code-chip">/verify</code>, <code className="rialto-code-chip">/settle</code>,{' '}
                <code className="rialto-code-chip">/supported</code>, built on the Apache-2.0{' '}
                <code className="rialto-code-chip">@x402/stellar</code> package. We compose settlement, we do not
                reimplement it.
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 9 }}>
                {facilitatorBullets.map((bullet) => (
                  <li key={bullet} style={{ fontSize: 'clamp(14px,0.9vw,16px)', color: 'var(--rialto-text-muted-1)', paddingLeft: 16, position: 'relative' }}>
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
          </div>
        </StaggerItem>

        {/* Discovery */}
        <StaggerItem>
          <div
            className="rialto-row"
            style={
              {
                '--rialto-row-accent': 'var(--rialto-accent-alt)',
                '--rialto-row-accent-soft': 'var(--rialto-accent-alt-soft)',
              } as CSSProperties
            }
          >
            {/* <span className="rialto-row-tag">The bazaar</span> */}
            <div className="rialto-row-head">
              <span className="rialto-row-marker" />
              <h3 className="rialto-row-name">Discovery</h3>
            </div>
            <div className="rialto-row-body">
              <p style={{ fontSize: 'clamp(15px,1vw,17px)', lineHeight: 1.6, color: 'var(--rialto-text-body-3)', margin: '0 0 14px' }}>
                Postgres-backed catalog with hybrid search and settlement-history ranking, so agents can tell
                proven endpoints from stale ones.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12.5, fontWeight: 600 }}>
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
          </div>
        </StaggerItem>

        {/* Federation */}
        <StaggerItem>
          <div className="rialto-row">
            <div className="rialto-row-head">
              <span className="rialto-row-marker" />
              <h3 className="rialto-row-name">Federation</h3>
            </div>
            <div className="rialto-row-body">
              <p style={{ fontSize: 'clamp(15px,1vw,17px)', lineHeight: 1.6, color: 'var(--rialto-text-body-3)', margin: '0 0 10px' }}>
                Independent facilitators register. External catalogs are ingested and cross-published.
              </p>
              <p style={{ fontFamily: 'var(--rialto-font-heading)', fontSize: 'clamp(15px,1vw,17px)', color: 'var(--rialto-accent)', margin: 0, fontWeight: 600 }}>
                Settles anywhere. Findable everywhere.
              </p>
            </div>
          </div>
        </StaggerItem>
      </Stagger>
    </section>
  );
}
