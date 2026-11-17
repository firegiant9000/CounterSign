import { compareLocalDate, isLocalDate } from './dates';
import type { WriteOp } from './repository';
import { isRoundKind } from './round-kinds';
import type { Contact, Deps, Id, Round, Snapshot } from './types';

export interface RoundInput {
  kind?: string;
  date?: string;
  time?: string;
  interviewerIds?: Id[];
  notes?: string;
  debriefAsked?: string;
  debriefWentWell?: string;
  debriefToChange?: string;
  debriefStoriesUsed?: string;
}

export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const TEXT_FIELDS = [
  'notes',
  'debriefAsked',
  'debriefWentWell',
  'debriefToChange',
  'debriefStoriesUsed',
] as const;

function validDate(value: unknown): value is string {
  return typeof value === 'string' && isLocalDate(value);
}

function validTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_PATTERN.test(value);
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Rounds for one application: dated first by date then time (untimed first), undated last, then createdAt, id. */
export function roundsFor(data: Snapshot, applicationId: Id): Round[] {
  return data.rounds
    .filter((r) => r.applicationId === applicationId)
    .sort((a, b) => {
      const ad: unknown = a.date;
      const bd: unknown = b.date;
      const aDated = validDate(ad);
      const bDated = validDate(bd);
      if (aDated !== bDated) return aDated ? -1 : 1;
      if (aDated && bDated) {
        const byDate = compareLocalDate(ad, bd);
        if (byDate) return byDate;
        const at: unknown = a.time;
        const bt: unknown = b.time;
        const aTimed = validTime(at);
        const bTimed = validTime(bt);
        if (aTimed !== bTimed) return aTimed ? 1 : -1;
        if (aTimed && bTimed) {
          const byTime = compareText(at, bt);
          if (byTime) return byTime;
        }
      }
      return (
        compareText(String(a.createdAt), String(b.createdAt)) ||
        compareText(a.id, b.id)
      );
    });
}

/** Normalised values for the fields present in `input`; `undefined` means "remove". */
function normalise(
  data: Snapshot,
  input: RoundInput,
): Partial<Record<keyof RoundInput, unknown>> {
  const out: Partial<Record<keyof RoundInput, unknown>> = {};
  const raw = input as Record<string, unknown>;
  if (raw.kind !== undefined) {
    const kind = typeof raw.kind === 'string' ? raw.kind.trim() : raw.kind;
    out.kind = isRoundKind(kind) ? kind : undefined;
  }
  if (raw.date !== undefined) {
    const date = typeof raw.date === 'string' ? raw.date.trim() : raw.date;
    out.date = validDate(date) ? date : undefined;
  }
  if (raw.time !== undefined) {
    const time = typeof raw.time === 'string' ? raw.time.trim() : raw.time;
    out.time = validTime(time) ? time : undefined;
  }
  if (raw.interviewerIds !== undefined) {
    const known = new Set(data.contacts.map((c) => c.id));
    const ids = Array.isArray(raw.interviewerIds)
      ? [
          ...new Set(
            (raw.interviewerIds as unknown[]).filter(
              (id): id is string => typeof id === 'string' && known.has(id),
            ),
          ),
        ]
      : [];
    out.interviewerIds = ids.length > 0 ? ids : undefined;
  }
  for (const field of TEXT_FIELDS) {
    const value = raw[field];
    if (value === undefined) continue;
    const text = typeof value === 'string' ? value.trim() : '';
    out[field] = text || undefined;
  }
  return out;
}

function apply(record: Record<string, unknown>, values: object): void {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete record[key];
    else record[key] = value;
  }
}

export function newRoundOps(
  data: Snapshot,
  applicationId: Id,
  input: RoundInput,
  deps: Deps,
): { ops: WriteOp[]; roundId: Id } {
  if (!data.applications.some((a) => a.id === applicationId)) {
    throw new Error('This application no longer exists.');
  }
  const record: Round = {
    id: deps.newId(),
    createdAt: deps.now(),
    applicationId,
  };
  apply(record as unknown as Record<string, unknown>, normalise(data, input));
  return {
    ops: [{ kind: 'put', store: 'rounds', record }],
    roundId: record.id,
  };
}

export function updateRoundOps(
  data: Snapshot,
  round: Round,
  patch: RoundInput,
): WriteOp[] {
  const record: Round = { ...round };
  apply(record as unknown as Record<string, unknown>, normalise(data, patch));
  return [{ kind: 'put', store: 'rounds', record }];
}

export function deleteRoundOps(roundId: Id): WriteOp[] {
  return [{ kind: 'delete', store: 'rounds', id: roundId }];
}

/** Interviewers that still exist, in stored order. A non-array reads as none. */
export function interviewersOf(data: Snapshot, round: Round): Contact[] {
  const ids: unknown = round.interviewerIds;
  if (!Array.isArray(ids)) return [];
  const seen = new Set<unknown>();
  const out: Contact[] = [];
  for (const id of ids as unknown[]) {
    if (seen.has(id)) continue;
    seen.add(id);
    const contact = data.contacts.find((c) => c.id === id);
    if (contact) out.push(contact);
  }
  return out;
}
