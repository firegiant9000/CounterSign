import type { VNode } from 'preact';
import { useRef, useState } from 'preact/hooks';
import {
  flagTargetByNameOps,
  setTargetOps,
  targetCompanies,
} from '../../core/src/targets';
import type { Id } from '../../core/src/types';
import { useAppData } from './app-data';

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Restored data may hold odd types; render only strings.
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function isWebUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function savedOn(createdAt: unknown): string {
  const at = new Date(str(createdAt));
  return Number.isNaN(at.getTime()) ? '' : at.toLocaleDateString();
}

export function TargetsPage(): VNode {
  const appData = useAppData();
  const { data, deps } = appData;
  const [busy, setBusy] = useState(false);
  // Set synchronously so a second click before re-render cannot start a write.
  const inFlight = useRef(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [name, setName] = useState('');

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

  const onAdd = async (event: Event): Promise<void> => {
    event.preventDefault();
    if (inFlight.current) return;
    const ok = await run(() =>
      appData.apply((d) => flagTargetByNameOps(d, name, deps)),
    );
    if (ok) setName('');
  };

  const onRemove = async (id: Id): Promise<void> => {
    if (inFlight.current) return;
    await run(() =>
      appData.apply((d) => {
        const fresh = d.companies.find((c) => c.id === id);
        return fresh ? setTargetOps(fresh, false) : [];
      }),
    );
  };

  const rows = targetCompanies(data);

  return (
    <div class="data-page">
      <h1>Targets</h1>
      <form class="data-section" onSubmit={(e) => void onAdd(e)}>
        <h2>Add a target company</h2>
        <label>
          Company
          <input
            type="text"
            list="target-companies"
            value={name}
            disabled={busy}
            onInput={(e) => setName(e.currentTarget.value)}
          />
        </label>
        <datalist id="target-companies">
          {data.companies
            .filter((c) => str(c.name) !== '')
            .map((c) => (
              <option key={c.id} value={str(c.name)} />
            ))}
        </datalist>{' '}
        <button type="submit" disabled={busy}>
          Add target
        </button>
      </form>
      {error ? (
        <span class="field-error" role="alert">
          {error}
        </span>
      ) : null}
      {rows.length === 0 ? (
        <p>No target companies yet.</p>
      ) : (
        rows.map(({ company, contacts, jobs }) => (
          <section class="data-section" key={company.id}>
            <h2>{str(company.name) || '(no company)'}</h2>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onRemove(company.id)}
            >
              Remove target
            </button>
            <h3>Contacts</h3>
            {contacts.length === 0 ? (
              <p>No contacts yet.</p>
            ) : (
              <ul>
                {contacts.map((c) => (
                  <li key={c.id}>
                    <strong>{str(c.name) || '(no name)'}</strong>
                    {str(c.role) ? `, ${str(c.role)}` : ''}
                  </li>
                ))}
              </ul>
            )}
            <h3>Saved jobs</h3>
            {jobs.length === 0 ? (
              <p>No saved jobs.</p>
            ) : (
              <ul>
                {jobs.map((j) => {
                  const url = str(j.url).trim();
                  const date = savedOn(j.createdAt);
                  return (
                    <li key={j.id}>
                      {str(j.title) || '(untitled)'}
                      {date ? `, saved ${date}` : ''}
                      {isWebUrl(url) ? (
                        <>
                          {' '}
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Open posting
                          </a>
                        </>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))
      )}
    </div>
  );
}
