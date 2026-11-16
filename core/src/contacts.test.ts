import { describe, expect, it } from 'vitest';
import { findOrCreateCompanyOps } from './application-ops';
import {
  addContactOps,
  anyoneHereForName,
  anyoneHerePrompt,
  contactsAt,
  deleteContactOps,
  markCheckedNobodyOps,
  updateContactOps,
} from './contacts';
import { emptySnapshot } from './schema';
import type { Contact, Deps, Snapshot } from './types';

const T = '2026-11-15T12:00:00.000Z';

function makeDeps(): Deps {
  let n = 0;
  return { now: () => T, newId: () => `new${++n}` };
}

function snap(extra: Partial<Snapshot> = {}): Snapshot {
  return {
    ...emptySnapshot(),
    companies: [{ id: 'c1', createdAt: T, name: 'Example Robotics' }],
    ...extra,
  };
}

function contact(id: string, extra: Partial<Contact> = {}): Contact {
  return { id, createdAt: T, companyId: 'c1', ...extra };
}

describe('findOrCreateCompanyOps', () => {
  it('finds an existing company however it is typed', () => {
    const r = findOrCreateCompanyOps(snap(), ' example  robotics ', makeDeps());
    expect(r).toEqual({ ops: [], companyId: 'c1' });
  });
  it('creates a new company with the collapsed name', () => {
    const r = findOrCreateCompanyOps(snap(), ' Sample   Labs ', makeDeps());
    expect(r.ops).toEqual([
      {
        kind: 'put',
        store: 'companies',
        record: { id: 'new1', createdAt: T, name: 'Sample Labs' },
      },
    ]);
    expect(r.companyId).toBe('new1');
  });
  it('does nothing for a blank name', () => {
    expect(findOrCreateCompanyOps(snap(), '  ', makeDeps())).toEqual({
      ops: [],
      companyId: undefined,
    });
  });
});

describe('anyoneHerePrompt', () => {
  it('is none without a company or with a dangling id', () => {
    expect(anyoneHerePrompt(snap(), undefined)).toBe('none');
    expect(anyoneHerePrompt(snap(), 'zz')).toBe('none');
  });
  it('shows contacts when the company has some', () => {
    expect(anyoneHerePrompt(snap({ contacts: [contact('k1')] }), 'c1')).toBe(
      'show_contacts',
    );
  });
  it('asks when the company has no contacts', () => {
    expect(anyoneHerePrompt(snap(), 'c1')).toBe('ask');
  });
  it('is none when checked_nobody, unless a contact exists', () => {
    const companies = [
      {
        id: 'c1',
        createdAt: T,
        name: 'Example Robotics',
        anyoneHere: 'checked_nobody' as const,
      },
    ];
    expect(anyoneHerePrompt(snap({ companies }), 'c1')).toBe('none');
    expect(
      anyoneHerePrompt(snap({ companies, contacts: [contact('k1')] }), 'c1'),
    ).toBe('show_contacts');
  });
  it('ignores any other anyoneHere value', () => {
    for (const bad of [true, 'yes', 'nobody']) {
      const companies = [
        { id: 'c1', createdAt: T, name: 'X', anyoneHere: bad },
      ] as unknown as Snapshot['companies'];
      expect(anyoneHerePrompt(snap({ companies }), 'c1')).toBe('ask');
    }
  });
});

describe('anyoneHereForName', () => {
  it('is none for a blank name', () => {
    expect(anyoneHereForName(snap(), '  ')).toEqual({ prompt: 'none' });
    expect(anyoneHereForName(snap(), undefined)).toEqual({ prompt: 'none' });
  });
  it('asks for an unknown name, with no id', () => {
    const r = anyoneHereForName(snap(), 'Nowhere Inc');
    expect(r).toEqual({ prompt: 'ask' });
    expect('companyId' in r).toBe(false);
  });
  it('resolves a stored company however it is typed', () => {
    expect(anyoneHereForName(snap(), ' example  robotics ')).toEqual({
      prompt: 'ask',
      companyId: 'c1',
    });
    expect(
      anyoneHereForName(
        snap({ contacts: [contact('k1')] }),
        'EXAMPLE ROBOTICS',
      ),
    ).toEqual({ prompt: 'show_contacts', companyId: 'c1' });
  });
});

