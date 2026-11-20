import { describe, expect, it } from 'vitest';
import { PROFILE_FIELDS, profileValues, setProfileFieldOps } from './profile';
import { emptySnapshot } from './schema';
import type { Deps, ProfileField, Snapshot } from './types';

const NOW = '2026-11-15T12:00:00.000Z';
const OLD = '2026-01-01T00:00:00.000Z';
const NEWER = '2026-03-01T00:00:00.000Z';

function deps(): Deps {
  let n = 0;
  return { now: () => NOW, newId: () => `new${String((n += 1))}` };
}

function withFields(...fields: unknown[]): Snapshot {
  return { ...emptySnapshot(), profileFields: fields as ProfileField[] };
}

describe('setProfileFieldOps', () => {
  it('puts a new field, trimmed, with its label', () => {
    const ops = setProfileFieldOps(
      emptySnapshot(),
      'email',
      ' sam@example.com ',
      deps(),
    );
    expect(ops).toEqual([
      {
        kind: 'put',
        store: 'profileFields',
        record: {
          id: 'new1',
          createdAt: NOW,
          key: 'email',
          label: 'Email',
          value: 'sam@example.com',
        },
      },
    ]);
  });

  it('writes nothing when the value and label are unchanged', () => {
    const data = withFields({
      id: 'p1',
      createdAt: OLD,
      key: 'email',
      label: 'Email',
      value: 'sam@example.com',
    });
    expect(
      setProfileFieldOps(data, 'email', 'sam@example.com', deps()),
    ).toEqual([]);
  });

  it('a changed value keeps the same id and createdAt', () => {
    const data = withFields({
      id: 'p1',
      createdAt: OLD,
      key: 'email',
      label: 'Email',
      value: 'old@example.com',
    });
    expect(
      setProfileFieldOps(data, 'email', 'new@example.com', deps()),
    ).toEqual([
      {
        kind: 'put',
        store: 'profileFields',
        record: {
          id: 'p1',
          createdAt: OLD,
          key: 'email',
          label: 'Email',
          value: 'new@example.com',
        },
      },
    ]);
  });

  it('a blank value deletes the record', () => {
    const data = withFields({
      id: 'p1',
      createdAt: OLD,
      key: 'email',
      label: 'Email',
      value: 'sam@example.com',
    });
    expect(setProfileFieldOps(data, 'email', '   ', deps())).toEqual([
      { kind: 'delete', store: 'profileFields', id: 'p1' },
    ]);
    expect(setProfileFieldOps(emptySnapshot(), 'email', '', deps())).toEqual(
      [],
    );
  });

  it('duplicates resolve to the first', () => {
    // Newer record listed first, so the result cannot depend on array order.
    const data = withFields(
      {
        id: 'p2',
        createdAt: NEWER,
        key: 'phone',
        label: 'Phone',
        value: '555-0199',
      },
      {
        id: 'p1',
        createdAt: OLD,
        key: 'phone',
        label: 'Phone',
        value: '555-0100',
      },
    );
    expect(profileValues(data)).toEqual({ phone: '555-0100' });
    expect(setProfileFieldOps(data, 'phone', '555-0123', deps())).toEqual([
      {
        kind: 'put',
        store: 'profileFields',
        record: {
          id: 'p1',
          createdAt: OLD,
          key: 'phone',
          label: 'Phone',
          value: '555-0123',
        },
      },
      { kind: 'delete', store: 'profileFields', id: 'p2' },
    ]);
  });

  it('a blank duplicate does not hide a filled one', () => {
    const data = withFields(
      {
        id: 'p1',
        createdAt: OLD,
        key: 'email',
        label: 'Email',
        value: '  ',
      },
      {
        id: 'p2',
        createdAt: NEWER,
        key: 'email',
        label: 'Email',
        value: 'sam@example.com',
      },
    );
    expect(profileValues(data)).toEqual({ email: 'sam@example.com' });
    expect(
      setProfileFieldOps(data, 'email', 'pat@example.com', deps()),
    ).toEqual([
      {
        kind: 'put',
        store: 'profileFields',
        record: {
          id: 'p2',
          createdAt: NEWER,
          key: 'email',
          label: 'Email',
          value: 'pat@example.com',
        },
      },
      { kind: 'delete', store: 'profileFields', id: 'p1' },
    ]);
  });

  it('never touches a record with an unknown key', () => {
    const data = withFields({
      id: 's1',
      createdAt: OLD,
      key: 'shoe_size',
      label: 'Shoe size',
      value: '10',
    });
    expect(setProfileFieldOps(data, 'email', '', deps())).toEqual([]);
    expect(
      setProfileFieldOps(data, 'email', 'sam@example.com', deps()),
    ).toEqual([
      {
        kind: 'put',
        store: 'profileFields',
        record: {
          id: 'new1',
          createdAt: NOW,
          key: 'email',
          label: 'Email',
          value: 'sam@example.com',
        },
      },
    ]);
  });

  it('a non-string value reads as absent and is overwritten, not thrown on', () => {
    const data = withFields({
      id: 'e1',
      createdAt: OLD,
      key: 'email',
      label: 'Email',
      value: 42,
    });
    expect(() =>
      setProfileFieldOps(data, 'email', 'sam@example.com', deps()),
    ).not.toThrow();
    expect(
      setProfileFieldOps(data, 'email', 'sam@example.com', deps()),
    ).toEqual([
      {
        kind: 'put',
        store: 'profileFields',
        record: {
          id: 'e1',
          createdAt: OLD,
          key: 'email',
          label: 'Email',
          value: 'sam@example.com',
        },
      },
    ]);
  });
});

