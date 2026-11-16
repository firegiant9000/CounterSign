import type { VNode } from 'preact';
import { useState } from 'preact/hooks';
import {
  addStatusEventOps,
  deleteApplicationOps,
  updateApplicationOps,
  voidStatusEventOps,
} from '../../core/src/application-ops';
import type { ApplicationPatch } from '../../core/src/application-ops';
import { isLocalDate, toLocalDate } from '../../core/src/dates';
import {
  STATUS_KEYS,
  currentStatus,
  effectiveDate,
  historyFor,
  statusLabel,
} from '../../core/src/status';
import type { StatusKey } from '../../core/src/status';
import type { Id } from '../../core/src/types';
import { useAppData } from './app-data';
import { DocumentField } from './DocumentField';
import { routeHref } from './route';
import { StatementsSection } from './StatementsSection';

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isWebUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

const BAD_DATE = 'Enter a valid date (YYYY-MM-DD).';

export function ApplicationDetail(props: { id: Id }): VNode {
  const appData = useAppData();
  const { data, settings, deps } = appData;
  const { id } = props;

  const [titleError, setTitleError] = useState<string | undefined>(undefined);
  const [urlError, setUrlError] = useState<string | undefined>(undefined);
  const [actorError, setActorError] = useState<string | undefined>(undefined);
  const [notesError, setNotesError] = useState<string | undefined>(undefined);
  const [deleteError, setDeleteError] = useState<string | undefined>(undefined);
  const [nextError, setNextError] = useState<string | undefined>(undefined);
  const [eventError, setEventError] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<StatusKey>('applied');
  const [occurredOn, setOccurredOn] = useState(() => toLocalDate(new Date()));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const app = data.applications.find((a) => a.id === id);
  if (!app) {
    return (
      <div>
        <p>This application no longer exists.</p>
        <a href={routeHref({ page: 'applications' })}>Back to applications</a>
      </div>
    );
  }

  const company = data.companies.find((c) => c.id === app.companyId);
  const history = historyFor(data.statusEvents, id);
  const current = currentStatus(data.statusEvents, id);

  const save = async (
    patch: ApplicationPatch,
    report: (message: string | undefined) => void,
  ): Promise<void> => {
    report(undefined);
    try {
      await appData.apply((d) => {
        const fresh = d.applications.find((a) => a.id === id);
        return fresh ? updateApplicationOps(fresh, patch) : [];
      });
    } catch (err) {
      report(`Could not save: ${messageOf(err)}`);
    }
  };

  const onNextActionDate = (value: string): void => {
    if (value !== '' && !isLocalDate(value)) {
      setNextError(BAD_DATE);
      return;
    }
    void save({ nextActionDate: value }, setNextError);
  };

  const onAddStatus = async (event: Event): Promise<void> => {
    event.preventDefault();
    if (busy) return;
    if (occurredOn !== '' && !isLocalDate(occurredOn)) {
      setEventError(BAD_DATE);
      return;
    }
    setEventError(undefined);
    setBusy(true);
    try {
      await appData.apply((d) =>
        d.applications.some((a) => a.id === id)
          ? addStatusEventOps(id, { status, occurredOn, note }, deps)
          : [],
      );
      setOccurredOn(toLocalDate(new Date()));
      setNote('');
    } catch (err) {
      setEventError(`Could not add the status: ${messageOf(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const onUndo = async (eventId: Id): Promise<void> => {
    if (busy) return;
    setEventError(undefined);
    setBusy(true);
    try {
      let stale = false;
      await appData.apply((d) => {
        const target = currentStatus(d.statusEvents, id);
        if (target?.id !== eventId) {
          stale = true;
          return [];
        }
        return voidStatusEventOps(target, deps);
      });
      if (stale) {
        setEventError('The status changed meanwhile; nothing was undone.');
      }
    } catch (err) {
      setEventError(`Could not undo: ${messageOf(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (): Promise<void> => {
    if (busy) return;
    if (
      !confirm(
        'Delete this application, its status history and what you told them?',
      )
    )
      return;
    setDeleteError(undefined);
    setBusy(true);
    try {
      await appData.apply((d) =>
        d.applications.some((a) => a.id === id)
          ? deleteApplicationOps(d, id)
          : [],
      );
      location.hash = routeHref({ page: 'applications' });
    } catch (err) {
      setDeleteError(`Could not delete: ${messageOf(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const url = typeof app.url === 'string' ? app.url : '';
  const title = typeof app.title === 'string' ? app.title : '';
  const notes = typeof app.notes === 'string' ? app.notes : '';
  const nextDate =
    typeof app.nextActionDate === 'string' ? app.nextActionDate : '';
  const actor =
    app.nextActor === 'me' || app.nextActor === 'them' ? app.nextActor : '';

  return (
    <div class="detail">
      <p>
        <a href={routeHref({ page: 'applications' })}>Back to applications</a>
      </p>
      <h1>{company?.name ?? 'Unknown company'}</h1>

      <div class="detail-fields">
        <label>
          Title
          <input
            key={`title-${title}`}
            type="text"
            defaultValue={title}
            onChange={(e) => {
              void save({ title: e.currentTarget.value }, setTitleError);
            }}
          />
          {titleError ? <span class="field-error">{titleError}</span> : null}
        </label>
        <label>
          URL
          <input
            key={`url-${url}`}
            type="text"
            defaultValue={url}
            onChange={(e) => {
              void save({ url: e.currentTarget.value }, setUrlError);
            }}
          />
          {urlError ? <span class="field-error">{urlError}</span> : null}
        </label>
        {url !== '' ? (
          <p>
            {isWebUrl(url) ? (
              <a href={url} target="_blank" rel="noopener noreferrer">
                {url}
              </a>
            ) : (
              <span>{url}</span>
            )}
          </p>
        ) : null}
        <label>
          Next action date
          <input
            key={`next-${nextDate}`}
            type="date"
            defaultValue={nextDate}
            onChange={(e) => {
              // A half-typed date reads as '' with badInput set; do not clear.
              if (
                e.currentTarget.value === '' &&
                e.currentTarget.validity.badInput
              ) {
                return;
              }
              onNextActionDate(e.currentTarget.value);
            }}
          />
          {nextError ? <span class="field-error">{nextError}</span> : null}
        </label>
        <label>
          Who acts next
          <select
            key={`actor-${actor}`}
            value={actor}
            onChange={(e) => {
              const value = e.currentTarget.value;
              void save(
                {
                  nextActor:
                    value === 'me' || value === 'them' ? value : undefined,
                },
                setActorError,
              );
            }}
          >
            <option value="">Nobody</option>
            <option value="me">Me</option>
            <option value="them">Them</option>
          </select>
          {actorError ? <span class="field-error">{actorError}</span> : null}
        </label>
        <label>
          Notes
          <textarea
            key={`notes-${notes}`}
            defaultValue={notes}
            onChange={(e) => {
              void save({ notes: e.currentTarget.value }, setNotesError);
            }}
          />
          {notesError ? <span class="field-error">{notesError}</span> : null}
        </label>
      </div>

      <h2>Documents</h2>
      <DocumentField app={app} slot="resume" label="Resume" />
      <DocumentField app={app} slot="coverLetter" label="Cover letter" />

      <h2>What I told them</h2>
      <StatementsSection applicationId={id} />

      <h2>Status history</h2>
      {history.length === 0 ? <p>No status yet.</p> : null}
      <ul class="history">
        {history.map((e) => (
          <li key={e.id} class={e.voidedAt ? 'voided' : undefined}>
            <span>
              {effectiveDate(e)} ·{' '}
              {statusLabel(e.status, settings.statusLabels)}
              {e.note ? ` · ${e.note}` : ''}
            </span>
            {current && e.id === current.id ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void onUndo(e.id);
                }}
              >
                Undo
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      <form
        class="app-form"
        onSubmit={(e) => {
          void onAddStatus(e);
        }}
      >
        <h2>Add status</h2>
        <label>
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.currentTarget.value as StatusKey)}
          >
            {STATUS_KEYS.map((key) => (
              <option key={key} value={key}>
                {statusLabel(key, settings.statusLabels)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date
          <input
            type="date"
            value={occurredOn}
            onInput={(e) => setOccurredOn(e.currentTarget.value)}
          />
        </label>
        <label>
          Note
          <input
            type="text"
            value={note}
            onInput={(e) => setNote(e.currentTarget.value)}
          />
        </label>
        <button type="submit" disabled={busy}>
          Add status
        </button>
        {eventError ? <span class="field-error">{eventError}</span> : null}
      </form>

      <p>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            void onDelete();
          }}
        >
          Delete application
        </button>
        {deleteError ? <span class="field-error">{deleteError}</span> : null}
      </p>
    </div>
  );
}
