import type { VNode } from 'preact';
import { useState } from 'preact/hooks';
import {
  addStatusEventOps,
  deleteApplicationOps,
  updateApplicationOps,
  voidStatusEventOps,
} from '../../core/src/application-ops';
import type { ApplicationPatch } from '../../core/src/application-ops';
import { anyoneHereForName } from '../../core/src/contacts';
import { isLocalDate, toLocalDate } from '../../core/src/dates';
import {
  FILL_OUTCOMES,
  FILL_OUTCOME_LABELS,
  SITE_TYPES,
  SITE_TYPE_LABELS,
  isFillOutcome,
  isSiteType,
} from '../../core/src/formhand';
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
import { AnyoneHere } from './AnyoneHere';
import { Button } from './components/Button';
import { Field } from './components/Field';
import { CardSection, IndexCard } from './components/IndexCard';
import { TypedLine } from './components/TypedLine';
import { DocumentField } from './DocumentField';
import { routeHref } from './route';
import { RoundsSection } from './RoundsSection';
import { StatementsSection } from './StatementsSection';
import { inkFor } from './status-ink';

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
  const [projectsError, setProjectsError] = useState<string | undefined>(
    undefined,
  );
  const [siteError, setSiteError] = useState<string | undefined>(undefined);
  const [fillOutcomeError, setFillOutcomeError] = useState<string | undefined>(
    undefined,
  );
  const [fillNoteError, setFillNoteError] = useState<string | undefined>(
    undefined,
  );
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
        'Delete this application, its status history, what you told them and its interview rounds?',
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
  const projectsShown =
    typeof app.projectsShown === 'string' ? app.projectsShown : '';
  const nextDate =
    typeof app.nextActionDate === 'string' ? app.nextActionDate : '';
  const actor =
    app.nextActor === 'me' || app.nextActor === 'them' ? app.nextActor : '';
  const siteType = isSiteType(app.siteType) ? app.siteType : '';
  const fillOutcome = isFillOutcome(app.fillOutcome) ? app.fillOutcome : '';
  const fillNote = typeof app.fillNote === 'string' ? app.fillNote : '';

  const companyName =
    typeof company?.name === 'string' ? company.name : undefined;

  return (
    <div class="detail">
      <p>
        <a href={routeHref({ page: 'applications' })}>Back to applications</a>
      </p>
      <IndexCard edge={inkFor(current?.status)}>
        <h1>{company?.name ?? 'Unknown company'}</h1>
        <div class="detail-fields">
          <Field label="Title">
            <input
              key={`title-${title}`}
              type="text"
              defaultValue={title}
              onChange={(e) => {
                void save({ title: e.currentTarget.value }, setTitleError);
              }}
            />
            {titleError ? <span class="field-error">{titleError}</span> : null}
          </Field>
          <Field label="URL">
            <input
              key={`url-${url}`}
              type="text"
              defaultValue={url}
              onChange={(e) => {
                void save({ url: e.currentTarget.value }, setUrlError);
              }}
            />
            {urlError ? <span class="field-error">{urlError}</span> : null}
          </Field>
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
          <Field label="Next action date">
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
          </Field>
          <Field label="Who acts next">
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
          </Field>
          <Field label="Notes">
            <textarea
              key={`notes-${notes}`}
              defaultValue={notes}
              onChange={(e) => {
                void save({ notes: e.currentTarget.value }, setNotesError);
              }}
            />
            {notesError ? <span class="field-error">{notesError}</span> : null}
          </Field>
          <Field label="Projects shown">
            <textarea
              key={`projects-${projectsShown}`}
              defaultValue={projectsShown}
              onChange={(e) => {
                void save(
                  { projectsShown: e.currentTarget.value },
                  setProjectsError,
                );
              }}
            />
            {projectsError ? (
              <span class="field-error">{projectsError}</span>
            ) : null}
          </Field>
        </div>
        <p>
          <a href={routeHref({ page: 'pack', id })}>Interview pack</a>
        </p>
      </IndexCard>

      {anyoneHereForName(data, companyName).prompt === 'none' ? null : (
        <IndexCard title="People here">
          <AnyoneHere companyName={companyName} />
        </IndexCard>
      )}

      <IndexCard title="Documents">
        <DocumentField app={app} slot="resume" label="Resume" />
        <DocumentField app={app} slot="coverLetter" label="Cover letter" />
      </IndexCard>

      <IndexCard title="What I told them">
        <StatementsSection applicationId={id} />
      </IndexCard>

      <IndexCard title="Interview rounds">
        <RoundsSection applicationId={id} companyId={app.companyId} />
      </IndexCard>

      <IndexCard title="Formhand log">
        <div class="detail-fields">
          <Field label="Application site">
            <select
              key={`site-${siteType}`}
              value={siteType}
              onChange={(e) => {
                const value = e.currentTarget.value;
                void save(
                  {
                    siteType: isSiteType(value) ? value : undefined,
                  },
                  setSiteError,
                );
              }}
            >
              <option value="">Not recorded</option>
              {SITE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {SITE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            {siteError ? <span class="field-error">{siteError}</span> : null}
          </Field>
          <Field label="How filling went">
            <select
              key={`fill-${fillOutcome}`}
              value={fillOutcome}
              onChange={(e) => {
                const value = e.currentTarget.value;
                void save(
                  {
                    fillOutcome: isFillOutcome(value) ? value : undefined,
                  },
                  setFillOutcomeError,
                );
              }}
            >
              <option value="">Not recorded</option>
              {FILL_OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {FILL_OUTCOME_LABELS[o]}
                </option>
              ))}
            </select>
            {fillOutcomeError ? (
              <span class="field-error">{fillOutcomeError}</span>
            ) : null}
          </Field>
          <Field label="Fill note">
            <input
              key={`fill-note-${fillNote}`}
              type="text"
              defaultValue={fillNote}
              onChange={(e) => {
                void save(
                  { fillNote: e.currentTarget.value },
                  setFillNoteError,
                );
              }}
            />
            {fillNoteError ? (
              <span class="field-error">{fillNoteError}</span>
            ) : null}
          </Field>
        </div>
      </IndexCard>

      <IndexCard title="Status history">
        {history.length === 0 ? <TypedLine>No status yet.</TypedLine> : null}
        <ul class="history">
          {history.map((e) => (
            <li key={e.id} class={e.voidedAt ? 'voided' : undefined}>
              <span>
                {effectiveDate(e)} ·{' '}
                {statusLabel(e.status, settings.statusLabels)}
                {e.note ? ` · ${e.note}` : ''}
              </span>
              {current && e.id === current.id ? (
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() => {
                    void onUndo(e.id);
                  }}
                >
                  Undo
                </Button>
              ) : null}
            </li>
          ))}
        </ul>

        <CardSection title={<h2>Add status</h2>}>
          <form
            class="app-form"
            onSubmit={(e) => {
              void onAddStatus(e);
            }}
          >
            <Field label="Status">
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
            </Field>
            <Field label="Date">
              <input
                type="date"
                value={occurredOn}
                onInput={(e) => setOccurredOn(e.currentTarget.value)}
              />
            </Field>
            <Field label="Note">
              <input
                type="text"
                value={note}
                onInput={(e) => setNote(e.currentTarget.value)}
              />
            </Field>
            <Button variant="primary" type="submit" disabled={busy}>
              Add status
            </Button>
            {eventError ? <span class="field-error">{eventError}</span> : null}
          </form>
        </CardSection>
      </IndexCard>

      <p>
        <Button
          variant="danger"
          disabled={busy}
          onClick={() => {
            void onDelete();
          }}
        >
          Delete application
        </Button>
        {deleteError ? <span class="field-error">{deleteError}</span> : null}
      </p>
    </div>
  );
}
