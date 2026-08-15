import { adrCards } from './content';
import { Parallax, Reveal, Stagger, StaggerItem, RevealMask, TiltCard } from './Reveal';

export default function Adrs() {
  return (
    <section className="rialto-section rialto-section--divided">
      <Parallax speed={65} className="rialto-section-decor" style={{ top: -10, right: -10 }}>
        <svg width="150" height="150" viewBox="0 0 150 150" style={{ opacity: 0.4 }}>
          <rect x="30" y="30" width="60" height="60" fill="none" stroke="var(--rialto-accent)" strokeWidth="1.2" transform="rotate(45 60 60)" />
          <rect x="65" y="55" width="40" height="40" fill="none" stroke="var(--rialto-accent-alt)" strokeWidth="1.2" transform="rotate(45 85 75)" />
        </svg>
      </Parallax>

      <Reveal>
        <div className="rialto-section-eyebrow-block" style={{ marginBottom: 40 }}>
          <p className="rialto-eyebrow">Design decisions</p>
          <RevealMask>
            <h2 className="rialto-section-heading">Two bets that shape everything</h2>
          </RevealMask>
        </div>
      </Reveal>

      <Stagger className="rialto-grid-2">
        {adrCards.map((adr) => (
          <StaggerItem key={adr.label}>
            <TiltCard
              className={`rialto-card--accent-left${adr.variant === 'violet' ? ' rialto-card--accent-left--violet' : ''}`}
            >
              <p style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--rialto-text-muted-2)', fontWeight: 700, margin: '0 0 16px' }}>
                {adr.label}
              </p>
              <p style={{ fontFamily: 'var(--rialto-font-heading)', fontSize: 'clamp(19px,1.3vw,22px)', lineHeight: 1.5, color: '#EEF1FA', margin: '0 0 18px', fontWeight: 500 }}>
                {adr.quote}
              </p>
              <p style={{ fontSize: 'clamp(14px,0.9vw,16px)', lineHeight: 1.6, color: 'var(--rialto-text-muted-1)', margin: '0 0 18px' }}>
                {adr.supporting}
              </p>
              <a href={adr.href} style={{ fontSize: 'clamp(14px,0.9vw,16px)', fontWeight: 600 }}>
                {adr.linkLabel}
              </a>
            </TiltCard>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}
