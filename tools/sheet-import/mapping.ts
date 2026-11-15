import type { StatusKey } from '../../core/src/status';

export const APPLICATION_HEADERS = {
  company: 'Company',
  position: 'Position',
  dateApplied: 'Date Applied',
  stage: 'Stage',
  lastEventDate: 'Last Event Date',
  mostRecentEvent: 'Most Recent Event',
  followUpDue: 'Follow-Up Due',
  postingUrl: 'Posting URL',
  emailThreadUrl: 'Email Thread URL',
  notes: 'Notes',
} as const;

/** Non-empty values in these columns become `Header: value` lines in the application's notes, in this order. */
export const APPLICATION_NOTE_COLUMNS = [
  'Channel',
  'Location / Remote',
  'Salary Range',
  'Next Action',
  'Email Thread URL',
  'Evidence',
  'Priority',
  'Follow-Up Flag',
] as const;

export const HISTORY_HEADERS = {
  eventDate: 'Event Date',
  company: 'Company',
  position: 'Position',
  eventType: 'Event Type',
  responseNotes: 'Response / Notes',
  stageAfterEvent: 'Stage After Event',
  sourceReliability: 'Source Reliability',
  emailThreadUrl: 'Email Thread URL',
} as const;

export type StatusRule =
  | { kind: 'status'; status: StatusKey }
  | { kind: 'carry-forward' } // keep the previous status; listed in the report
  | { kind: 'unconfirmed' }; // becomes 'interested' with UNCONFIRMED_NOTE; listed in the report

/** Keys are lower-case; look up with `statusRuleFor`. */
export const STATUS_RULES: Readonly<Record<string, StatusRule>> = {
  applied: { kind: 'status', status: 'applied' },
  rejected: { kind: 'status', status: 'rejected' },
  closed: { kind: 'status', status: 'position_closed' },
  'phone screening': { kind: 'status', status: 'phone_screen' },
  'technical assessment': { kind: 'status', status: 'phone_screen' },
  interviewing: { kind: 'status', status: 'interview' },
  'not submitted': { kind: 'unconfirmed' },
  'awaiting response': { kind: 'carry-forward' },
  'needs review': { kind: 'carry-forward' },
};

export const UNCONFIRMED_NOTE = 'Submission not confirmed in the sheet.';
export const UNDATED_NOTE = 'Date applied not recorded in the sheet.';

/** Trimmed, whitespace-collapsed, lower-cased lookup. Unknown or blank → undefined. */
export function statusRuleFor(
  value: string,
  rules: Readonly<Record<string, StatusRule>> = STATUS_RULES,
): StatusRule | undefined {
  const key = value.trim().replace(/\s+/g, ' ').toLowerCase();
  if (key === '' || !Object.hasOwn(rules, key)) return undefined;
  return rules[key];
}
