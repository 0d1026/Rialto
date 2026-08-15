import { Reveal, TiltCard } from './Reveal';

const STEPS = ['Discover', 'Quote', 'Pay', 'Settle on testnet', 'Listed in the catalog'];

export default function TryTeaser() {
  return (
    <section className="rialto-section" id="try">
      <Reveal>
        <TiltCard maxTilt={2} className="rialto-tryteaser">
          <h2>See a real payment in one click</h2>
          <p>
            Watch a live x402 payment settle on Stellar testnet through the facilitator, and the
            service it paid for appear in the catalog. No wallet, no setup. Being paid is what
            gets a service listed.
          </p>
          <div className="rialto-tryteaser-steps">
            {STEPS.map((s, i) => (
              <span key={s} className="rialto-tryteaser-chip">
                {i + 1}. {s}
              </span>
            ))}
          </div>
          <a href="/try" className="rialto-btn rialto-btn--primary">
            Try it live ↗
          </a>
        </TiltCard>
      </Reveal>
    </section>
  );
}
