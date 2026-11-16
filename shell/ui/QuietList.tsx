import type { VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { toLocalDate } from '../../core/src/dates';
import { closeAsNoResponseOps, quietApplications } from '../../core/src/quiet';
import { noResponseDays } from '../../core/src/settings';
import { useAppData } from './app-data';
import { routeHref } from './route';

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function QuietList(): VNode {
  const appData = useAppData();
  const { data, settings, deps } = appData;
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);
  // Set synchronously so a second click before re-render cannot start a write.
  const inFlight = useRef(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [message, setMessage] = useState<string | undefined>(undefined);

  const days = noResponseDays(settings);
  // Derived on every render so a cross-tab reload is reflected at once.
  const rows = quietApplications(data, days, toLocalDate(new Date()));
  const listed = new Set(rows.map((r) => r.id));
  const chosen = selected.filter((id) => listed.has(id));

  // Drop ids that left the list so they never reappear pre-checked later.
  const listKey = rows.map((r) => r.id).join('\n');
  useEffect(() => {
    setSelected((prev) => {
      const kept = prev.filter((id) => listed.has(id));
      return kept.length === prev.length ? prev : kept;
    });
  }, [listKey]);

  const close = async (ids: readonly string[]): Promise<void> => {
    if (inFlight.current || ids.length === 0) return;
    inFlight.current = true;
    try {
      await closeIds(ids);
    } finally {
      inFlight.current = false;
    }
  };

  const closeIds = async (ids: readonly string[]): Promise<void> => {
    if (!confirm(`Close ${ids.length} application(s) as No response?`)) return;
    const today = toLocalDate(new Date());
    let closed = 0;
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      await appData.apply((d) => {
        const ops = closeAsNoResponseOps(d, ids, today, deps);
        closed = ops.length;
        return ops;
      });
      setSelected([]);
      setMessage(
        closed < ids.length
          ? `Closed ${closed}. Some had already changed.`
          : `Closed ${closed}.`,
      );
    } catch (err) {
      setError(reasonOf(err));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string, on: boolean): void => {
    setSelected(on ? [...chosen, id] : chosen.filter((x) => x !== id));
  };

  return (
    <div class="data-page">
      <h1>Quiet for more than {days} days</h1>
      <p>
        <a href={routeHref({ page: 'settings' })}>Change the number of days</a>
      </p>
      {rows.length === 0 ? (
        <p>Nothing is quiet.</p>
      ) : (
        <section class="data-section">
          <button
            type="button"
            disabled={busy || chosen.length === 0}
            onClick={() => void close(chosen)}
          >
            Close selected ({chosen.length})
          </button>
          <ul>
            {rows.map((row) => (
              <li key={row.id}>
                <input
                  type="checkbox"
                  checked={chosen.includes(row.id)}
                  disabled={busy}
                  aria-label={`Select ${row.companyName || '(no company)'}`}
                  onChange={(e) => toggle(row.id, e.currentTarget.checked)}
                />{' '}
                <a href={routeHref({ page: 'application', id: row.id })}>
                  {row.companyName || '(no company)'}
                  {row.title ? `, ${row.title}` : ''}
                </a>{' '}
                Applied {row.statusDate}, {row.quietDays} days ago{' '}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void close([row.id])}
                >
                  Close as No response
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {error ? <span class="field-error">{error}</span> : null}
      {message ? <p>{message}</p> : null}
    </div>
  );
}
