import { RIALTO } from '@/lib/rialto';

export const dynamic = 'force-dynamic';

/** Server-side proxy to the live discovery search so the browser stays same-origin. */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const query = (url.searchParams.get('query') ?? '').trim();
  if (!query) {
    return Response.json({ error: 'query parameter is required' }, { status: 400 });
  }
  const limit = url.searchParams.get('limit') ?? '8';
  const target = `${RIALTO.discoveryUrl}/discovery/search?query=${encodeURIComponent(
    query,
  )}&limit=${encodeURIComponent(limit)}`;

  try {
    const res = await fetch(target, { signal: AbortSignal.timeout(90_000) });
    const body = await res.json();
    return Response.json(body, { status: res.status });
  } catch {
    return Response.json({ error: 'discovery unreachable' }, { status: 502 });
  }
}
