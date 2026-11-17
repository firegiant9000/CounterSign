import { describe, expect, it } from 'vitest';
import { fixedDeps } from '../testing/fixed-deps';
import {
  canScheduleFollowUp,
  clearFollowUpOps,
  contactEventDate,
  eventsFor,
  followUpsUsed,
  isLiveEvent,
  logContactEventOps,
  setFollowUpOps,
  voidContactEventOps,
} from './followups';
import type { Contact, ContactEvent, Snapshot } from './types';

function snap(parts: Partial<Snapshot> = {}): Snapshot {
  return {
    companies: [],
    applications: [
      { id: 'app1', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'app2', createdAt: '2026-01-01T00:00:00.000Z' },
    ],
    contacts: [
      { id: 'A', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'B', createdAt: '2026-01-01T00:00:00.000Z' },
    ],
    contactEvents: [],
    ...parts,
  } as unknown as Snapshot;
}

function ev(id: string, extra: Record<string, unknown> = {}): ContactEvent {
  return {
    id,
    createdAt: '2026-01-02T00:00:00.000Z',
    contactId: 'A',
    kind: 'followed_up',
    occurredOn: '2026-01-02',
    ...extra,
  };
}

const twoOn1 = [
  ev('e1', { applicationId: 'app1' }),
  ev('e2', { applicationId: 'app1' }),
];

describe('follow-up limit', () => {
  it('the limit is per contact and per application', () => {
    const data = snap({ contactEvents: twoOn1 });
    expect(canScheduleFollowUp(data, 'A', 'app1')).toBe(false);
    expect(canScheduleFollowUp(data, 'A', 'app2')).toBe(true);
    expect(canScheduleFollowUp(data, 'A', undefined)).toBe(true);
    expect(canScheduleFollowUp(data, 'B', 'app1')).toBe(true);
    expect(() => setFollowUpOps(data, 'A', '2026-02-01', 'app1')).toThrow(
      'You have followed up twice on this application.',
    );
  });

  it('unlinked events do not count', () => {
    const data = snap({ contactEvents: [ev('e1'), ev('e2')] });
    expect(followUpsUsed(data, 'A', 'app1')).toBe(0);
  });

  it('undo frees a slot', () => {
    const [op] = voidContactEventOps(twoOn1[0]!, fixedDeps());
    const voided = (op as { record: ContactEvent }).record;
    const after = snap({ contactEvents: [voided, twoOn1[1]!] });
    expect(canScheduleFollowUp(after, 'A', 'app1')).toBe(true);
    expect(voidContactEventOps(voided, fixedDeps())).toEqual([]);
  });

  it('logging the follow-up clears the date', () => {
    const contact: Contact = {
      id: 'A',
      createdAt: '2026-01-01T00:00:00.000Z',
      name: 'Sam',
      followUpOn: '2026-02-01',
      followUpApplicationId: 'app1',
    };
    const data = snap({ contacts: [contact] });
    const input = { kind: 'followed_up', occurredOn: '2026-01-10' } as const;
    const ops = logContactEventOps(
      data,
      'A',
      { ...input, applicationId: 'app1' },
      fixedDeps(),
    );
    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatchObject({ kind: 'put', store: 'contactEvents' });
    const rec = (ops[1] as { record: Contact }).record;
    expect(rec.name).toBe('Sam');
    expect('followUpOn' in rec).toBe(false);
    expect('followUpApplicationId' in rec).toBe(false);
    const other = logContactEventOps(
      data,
      'A',
      { ...input, applicationId: 'app2' },
      fixedDeps(),
    );
    expect(other).toHaveLength(1);
  });

  it('a dangling application id does not clear an unlinked date', () => {
    const contact: Contact = {
      id: 'A',
      createdAt: '2026-01-01T00:00:00.000Z',
      name: 'Sam',
      followUpOn: '2026-02-01',
    };
    const ops = logContactEventOps(
      snap({ contacts: [contact] }),
      'A',
      { kind: 'followed_up', occurredOn: '2026-01-10', applicationId: 'gone' },
      fixedDeps(),
    );
    expect(ops).toHaveLength(1);
    const rec = (ops[0] as { record: ContactEvent }).record;
    expect('applicationId' in rec).toBe(false);
    expect(contact.followUpOn).toBe('2026-02-01');
  });

  it('logging clears a date whose application was deleted', () => {
    const contact: Contact = {
      id: 'A',
      createdAt: '2026-01-01T00:00:00.000Z',
      name: 'Sam',
      followUpOn: '2026-02-01',
      followUpApplicationId: 'gone',
    };
    const ops = logContactEventOps(
      snap({ contacts: [contact] }),
      'A',
      { kind: 'followed_up', occurredOn: '2026-01-10' },
      fixedDeps(),
    );
    expect(ops).toHaveLength(2);
    const rec = (ops[1] as { record: Contact }).record;
    expect(rec.name).toBe('Sam');
    expect('followUpOn' in rec).toBe(false);
    expect('followUpApplicationId' in rec).toBe(false);
  });

  it('no pending date, no contact write', () => {
    const ops = logContactEventOps(
      snap(),
      'A',
      { kind: 'followed_up', occurredOn: '2026-01-10' },
      fixedDeps(),
    );
    expect(ops).toHaveLength(1);
  });

  it('logging is never blocked', () => {
    const data = snap({ contactEvents: twoOn1 });
    const ops = logContactEventOps(
      data,
      'A',
      { kind: 'followed_up', occurredOn: '2026-01-10', applicationId: 'app1' },
      fixedDeps(),
    );
    expect(ops[0]).toMatchObject({ kind: 'put', store: 'contactEvents' });
  });
});

