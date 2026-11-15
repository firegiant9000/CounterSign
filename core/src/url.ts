// core/ declares no URL global (lib ES2023, types []), so declare the subset used here.
interface UrlLike {
  protocol: string;
  origin: string;
  hash: string;
  search: string;
  href: string;
  searchParams: { forEach(cb: (value: string, key: string) => void): void };
}
declare const URL: { new (url: string, base?: string): UrlLike };

const TRACKING_NAMES = new Set([
  'gclid',
  'fbclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'gh_src',
  'lever-source',
  'source',
  'src',
  'ref',
  'refid',
  'trk',
  'trackingid',
]);

function parseHttp(input: string, base?: string): UrlLike | undefined {
  try {
    const parsed = new URL(input, base);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith('utm_') || TRACKING_NAMES.has(lower);
}

function keptPairs(url: UrlLike): Set<string> {
  const pairs = new Set<string>();
  url.searchParams.forEach((value, key) => {
    if (!isTrackingParam(key)) {
      pairs.add(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
  });
  return pairs;
}

/** A rel=canonical is trusted only on the same origin and when it keeps every non-tracking page parameter. */
function canonicalAcceptable(page: UrlLike, canonical: UrlLike): boolean {
  if (canonical.origin !== page.origin) return false;
  const canonicalPairs = keptPairs(canonical);
  for (const pair of keptPairs(page)) {
    if (!canonicalPairs.has(pair)) return false;
  }
  return true;
}

/**
 * Returns a stable form of a job posting URL: fragment and tracking parameters
 * removed, rel=canonical used when it is a valid http(s) URL. Never throws.
 */
export function canonicalizeUrl(url: string, relCanonical?: string): string {
  const input = url.trim();
  const page = parseHttp(input);
  if (!page) return input;
  const rel = relCanonical?.trim() ?? '';
  const candidate = rel !== '' ? parseHttp(rel, input) : undefined;
  const parsed =
    candidate && canonicalAcceptable(page, candidate) ? candidate : page;

  // A '#' or '?' cannot appear unencoded inside the path, so the first occurrence starts the fragment or query.
  const href = parsed.href;
  const hashIndex = href.indexOf('#');
  const noHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const queryIndex = noHash.indexOf('?');
  const base = queryIndex >= 0 ? noHash.slice(0, queryIndex) : noHash;

  const kept: string[] = [];
  parsed.searchParams.forEach((value, key) => {
    if (!isTrackingParam(key)) {
      kept.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
  });
  return kept.length > 0 ? `${base}?${kept.sort().join('&')}` : base;
}
