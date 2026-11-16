import { isLocalDate } from './dates';
import type { WriteOp } from './repository';
import type { Deps, Id, LocalDate, Snapshot, Task } from './types';

/** A new open task. The title is trimmed; a blank or invalid due date is left out. */
export function newTaskOps(
  input: { title: string; dueOn?: LocalDate },
  deps: Deps,
): { ops: WriteOp[]; taskId: Id } {
  const taskId = deps.newId();
  const record: Task = {
    id: taskId,
    createdAt: deps.now(),
    title: input.title.trim(),
  };
  if (input.dueOn !== undefined && isLocalDate(input.dueOn)) {
    record.dueOn = input.dueOn;
  }
  return { ops: [{ kind: 'put', store: 'tasks', record }], taskId };
}

function isDone(task: Task): boolean {
  const doneAt: unknown = task.doneAt;
  return typeof doneAt === 'string';
}

export function completeTaskOps(task: Task, deps: Deps): WriteOp[] {
  if (isDone(task)) return [];
  return [
    {
      kind: 'put',
      store: 'tasks',
      record: { ...task, doneAt: deps.now() },
    },
  ];
}

export function reopenTaskOps(task: Task): WriteOp[] {
  if (!isDone(task)) return [];
  const record: Task = { ...task };
  delete record.doneAt;
  return [{ kind: 'put', store: 'tasks', record }];
}

export function deleteTaskOps(taskId: Id): WriteOp[] {
  return [{ kind: 'delete', store: 'tasks', id: taskId }];
}

/** Completed tasks, newest first. */
export function doneTasks(data: Snapshot): Task[] {
  return data.tasks.filter(isDone).sort((a, b) => {
    const x = a.doneAt ?? '';
    const y = b.doneAt ?? '';
    if (x !== y) return x < y ? 1 : -1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
