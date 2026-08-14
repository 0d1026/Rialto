import Link from 'next/link';
import { navLinks, REPO_URL } from './content';

export default function Nav() {
  return (
    <nav className="rialto-nav">
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
      <div className="rialto-nav-links">
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
