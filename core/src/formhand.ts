export const SITE_TYPES = [
  'greenhouse',
  'lever',
  'ashby',
  'workday',
  'linkedin',
  'indeed',
  'other',
] as const;
export type SiteType = (typeof SITE_TYPES)[number];
export const SITE_TYPE_LABELS: Record<SiteType, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  workday: 'Workday',
  linkedin: 'LinkedIn',
  indeed: 'Indeed',
  other: 'Other',
};

export const FILL_OUTCOMES = [
  'worked',
  'partly',
  'failed',
  'not_used',
] as const;
export type FillOutcome = (typeof FILL_OUTCOMES)[number];
export const FILL_OUTCOME_LABELS: Record<FillOutcome, string> = {
  worked: 'Worked',
  partly: 'Partly',
  failed: 'Failed',
  not_used: 'Not used',
};

// Stored values outside the lists read as blank in the UI.
export function isSiteType(value: unknown): value is SiteType {
  return (SITE_TYPES as readonly unknown[]).includes(value);
}

export function isFillOutcome(value: unknown): value is FillOutcome {
  return (FILL_OUTCOMES as readonly unknown[]).includes(value);
}
