import type { VNode } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { formatAnswer } from '../../core/src/answers';
import {
  PROFILE_FIELDS,
  profileValues,
  setProfileFieldOps,
} from '../../core/src/profile';
import { copyText } from '../clipboard';
import { useAppData } from './app-data';
import { routeHref } from './route';

// Restored data may hold odd types; render only strings.
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

type CopyState = { id: string; ok: boolean; message: string };

export function CopyPanel(): VNode {
  const appData = useAppData();
  const { data, deps } = appData;
  const [busy, setBusy] = useState(false);
  // Set synchronously so a second click before re-render cannot start a write.
  const inFlight = useRef(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState<Record<string, string> | undefined>(
    undefined,
  );
  // Values as they were when Edit opened; only fields changed since are saved.
  const [base, setBase] = useState<Record<string, string>>({});
  const [copy, setCopy] = useState<CopyState | undefined>(undefined);

  const values = profileValues(data);

  const startEdit = (): void => {
    const next: Record<string, string> = {};
    for (const f of PROFILE_FIELDS) next[f.key] = values[f.key] ?? '';
    setError(undefined);
    setCopy(undefined);
    setBase(next);
    setDraft(next);
  };

  const save = async (): Promise<void> => {
    if (draft === undefined || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await appData.apply((d) =>
        PROFILE_FIELDS.filter(
          (f) => (draft[f.key] ?? '').trim() !== (base[f.key] ?? '').trim(),
        ).flatMap((f) =>
          setProfileFieldOps(d, f.key, draft[f.key] ?? '', deps),
        ),
      );
      setCopy(undefined);
      setDraft(undefined);
    } catch (err) {
      setError(reasonOf(err));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  // Called synchronously from onClick: no await before copyText.
  const doCopy = (id: string, text: string): void => {
    copyText(text).then(
      () => setCopy({ id, ok: true, message: 'Copied' }),
      () => setCopy({ id, ok: false, message: 'Could not copy.' }),
    );
  };

  const status = (id: string): VNode | null => {
    if (copy?.id !== id) return null;
    return copy.ok ? (
      <span role="status"> {copy.message}</span>
    ) : (
      <span class="field-error" role="alert">
        {' '}
        {copy.message}
      </span>
    );
  };

  const answers = data.canonicalAnswers
    .map((a) => ({
      id: a.id,
      label: str(a.label) || str(a.key) || '(no label)',
      text: formatAnswer(a.value),
    }))
    .filter((a) => a.text !== '');

  return (
    <div class="data-page">
      <h1>My details</h1>
      <section class="data-section">
        <h2>Your details</h2>
        {draft === undefined ? (
          <>
            <ul>
              {PROFILE_FIELDS.map((f) => {
                const value = values[f.key];
                return (
                  <li key={f.key}>
                    <strong>{f.label}</strong>:{' '}
                    {value === undefined ? (
                      'Not set'
                    ) : (
                      <>
                        {value}{' '}
                        <button
                          type="button"
                          onClick={() => doCopy(`profile:${f.key}`, value)}
                        >
                          Copy
                        </button>
                        {status(`profile:${f.key}`)}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
            <button type="button" disabled={busy} onClick={startEdit}>
              Edit
            </button>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            {PROFILE_FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}
                <input
                  type="text"
                  value={draft[f.key] ?? ''}
                  disabled={busy}
                  onInput={(e) => {
                    const v = e.currentTarget.value;
                    setDraft((d) => ({ ...d, [f.key]: v }));
                  }}
                />
              </label>
            ))}
            <button type="submit" disabled={busy}>
              Save
            </button>{' '}
            <button
              type="button"
              disabled={busy}
              onClick={() => setDraft(undefined)}
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
      </section>
      <section class="data-section">
        <h2>Your answers</h2>
        <p>
          To change an answer, go to the{' '}
          <a href={routeHref({ page: 'answers' })}>Answers page</a>.
        </p>
        {answers.length === 0 ? (
          <p>No answers yet.</p>
        ) : (
          <ul>
            {answers.map((a) => (
              <li key={a.id}>
                <strong>{a.label}</strong>: {a.text}{' '}
                {a.text.trim() === '' ? null : (
                  <>
                    <button
                      type="button"
                      onClick={() => doCopy(`answer:${a.id}`, a.text)}
                    >
                      Copy
                    </button>
                    {status(`answer:${a.id}`)}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
