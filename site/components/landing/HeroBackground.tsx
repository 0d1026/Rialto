import { heroStars } from './content';
import { Parallax } from './Reveal';

/**
 * Decorative hero background: dot-grid + twinkling stars + constellation SVG
 * + a crisp animated outline blob. The source design's `heroStars` toggle is
 * hardcoded to always render (true). Layers drift at different scroll
 * speeds (Parallax) so the background feels like it has depth rather than
 * scrolling 1:1 with the page.
 */
export default function HeroBackground() {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {/* Subtle grain, above the glow, below the dot-grid/stars */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.045,
          mixBlendMode: 'overlay',
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
      <Parallax speed={35} style={{ position: 'absolute', inset: 0 }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)',
            backgroundSize: '34px 34px',
            maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.9), transparent 75%)',
            WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.9), transparent 75%)',
          }}
        />
      </Parallax>

      <Parallax speed={55} style={{ position: 'absolute', inset: 0 }}>
        {heroStars.map((star, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: star.top,
              left: star.left,
              width: star.size,
              height: star.size,
              background: '#fff',
              borderRadius: '50%',
              animation: `rialto-twinkle ${star.duration}s ease-in-out infinite ${star.delay}s`,
            }}
          />
        ))}
      </Parallax>

      <Parallax speed={-80} style={{ position: 'absolute', inset: 0 }}>
        <svg
          viewBox="0 0 400 400"
          style={{ position: 'absolute', top: -40, right: -40, width: 420, height: 420, opacity: 0.55 }}
        >
          <line x1="330" y1="60" x2="250" y2="140" stroke="var(--rialto-accent)" strokeWidth="1.2" opacity="0.5" />
          <line x1="250" y1="140" x2="300" y2="220" stroke="var(--rialto-accent)" strokeWidth="1.2" opacity="0.5" />
          <line x1="250" y1="140" x2="170" y2="120" stroke="var(--rialto-accent)" strokeWidth="1.2" opacity="0.4" />
          <line x1="300" y1="220" x2="360" y2="280" stroke="var(--rialto-accent)" strokeWidth="1.2" opacity="0.4" />
          <line x1="170" y1="120" x2="120" y2="180" stroke="var(--rialto-accent)" strokeWidth="1.2" opacity="0.35" />
          <line x1="300" y1="220" x2="230" y2="290" stroke="#7C3AED" strokeWidth="1.2" opacity="0.4" />
          <line x1="230" y1="290" x2="150" y2="320" stroke="#7C3AED" strokeWidth="1.2" opacity="0.3" />
          <circle cx="330" cy="60" r="4" fill="var(--rialto-accent)" />
          <circle cx="250" cy="140" r="5" fill="var(--rialto-accent)" />
          <circle cx="170" cy="120" r="3" fill="var(--rialto-accent)" opacity="0.8" />
          <circle cx="120" cy="180" r="3" fill="var(--rialto-accent)" opacity="0.6" />
          <circle cx="300" cy="220" r="4.5" fill="#7C3AED" />
          <circle cx="360" cy="280" r="3" fill="var(--rialto-accent)" opacity="0.6" />
          <circle cx="230" cy="290" r="3.5" fill="#7C3AED" opacity="0.8" />
          <circle cx="150" cy="320" r="2.5" fill="#7C3AED" opacity="0.5" />
        </svg>
      </Parallax>

      {/* Crisp (non-blurred) animated outline blob, slow-drifting behind the copy */}
      <Parallax speed={45} style={{ position: 'absolute', inset: 0 }}>
        <svg
          viewBox="0 0 400 400"
          className="rialto-hero-blob"
          style={{ position: 'absolute', bottom: -90, left: -110, width: 420, height: 420, opacity: 0.5 }}
        >
          <path
            d="M199,331Q149,412,84,352Q19,292,29,209Q39,126,111,84Q183,42,251,86Q319,130,331,206Q343,282,271,306Q199,330,199,331Z"
            fill="none"
            stroke="var(--rialto-accent)"
            strokeWidth="1.4"
            opacity="0.6"
          />
          <path
            d="M199,331Q149,412,84,352Q19,292,29,209Q39,126,111,84Q183,42,251,86Q319,130,331,206Q343,282,271,306Q199,330,199,331Z"
            fill="var(--rialto-accent-soft)"
            opacity="0.4"
          />
        </svg>
      </Parallax>
    </div>
  );
}
