import type { ReactNode } from 'react';

/**
 * The landing page ships its own bespoke nav/footer (see components/landing/),
 * so this route intentionally does NOT use Fumadocs' `HomeLayout` chrome —
 * that's reserved for /docs. Manrope is loaded here (not in the root layout)
 * since it's only needed by the landing page's body copy.
 */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      {children}
    </>
  );
}
