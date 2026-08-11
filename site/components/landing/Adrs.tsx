import { adrCards } from './content';

export default function Adrs() {
  return (
    <section className="rialto-section rialto-section--divided">
      <div className="rialto-section-eyebrow-block" style={{ marginBottom: 40 }}>
        <p className="rialto-eyebrow">Design decisions</p>
        <h2 className="rialto-section-heading">Two bets that shape everything</h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 'var(--rialto-grid-gap-card)' }}>
        {adrCards.map((adr) => (
          <div
            key={adr.label}
            className={`rialto-card--accent-left${adr.variant === 'violet' ? ' rialto-card--accent-left--violet' : ''}`}
          >
            <p style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--rialto-text-muted-2)', fontWeight: 700, margin: '0 0 16px' }}>
              {adr.label}
            </p>
            <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 19, lineHeight: 1.5, color: '#EEF1FA', margin: '0 0 18px', fontWeight: 500 }}>
              {adr.quote}
            </p>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--rialto-text-muted-1)', margin: '0 0 18px' }}>
              {adr.supporting}
            </p>
            <a href={adr.href} style={{ fontSize: 14, fontWeight: 600 }}>
              {adr.linkLabel}
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
