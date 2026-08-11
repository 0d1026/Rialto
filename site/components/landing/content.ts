export const REPO_URL = 'https://github.com/0d1026/Rialto';
export const AGENTVAULT_URL = 'https://github.com/xpanvictor/agentvault';

export const navLinks = [
  { label: 'Docs', href: '/docs' },
  { label: 'Packages', href: `${REPO_URL}/tree/main/packages` },
  { label: 'Decisions', href: `${REPO_URL}/tree/main/docs/decisions` },
];

export const facilitatorBullets: string[] = [
  'Channel-account throughput: parallel settlements, no sequence collisions',
  'Fee sponsorship with sponsor-cost protection',
  'Verifiable, on-ledger settlement receipts',
];

export const discoveryPipeline = [
  { label: 'BM25', variant: 'default' as const },
  { label: '+', variant: 'connector' as const },
  { label: 'Embeddings', variant: 'default' as const },
  { label: '→', variant: 'connector' as const },
  { label: 'RRF', variant: 'violet-soft' as const },
  { label: '→', variant: 'connector' as const },
  { label: 'Ranked', variant: 'violet-strong' as const },
];

export interface ProofCard {
  title: string;
  description: string;
  metrics?: string[];
}

export const proofCards: ProofCard[] = [
  {
    title: 'Public eval harness',
    description:
      '@rialto/eval-harness is a versioned golden-query set scored on nDCG@10, MRR, and Recall@20, gated in CI on every ranking change, re-runnable by anyone.',
    metrics: ['nDCG@10', 'MRR', 'Recall@20'],
  },
  {
    title: 'Validated at the source',
    description:
      'Malformed listings are a real, observed problem in production catalogs. @rialto/seller-sdk validates discovery metadata locally, before it ever reaches an index.',
  },
];

export interface TimelineStep {
  number: number;
  title: string;
  description: string;
}

export const timelineSteps: TimelineStep[] = [
  {
    number: 1,
    title: 'Seller declares',
    description: 'Metadata declared and validated locally via seller-sdk.',
  },
  {
    number: 2,
    title: 'Payment settles',
    description: 'The facilitator verifies and settles the x402 payment on Stellar.',
  },
  {
    number: 3,
    title: 'Bazaar catalogs it',
    description: 'Settlement carrying the Bazaar extension indexes the service automatically.',
  },
  {
    number: 4,
    title: 'Agent discovers + pays',
    description: 'Via MCP search_resources / paid_call.',
  },
];

export interface AdrCard {
  label: string;
  quote: string;
  supporting: string;
  href: string;
  linkLabel: string;
  variant: 'blue' | 'violet';
}

export const adrCards: AdrCard[] = [
  {
    label: 'ADR 0001: upto on-chain cap',
    quote: '“Token allowances alone cannot bind the recipient or guarantee single settlement.”',
    supporting:
      'A minimal, stateless Soroban contract enforces the spending cap on-chain and settles atomically in one transaction.',
    href: `${REPO_URL}/blob/main/docs/decisions/0001-upto-onchain-cap.md`,
    linkLabel: 'Read ADR 0001 ↗',
    variant: 'blue',
  },
  {
    label: 'ADR 0002: search stack',
    quote:
      'Rejected Elasticsearch for license reasons, and a dedicated vector database as “a second stateful service for a corpus that fits in RAM.”',
    supporting: 'Hybrid retrieval runs on plain PostgreSQL instead: one boring, self-hostable store.',
    href: `${REPO_URL}/blob/main/docs/decisions/0002-search-stack-and-eval.md`,
    linkLabel: 'Read ADR 0002 ↗',
    variant: 'violet',
  },
];

export const priorWorkFeatureChips = [
  'Filecoin + PDP proofs',
  'x402 micropayments',
  'ERC-8004 identity',
];

export const footerLinks = [
  { label: 'GitHub', href: REPO_URL },
  { label: 'License', href: `${REPO_URL}/blob/main/LICENSE` },
  { label: 'Docs', href: '/docs' },
];

export interface Star {
  top: string;
  left: string;
  size: number;
  duration: number;
  delay: number;
}

export const heroStars: Star[] = [
  { top: '12%', left: '8%', size: 3, duration: 3.2, delay: 0 },
  { top: '22%', left: '22%', size: 2, duration: 4, delay: 0.4 },
  { top: '8%', left: '45%', size: 2, duration: 3.6, delay: 0.8 },
  { top: '35%', left: '6%', size: 2, duration: 5, delay: 1.1 },
  { top: '14%', left: '68%', size: 3, duration: 3.4, delay: 0.2 },
  { top: '44%', left: '85%', size: 2, duration: 4.4, delay: 1.4 },
  { top: '60%', left: '12%', size: 2, duration: 3.8, delay: 0.6 },
  { top: '5%', left: '90%', size: 2, duration: 4.6, delay: 1.8 },
];
