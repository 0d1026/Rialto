import HeroBackground from './HeroBackground';
import { REPO_URL } from './content';
import { RevealMask } from './Reveal';

export default function Hero() {
  return (
    <header
      style={{
        position: 'relative',
        maxWidth: 'var(--rialto-content-max-width)',
        margin: '0 auto',
        padding: 'clamp(46px,8vw,96px) clamp(20px,5vw,48px) clamp(70px,8vw,120px)',
        overflow: 'hidden',
      }}
    >
      <HeroBackground />

      <div style={{ position: 'relative', display: 'flex', gap: 56, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="rialto-hero-col-left" style={{ flex: '1 1 480px', maxWidth: 640 }}>
          <p
            style={{
              fontFamily: 'var(--rialto-font-heading)',
              fontSize: 'clamp(16px,2vw,19px)',
              color: 'var(--rialto-accent)',
              margin: '0 0 16px',
              fontWeight: 500,
            }}
          >
            &ldquo;Being paid is what gets a service listed.&rdquo;
          </p>

          <RevealMask delay={0.1} style={{ margin: '0 0 20px' }}>
            <h1
              style={{
                fontFamily: 'var(--rialto-font-heading)',
                fontSize: 'clamp(36px,4.6vw,58px)',
                lineHeight: 1.08,
                fontWeight: 700,
                margin: 0,
                color: '#FFFFFF',
              }}
            >
              An x402 facilitator and Bazaar discovery layer for Stellar
            </h1>
          </RevealMask>

          <p
            style={{
              fontSize: 'clamp(16px,1.6vw,18px)',
              lineHeight: 1.6,
              color: 'var(--rialto-text-body-2)',
              maxWidth: 520,
              margin: '0 0 32px',
            }}
          >
            So AI agents can find, pay for, and verify paid services on{' '}
            <code className="rialto-code-chip rialto-code-chip--lg">stellar:testnet</code> and{' '}
            <code className="rialto-code-chip rialto-code-chip--lg">stellar:pubnet</code>.
          </p>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <a href={REPO_URL} className="rialto-btn rialto-btn--primary">
              View the repo ↗
            </a>
            <a href="#pillars" className="rialto-btn rialto-btn--outline">
              See what ships ↓
            </a>
          </div>
        </div>

        <div className="rialto-hero-col-right" style={{ flex: '1 1 400px', maxWidth: 460, minWidth: 300 }}>
          <div
            style={{
              background: 'var(--rialto-bg-terminal)',
              border: '1px solid var(--rialto-border-medium)',
              borderRadius: 'var(--rialto-radius-terminal)',
              overflow: 'hidden',
              boxShadow:
                '0 40px 90px -30px rgba(0,0,0,0.7), 0 12px 40px -18px var(--rialto-accent-soft), inset 0 -1px 0 0 var(--rialto-accent-soft)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '13px 16px',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.02)',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.16)', display: 'inline-block' }} />
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.16)', display: 'inline-block' }} />
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--rialto-accent)', display: 'inline-block' }} />
              <span style={{ marginLeft: 8, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, color: 'var(--rialto-text-muted-2)' }}>
                facilitator · stellar:pubnet
              </span>
            </div>
            <div
              style={{
                padding: '22px 20px',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 13,
                lineHeight: 1.95,
                color: 'var(--rialto-text-body-2)',
              }}
            >
              <div>
                <span style={{ color: 'var(--rialto-accent)' }}>$</span> curl -X POST /verify
              </div>
              <div style={{ color: 'var(--rialto-text-muted-3)', paddingLeft: 16 }}>→ 402 Payment Required</div>
              <div style={{ marginTop: 10 }}>
                <span style={{ color: 'var(--rialto-accent)' }}>$</span> x402 pay --to svc_weather_usdc --network stellar:pubnet
              </div>
              <div style={{ color: 'var(--rialto-accent)', paddingLeft: 16 }}>✓ settled · tx CBOA7…F31</div>
              <div style={{ color: 'var(--rialto-accent)', paddingLeft: 16 }}>✓ cataloged → bazaar</div>
              <div style={{ marginTop: 10 }}>
                <span style={{ color: 'var(--rialto-accent)' }}>$</span> mcp search_resources &quot;weather api usdc stellar&quot;
              </div>
              <div style={{ color: 'var(--rialto-text-muted-3)', paddingLeft: 16 }}>
                → 1 result · rank #1 · settled 4m ago
                <span
                  style={{
                    display: 'inline-block',
                    width: 7,
                    height: 14,
                    background: 'var(--rialto-accent)',
                    marginLeft: 8,
                    animation: 'rialto-blink 1s step-end infinite',
                    verticalAlign: 'middle',
                  }}
                />
              </div>
            </div>
          </div>
          <p style={{ fontSize: 13, color: 'var(--rialto-text-muted-2)', margin: '14px 4px 0' }}>
            Every settled call is a discovery event.
          </p>
        </div>
      </div>
    </header>
  );
}