describe('logContactEventOps', () => {
  it('drops a dangling applicationId and trims the note', () => {
    const [op] = logContactEventOps(
      snap(),
      'A',
      {
        kind: 'replied',
        occurredOn: '2026-01-10',
        applicationId: 'gone',
        note: '  hi  ',
      },
      fixedDeps(),
    );
    const rec = (op as { record: ContactEvent }).record;
    expect('applicationId' in rec).toBe(false);
    expect(rec.note).toBe('hi');
    expect(rec.contactId).toBe('A');
  });

  it('rejects a bad date and an unknown kind', () => {
    expect(() =>
      logContactEventOps(
        snap(),
        'A',
        { kind: 'replied', occurredOn: '2026-13-01' },
        fixedDeps(),
      ),
    ).toThrow('Enter a valid date (YYYY-MM-DD).');
    expect(() =>
      logContactEventOps(
        snap(),
        'A',
        { kind: 'waved' as never, occurredOn: '2026-01-01' },
        fixedDeps(),
      ),
    ).toThrow('Choose what happened.');
  });

  it('gives [] for a gone contact', () => {
    expect(
      logContactEventOps(
        snap(),
        'nope',
        { kind: 'replied', occurredOn: '2026-01-01' },
        fixedDeps(),
      ),
    ).toEqual([]);
    expect(setFollowUpOps(snap(), 'nope', '2026-02-01', undefined)).toEqual([]);
  });
});

describe('setFollowUpOps and clearFollowUpOps', () => {
  it('sets and replaces the date and application', () => {
    const contact = {
      id: 'A',
      createdAt: '2026-01-01T00:00:00.000Z',
      followUpApplicationId: 'app1',
    } as Contact;
    const data = snap({ contacts: [contact] });
    const [op] = setFollowUpOps(data, 'A', '2026-02-01', undefined);
    const rec = (op as { record: Contact }).record;
    expect(rec.followUpOn).toBe('2026-02-01');
    expect('followUpApplicationId' in rec).toBe(false);
    expect(() => setFollowUpOps(data, 'A', 'soon', undefined)).toThrow(
      'Enter a valid date (YYYY-MM-DD).',
    );
  });

  it('clearFollowUpOps removes both fields, or does nothing', () => {
    const c = {
      id: 'A',
      createdAt: '2026-01-01T00:00:00.000Z',
      followUpOn: '2026-02-01',
    } as Contact;
    const [op] = clearFollowUpOps(c);
    expect('followUpOn' in (op as { record: Contact }).record).toBe(false);
    expect(clearFollowUpOps({ id: 'A', createdAt: 'x' })).toEqual([]);
  });
});

describe('reading events', () => {
  it('eventsFor orders newest first and hides voided and unknown kinds', () => {
    const data = snap({
      contactEvents: [
        ev('old', { occurredOn: '2026-01-01' }),
        ev('new', { occurredOn: '2026-03-01' }),
        ev('gone', {
          occurredOn: '2026-04-01',
          voidedAt: '2026-04-02T00:00:00.000Z',
        }),
        ev('odd', { kind: 'waved' }),
        ev('weird', { voidedAt: false, occurredOn: '2026-02-01' }),
        ev('other', { contactId: 'B' }),
      ],
    });
    expect(eventsFor(data, 'A').map((e) => e.id)).toEqual([
      'new',
      'weird',
      'old',
    ]);
  });

  it('isLiveEvent tolerates odd values', () => {
    expect(isLiveEvent(ev('x', { kind: 'waved' }))).toBe(false);
    expect(isLiveEvent(ev('x', { voidedAt: false }))).toBe(true);
    expect(isLiveEvent(ev('x', { voidedAt: '2026-01-01T00:00:00.000Z' }))).toBe(
      false,
    );
  });

  it('contactEventDate falls back to the createdAt day', () => {
    expect(contactEventDate(ev('x', { occurredOn: undefined }))).toBe(
      '2026-01-02',
    );
    expect(contactEventDate(ev('x', { occurredOn: 'soon' }))).toBe(
      '2026-01-02',
    );
    expect(contactEventDate(ev('x', { occurredOn: '2026-05-05' }))).toBe(
      '2026-05-05',
    );
  });
});