describe('PROFILE_FIELDS', () => {
  it('has fourteen fields in order', () => {
    expect(PROFILE_FIELDS.map((f) => f.key)).toEqual([
      'full_name',
      'first_name',
      'last_name',
      'email',
      'phone',
      'address_line1',
      'address_line2',
      'city',
      'region',
      'postal_code',
      'country',
      'linkedin',
      'github',
      'website',
    ]);
  });

  it('saves last name with its label', () => {
    expect(
      setProfileFieldOps(emptySnapshot(), 'last_name', 'Example', deps()),
    ).toEqual([
      {
        kind: 'put',
        store: 'profileFields',
        record: {
          id: 'new1',
          createdAt: NOW,
          key: 'last_name',
          label: 'Last name',
          value: 'Example',
        },
      },
    ]);
  });
});

describe('profileValues', () => {
  it('reads first and last name', () => {
    const data = withFields(
      {
        id: 'p1',
        createdAt: OLD,
        key: 'first_name',
        label: 'First name',
        value: 'Sam',
      },
      {
        id: 'p2',
        createdAt: OLD,
        key: 'last_name',
        label: 'Last name',
        value: 'Example',
      },
    );
    expect(profileValues(data)).toEqual({
      first_name: 'Sam',
      last_name: 'Example',
    });
  });

  it('reads one value per known key', () => {
    const data = withFields(
      {
        id: 'p1',
        createdAt: OLD,
        key: 'email',
        label: 'Email',
        value: 'sam@example.com',
      },
      {
        id: 'p2',
        createdAt: OLD,
        key: 'city',
        label: 'City',
        value: 'Springfield',
      },
    );
    expect(profileValues(data)).toEqual({
      email: 'sam@example.com',
      city: 'Springfield',
    });
  });

  it('ignores unknown keys', () => {
    const data = withFields({
      id: 's1',
      createdAt: OLD,
      key: 'shoe_size',
      label: 'Shoe size',
      value: '10',
    });
    expect(profileValues(data)).toEqual({});
  });

  it('reads a non-string value as absent without throwing', () => {
    const data = withFields({
      id: 'e1',
      createdAt: OLD,
      key: 'email',
      label: 'Email',
      value: 42,
    });
    expect(() => profileValues(data)).not.toThrow();
    expect(profileValues(data)).toEqual({});
  });
});
