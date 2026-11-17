import { compareLocalDate, isLocalDate } from './dates';
import type { WriteOp } from './repository';
import type {
  Contact,
  ContactEvent,
  ContactEventKind,
  Deps,
  Id,
  LocalDate,
  Snapshot,
} from './types';

export const CONTACT_EVENT_KINDS: readonly ContactEventKind[] = [
  'reached_out',
  'replied',
  'referred',
  'followed_up',
  'call_held',
];

export const CONTACT_EVENT_LABELS: Record<ContactEventKind, string> = {
  reached_out: 'Reached out',
  replied: 'Replied',
  referred: 'Referred',
  followed_up: 'Followed up',
  call_held: 'Call held',
};

export const MAX_FOLLOW_UPS = 2;

const BAD_DATE = 'Enter a valid date (YYYY-MM-DD).';

function isKind(value: unknown): value is ContactEventKind {
  return (
    typeof value === 'string' &&
    (CONTACT_EVENT_KINDS as readonly string[]).includes(value)
  );
}

/** The calendar day an event happened: `occurredOn` when valid, else the creation day. */
export function contactEventDate(e: ContactEvent): LocalDate {
  const on: unknown = e.occurredOn;
  if (typeof on === 'string' && isLocalDate(on)) return on;
  const created: unknown = e.createdAt;
  return typeof created === 'string' ? created.slice(0, 10) : '';
}

/** A known kind that has not been undone. */
export function isLiveEvent(e: ContactEvent): boolean {
  const voided: unknown = e.voidedAt;
  return isKind(e.kind) && typeof voided !== 'string';
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Live events for one contact: newest date first, then newest created, then id. */
export function eventsFor(data: Snapshot, contactId: Id): ContactEvent[] {
  return data.contactEvents
    .filter((e) => e.contactId === contactId && isLiveEvent(e))
    .sort(
      (a, b) =>
        compareLocalDate(contactEventDate(b), contactEventDate(a)) ||
        compareText(String(b.createdAt), String(a.createdAt)) ||
        compareText(a.id, b.id),
    );
}

export interface LogEventInput {
  kind: ContactEventKind;
  occurredOn: LocalDate;
  applicationId?: Id;
  note?: string;
}

export function logContactEventOps(
  data: Snapshot,
  contactId: Id,
  input: LogEventInput,
  deps: Deps,
): WriteOp[] {
  if (typeof input.occurredOn !== 'string' || !isLocalDate(input.occurredOn)) {
    throw new Error(BAD_DATE);
  }
  if (!isKind(input.kind)) throw new Error('Choose what happened.');
  const contact = data.contacts.find((c) => c.id === contactId);
  if (!contact) return [];
  const applicationId =
    input.applicationId !== undefined &&
    data.applications.some((a) => a.id === input.applicationId)
      ? input.applicationId
      : undefined;
  const event: ContactEvent = {
    id: deps.newId(),
    createdAt: deps.now(),
    contactId,
    kind: input.kind,
    occurredOn: input.occurredOn,
  };
  if (applicationId !== undefined) event.applicationId = applicationId;
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (note) event.note = note;
  const ops: WriteOp[] = [
    { kind: 'put', store: 'contactEvents', record: event },
  ];
  const storedId: unknown = contact.followUpApplicationId;
  const storedApp =
    typeof storedId === 'string' &&
    data.applications.some((a) => a.id === storedId)
      ? storedId
      : undefined;
  const inputDangling =
    input.applicationId !== undefined && applicationId === undefined;
  const pending =
    contact.followUpOn !== undefined ||
    contact.followUpApplicationId !== undefined;
  if (
    input.kind === 'followed_up' &&
    pending &&
    !inputDangling &&
    applicationId === storedApp
  ) {
    const record: Contact = { ...contact };
    delete record.followUpOn;
    delete record.followUpApplicationId;
    ops.push({ kind: 'put', store: 'contacts', record });
  }
  return ops;
}

export function voidContactEventOps(
  event: ContactEvent,
  deps: Deps,
): WriteOp[] {
  const voided: unknown = event.voidedAt;
  if (typeof voided === 'string') return [];
  return [
    {
      kind: 'put',
      store: 'contactEvents',
      record: { ...event, voidedAt: deps.now() },
    },
  ];
}

/** Live `followed_up` events for this contact that name exactly this application. */
export function followUpsUsed(
  data: Snapshot,
  contactId: Id,
  applicationId: Id,
): number {
  return data.contactEvents.filter(
    (e) =>
      e.contactId === contactId &&
      e.kind === 'followed_up' &&
      e.applicationId === applicationId &&
      isLiveEvent(e),
  ).length;
}

export function canScheduleFollowUp(
  data: Snapshot,
  contactId: Id,
  applicationId: Id | undefined,
): boolean {
  if (applicationId === undefined) return true;
  return followUpsUsed(data, contactId, applicationId) < MAX_FOLLOW_UPS;
}

export function setFollowUpOps(
  data: Snapshot,
  contactId: Id,
  on: LocalDate,
  applicationId: Id | undefined,
): WriteOp[] {
  if (typeof on !== 'string' || !isLocalDate(on)) throw new Error(BAD_DATE);
  if (!canScheduleFollowUp(data, contactId, applicationId)) {
    throw new Error('You have followed up twice on this application.');
  }
  const contact = data.contacts.find((c) => c.id === contactId);
  if (!contact) return [];
  const record: Contact = { ...contact, followUpOn: on };
  if (applicationId !== undefined) record.followUpApplicationId = applicationId;
  else delete record.followUpApplicationId;
  return [{ kind: 'put', store: 'contacts', record }];
}

export function clearFollowUpOps(contact: Contact): WriteOp[] {
  if (!('followUpOn' in contact) && !('followUpApplicationId' in contact)) {
    return [];
  }
  const record: Contact = { ...contact };
  delete record.followUpOn;
  delete record.followUpApplicationId;
  return [{ kind: 'put', store: 'contacts', record }];
}
