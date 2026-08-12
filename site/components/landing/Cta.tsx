import { REPO_URL } from './content';
import { Reveal, RevealMask } from './Reveal';

export default function Cta() {
  return (
    <section
      className="rialto-section"
      style={{ paddingBottom: 'clamp(80px,9vw,120px)' }}
    >
      <Reveal>
        <div
          style={{
            borderRadius: 20,
            background: 'linear-gradient(135deg, #111B27 0%, #0E1420 100%)',
            border: '1px solid var(--rialto-border-soft)',
            padding: 'clamp(40px,6vw,64px)',
            textAlign: 'center',
          }}
        >
          <RevealMask style={{ margin: '0 0 14px' }}>
            <h2 style={{ fontFamily: 'var(--rialto-font-heading)', fontSize: 'clamp(26px,3.2vw,36px)', color: '#FFFFFF', margin: 0, fontWeight: 700 }}>
              Follow the build, milestone by milestone
            </h2>
          </RevealMask>
          <p style={{ fontSize: 16, color: 'var(--rialto-text-body-3)', maxWidth: 520, margin: '0 auto 32px', lineHeight: 1.6 }}>
            Code lands in the open.
          </p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
            <a href={REPO_URL} className="rialto-btn rialto-btn--primary">
              View on GitHub ↗
            </a>
            <a href={`${REPO_URL}/blob/main/docs/architecture.md`} className="rialto-btn rialto-btn--outline">
              Architecture doc
            </a>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
