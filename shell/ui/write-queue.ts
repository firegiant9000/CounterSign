import type { Repository, WriteOp } from '../../core/src/repository';
import type { Snapshot } from '../../core/src/types';

export type OpsBuilder = (data: Snapshot) => readonly WriteOp[];

export interface WriteQueue {
  /**
   * Runs after every earlier write has settled (resolved or rejected).
   * Reads a fresh repo.snapshot(), calls build(snapshot), applies the ops
   * (skips repo.apply when there are none), re-reads, and resolves with the
   * fresh snapshot. A failure rejects this call only; later calls still run.
   */
  run(build: OpsBuilder): Promise<Snapshot>;
  /**
   * Runs fn as one queue turn: it waits for earlier turns and later turns
   * wait for it. A rejection rejects this call only; later calls still run.
   */
  exclusive<T>(fn: () => Promise<T>): Promise<T>;
}

const LOCK_NAME = 'countersign-write';

/** Holds the cross-tab Web Lock around fn; runs without it where unavailable. */
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks =
    typeof navigator === 'undefined'
      ? undefined
      : (navigator as { locks?: LockManager }).locks;
  if (!locks) return fn();
  return locks.request(LOCK_NAME, fn);
}

export function createWriteQueue(repo: Repository): WriteQueue {
  let tail: Promise<unknown> = Promise.resolve();

  function turn<T>(fn: () => Promise<T>): Promise<T> {
    const result = tail.then(() => withLock(fn));
    tail = result.catch(() => undefined);
    return result;
  }

  return {
    run(build) {
      return turn(async () => {
        const before = await repo.snapshot();
        const ops = build(before);
        if (ops.length === 0) return before;
        await repo.apply(ops);
        return repo.snapshot();
      });
    },
    exclusive: (fn) => turn(fn),
  };
}
