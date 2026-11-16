import type { VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { toLocalDate } from '../../core/src/dates';
import { findApplicationMatch, repostFact } from '../../core/src/duplicates';
import type { JobCandidate } from '../../core/src/duplicates';
import {
  createApplicationFromJobOps,
  saveJobOps,
} from '../../core/src/job-ops';
import type { JobInput } from '../../core/src/job-ops';
import { canonicalizeUrl } from '../../core/src/url';
import { capturePage } from '../capture/inject';
import type { CaptureOutcome } from '../capture/inject';
import { openDashboard } from '../open-dashboard';
import { useAppData } from './app-data';
import { AnyoneHere } from './AnyoneHere';

const PREVIEW_CHARS = 300;

type Capture =
  | { status: 'reading' }
  | { status: 'done'; outcome: CaptureOutcome }
  | { status: 'failed'; message: string };

type Facts = {
  jobId: string;
  match: 'already_applied' | 'possible_match' | undefined;
  repost: string | undefined;
  companyName: string | undefined;
};

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function clean(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Ruling P1: the duplicate-check candidate is built the way saveJobOps stores
 * the job (trimmed, blank means absent, canonical URL from the same rule), so
 * it matches the stored record verbatim.
 */
function candidateOf(input: JobInput): JobCandidate {
  const candidate: JobCandidate = {};
  const url = clean(input.url);
  if (url !== undefined) {
    candidate.canonicalUrl = canonicalizeUrl(url, input.relCanonical);
  }
  const companyName = clean(input.companyName);
  if (companyName !== undefined) candidate.companyName = companyName;
  const title = clean(input.title);
  if (title !== undefined) candidate.title = title;
  return candidate;
}

export function Popup(): VNode {
  const app = useAppData();
  const { data, deps } = app;
  const [capture, setCapture] = useState<Capture>({ status: 'reading' });
  const started = useRef(false);

  const [pasteText, setPasteText] = useState('');
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteCompany, setPasteCompany] = useState('');
  // undefined until the user edits the field; then the prefill no longer applies.
  const [pasteLink, setPasteLink] = useState<string | undefined>(undefined);

  const [facts, setFacts] = useState<Facts | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [createError, setCreateError] = useState<string | undefined>(undefined);
  const [openError, setOpenError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    capturePage().then(
      (outcome) => setCapture({ status: 'done', outcome }),
      (err: unknown) =>
        setCapture({ status: 'failed', message: messageOf(err) }),
    );
  }, []);

  const save = (input: JobInput): void => {
    setSaving(true);
    setSaveError(undefined);
    const candidate = candidateOf(input);
    const { ops, jobId } = saveJobOps(input, deps);
    // Facts come from the rendered data, before this save is applied.
    const match = findApplicationMatch(data, candidate)?.kind;
    const repost = repostFact(
      data,
      { ...candidate, excludeJobId: jobId },
      toLocalDate(new Date()),
    )?.text;
    app.apply(ops).then(
      () => {
        setFacts({ jobId, match, repost, companyName: candidate.companyName });
        setSaving(false);
      },
      (err: unknown) => {
        setSaveError(messageOf(err));
        setSaving(false);
      },
    );
  };

  const create = (jobId: string): void => {
    setCreating(true);
    setCreateError(undefined);
    app
      .apply((d) => {
        const job = d.jobs.find((j) => j.id === jobId);
        if (!job) {
          throw new Error('The saved job is no longer there. Save it again.');
        }
        return createApplicationFromJobOps(job, d, deps).ops;
      })
      .then(
        () => {
          setCreated(true);
          setCreating(false);
        },
        (err: unknown) => {
          setCreateError(messageOf(err));
          setCreating(false);
        },
      );
  };

  const open = (): void => {
    setOpenError(undefined);
    openDashboard().then(
      () => window.close(),
      (err: unknown) => setOpenError(messageOf(err)),
    );
  };

  if (capture.status === 'reading') {
    return (
      <main class="popup">
        <p>Reading this page…</p>
      </main>
    );
  }

  const outcome: CaptureOutcome =
    capture.status === 'done'
      ? capture.outcome
      : { ok: false, reason: 'refused' };
  const captured =
    outcome.ok && outcome.capture.source !== 'none'
      ? outcome.capture
      : undefined;
  const isHttp = (u: string | undefined): u is string =>
    u !== undefined && /^https?:\/\//i.test(u.trim());
  const outcomeUrl = outcome.ok ? outcome.capture.url : outcome.url;
  const linkValue = pasteLink ?? (isHttp(outcomeUrl) ? outcomeUrl.trim() : '');

  let body: VNode;
  if (captured) {
    const input: JobInput = {
      source: captured.source === 'jsonld' ? 'jsonld' : 'selection',
      url: captured.url,
      relCanonical: captured.relCanonical,
      title: captured.title,
      companyName: captured.companyName,
      location: captured.location,
      text: captured.text,
    };
    body = (
      <section class="popup-capture">
        <h2>{captured.title || 'Untitled posting'}</h2>
        {captured.companyName ? <p>{captured.companyName}</p> : null}
        {captured.location ? <p>{captured.location}</p> : null}
        {captured.text ? (
          <p class="popup-text">{captured.text.slice(0, PREVIEW_CHARS)}</p>
        ) : null}
        {facts ? null : (
          <div class="popup-actions">
            <button type="button" disabled={saving} onClick={() => save(input)}>
              Save job
            </button>
            {saveError ? (
              <span class="field-error" role="alert">
                {saveError}
              </span>
            ) : null}
          </div>
        )}
      </section>
    );
  } else {
    const line = outcome.ok
      ? 'No job posting found. Select the posting text and reopen, or paste it below.'
      : "This page can't be read. Paste the posting below.";
    const canSave =
      pasteText.trim() !== '' ||
      pasteTitle.trim() !== '' ||
      pasteCompany.trim() !== '';
    const input: JobInput = {
      source: 'paste',
      url: linkValue.trim() === '' ? undefined : linkValue.trim(),
      title: pasteTitle,
      companyName: pasteCompany,
      text: pasteText,
    };
    body = (
      <section class="popup-paste">
        <p>{line}</p>
        {capture.status === 'failed' ? (
          <p class="field-error" role="alert">
            {capture.message}
          </p>
        ) : null}
        <label>
          Link
          <input
            type="text"
            value={linkValue}
            disabled={facts !== undefined}
            onInput={(e) => setPasteLink(e.currentTarget.value)}
          />
        </label>
        <label>
          Title
          <input
            type="text"
            value={pasteTitle}
            disabled={facts !== undefined}
            onInput={(e) => setPasteTitle(e.currentTarget.value)}
          />
        </label>
        <label>
          Company
          <input
            type="text"
            value={pasteCompany}
            disabled={facts !== undefined}
            onInput={(e) => setPasteCompany(e.currentTarget.value)}
          />
        </label>
        <label>
          Posting text
          <textarea
            rows={6}
            value={pasteText}
            disabled={facts !== undefined}
            onInput={(e) => setPasteText(e.currentTarget.value)}
          />
        </label>
        {facts ? null : (
          <div class="popup-actions">
            <button
              type="button"
              disabled={!canSave || saving}
              onClick={() => save(input)}
            >
              Save job
            </button>
            {saveError ? (
              <span class="field-error" role="alert">
                {saveError}
              </span>
            ) : null}
          </div>
        )}
      </section>
    );
  }

  return (
    <main class="popup">
      {body}
      {facts ? (
        <section class="popup-result">
          <p>Saved.</p>
          {facts.match === 'already_applied' ? (
            <p>Already applied here.</p>
          ) : null}
          {facts.match === 'possible_match' ? (
            <p>
              Possible match: an application for the same company and title.
            </p>
          ) : null}
          {facts.repost ? <p>{facts.repost}</p> : null}
          <AnyoneHere compact companyName={facts.companyName} />
          <div class="popup-actions">
            {created ? (
              <span>Application created.</span>
            ) : (
              <button
                type="button"
                disabled={creating}
                onClick={() => create(facts.jobId)}
              >
                Create application
              </button>
            )}
            {createError ? (
              <span class="field-error" role="alert">
                {createError}
              </span>
            ) : null}
          </div>
        </section>
      ) : null}
      <div class="popup-actions">
        <button type="button" onClick={open}>
          Open dashboard
        </button>
        {openError ? (
          <span class="field-error" role="alert">
            {openError}
          </span>
        ) : null}
      </div>
    </main>
  );
}
