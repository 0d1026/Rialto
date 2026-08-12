import { adrCards } from './content';
import { Reveal, Stagger, StaggerItem, RevealMask } from './Reveal';

export default function Adrs() {
  return (
    <section className="rialto-section rialto-section--divided">
      <Reveal>
        <div className="rialto-section-eyebrow-block" style={{ marginBottom: 40 }}>
          <p className="rialto-eyebrow">Design decisions</p>
          <RevealMask>
            <h2 className="rialto-section-heading">Two bets that shape everything</h2>
          </RevealMask>
        </div>
      </Reveal>

      <Stagger style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 'var(--rialto-grid-gap-card)' }}>
        {adrCards.map((adr) => (
          <StaggerItem key={adr.label}>
            <div
              className={`rialto-card--accent-left${adr.variant === 'violet' ? ' rialto-card--accent-left--violet' : ''}`}
            >
              <p style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--rialto-text-muted-2)', fontWeight: 700, margin: '0 0 16px' }}>
                {adr.label}
              </p>
              <p style={{ fontFamily: 'var(--rialto-font-heading)', fontSize: 19, lineHeight: 1.5, color: '#EEF1FA', margin: '0 0 18px', fontWeight: 500 }}>
                {adr.quote}
              </p>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--rialto-text-muted-1)', margin: '0 0 18px' }}>
                {adr.supporting}
              </p>
              <a href={adr.href} style={{ fontSize: 14, fontWeight: 600 }}>
                {adr.linkLabel}
              </a>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}
