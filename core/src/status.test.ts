import { describe, expect, it } from 'vitest';
import { DEFAULT_STATUS_LABELS, STATUS_KEYS } from './status';

describe('default statuses', () => {
  it('lists the ten statuses in spec order', () => {
    expect(STATUS_KEYS).toEqual([
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
    ]);
  });
  it('labels every status', () => {
    expect(DEFAULT_STATUS_LABELS).toEqual({
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
    });
  });
});
