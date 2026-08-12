import { REPO_URL } from './content';
import { Parallax, Reveal, RevealMask, TiltCard } from './Reveal';

export default function Cta() {
  return (
    <section
      className="rialto-section"
      style={{ paddingBottom: 'clamp(80px,9vw,120px)' }}
    >
      <Parallax speed={55} className="rialto-section-decor" style={{ top: -40, right: -40 }}>
        <svg width="260" height="260" viewBox="0 0 260 260" style={{ opacity: 0.35 }}>
          <circle cx="130" cy="130" r="110" fill="none" stroke="var(--rialto-accent)" strokeWidth="1" />
          <circle cx="130" cy="130" r="70" fill="none" stroke="var(--rialto-accent-alt)" strokeWidth="1" opacity="0.6" />
        </svg>
      </Parallax>
      <Parallax speed={-55} className="rialto-section-decor" style={{ bottom: -20, left: -40 }}>
        <svg width="200" height="200" viewBox="0 0 200 200" style={{ opacity: 0.3 }}>
          <circle cx="100" cy="100" r="90" fill="none" stroke="var(--rialto-accent)" strokeWidth="1" strokeDasharray="3 9" />
        </svg>
      </Parallax>

      <Reveal>
        <TiltCard
          maxTilt={3}
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
        </TiltCard>
      </Reveal>
    </section>
  );
}
