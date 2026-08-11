import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 text-center">
      <h1 className="mb-4 text-4xl font-bold">Rialto</h1>
      <p className="mb-2 max-w-xl text-lg text-fd-muted-foreground">
        An x402 payment facilitator and Bazaar discovery layer for Stellar - so
        AI agents can find, pay for, and verify paid services.
      </p>
      <p className="mb-8 max-w-xl text-sm text-fd-muted-foreground">
        Landing page in progress. The technical documentation is live.
      </p>
      <div className="flex gap-3">
        <Link
          href="/docs"
          className="lift rounded-lg bg-fd-primary px-5 py-2.5 font-medium text-fd-primary-foreground"
        >
          Read the Docs
        </Link>
        <a
          href="https://github.com/0d1026/Rialto"
          className="lift rounded-lg border px-5 py-2.5 font-medium"
        >
          GitHub
        </a>
      </div>
    </main>
  );
}
