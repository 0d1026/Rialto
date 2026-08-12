import Link from 'next/link';
import { footerLinks } from './content';

export default function Footer() {
  return (
    <footer
      style={{
        maxWidth: 'var(--rialto-content-max-width)',
        margin: '0 auto',
        padding: '32px clamp(20px,5vw,48px) 48px',
        borderTop: '1px solid var(--rialto-border-soft)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <img src="/logo-mark-transparent.png" alt="Rialto" style={{ height: 22, width: 'auto', display: 'block', opacity: 0.85 }} />
        <span style={{ fontFamily: 'var(--rialto-font-heading)', fontWeight: 700, fontSize: 14 }}>
          Rialto
        </span>
        <span style={{ fontSize: 13, color: 'var(--rialto-text-muted-2)' }}>
          Apache-2.0 · No copyleft anywhere in the dependency path.
        </span>
      </div>
      <div style={{ display: 'flex', gap: 24 }}>
        {footerLinks.map((link) =>
          link.href.startsWith('/') ? (
            <Link key={link.label} href={link.href} style={{ fontSize: 13, color: 'var(--rialto-text-muted-1)' }}>
              {link.label}
            </Link>
          ) : (
            <a key={link.label} href={link.href} style={{ fontSize: 13, color: 'var(--rialto-text-muted-1)' }}>
              {link.label}
            </a>
          ),
        )}
      </div>
    </footer>
  );
}
