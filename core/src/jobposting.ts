export const MAX_POSTING_TEXT = 100_000;

export interface CaptureResult {
  source: 'jsonld' | 'selection' | 'none';
  url: string;
  relCanonical?: string;
  title?: string;
  companyName?: string;
  location?: string;
  text?: string;
}

export interface PostingFields {
  title?: string;
  companyName?: string;
  location?: string;
  descriptionHtml?: string;
}

const MAX_DEPTH = 3;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A trimmed non-blank string, or undefined for anything else. */
function str(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function isJobPosting(node: Record<string, unknown>): boolean {
  const type = node['@type'];
  if (type === 'JobPosting') return true;
  return Array.isArray(type) && type.includes('JobPosting');
}

function collectJobPostings(
  value: unknown,
  depth: number,
  found: Record<string, unknown>[],
): void {
  if (depth > MAX_DEPTH) return;
  if (Array.isArray(value)) {
    for (const item of value) collectJobPostings(item, depth + 1, found);
    return;
  }
  if (!isPlainObject(value)) return;
  if (isJobPosting(value)) {
    found.push(value);
    return;
  }
  const graph = value['@graph'];
  if (Array.isArray(graph)) collectJobPostings(graph, depth + 1, found);
}

function companyOf(node: Record<string, unknown>): string | undefined {
  const org = node['hiringOrganization'];
  if (typeof org === 'string') return str(org);
  return isPlainObject(org) ? str(org['name']) : undefined;
}

function locationOf(node: Record<string, unknown>): string | undefined {
  const raw = node['jobLocation'];
  const loc: unknown = Array.isArray(raw) ? (raw as unknown[])[0] : raw;
  if (!isPlainObject(loc)) return undefined;
  const address = loc['address'];
  if (!isPlainObject(address)) return undefined;
  const parts = [
    str(address['addressLocality']),
    str(address['addressRegion']),
  ].filter((p): p is string => p !== undefined);
  return parts.length > 0 ? parts.join(', ') : undefined;
}

export function postingFromJsonLd(
  blocks: readonly string[],
): PostingFields | undefined {
  const nodes: Record<string, unknown>[] = [];
  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block);
    } catch {
      continue;
    }
    collectJobPostings(parsed, 0, nodes);
  }
  // None, or several (a listing page), means no single posting to trust.
  const node = nodes.length === 1 ? nodes[0] : undefined;
  if (!node) return undefined;
  const fields: PostingFields = {};
  const title = str(node['title']);
  if (title !== undefined) fields.title = title;
  const companyName = companyOf(node);
  if (companyName !== undefined) fields.companyName = companyName;
  const location = locationOf(node);
  if (location !== undefined) fields.location = location;
  const descriptionHtml = str(node['description']);
  if (descriptionHtml !== undefined) fields.descriptionHtml = descriptionHtml;
  return Object.keys(fields).length > 0 ? fields : undefined;
}
