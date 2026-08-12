import { AGENTVAULT_URL, FCR_X402_URL, fcrX402FeatureChips, priorWorkFeatureChips } from './content';
import { Reveal, Stagger, StaggerItem, RevealMask, TiltCard } from './Reveal';

export default function PriorWork() {
  return (
    <section className="rialto-section rialto-section--divided">
      <Reveal>
        <div className="rialto-section-eyebrow-block" style={{ marginBottom: 32 }}>
          <p className="rialto-eyebrow">Prior work</p>
          <RevealMask>
            <h2 className="rialto-section-heading">We&apos;ve shipped agent-payments infra before</h2>
          </RevealMask>
        </div>
      </Reveal>

      <Stagger staggerDelay={0.12}>
        <StaggerItem>
          <TiltCard
            className="rialto-card"
            maxTilt={4}
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
              <p style={{ fontFamily: 'var(--rialto-font-heading)', fontSize: 22, color: '#FFFFFF', margin: '0 0 10px', fontWeight: 600 }}>
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
          </TiltCard>
        </StaggerItem>

        <StaggerItem>
          <TiltCard
            className="rialto-card"
            maxTilt={4}
            style={{
              marginTop: 20,
              padding: 'clamp(28px,4vw,40px)',
              display: 'flex',
              gap: 32,
              flexWrap: 'wrap',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ flex: '1 1 420px' }}>
              <p style={{ fontFamily: 'var(--rialto-font-heading)', fontSize: 22, color: '#FFFFFF', margin: '0 0 10px', fontWeight: 600 }}>
                FCR-x402
              </p>
              <p style={{ fontSize: 15, lineHeight: 1.65, color: 'var(--rialto-text-body-3)', margin: '0 0 20px', maxWidth: 560 }}>
                An x402 facilitator for Filecoin using the Fast Confirmation Rule for sub-minute finality, with
                instant EIP-3009 payments and a deferred escrow model for high-frequency calls, both backed by
                facilitator-posted USDFC collateral.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {fcrX402FeatureChips.map((chip) => (
                  <span key={chip} className="rialto-feature-chip">
                    {chip}
                  </span>
                ))}
              </div>
            </div>
            <a href={FCR_X402_URL} className="rialto-btn rialto-btn--outline rialto-btn--small">
              View FCR-x402 ↗
            </a>
          </TiltCard>
        </StaggerItem>
      </Stagger>
    </section>
  );
}
