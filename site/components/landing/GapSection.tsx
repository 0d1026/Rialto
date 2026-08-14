import { Parallax, Reveal } from './Reveal';

export default function GapSection() {
  return (
    <section className="rialto-section rialto-section--divided">
      <Parallax speed={80} className="rialto-section-decor" style={{ top: -20, right: -60 }}>
        <svg width="260" height="260" viewBox="0 0 260 260" style={{ opacity: 0.4 }}>
          <circle cx="130" cy="130" r="110" fill="none" stroke="var(--rialto-accent)" strokeWidth="1" strokeDasharray="2 8" />
          <circle cx="130" cy="130" r="70" fill="none" stroke="var(--rialto-accent-alt)" strokeWidth="1" opacity="0.5" />
          <circle cx="130" cy="20" r="4" fill="var(--rialto-accent)" />
          <circle cx="222" cy="160" r="3" fill="var(--rialto-accent-alt)" />
        </svg>
      </Parallax>

      <Reveal>
        <div className="rialto-gap-grid">
          <p className="rialto-eyebrow" style={{ margin: '6px 0 0' }}>
            The gap
          </p>
          <p
            style={{
              fontSize: 'clamp(19px,2.2vw,27px)',
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
      </Reveal>
    </section>
  );
}
