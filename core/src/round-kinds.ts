export const ROUND_KINDS = [
  'recruiter_screen',
  'phone_screen',
  'technical',
  'take_home',
  'onsite',
  'hiring_manager',
  'panel',
  'other',
] as const;
export type RoundKind = (typeof ROUND_KINDS)[number];
export const ROUND_KIND_LABELS: Record<RoundKind, string> = {
  recruiter_screen: 'Recruiter screen',
  phone_screen: 'Phone screen',
  technical: 'Technical',
  take_home: 'Take-home',
  onsite: 'On-site',
  hiring_manager: 'Hiring manager',
  panel: 'Panel',
  other: 'Other',
};

// Stored values outside the list read as Other in the UI.
export function isRoundKind(value: unknown): value is RoundKind {
  return (ROUND_KINDS as readonly unknown[]).includes(value);
}
