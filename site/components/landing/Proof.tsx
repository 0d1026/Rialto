import { proofCards } from './content';

function withInlineCode(text: string) {
  const parts = text.split(/(@rialto\/[a-z-]+)/g);
  return parts.map((part, i) =>
    part.startsWith('@rialto/') ? (
      <code key={i} className="rialto-code-chip">
        {part}
      </code>
    ) : (
      part
    ),
  );
}

export default function Proof() {
  return (
    <section className="rialto-section rialto-section--divided">
      <div className="rialto-section-eyebrow-block" style={{ marginBottom: 40 }}>
        <p className="rialto-eyebrow">Proof, not claims</p>
        <h2 className="rialto-section-heading">Search quality is proven, not asserted</h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 'var(--rialto-grid-gap-card)' }}>
        {proofCards.map((card) => (
          <div key={card.title} className="rialto-card--bordered">
            <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 17, color: '#FFFFFF', margin: '0 0 10px', fontWeight: 600 }}>
              {card.title}
            </p>
            <p
              style={{
                fontSize: 15,
                lineHeight: 1.65,
                color: 'var(--rialto-text-body-3)',
                margin: card.metrics ? '0 0 16px' : 0,
              }}
            >
              {withInlineCode(card.description)}
            </p>
            {card.metrics && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {card.metrics.map((metric) => (
                  <span key={metric} className="rialto-metric-chip">
                    {metric}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
