export const STATUS_KEYS = [
  'interested',
  'applied',
  'recruiter_contact',
  'phone_screen',
  'interview',
  'offer',
  'accepted',
  'rejected',
  'no_response',
  'withdrawn',
] as const;

export type StatusKey = (typeof STATUS_KEYS)[number];

export const DEFAULT_STATUS_LABELS: Record<StatusKey, string> = {
  interested: 'Interested',
  applied: 'Applied',
  recruiter_contact: 'Recruiter contact',
  phone_screen: 'Phone screen',
  interview: 'Interview',
  offer: 'Offer',
  accepted: 'Accepted',
  rejected: 'Rejected',
  no_response: 'No response',
  withdrawn: 'Withdrawn',
};
