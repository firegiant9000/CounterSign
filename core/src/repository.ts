import type { Id, Snapshot, StoreMap, StoreName } from './types';

export type WriteOp = {
  [S in StoreName]:
    | { kind: 'put'; store: S; record: StoreMap[S] }
    | { kind: 'delete'; store: S; id: Id };
}[StoreName];

export interface Repository {
  snapshot(): Promise<Snapshot>; // every record of every store, as copies
  apply(ops: readonly WriteOp[]): Promise<void>; // all or nothing
  replaceAll(data: Snapshot): Promise<void>; // all or nothing; restore only
}
