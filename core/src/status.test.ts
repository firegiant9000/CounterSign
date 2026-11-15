import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STATUS_LABELS,
  STATUS_KEYS,
  currentStatus,
  effectiveDate,
  historyFor,
  isArchived,
  statusLabel,
} from './status';
import type { StatusKey } from './status';
import type { StatusEvent } from './types';

describe('default statuses', () => {
  it('lists the eleven statuses in spec order', () => {
    expect(STATUS_KEYS).toEqual([
      'interested',
      'applied',
      'recruiter_contact',
      'phone_screen',
      'interview',
      'offer',
      'accepted',
      'rejected',
      'position_closed',
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
      position_closed: 'Position closed',
      no_response: 'No response',
      withdrawn: 'Withdrawn',
    });
  });
});

describe('derived status', () => {
  const ev = (
    id: string,
    status: StatusKey,
    occurredOn: string | undefined,
    createdAt: string,
    extra: Partial<StatusEvent> = {},
  ): StatusEvent => ({
    id,
    createdAt,
    applicationId: 'a1',
    status,
    occurredOn,
    ...extra,
  });

  it('takes the latest event by date, not by entry order', () => {
    const events = [
      ev('e1', 'interview', '2026-03-10', '2026-03-10T10:00:00.000Z'),
      ev('e2', 'applied', '2026-03-02', '2026-03-11T10:00:00.000Z'), // entered later, happened earlier
    ];
    expect(currentStatus(events, 'a1')?.status).toBe('interview');
    expect(historyFor(events, 'a1').map((e) => e.id)).toEqual(['e2', 'e1']);
  });
  it('orders same-day events by entry time', () => {
    const events = [
      ev('e2', 'rejected', '2026-03-10', '2026-03-10T15:00:00.000Z'),
      ev('e1', 'phone_screen', '2026-03-10', '2026-03-10T09:00:00.000Z'),
    ];
    expect(currentStatus(events, 'a1')?.status).toBe('rejected');
  });
  it('uses the creation day when occurredOn is missing', () => {
    expect(
      effectiveDate(ev('e1', 'applied', undefined, '2026-03-04T23:59:00.000Z')),
    ).toBe('2026-03-04');
  });
  it('ignores voided events for the current status but keeps them in history', () => {
    const events = [
      ev('e1', 'applied', '2026-03-02', '2026-03-02T10:00:00.000Z'),
      ev('e2', 'rejected', '2026-03-05', '2026-03-05T10:00:00.000Z', {
        voidedAt: '2026-03-05T10:01:00.000Z',
      }),
    ];
    expect(currentStatus(events, 'a1')?.status).toBe('applied');
    expect(historyFor(events, 'a1')).toHaveLength(2);
  });
  it('ignores other applications', () => {
    expect(
      currentStatus(
        [
          {
            ...ev('e1', 'offer', '2026-03-02', '2026-03-02T10:00:00.000Z'),
            applicationId: 'a2',
          },
        ],
        'a1',
      ),
    ).toBeUndefined();
  });
  it('archives on the five closing statuses only', () => {
    for (const s of [
      'accepted',
      'rejected',
      'position_closed',
      'no_response',
      'withdrawn',
    ] as const)
      expect(
        isArchived(ev('e', s, '2026-03-02', '2026-03-02T10:00:00.000Z')),
      ).toBe(true);
    for (const s of [
      'interested',
      'applied',
      'recruiter_contact',
      'phone_screen',
      'interview',
      'offer',
    ] as const)
      expect(
        isArchived(ev('e', s, '2026-03-02', '2026-03-02T10:00:00.000Z')),
      ).toBe(false);
    expect(isArchived(undefined)).toBe(false);
  });
  it('labels by override, then default, then the raw key', () => {
    expect(statusLabel('applied', { applied: 'Sent' })).toBe('Sent');
    expect(statusLabel('applied')).toBe('Applied');
    expect(statusLabel('position_closed')).toBe('Position closed');
    expect(statusLabel('mystery')).toBe('mystery');
    expect(statusLabel(undefined)).toBe('No status');
  });
});

describe('statusLabel hardening', () => {
  it('returns the raw key for prototype names', () => {
    expect(statusLabel('toString')).toBe('toString');
    expect(statusLabel('__proto__')).toBe('__proto__');
    expect(statusLabel('toString', {})).toBe('toString');
    expect(statusLabel('__proto__', {})).toBe('__proto__');
  });

  it('ignores non-string overrides and non-string keys', () => {
    const overrides = { applied: 5 } as unknown as Record<string, string>;
    expect(statusLabel('applied', overrides)).toBe('Applied');
    expect(statusLabel(5 as unknown as string)).toBe('No status');
    expect(statusLabel(null as unknown as string)).toBe('No status');
  });

  it('effectiveDate falls back to createdAt for a non-string occurredOn', () => {
    const event = {
      id: 's',
      createdAt: '2026-01-05T09:00:00.000Z',
      occurredOn: 20260106,
    } as unknown as StatusEvent;
    expect(effectiveDate(event)).toBe('2026-01-05');
  });
});
