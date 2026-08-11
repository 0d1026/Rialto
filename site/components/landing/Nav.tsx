import Link from 'next/link';
import { navLinks, REPO_URL } from './content';

export default function Nav() {
  return (
    <nav
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
      <img src="/logo-lockup.png" alt="Rialto" style={{ height: 34, display: 'block' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(16px,3vw,36px)', flexWrap: 'wrap' }}>
        {navLinks.map((link) =>
          link.href.startsWith('/') ? (
            <Link
              key={link.label}
              href={link.href}
              style={{ fontSize: 14, color: 'var(--rialto-text-body-2)', fontWeight: 500 }}
            >
              {link.label}
            </Link>
          ) : (
            <a
              key={link.label}
              href={link.href}
              style={{ fontSize: 14, color: 'var(--rialto-text-body-2)', fontWeight: 500 }}
            >
              {link.label}
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
