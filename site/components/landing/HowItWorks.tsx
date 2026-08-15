import { timelineSteps } from './content';
import { Parallax, Reveal, Stagger, StaggerItem, RevealMask } from './Reveal';

function withInlineCode(text: string) {
  const parts = text.split(/(seller-sdk|search_resources|paid_call)/g);
  return parts.map((part, i) =>
    part === 'seller-sdk' || part === 'search_resources' || part === 'paid_call' ? (
      <code key={i} className="rialto-code-chip">
        {part}
      </code>
    ) : (
      part
    ),
  );
}

export default function HowItWorks() {
  return (
    <section className="rialto-section rialto-section--divided">
      <Parallax speed={-60} className="rialto-section-decor" style={{ top: 40, right: -30 }}>
        <svg width="120" height="200" viewBox="0 0 120 200" style={{ opacity: 0.35 }}>
          <line x1="60" y1="0" x2="60" y2="200" stroke="var(--rialto-accent)" strokeWidth="1" strokeDasharray="2 8" />
          <circle cx="60" cy="30" r="3" fill="var(--rialto-accent)" />
          <circle cx="60" cy="100" r="3" fill="var(--rialto-accent-alt)" />
          <circle cx="60" cy="170" r="3" fill="var(--rialto-accent)" />
        </svg>
      </Parallax>

      <Reveal>
        <div className="rialto-section-eyebrow-block" style={{ marginBottom: 48 }}>
          <p className="rialto-eyebrow rialto-eyebrow--pill">How it works</p>
          <RevealMask>
            <h2 className="rialto-section-heading">Discovery is a side effect of settlement</h2>
          </RevealMask>
        </div>
      </Reveal>

      <Stagger className="rialto-timeline">
        <div className="rialto-timeline-line" />
        {timelineSteps.map((step, i) => (
          <StaggerItem key={step.number}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                paddingRight: i < timelineSteps.length - 1 ? 16 : 0,
                position: 'relative',
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  background: 'var(--rialto-bg-page)',
                  border: '1px solid var(--rialto-accent)',
                  color: 'var(--rialto-accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'var(--rialto-font-heading)',
                  fontWeight: 700,
                  fontSize: 15,
                }}
              >
                {step.number}
              </div>
              <p style={{ fontFamily: 'var(--rialto-font-heading)', fontSize: 'clamp(16px,1.1vw,18px)', color: '#FFFFFF', margin: 0, fontWeight: 600 }}>
                {step.title}
              </p>
              <p style={{ fontSize: 'clamp(14px,0.9vw,16px)', color: 'var(--rialto-text-muted-1)', lineHeight: 1.55, margin: 0 }}>
                {withInlineCode(step.description)}
              </p>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}
