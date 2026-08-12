import './global.css';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { Geist, Space_Grotesk, Inter, Poppins, Nunito_Sans } from 'next/font/google';
import type { ReactNode } from 'react';

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-space-grotesk',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

// Landing-only display pairing, extracted from the reference site
// (minhpham.design): geometric bold sans for headings/display (their
// commercial "Avant Garde" — Poppins is the closest open equivalent) +
// Nunito Sans for small tracked nav/label text.
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

const nunitoSans = Nunito_Sans({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-nunito-sans',
  display: 'swap',
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
      className={`${geist.variable} ${spaceGrotesk.variable} ${inter.variable} ${poppins.variable} ${nunitoSans.variable}`}
    >
      <body className="flex min-h-screen flex-col font-sans">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
