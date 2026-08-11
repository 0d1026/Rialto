import './global.css';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { Geist, Space_Grotesk } from 'next/font/google';
import type { ReactNode } from 'react';

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
});

export const metadata = {
  title: {
    template: '%s | Rialto',
    default: 'Rialto - x402 facilitator & discovery on Stellar',
  },
  description:
    'An x402 payment facilitator and Bazaar discovery layer for Stellar, so AI agents can find, pay for, and verify paid services.',
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geist.variable} ${spaceGrotesk.variable}`}
    >
      <body className="flex min-h-screen flex-col font-sans">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
