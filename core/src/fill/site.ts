import type { SiteType } from '../formhand';
import type { FrameAdvice } from './types';

// core/ declares no URL global (lib ES2023, types []), so declare the subset used here.
interface UrlLike {
  protocol: string;
  hostname: string;
}
declare const URL: { new (url: string): UrlLike };

export const FRAME_HOSTS: ReadonlyMap<string, 'greenhouse' | 'ashby'> = new Map<
  string,
  'greenhouse' | 'ashby'
>([
  ['job-boards.greenhouse.io', 'greenhouse'],
  ['boards.greenhouse.io', 'greenhouse'],
  ['jobs.ashbyhq.com', 'ashby'],
]);

const SITE_SUFFIXES: ReadonlyArray<readonly [string, SiteType]> = [
  ['greenhouse.io', 'greenhouse'],
  ['lever.co', 'lever'],
  ['ashbyhq.com', 'ashby'],
  ['myworkdayjobs.com', 'workday'],
  ['workday.com', 'workday'],
  ['linkedin.com', 'linkedin'],
  ['indeed.com', 'indeed'],
];

function parseUrl(input: string): UrlLike | undefined {
  try {
    return new URL(input);
  } catch {
    return undefined;
  }
}

export function siteTypeForUrl(url: string): SiteType {
  const parsed = parseUrl(url);
  if (
    !parsed ||
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
  ) {
    return 'other';
  }
  const host = parsed.hostname.toLowerCase();
  for (const [suffix, site] of SITE_SUFFIXES) {
    if (host === suffix || host.endsWith('.' + suffix)) {
      return site;
    }
  }
  return 'other';
}

export function frameAdvice(frames: readonly string[]): FrameAdvice[] {
  const taken = new Map<'greenhouse' | 'ashby', string>();
  for (const src of frames) {
    const parsed = parseUrl(src);
    if (!parsed || parsed.protocol !== 'https:') {
      continue;
    }
    const site = FRAME_HOSTS.get(parsed.hostname.toLowerCase());
    if (site === undefined || taken.has(site)) {
      continue;
    }
    taken.set(site, src);
  }
  const advice: FrameAdvice[] = [];
  for (const site of ['greenhouse', 'ashby'] as const) {
    const src = taken.get(site);
    if (src !== undefined) {
      advice.push({ site, src });
    }
  }
  return advice;
}
