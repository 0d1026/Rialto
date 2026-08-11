export default function GapSection() {
  return (
    <section className="rialto-section rialto-section--divided">
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 40, maxWidth: 900 }}>
        <p className="rialto-eyebrow" style={{ margin: '6px 0 0' }}>
          The gap
        </p>
        <p
          style={{
            fontSize: 'clamp(19px,2.2vw,24px)',
            lineHeight: 1.55,
            color: 'var(--rialto-text-body-1)',
            margin: 0,
            fontWeight: 500,
          }}
        >
          x402 already solves payment. Settlement on Stellar works today. The gap is discovery: an agent can
          only pay an endpoint it already knows about. Rialto adds the discovery layer, so a payment settling
          through the facilitator is what catalogs the service it paid for.
        </p>
      </div>
    </section>
  );
}
