import type { VNode } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { contactsAt } from '../../core/src/contacts';
import { isLocalDate } from '../../core/src/dates';
import {
  TIME_PATTERN,
  deleteRoundOps,
  interviewersOf,
  newRoundOps,
  roundsFor,
  updateRoundOps,
} from '../../core/src/rounds';
import type { RoundInput } from '../../core/src/rounds';
import {
  ROUND_KINDS,
  ROUND_KIND_LABELS,
  isRoundKind,
} from '../../core/src/round-kinds';
import type { RoundKind } from '../../core/src/round-kinds';
import type { Contact, Id, Round } from '../../core/src/types';
import { useAppData } from './app-data';

const BAD_DATE = 'Enter a valid date (YYYY-MM-DD).';
const BAD_TIME = 'Enter a time as HH:MM.';

interface FormState {
  kind: string;
  date: string;
  time: string;
  interviewerIds: Id[];
  notes: string;
  debriefAsked: string;
  debriefWentWell: string;
  debriefToChange: string;
  debriefStoriesUsed: string;
}

const DEBRIEF_FIELDS = [
  ['debriefAsked', 'What they asked'],
  ['debriefWentWell', 'What went well'],
  ['debriefToChange', 'What to change'],
  ['debriefStoriesUsed', 'Stories used'],
] as const;

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function text(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function kindOf(round: Round): RoundKind {
  const kind: unknown = round.kind;
  return isRoundKind(kind) ? kind : 'other';
}

function blankForm(): FormState {
  return {
    kind: 'other',
    date: '',
    time: '',
    interviewerIds: [],
    notes: '',
    debriefAsked: '',
    debriefWentWell: '',
    debriefToChange: '',
    debriefStoriesUsed: '',
  };
}

function formFrom(round: Round): FormState {
  const ids: unknown = round.interviewerIds;
  return {
    kind: kindOf(round),
    date: isLocalDate(text(round.date)) ? text(round.date) : '',
    time: TIME_PATTERN.test(text(round.time)) ? text(round.time) : '',
    interviewerIds: Array.isArray(ids)
      ? (ids as unknown[]).filter((i): i is string => typeof i === 'string')
      : [],
    notes: text(round.notes),
    debriefAsked: text(round.debriefAsked),
    debriefWentWell: text(round.debriefWentWell),
    debriefToChange: text(round.debriefToChange),
    debriefStoriesUsed: text(round.debriefStoriesUsed),
  };
}

function nameOf(c: Contact): string {
  const name: unknown = c.name;
  return typeof name === 'string' && name.trim() !== ''
    ? name
    : 'Unnamed contact';
}

export function RoundsSection(props: {
  applicationId: Id;
  companyId: Id | undefined;
}): VNode {
  const appData = useAppData();
  const { data, deps } = appData;
  const { applicationId, companyId } = props;

  const [busy, setBusy] = useState(false);
  // Set synchronously so a second click before re-render cannot start a write.
  const inFlight = useRef(false);
  const [error, setError] = useState<string | undefined>(undefined);
  // undefined = form closed, null = adding, string = editing that round id.
  const [editing, setEditing] = useState<Id | null | undefined>(undefined);
  const [form, setForm] = useState<FormState>(blankForm);
  // The values the edit form opened with; only changes are saved.
  const [start, setStart] = useState<FormState | undefined>(undefined);

  const rounds = roundsFor(data, applicationId);
  const contacts = companyId === undefined ? [] : contactsAt(data, companyId);
  // Selected interviewers who exist but are no longer at this company.
  const listed = new Set(contacts.map((c) => c.id));
  const elsewhere = form.interviewerIds.flatMap((id) => {
    const c = data.contacts.find((x) => x.id === id);
    return c && !listed.has(id) ? [c] : [];
  });
  const choices = [...contacts, ...elsewhere];

  const patchForm = (patch: Partial<FormState>): void =>
    setForm((f) => ({ ...f, ...patch }));

  const run = async (write: () => Promise<void>): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setError(undefined);
    setBusy(true);
    try {
      await write();
      return true;
    } catch (err) {
      setError(messageOf(err));
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const openAdd = (): void => {
    setError(undefined);
    setForm(blankForm());
    setStart(undefined);
    setEditing(null);
  };

  const openEdit = (round: Round): void => {
    setError(undefined);
    const opened = formFrom(round);
    setForm(opened);
    setStart(opened);
    setEditing(round.id);
  };

  const onSubmit = async (event: Event): Promise<void> => {
    event.preventDefault();
    if (inFlight.current || editing === undefined) return;
    const date = form.date.trim();
    const time = form.time.trim();
    if (date !== '' && !isLocalDate(date)) {
      setError(BAD_DATE);
      return;
    }
    if (time !== '' && !TIME_PATTERN.test(time)) {
      setError(BAD_TIME);
      return;
    }
    const full: RoundInput = {
      kind: form.kind,
      date,
      time,
      interviewerIds: form.interviewerIds,
      notes: form.notes,
      debriefAsked: form.debriefAsked,
      debriefWentWell: form.debriefWentWell,
      debriefToChange: form.debriefToChange,
      debriefStoriesUsed: form.debriefStoriesUsed,
    };
    let input: RoundInput = full;
    if (editing !== null && start !== undefined) {
      // Send only what the user changed, so another tab's edits are kept.
      const changed: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(full)) {
        const before = start[key as keyof FormState];
        const same = Array.isArray(value)
          ? Array.isArray(before) &&
            value.length === before.length &&
            value.every((v, i) => v === before[i])
          : value === before;
        if (!same) changed[key] = value;
      }
      input = changed;
    }
    const target = editing;
    const ok = await run(() =>
      appData.apply((d) => {
        if (target === null) {
          return newRoundOps(d, applicationId, input, deps).ops;
        }
        const fresh = d.rounds.find((r) => r.id === target);
        if (!fresh) throw new Error('This round no longer exists.');
        return updateRoundOps(d, fresh, input);
      }),
    );
    if (ok) setEditing(undefined);
  };

  const onDelete = async (roundId: Id): Promise<void> => {
    if (inFlight.current) return;
    if (!confirm('Delete this round?')) return;
    const ok = await run(() => appData.apply(() => deleteRoundOps(roundId)));
    if (ok && editing === roundId) setEditing(undefined);
  };

  const toggleInterviewer = (id: Id, on: boolean): void =>
    setForm((f) => ({
      ...f,
      interviewerIds: on
        ? f.interviewerIds.includes(id)
          ? f.interviewerIds
          : [...f.interviewerIds, id]
        : f.interviewerIds.filter((i) => i !== id),
    }));

  const renderRound = (round: Round): VNode => {
    const date = text(round.date);
    const time = text(round.time);
    const when = [date, time].filter((s) => s !== '').join(' ');
    const names = interviewersOf(data, round).map(nameOf);
    const notes = text(round.notes);
    const debrief = DEBRIEF_FIELDS.flatMap(([key, label]) => {
      const value = text(round[key]);
      return value.trim() === '' ? [] : [{ key, label, value }];
    });
    return (
      <li key={round.id}>
        <strong>{ROUND_KIND_LABELS[kindOf(round)]}</strong>
        {when ? ` · ${when}` : ''}
        {names.length > 0 ? <div>Interviewers: {names.join(', ')}</div> : null}
        {notes ? <div>{notes}</div> : null}
        <div>
          <strong>Debrief</strong>
          {debrief.length === 0 ? (
            <div>No debrief yet.</div>
          ) : (
            debrief.map((d) => (
              <div key={d.key}>
                {d.label}: {d.value}
              </div>
            ))
          )}
        </div>
        <button type="button" disabled={busy} onClick={() => openEdit(round)}>
          Edit
        </button>{' '}
        <button
          type="button"
          disabled={busy}
          onClick={() => void onDelete(round.id)}
        >
          Delete
        </button>
      </li>
    );
  };

  return (
    <div>
      {rounds.length === 0 ? (
        <p>No rounds yet.</p>
      ) : (
        <ul>{rounds.map(renderRound)}</ul>
      )}
      {editing === undefined ? (
        <button type="button" disabled={busy} onClick={openAdd}>
          Add round
        </button>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)}>
          <label>
            Kind
            <select
              value={form.kind}
              disabled={busy}
              onChange={(e) => patchForm({ kind: e.currentTarget.value })}
            >
              {ROUND_KINDS.map((k) => (
                <option key={k} value={k}>
                  {ROUND_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>{' '}
          <label>
            Date
            <input
              type="date"
              value={form.date}
              disabled={busy}
              onInput={(e) => patchForm({ date: e.currentTarget.value })}
            />
          </label>{' '}
          <label>
            Time (HH:MM)
            <input
              type="text"
              value={form.time}
              disabled={busy}
              onInput={(e) => patchForm({ time: e.currentTarget.value })}
            />
          </label>
          <fieldset>
            <legend>Interviewers</legend>
            {choices.length === 0 ? (
              <p>Add interviewers under People here.</p>
            ) : (
              choices.map((c) => (
                <label key={c.id}>
                  <input
                    type="checkbox"
                    checked={form.interviewerIds.includes(c.id)}
                    disabled={busy}
                    onChange={(e) =>
                      toggleInterviewer(c.id, e.currentTarget.checked)
                    }
                  />{' '}
                  {nameOf(c)}
                </label>
              ))
            )}
          </fieldset>
          <label>
            Notes
            <textarea
              value={form.notes}
              disabled={busy}
              onInput={(e) => patchForm({ notes: e.currentTarget.value })}
            />
          </label>
          {DEBRIEF_FIELDS.map(([key, label]) => (
            <label key={key}>
              {label}
              <textarea
                value={form[key]}
                disabled={busy}
                onInput={(e) => patchForm({ [key]: e.currentTarget.value })}
              />
            </label>
          ))}
          <button type="submit" disabled={busy}>
            Save round
          </button>{' '}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setError(undefined);
              setEditing(undefined);
            }}
          >
            Cancel
          </button>
        </form>
      )}
      {error ? (
        <span class="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
