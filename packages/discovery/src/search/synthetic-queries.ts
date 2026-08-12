/**
 * Synthetic per-resource queries: at index time, generate natural-language
 * questions an agent would plausibly ask to find this resource, embed them
 * alongside the resource's own metadata (same generation) - so a paraphrase
 * query with no vocabulary overlap with the resource's own text can still
 * match, via similarity to one of these instead.
 *
 * v1 is template-based, not LLM-authored: this environment has no
 * separately-provisioned query-generation LLM, and templates keep query
 * generation local/offline/free, consistent with the embedding model choice
 * for this stage. Three queries per resource (documented count): a direct
 * "what does this do" framing, a task-oriented framing, and a tag-anchored
 * framing when tags exist - enough to give the dense arm more than one
 * phrasing to match against without needing real NL generation yet. This is
 * the piece most worth upgrading to real LLM-authored queries once judge/
 * generator model access exists (see packages/eval-harness's judge-model
 * limitation note).
 */
export interface SyntheticQueryInput {
  serviceName?: string;
  description?: string;
  tags?: string[];
  type: 'http' | 'mcp';
}

export function generateSyntheticQueries(resource: SyntheticQueryInput): string[] {
  const name = resource.serviceName ?? (resource.type === 'mcp' ? 'this tool' : 'this service');
  const queries: string[] = [];

  queries.push(`What does ${name} do?`);

  if (resource.description) {
    queries.push(`I need something that can ${lowerFirst(resource.description)}`);
  } else {
    queries.push(`Where can I find ${name}?`);
  }

  if (resource.tags && resource.tags.length > 0) {
    queries.push(`Looking for a ${resource.type === 'mcp' ? 'tool' : 'service'} related to ${resource.tags.join(', ')}`);
  }

  return queries;
}

function lowerFirst(s: string): string {
  return s.length === 0 ? s : s[0].toLowerCase() + s.slice(1);
}