describe('markCheckedNobodyOps (one company however it is typed)', () => {
  it('updates the stored company and keeps its fields', () => {
    const ops = markCheckedNobodyOps(snap(), ' example  robotics ', makeDeps());
    expect(ops).toEqual([
      {
        kind: 'put',
        store: 'companies',
        record: {
          id: 'c1',
          createdAt: T,
          name: 'Example Robotics',
          anyoneHere: 'checked_nobody',
        },
      },
    ]);
  });
  it('creates the company with the answer set', () => {
    const ops = markCheckedNobodyOps(snap(), 'Sample Labs', makeDeps());
    expect(ops).toEqual([
      {
        kind: 'put',
        store: 'companies',
        record: {
          id: 'new1',
          createdAt: T,
          name: 'Sample Labs',
          anyoneHere: 'checked_nobody',
        },
      },
    ]);
  });
  it('is a no-op when already set, or when blank', () => {
    const first = markCheckedNobodyOps(snap(), 'Example Robotics', makeDeps());
    const op = first[0];
    if (op?.kind !== 'put' || op.store !== 'companies') throw new Error('x');
    const again = snap({ companies: [op.record] });
    expect(markCheckedNobodyOps(again, 'example robotics', makeDeps())).toEqual(
      [],
    );
    expect(markCheckedNobodyOps(snap(), ' ', makeDeps())).toEqual([]);
  });
});

describe('addContactOps', () => {
  it('creates the company then the contact for a new company', () => {
    const r = addContactOps(
      snap(),
      'Sample Labs',
      { name: ' Bea Example ', role: ' Recruiter ', howKnown: '  ' },
      makeDeps(),
    );
    expect(r.ops).toHaveLength(2);
    expect(r.ops[0]).toMatchObject({ store: 'companies' });
    expect(r.ops[1]).toEqual({
      kind: 'put',
      store: 'contacts',
      record: {
        id: 'new2',
        createdAt: T,
        companyId: 'new1',
        name: 'Bea Example',
        role: 'Recruiter',
      },
    });
    expect(r.contactId).toBe('new2');
  });
  it('writes one put for an existing company', () => {
    const r = addContactOps(snap(), 'example robotics', {}, makeDeps());
    expect(r.ops).toHaveLength(1);
    expect(r.ops[0]).toMatchObject({
      store: 'contacts',
      record: { companyId: 'c1' },
    });
  });
  it('throws for a blank company name', () => {
    expect(() => addContactOps(snap(), '  ', {}, makeDeps())).toThrow(
      'Enter a company name.',
    );
  });
});

describe('updateContactOps', () => {
  it('trims, removes blanks and keeps identity fields', () => {
    const c = contact('k1', { name: 'Bea', role: 'Recruiter', notes: 'n' });
    const ops = updateContactOps(c, { name: ' Bea E ', role: '  ' });
    expect(ops).toEqual([
      {
        kind: 'put',
        store: 'contacts',
        record: {
          id: 'k1',
          createdAt: T,
          companyId: 'c1',
          name: 'Bea E',
          notes: 'n',
        },
      },
    ]);
  });
});

describe('deleteContactOps', () => {
  it('deletes its events then the contact', () => {
    const data = snap({
      contacts: [contact('k1'), contact('k2')],
      contactEvents: [
        { id: 'e1', createdAt: T, contactId: 'k1' },
        { id: 'e2', createdAt: T, contactId: 'k1' },
        { id: 'e3', createdAt: T, contactId: 'k2' },
      ],
    });
    expect(deleteContactOps(data, 'k1')).toEqual([
      { kind: 'delete', store: 'contactEvents', id: 'e1' },
      { kind: 'delete', store: 'contactEvents', id: 'e2' },
      { kind: 'delete', store: 'contacts', id: 'k1' },
    ]);
  });
});

describe('contactsAt', () => {
  it('orders by name case-insensitively, nameless last, per company', () => {
    const data = snap({
      contacts: [
        contact('k3'),
        contact('k2', { name: 'Cal' }),
        contact('k1', { name: 'bea' }),
        contact('k4', { name: 'Other', companyId: 'c2' }),
        { id: 'k5', createdAt: T, name: 'Orphan' },
      ],
    });
    expect(contactsAt(data, 'c1').map((c) => c.id)).toEqual(['k1', 'k2', 'k3']);
  });
});
