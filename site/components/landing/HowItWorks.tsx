import { timelineSteps } from './content';
import { Reveal, Stagger, StaggerItem, RevealMask } from './Reveal';

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
      <Reveal>
        <div className="rialto-section-eyebrow-block" style={{ marginBottom: 48 }}>
          <p className="rialto-eyebrow rialto-eyebrow--pill">How it works</p>
          <RevealMask>
            <h2 className="rialto-section-heading">Discovery is a side effect of settlement</h2>
          </RevealMask>
        </div>
      </Reveal>

      <Stagger style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 0, position: 'relative' }}>
        <div style={{ position: 'absolute', top: 19, left: '5%', right: '5%', height: 1, background: 'rgba(255,255,255,0.12)' }} />
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
              <p style={{ fontFamily: 'var(--rialto-font-heading)', fontSize: 16, color: '#FFFFFF', margin: 0, fontWeight: 600 }}>
                {step.title}
              </p>
              <p style={{ fontSize: 14, color: 'var(--rialto-text-muted-1)', lineHeight: 1.55, margin: 0 }}>
                {withInlineCode(step.description)}
              </p>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}
