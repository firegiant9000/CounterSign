import type { VNode } from 'preact';
import { useState } from 'preact/hooks';
import { applicationRows } from '../../core/src/application-list';
import { isLocalDate, toLocalDate } from '../../core/src/dates';
import {
  CONTACT_EVENT_KINDS,
  CONTACT_EVENT_LABELS,
  canScheduleFollowUp,
  clearFollowUpOps,
  contactEventDate,
  eventsFor,
  logContactEventOps,
  setFollowUpOps,
  voidContactEventOps,
} from '../../core/src/followups';
import type { Contact, ContactEventKind, Id } from '../../core/src/types';
import { useAppData } from './app-data';

const BAD_DATE = 'Enter a valid date (YYYY-MM-DD).';
const NOT_LINKED = '';

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function text(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export function ContactActivity(props: { contact: Contact }): VNode {
  const appData = useAppData();
  const { data, settings, deps } = appData;
  const contactId = props.contact.id;
  // Read the live record so a change from another tab shows here.
  const contact =
    data.contacts.find((c) => c.id === contactId) ?? props.contact;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [kind, setKind] = useState<ContactEventKind>('reached_out');
  const [occurredOn, setOccurredOn] = useState(() => toLocalDate(new Date()));
  const [logApp, setLogApp] = useState(NOT_LINKED);
  const [note, setNote] = useState('');
  const [followOn, setFollowOn] = useState(() => toLocalDate(new Date()));
  const [followApp, setFollowApp] = useState(NOT_LINKED);

  const events = eventsFor(data, contactId);
  const rows = new Map(
    applicationRows(data, settings.statusLabels).map((r) => [r.id, r] as const),
  );
  const companyApps = data.applications
    .filter(
      (a) =>
        contact.companyId !== undefined && a.companyId === contact.companyId,
    )
    .flatMap((a) => {
      const row = rows.get(a.id);
      return row ? [row] : [];
    });
  const appChoice = (value: string): Id | undefined =>
    value === NOT_LINKED ? undefined : value;
  const titleOf = (id: Id | undefined): string =>
    id === undefined ? '' : (rows.get(id)?.title ?? '');

  const run = async (write: () => Promise<void>): Promise<boolean> => {
    if (busy) return false;
    setError(undefined);
    setBusy(true);
    try {
      await write();
      return true;
    } catch (err) {
      setError(messageOf(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onLog = async (event: Event): Promise<void> => {
    event.preventDefault();
    if (busy) return;
    if (!isLocalDate(occurredOn)) {
      setError(BAD_DATE);
      return;
    }
    const ok = await run(() =>
      appData.apply((d) =>
        logContactEventOps(
          d,
          contactId,
          { kind, occurredOn, applicationId: appChoice(logApp), note },
          deps,
        ),
      ),
    );
    if (ok) setNote('');
  };

  const onUndo = async (eventId: Id): Promise<void> => {
    if (busy) return;
    if (!confirm('Undo this entry?')) return;
    await run(() =>
      appData.apply((d) => {
        const target = d.contactEvents.find((e) => e.id === eventId);
        return target ? voidContactEventOps(target, deps) : [];
      }),
    );
  };

  const onSetFollowUp = async (event: Event): Promise<void> => {
    event.preventDefault();
    if (busy) return;
    if (!isLocalDate(followOn)) {
      setError(BAD_DATE);
      return;
    }
    await run(() =>
      appData.apply((d) =>
        setFollowUpOps(d, contactId, followOn, appChoice(followApp)),
      ),
    );
  };

  const onClear = async (): Promise<void> => {
    if (busy) return;
    await run(() =>
      appData.apply((d) => {
        const fresh = d.contacts.find((c) => c.id === contactId);
        return fresh ? clearFollowUpOps(fresh) : [];
      }),
    );
  };

  const pending = text(contact.followUpOn);
  const canSchedule = canScheduleFollowUp(
    data,
    contactId,
    appChoice(followApp),
  );

  const appSelect = (value: string, onChange: (v: string) => void): VNode => (
    <select
      value={value}
      disabled={busy}
      onChange={(e) => onChange(e.currentTarget.value)}
    >
      <option value={NOT_LINKED}>Not linked</option>
      {companyApps.map((r) => (
        <option key={r.id} value={r.id}>
          {`${r.title} (${r.statusLabel})`}
        </option>
      ))}
    </select>
  );

  return (
    <details>
      <summary>Activity ({events.length})</summary>
      <form onSubmit={(e) => void onLog(e)}>
        <label>
          What happened
          <select
            value={kind}
            disabled={busy}
            onChange={(e) => setKind(e.currentTarget.value as ContactEventKind)}
          >
            {CONTACT_EVENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {CONTACT_EVENT_LABELS[k]}
              </option>
            ))}
          </select>
        </label>{' '}
        <label>
          Date
          <input
            type="date"
            value={occurredOn}
            disabled={busy}
            onInput={(e) => setOccurredOn(e.currentTarget.value)}
          />
        </label>{' '}
        <label>
          Application
          {appSelect(logApp, setLogApp)}
        </label>{' '}
        <label>
          Note
          <input
            type="text"
            value={note}
            disabled={busy}
            onInput={(e) => setNote(e.currentTarget.value)}
          />
        </label>{' '}
        <button type="submit" disabled={busy}>
          Log
        </button>
      </form>
      {error ? (
        <span class="field-error" role="alert">
          {error}
        </span>
      ) : null}
      <ul>
        {events.map((e) => {
          const title = titleOf(e.applicationId);
          const eventNote = text(e.note);
          return (
            <li key={e.id}>
              {contactEventDate(e)}{' '}
              {e.kind ? CONTACT_EVENT_LABELS[e.kind] : 'Other'}
              {title ? ` · ${title}` : ''}
              {eventNote ? ` · ${eventNote}` : ''}{' '}
              <button
                type="button"
                disabled={busy}
                onClick={() => void onUndo(e.id)}
              >
                Undo
              </button>
            </li>
          );
        })}
      </ul>
      {pending ? (
        <div>
          Follow up on {pending}{' '}
          <button type="button" disabled={busy} onClick={() => void onClear()}>
            Clear
          </button>
        </div>
      ) : (
        <form onSubmit={(e) => void onSetFollowUp(e)}>
          <label>
            Follow up on
            <input
              type="date"
              value={followOn}
              disabled={busy}
              onInput={(e) => setFollowOn(e.currentTarget.value)}
            />
          </label>{' '}
          <label>
            Application
            {appSelect(followApp, setFollowApp)}
          </label>{' '}
          <button type="submit" disabled={busy || !canSchedule}>
            Set date
          </button>
          {canSchedule ? null : (
            <div>You have followed up twice on this application.</div>
          )}
        </form>
      )}
    </details>
  );
}
