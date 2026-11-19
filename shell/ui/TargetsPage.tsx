import type { VNode } from 'preact';
import { useRef, useState } from 'preact/hooks';
import {
  flagTargetByNameOps,
  setTargetOps,
  targetCompanies,
} from '../../core/src/targets';
import type { Id } from '../../core/src/types';
import { useAppData } from './app-data';
import { Button } from './components/Button';
import { CardSection, IndexCard } from './components/IndexCard';
import { Field } from './components/Field';
import { TypedLine } from './components/TypedLine';

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
      <IndexCard title="Add a target company">
        <form onSubmit={(e) => void onAdd(e)}>
          <datalist id="target-companies">
            {data.companies
              .filter((c) => str(c.name) !== '')
              .map((c) => (
                <option key={c.id} value={str(c.name)} />
              ))}
          </datalist>
          <Field label="Company">
            <input
              type="text"
              list="target-companies"
              value={name}
              disabled={busy}
              onInput={(e) => setName(e.currentTarget.value)}
            />
          </Field>
          <p>
            <Button variant="primary" type="submit" disabled={busy}>
              Add target
            </Button>
          </p>
        </form>
      </IndexCard>
      {error ? (
        <span class="field-error" role="alert">
          {error}
        </span>
      ) : null}
      {rows.length === 0 ? (
        <TypedLine>No target companies yet.</TypedLine>
      ) : (
        rows.map(({ company, contacts, jobs }) => (
          <IndexCard
            key={company.id}
            title={str(company.name) || '(no company)'}
          >
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => void onRemove(company.id)}
            >
              Remove target
            </Button>
            <CardSection title={<h3>Contacts</h3>}>
              {contacts.length === 0 ? (
                <TypedLine>No contacts yet.</TypedLine>
              ) : (
                <ul>
                  {contacts.map((c) => (
                    <li key={c.id}>
                      <TypedLine as="span">
                        <strong>{str(c.name) || '(no name)'}</strong>
                        {str(c.role) ? `, ${str(c.role)}` : ''}
                      </TypedLine>
                    </li>
                  ))}
                </ul>
              )}
            </CardSection>
            <CardSection title={<h3>Saved jobs</h3>}>
              {jobs.length === 0 ? (
                <TypedLine>No saved jobs.</TypedLine>
              ) : (
                <ul>
                  {jobs.map((j) => {
                    const url = str(j.url).trim();
                    const date = savedOn(j.createdAt);
                    return (
                      <li key={j.id}>
                        <TypedLine as="span">
                          {str(j.title) || '(untitled)'}
                          {date ? `, saved ${date}` : ''}
                        </TypedLine>
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
            </CardSection>
          </IndexCard>
        ))
      )}
    </div>
  );
}
