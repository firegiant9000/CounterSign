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
import type { FillResult } from '../../core/src/fill/result';
import { fillRecordOps } from '../../core/src/fill-records';
import type { FillRecord } from '../../core/src/fill-records';
import {
  linkFormAndRecordOps,
  newApplicationFromFormOps,
} from '../../core/src/form-application';
import { findApplicationsForForm, formUrlKey } from '../../core/src/form-link';
import { profileValues } from '../../core/src/profile';
import type { WriteOp } from '../../core/src/repository';
import type { Id, Snapshot } from '../../core/src/types';
import { canonicalizeUrl } from '../../core/src/url';
import { capturePage } from '../capture/inject';
import type { CaptureOutcome } from '../capture/inject';
import { createFillController } from '../fill/controller';
import type { FillController } from '../fill/controller';
import { openDashboard } from '../open-dashboard';
import { useAppData } from './app-data';
import { AnyoneHere } from './AnyoneHere';
import { FillSection } from './FillSection';
import {
  FormLink,
  applicationLabel,
  displayName,
  pickerCandidates,
} from './FormLink';
import type { RecordLine } from './FormLink';
import { Button } from './components/Button';
import { Fact } from './components/Fact';
import { Field } from './components/Field';
import { FiledStamp } from './components/FiledStamp';
import { IndexCard } from './components/IndexCard';
import { Text } from './components/Text';
import { TypedLine } from './components/TypedLine';

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

  const dataRef = useRef(data);
  dataRef.current = data;
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const captureRef = useRef<Capture>(capture);
  captureRef.current = capture;
  const controllerRef = useRef<FillController | undefined>(undefined);
  if (controllerRef.current === undefined) {
    controllerRef.current = createFillController({
      input: () => ({
        profile: profileValues(dataRef.current),
        answers: Array.isArray(dataRef.current.canonicalAnswers)
          ? dataRef.current.canonicalAnswers
          : [],
      }),
      now: () => depsRef.current.now(),
      relCanonical: () => {
        const c = captureRef.current;
        if (c.status !== 'done' || !c.outcome.ok) return undefined;
        return c.outcome.capture.source !== 'none'
          ? c.outcome.capture.relCanonical
          : undefined;
      },
    });
  }
  const controller = controllerRef.current;

  const [fillStatus, setFillStatus] = useState(() => controller.state().status);
  useEffect(() => {
    const unsubscribe = controller.subscribe((s) => setFillStatus(s.status));
    setFillStatus(controller.state().status);
    return unsubscribe;
  }, [controller]);

  // Set by Choose… and Create and link; see linkedId below.
  const [chosenId, setChosenId] = useState<Id | undefined>(undefined);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | undefined>(undefined);
  // A fill result waiting for an application to record it on.
  const [held, setHeld] = useState<FillResult | undefined>(undefined);
  const heldRef = useRef<FillResult | undefined>(undefined);
  heldRef.current = held;
  const [recordLine, setRecordLine] = useState<RecordLine | undefined>(
    undefined,
  );
  const [recordNotice, setRecordNotice] = useState<string | undefined>(
    undefined,
  );
  const linkingRef = useRef(false);
  const linkedIdRef = useRef<Id | undefined>(undefined);

  useEffect(() => {
    controller.refresh();
  }, [data]);

  // A match linked the form without the owner's click: drop the stale held
  // fill rather than let a later Choose… record it. The owner's own link
  // path records and clears held itself, and is excluded while in flight.
  useEffect(() => {
    if (
      linkedIdRef.current !== undefined &&
      heldRef.current !== undefined &&
      !linkingRef.current
    ) {
      heldRef.current = undefined;
      setHeld(undefined);
    }
  });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void controller.start();
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
        <IndexCard edge="maroon">
          <TypedLine>Reading this page…</TypedLine>
        </IndexCard>
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

  const formKey =
    outcomeUrl === undefined
      ? undefined
      : formUrlKey(outcomeUrl, captured?.relCanonical);
  // A chosen application that still exists wins; otherwise the first match.
  // Task 8 records a fill to linkedId; Task 9 shows a panel for it.
  const linkedId: Id | undefined =
    chosenId !== undefined && data.applications.some((a) => a.id === chosenId)
      ? chosenId
      : formKey === undefined
        ? undefined
        : findApplicationsForForm(data, formKey)[0];

  linkedIdRef.current = linkedId;

  const MISSING = 'The application is no longer there. Choose another.';

  // One apply per write, with the held fill result recorded in the same one.
  const runLink = (
    build: (d: Snapshot) => {
      ops: WriteOp[];
      id: Id;
      name: string;
      record?: FillRecord;
    },
  ): Promise<boolean> => {
    if (linkingRef.current) return Promise.resolve(false);
    linkingRef.current = true;
    setLinking(true);
    setLinkError(undefined);
    const got: { id?: Id; name: string; record?: FillRecord } = { name: '' };
    return app
      .apply((d) => {
        const built = build(d);
        got.id = built.id;
        got.name = built.name;
        got.record = built.record;
        if (built.record?.missing) throw new Error(MISSING);
        return built.ops;
      })
      .then(
        () => {
          linkingRef.current = false;
          setChosenId(got.id);
          setLinking(false);
          if (got.record !== undefined) {
            setHeld(undefined);
            setRecordNotice(undefined);
            setRecordLine(
              got.record.recorded > 0
                ? {
                    recorded: got.record.recorded,
                    alreadyOnForm: got.record.alreadyOnForm,
                    name: got.name,
                  }
                : undefined,
            );
          }
          return true;
        },
        (err: unknown) => {
          linkingRef.current = false;
          setLinkError(messageOf(err));
          setLinking(false);
          return false;
        },
      );
  };
  const linkExisting = (id: Id): Promise<boolean> =>
    runLink((d) => {
      const built = linkFormAndRecordOps(
        d,
        id,
        formKey ?? '',
        heldRef.current,
        deps,
      );
      return {
        ops: built.ops,
        id,
        name: applicationLabel(d, id),
        record: built.record,
      };
    });

  const onFilled = (result: FillResult): void => {
    setRecordLine(undefined);
    setRecordNotice(undefined);
    // Read when the fill completes, not at the click (FillSection is fixed).
    const id = linkedIdRef.current;
    if (id === undefined) {
      setHeld(result);
      return;
    }
    const got: { name: string; record?: FillRecord } = { name: '' };
    app
      .apply((d) => {
        const record = fillRecordOps(d, result, id, deps);
        got.record = record;
        got.name = applicationLabel(d, id);
        return record.ops;
      })
      .then(
        () => {
          const record = got.record;
          if (record === undefined) return;
          if (record.missing) {
            setChosenId(undefined);
            setRecordNotice(MISSING);
            return;
          }
          setHeld(undefined);
          if (record.recorded > 0) {
            setRecordLine({
              recorded: record.recorded,
              alreadyOnForm: record.alreadyOnForm,
              name: got.name,
            });
          }
        },
        (err: unknown) => setLinkError(messageOf(err)),
      );
  };
  const linkNew = (names: {
    companyName: string;
    title: string;
  }): Promise<boolean> =>
    runLink((d) => {
      const input: JobInput = {
        source: captured
          ? captured.source === 'jsonld'
            ? 'jsonld'
            : 'selection'
          : 'paste',
        url: isHttp(outcomeUrl) ? outcomeUrl.trim() : undefined,
        relCanonical: captured?.relCanonical,
        title: names.title,
        companyName: names.companyName,
        location: captured?.location,
        text: captured?.text ?? '',
      };
      const built = newApplicationFromFormOps(d, input, deps, heldRef.current);
      return {
        ops: built.ops,
        id: built.applicationId,
        name: displayName(names.companyName, names.title),
        record: built.record,
      };
    });

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
        <TypedLine>Found on page</TypedLine>
        <h2>{captured.title || 'Untitled posting'}</h2>
        {captured.companyName ? (
          <p>
            <Text kind="title">{captured.companyName}</Text>
          </p>
        ) : null}
        {captured.location ? (
          <p>
            <Text kind="title">{captured.location}</Text>
          </p>
        ) : null}
        {captured.text ? (
          <p class="popup-text">{captured.text.slice(0, PREVIEW_CHARS)}</p>
        ) : null}
        {facts ? null : (
          <div class="popup-actions">
            <Button
              variant="primary"
              disabled={saving}
              onClick={() => save(input)}
            >
              Save job
            </Button>
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
        <TypedLine>{line}</TypedLine>
        {capture.status === 'failed' ? (
          <p class="field-error" role="alert">
            {capture.message}
          </p>
        ) : null}
        <Field label="Link">
          <input
            type="text"
            value={linkValue}
            disabled={facts !== undefined}
            onInput={(e) => setPasteLink(e.currentTarget.value)}
          />
        </Field>
        <Field label="Title">
          <input
            type="text"
            value={pasteTitle}
            disabled={facts !== undefined}
            onInput={(e) => setPasteTitle(e.currentTarget.value)}
          />
        </Field>
        <Field label="Company">
          <input
            type="text"
            value={pasteCompany}
            disabled={facts !== undefined}
            onInput={(e) => setPasteCompany(e.currentTarget.value)}
          />
        </Field>
        <Field label="Posting text">
          <textarea
            rows={6}
            value={pasteText}
            disabled={facts !== undefined}
            onInput={(e) => setPasteText(e.currentTarget.value)}
          />
        </Field>
        {facts ? null : (
          <div class="popup-actions">
            <Button
              variant="primary"
              disabled={!canSave || saving}
              onClick={() => save(input)}
            >
              Save job
            </Button>
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
    <main class={facts ? 'popup popup-filed' : 'popup'}>
      <IndexCard edge="maroon">
        {body}
        {facts ? (
          <section class="popup-result">
            <FiledStamp />
            <p>Saved.</p>
            {facts.match === 'already_applied' ? (
              <Fact tone="neutral">Already applied here.</Fact>
            ) : null}
            {facts.match === 'possible_match' ? (
              <Fact tone="neutral">
                Possible match: an application for the same company and title.
              </Fact>
            ) : null}
            {facts.repost ? <Fact tone="neutral">{facts.repost}</Fact> : null}
            <AnyoneHere compact companyName={facts.companyName} />
            <div class="popup-actions">
              {created ? (
                <TypedLine as="span">Application created.</TypedLine>
              ) : (
                <Button
                  variant="primary"
                  disabled={creating}
                  onClick={() => create(facts.jobId)}
                >
                  Create application
                </Button>
              )}
              {createError ? (
                <span class="field-error" role="alert">
                  {createError}
                </span>
              ) : null}
            </div>
          </section>
        ) : null}
        {fillStatus === 'ready' && formKey !== undefined ? (
          <FormLink
            data={data}
            linkedId={linkedId}
            candidates={pickerCandidates(data)}
            initialCompany={captured?.companyName}
            initialTitle={captured?.title}
            onLink={linkExisting}
            onNew={linkNew}
            busy={linking}
            error={linkError}
            onClearError={() => setLinkError(undefined)}
            heldNotice={held !== undefined && linkedId === undefined}
            notice={recordNotice}
            recordLine={recordLine}
          />
        ) : null}
        <FillSection controller={controller} onFilled={onFilled} />
        <div class="popup-actions">
          <Button variant="link" onClick={open}>
            Open dashboard
          </Button>
          {openError ? (
            <span class="field-error" role="alert">
              {openError}
            </span>
          ) : null}
        </div>
      </IndexCard>
    </main>
  );
}
