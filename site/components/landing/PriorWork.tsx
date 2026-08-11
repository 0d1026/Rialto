import { AGENTVAULT_URL, priorWorkFeatureChips } from './content';

export default function PriorWork() {
  return (
    <section className="rialto-section rialto-section--divided">
      <div className="rialto-section-eyebrow-block" style={{ marginBottom: 32 }}>
        <p className="rialto-eyebrow">Prior work</p>
        <h2 className="rialto-section-heading">We&apos;ve shipped agent-payments infra before</h2>
      </div>

      <div
        className="rialto-card"
        style={{
          padding: 'clamp(28px,4vw,40px)',
          display: 'flex',
          gap: 32,
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ flex: '1 1 420px' }}>
          <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, color: '#FFFFFF', margin: '0 0 10px', fontWeight: 600 }}>
            AgentVault
          </p>
          <p style={{ fontSize: 15, lineHeight: 1.65, color: 'var(--rialto-text-body-3)', margin: '0 0 20px', maxWidth: 560 }}>
            Verifiable storage infrastructure for autonomous AI agents: Filecoin Onchain Cloud, x402
            micropayments, and ERC-8004 identity, so an agent can prove who it is and that its stored data is
            real, not just that it paid for storage.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {priorWorkFeatureChips.map((chip) => (
              <span key={chip} className="rialto-feature-chip">
                {chip}
              </span>
            ))}
          </div>
        </div>
        <a href={AGENTVAULT_URL} className="rialto-btn rialto-btn--outline rialto-btn--small">
          View AgentVault ↗
        </a>
      </div>
    </section>
  );
}
