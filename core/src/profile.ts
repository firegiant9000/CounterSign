import type { WriteOp } from './repository';
import type { Deps, Id, Snapshot } from './types';

export const PROFILE_FIELDS = [
  { key: 'full_name', label: 'Full name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'address_line1', label: 'Address line 1' },
  { key: 'address_line2', label: 'Address line 2' },
  { key: 'city', label: 'City' },
  { key: 'region', label: 'State or region' },
  { key: 'postal_code', label: 'Postal code' },
  { key: 'country', label: 'Country' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'github', label: 'GitHub' },
  { key: 'website', label: 'Website' },
] as const;
export type ProfileKey = (typeof PROFILE_FIELDS)[number]['key'];

const LABEL_BY_KEY = new Map<string, string>(
  PROFILE_FIELDS.map((f) => [f.key, f.label] as const),
);

function isProfileKey(key: string): key is ProfileKey {
  return LABEL_BY_KEY.has(key);
}

/** A restored profileFields record, with every field type-checked. */
interface Stored {
  id: Id;
  createdAt: string | undefined;
  key: string;
  label: string | undefined;
  value: string | undefined;
}

function storedFields(data: Snapshot): Stored[] {
  const raw: unknown = data.profileFields;
  if (!Array.isArray(raw)) return [];
  const out: Stored[] = [];
  for (const item of raw as unknown[]) {
    if (typeof item !== 'object' || item === null) continue;
    const r = item as Record<string, unknown>;
    if (typeof r.id !== 'string' || typeof r.key !== 'string') continue;
    out.push({
      id: r.id,
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : undefined,
      key: r.key,
      label: typeof r.label === 'string' ? r.label : undefined,
      value: typeof r.value === 'string' ? r.value : undefined,
    });
  }
  return out;
}

function isFilled(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== '';
}

/** First-created first (records without createdAt last), then lowest id. */
function byAge(a: Stored, b: Stored): number {
  if (a.createdAt !== b.createdAt) {
    if (a.createdAt === undefined) return 1;
    if (b.createdAt === undefined) return -1;
    return a.createdAt < b.createdAt ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Per key, the first-created record with a non-blank string value. Unknown keys are ignored. */
export function profileValues(
  data: Snapshot,
): Partial<Record<ProfileKey, string>> {
  const out: Partial<Record<ProfileKey, string>> = {};
  for (const s of storedFields(data).sort(byAge)) {
    if (!isProfileKey(s.key) || out[s.key] !== undefined) continue;
    if (!isFilled(s.value)) continue;
    out[s.key] = s.value;
  }
  return out;
}

/**
 * Saves one profile field as a single record. Blank text deletes every record
 * for the key. Otherwise the record that profileValues reads (the first filled
 * one, else the first) is put, and any other duplicates are deleted.
 */
export function setProfileFieldOps(
  data: Snapshot,
  key: ProfileKey,
  text: string,
  deps: Deps,
): WriteOp[] {
  const matches = storedFields(data)
    .filter((s) => s.key === key)
    .sort(byAge);
  const value = text.trim();
  if (value === '') {
    return matches.map((m) => ({
      kind: 'delete',
      store: 'profileFields',
      id: m.id,
    }));
  }
  const winner = matches.find((m) => isFilled(m.value)) ?? matches[0];
  const others = matches.filter((m) => m !== winner);
  const label = LABEL_BY_KEY.get(key) ?? key;
  if (
    winner !== undefined &&
    winner.createdAt !== undefined &&
    winner.value === value &&
    winner.label === label &&
    others.length === 0
  ) {
    return [];
  }
  const ops: WriteOp[] = [
    {
      kind: 'put',
      store: 'profileFields',
      record: {
        id: winner?.id ?? deps.newId(),
        createdAt: winner?.createdAt ?? deps.now(),
        key,
        label,
        value,
      },
    },
  ];
  for (const other of others) {
    ops.push({ kind: 'delete', store: 'profileFields', id: other.id });
  }
  return ops;
}
