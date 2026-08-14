import HeroBackground from './HeroBackground';
import HeroScene from './HeroScene';
import { REPO_URL } from './content';
import { Parallax, RevealMask } from './Reveal';

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
                fontSize: 'clamp(38px,5vw,64px)',
                lineHeight: 1.04,
                letterSpacing: '-0.02em',
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
            <a href="/try" className="rialto-btn rialto-btn--primary">
              Try it live ↗
            </a>
            <a href={REPO_URL} className="rialto-btn rialto-btn--outline">
              View the repo ↗
            </a>
          </div>
        </div>

        <Parallax speed={-40} className="rialto-hero-col-right" style={{ flex: '1 1 400px', maxWidth: 460, minWidth: 300 }}>
          <HeroScene />
          <p style={{ fontSize: 13, color: 'var(--rialto-text-muted-2)', margin: '14px 4px 0', textAlign: 'center' }}>
            Discovery is always watching.
          </p>
        </Parallax>
      </div>
    </header>
  );
}
