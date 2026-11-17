import type { VNode } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { isLocalDate, toLocalDate } from '../../core/src/dates';
import { deadlines, type DeadlineRow } from '../../core/src/deadlines';
import {
  completeTaskOps,
  deleteTaskOps,
  doneTasks,
  newTaskOps,
  reopenTaskOps,
} from '../../core/src/tasks';
import type { Task } from '../../core/src/types';
import { useAppData } from './app-data';
import { routeHref } from './route';

// Restored data may hold odd types; render only strings.
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function actorLabel(actor: unknown): string {
  if (actor === 'me') return 'Me';
  if (actor === 'them') return 'Them';
  return 'Not set';
}

export function DeadlinesPage(): VNode {
  const appData = useAppData();
  const { data, settings, deps } = appData;
  const [busy, setBusy] = useState(false);
  // Set synchronously so a second click before re-render cannot start a write.
  const inFlight = useRef(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [title, setTitle] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [titleError, setTitleError] = useState<string | undefined>(undefined);
  const [dateError, setDateError] = useState<string | undefined>(undefined);

  const run = async (write: () => Promise<void>): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await write();
      return true;
    } catch (err) {
      setError(reasonOf(err));
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const add = async (e: Event): Promise<void> => {
    e.preventDefault();
    if (inFlight.current) return;
    const trimmed = title.trim();
    const badTitle = trimmed === '';
    const badDate = dueOn !== '' && !isLocalDate(dueOn);
    setTitleError(badTitle ? 'Enter a title.' : undefined);
    setDateError(badDate ? 'Enter a valid date (YYYY-MM-DD).' : undefined);
    if (badTitle || badDate) return;
    const ok = await run(() =>
      appData.apply(
        () =>
          newTaskOps(
            { title: trimmed, ...(dueOn !== '' ? { dueOn } : {}) },
            deps,
          ).ops,
      ),
    );
    if (ok) {
      setTitle('');
      setDueOn('');
    }
  };

  const complete = async (id: string): Promise<void> => {
    await run(() =>
      appData.apply((d) => {
        const fresh = d.tasks.find((t) => t.id === id);
        return fresh ? completeTaskOps(fresh, deps) : [];
      }),
    );
  };

  const reopen = async (id: string): Promise<void> => {
    await run(() =>
      appData.apply((d) => {
        const fresh = d.tasks.find((t) => t.id === id);
        return fresh ? reopenTaskOps(fresh) : [];
      }),
    );
  };

  const remove = async (id: string): Promise<void> => {
    if (inFlight.current) return;
    if (!confirm('Delete this task?')) return;
    await run(() =>
      appData.apply((d) =>
        d.tasks.some((t) => t.id === id) ? deleteTaskOps(id) : [],
      ),
    );
  };

  const rows = deadlines(data, settings, toLocalDate(new Date()));
  const done = doneTasks(data);

  // Round rows open their application; follow-up rows open the contacts list.
  const rowHref = (row: DeadlineRow): string | undefined => {
    if (row.applicationId !== undefined) {
      return routeHref({ page: 'application', id: row.applicationId });
    }
    return row.kind === 'follow_up'
      ? routeHref({ page: 'contacts' })
      : undefined;
  };

  const rowItem = (row: DeadlineRow): VNode => {
    const href = rowHref(row);
    return (
      <li key={row.key}>
        <strong>{str(row.date) || 'No date'}</strong>
        {row.overdue ? <> (Overdue)</> : null}{' '}
        {href !== undefined ? (
          <a href={href}>{str(row.label)}</a>
        ) : (
          str(row.label)
        )}{' '}
        <span>Next: {actorLabel(row.actor)}</span>
        {row.kind === 'quiet' ? (
          <>
            {' '}
            <a href={routeHref({ page: 'quiet' })}>Quiet applications</a>
          </>
        ) : null}
        {row.kind === 'task' && row.taskId !== undefined ? (
          <>
            {' '}
            <button
              type="button"
              disabled={busy}
              onClick={() => void complete(row.taskId as string)}
            >
              Done
            </button>{' '}
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove(row.taskId as string)}
            >
              Delete
            </button>
          </>
        ) : null}
      </li>
    );
  };

  const doneItem = (task: Task): VNode => (
    <li key={task.id}>
      {str(task.title) || '(no title)'}{' '}
      <button
        type="button"
        disabled={busy}
        onClick={() => void reopen(task.id)}
      >
        Not done
      </button>{' '}
      <button
        type="button"
        disabled={busy}
        onClick={() => void remove(task.id)}
      >
        Delete
      </button>
    </li>
  );

  return (
    <div class="data-page">
      <h1>Deadlines</h1>
      <section class="data-section">
        <h2>Add a task</h2>
        <form onSubmit={(e) => void add(e)} noValidate>
          <label>
            Title
            <input
              type="text"
              value={title}
              disabled={busy}
              onInput={(e) => setTitle(e.currentTarget.value)}
            />
          </label>
          {titleError ? (
            <span class="field-error" role="alert">
              {titleError}
            </span>
          ) : null}
          <label>
            Date (optional)
            <input
              type="text"
              placeholder="YYYY-MM-DD"
              value={dueOn}
              disabled={busy}
              onInput={(e) => setDueOn(e.currentTarget.value)}
            />
          </label>
          {dateError ? (
            <span class="field-error" role="alert">
              {dateError}
            </span>
          ) : null}
          <button type="submit" disabled={busy}>
            Add task
          </button>
        </form>
      </section>
      {error ? (
        <span class="field-error" role="alert">
          {error}
        </span>
      ) : null}
      {rows.length === 0 ? <p>Nothing due.</p> : <ul>{rows.map(rowItem)}</ul>}
      <details>
        <summary>Done ({done.length})</summary>
        <ul>{done.map(doneItem)}</ul>
      </details>
    </div>
  );
}
