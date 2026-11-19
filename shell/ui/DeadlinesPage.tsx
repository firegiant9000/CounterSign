import type { VNode } from 'preact';
import { useMemo, useRef, useState } from 'preact/hooks';
import { applicationRows } from '../../core/src/application-list';
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
import { Button } from './components/Button';
import { DeadlineItem, RowButton } from './components/DeadlineItem';
import { Disclosure } from './components/Disclosure';
import { Field } from './components/Field';
import { IndexCard } from './components/IndexCard';
import { LedgerSheet, ledgerRowClass } from './components/LedgerSheet';
import { Text } from './components/Text';
import { TypedLine } from './components/TypedLine';
import { routeHref } from './route';
import { inkFor } from './status-ink';

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
    const dueTrimmed = dueOn.trim();
    const badDate = dueTrimmed !== '' && !isLocalDate(dueTrimmed);
    setTitleError(badTitle ? 'Enter a title.' : undefined);
    setDateError(badDate ? 'Enter a valid date (YYYY-MM-DD).' : undefined);
    if (badTitle || badDate) return;
    const ok = await run(() =>
      appData.apply(
        () =>
          newTaskOps(
            {
              title: trimmed,
              ...(dueTrimmed !== '' ? { dueOn: dueTrimmed } : {}),
            },
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

  const statusById = useMemo(
    () => new Map(applicationRows(data).map((r) => [r.id, r.status] as const)),
    [data],
  );
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
      <DeadlineItem
        key={row.key}
        ink={
          row.applicationId !== undefined
            ? inkFor(statusById.get(row.applicationId))
            : 'none'
        }
        date={str(row.date) || 'No date'}
        overdue={row.overdue}
        label={
          href !== undefined ? (
            <a href={href}>{str(row.label)}</a>
          ) : (
            str(row.label)
          )
        }
        actor={actorLabel(row.actor)}
        extra={
          row.kind === 'quiet' ? (
            <>
              {' '}
              <a href={routeHref({ page: 'quiet' })}>Quiet applications</a>
            </>
          ) : null
        }
        actions={
          row.kind === 'task' && row.taskId !== undefined ? (
            <>
              <RowButton
                disabled={busy}
                onClick={() => void complete(row.taskId as string)}
              >
                Done
              </RowButton>
              <RowButton
                variant="danger"
                disabled={busy}
                onClick={() => void remove(row.taskId as string)}
              >
                Delete
              </RowButton>
            </>
          ) : null
        }
      />
    );
  };

  const doneItem = (task: Task): VNode => (
    <li key={task.id} class={ledgerRowClass('none')}>
      <Text kind="name">{str(task.title) || '(no title)'}</Text>
      <RowButton disabled={busy} onClick={() => void reopen(task.id)}>
        Not done
      </RowButton>
      <RowButton
        variant="danger"
        disabled={busy}
        onClick={() => void remove(task.id)}
      >
        Delete
      </RowButton>
    </li>
  );

  return (
    <div class="data-page">
      <h1>Deadlines</h1>
      <IndexCard title="Add a task">
        <form onSubmit={(e) => void add(e)} noValidate>
          <Field label="Title" error={titleError}>
            <input
              type="text"
              value={title}
              disabled={busy}
              onInput={(e) => setTitle(e.currentTarget.value)}
            />
          </Field>
          <Field label="Date (optional)" error={dateError}>
            <input
              type="text"
              placeholder="YYYY-MM-DD"
              value={dueOn}
              disabled={busy}
              onInput={(e) => setDueOn(e.currentTarget.value)}
            />
          </Field>
          <Button variant="primary" type="submit" disabled={busy}>
            Add task
          </Button>
        </form>
      </IndexCard>
      {error ? (
        <span class="field-error" role="alert">
          {error}
        </span>
      ) : null}
      <LedgerSheet label="DEADLINES">
        {rows.length === 0 ? (
          <TypedLine>Nothing due.</TypedLine>
        ) : (
          <ul>{rows.map(rowItem)}</ul>
        )}
      </LedgerSheet>
      <Disclosure summary={<>Done ({done.length})</>}>
        <LedgerSheet label="DONE">
          <ul>{done.map(doneItem)}</ul>
        </LedgerSheet>
      </Disclosure>
    </div>
  );
}
