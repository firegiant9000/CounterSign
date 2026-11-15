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
}

export function createWriteQueue(repo: Repository): WriteQueue {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run(build) {
      const result = tail.then(async () => {
        const before = await repo.snapshot();
        const ops = build(before);
        if (ops.length === 0) return before;
        await repo.apply(ops);
        return repo.snapshot();
      });
      tail = result.catch(() => undefined);
      return result;
    },
  };
}
