import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import Image from 'next/image';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <Image src="/logo-mark-transparent.png" alt="Rialto" width={22} height={29} />
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700 }}>
            Rialto
          </span>
        </>
      ),
    },
    githubUrl: 'https://github.com/0d1026/Rialto',
    links: [
      {
        text: 'Docs',
        url: '/docs',
      },
    ],
  };
}
