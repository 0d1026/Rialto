import Link from 'next/link';
import { navLinks, REPO_URL } from './content';

export default function Nav() {
  return (
    <nav
      className="rialto-nav"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        maxWidth: 'var(--rialto-content-max-width)',
        margin: '0 auto',
        padding: '22px clamp(20px,5vw,48px)',
        gap: 24,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <img
          src="/logo-mark-transparent.png"
          alt="Rialto"
          style={{ height: 28, width: 'auto', display: 'block' }}
        />
        <span style={{ fontFamily: 'var(--rialto-font-heading)', fontWeight: 700, fontSize: 18 }}>
          Rialto
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(16px,3vw,36px)', flexWrap: 'wrap' }}>
        {navLinks.map((link) =>
          link.href.startsWith('/') ? (
            <Link
              key={link.label}
              href={link.href}
              className="rialto-nav-link"
              style={{ color: 'var(--rialto-text-body-2)' }}
            >
              <span className="rialto-nav-link-track">
                <span className="rialto-nav-link-line">{link.label}</span>
                <span className="rialto-nav-link-line rialto-nav-link-line--hover">{link.label}</span>
              </span>
            </Link>
          ) : (
            <a
              key={link.label}
              href={link.href}
              className="rialto-nav-link"
              style={{ color: 'var(--rialto-text-body-2)' }}
            >
              <span className="rialto-nav-link-track">
                <span className="rialto-nav-link-line">{link.label}</span>
                <span className="rialto-nav-link-line rialto-nav-link-line--hover">{link.label}</span>
              </span>
            </a>
          ),
        )}
        <a href={REPO_URL} className="rialto-pill-btn">
          GitHub ↗
        </a>
      </div>
    </nav>
  );
}
