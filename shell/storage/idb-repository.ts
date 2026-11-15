import { openDB } from 'idb';
import type { IDBPDatabase, IDBPTransaction } from 'idb';
import type { Repository, WriteOp } from '../../core/src/repository';
import { SCHEMA_VERSION, STORES } from '../../core/src/schema';
import type { Snapshot, StoreName } from '../../core/src/types';

const DEFAULT_DB_NAME = 'countersign';
const NEWER_VERSION_MESSAGE =
  'This data was written by a newer version of Countersign.';

type Db = IDBPDatabase<unknown>;
type StoreNames = StoreName[];
type Tx = IDBPTransaction<unknown, StoreNames, 'readwrite'>;

function hasId(record: unknown): record is { id: string } {
  if (typeof record !== 'object' || record === null) return false;
  const id = (record as { id?: unknown }).id;
  const createdAt = (record as { createdAt?: unknown }).createdAt;
  return (
    typeof id === 'string' &&
    id !== '' &&
    typeof createdAt === 'string' &&
    createdAt !== ''
  );
}

function isStore(name: unknown): name is StoreName {
  return STORES.some((s) => s.name === name);
}

function validateOps(ops: readonly WriteOp[]): void {
  for (const op of ops) {
    if (!isStore(op.store))
      throw new Error(`Unknown store: ${String(op.store)}`);
    if (op.kind === 'put') {
      if (!hasId(op.record))
        throw new Error(`Record for ${op.store} needs an id and createdAt`);
    } else if (op.kind === 'delete') {
      if (typeof op.id !== 'string' || op.id === '') {
        throw new Error(`Delete for ${op.store} needs an id`);
      }
    } else {
      throw new Error('Unknown op kind');
    }
  }
}

// IndexedDB put() silently merges duplicate ids, so check before clearing.
function validateSnapshot(incoming: Snapshot): void {
  for (const { name } of STORES) {
    const list: unknown = incoming[name];
    if (!Array.isArray(list))
      throw new Error(`Snapshot is missing store ${name}`);
    const seen = new Set<string>();
    for (const record of list) {
      if (!hasId(record))
        throw new Error(`Record in ${name} needs an id and createdAt`);
      if (seen.has(record.id)) {
        throw new Error(`Store ${name} has two records with id ${record.id}`);
      }
      seen.add(record.id);
    }
  }
}

// Runs the writes; on any failure aborts the transaction so nothing is kept.
async function runWrite(
  db: Db,
  stores: StoreNames,
  work: (tx: Tx, queue: (request: Promise<unknown>) => void) => void,
): Promise<void> {
  const tx = db.transaction(stores, 'readwrite');
  const pending: Promise<unknown>[] = [];
  try {
    work(tx, (request) => pending.push(request));
    await Promise.all(pending);
  } catch (err) {
    // Requests queued before the failure reject on abort; mark them handled.
    for (const request of pending) request.catch(() => undefined);
    try {
      tx.abort();
    } catch {
      // already finished or aborted
    }
    await tx.done.catch(() => undefined);
    throw err instanceof Error ? err : new Error(String(err));
  }
  await tx.done;
}

export async function openIdbRepository(
  options: { dbName?: string } = {},
): Promise<Repository> {
  let db: Db;
  try {
    db = await openDB<unknown>(
      options.dbName ?? DEFAULT_DB_NAME,
      SCHEMA_VERSION,
      {
        upgrade(database, oldVersion) {
          for (const { name, since } of STORES) {
            if (since > oldVersion) {
              database.createObjectStore(name, { keyPath: 'id' });
            }
          }
        },
        blocking() {
          // Another tab or a newer version wants to upgrade: release the database.
          db.close();
        },
      },
    );
  } catch (err) {
    if (err instanceof Error && err.name === 'VersionError') {
      throw new Error(NEWER_VERSION_MESSAGE);
    }
    throw err;
  }

  return {
    async snapshot() {
      const tx = db.transaction(
        STORES.map((s) => s.name),
        'readonly',
      );
      const out: Record<string, unknown[]> = {};
      try {
        await Promise.all(
          STORES.map(async ({ name }) => {
            out[name] = await tx.objectStore(name).getAll();
          }),
        );
      } catch (err) {
        // The transaction rejects too; mark it handled so nothing is left over.
        tx.done.catch(() => undefined);
        throw err;
      }
      await tx.done;
      // One narrow cast: every store key was filled above.
      return out as unknown as Snapshot;
    },

    async apply(ops) {
      validateOps(ops);
      if (ops.length === 0) return;
      const stores = [...new Set(ops.map((op) => op.store))];
      await runWrite(db, stores, (tx, queue) => {
        for (const op of ops) {
          const store = tx.objectStore(op.store);
          queue(op.kind === 'put' ? store.put(op.record) : store.delete(op.id));
        }
      });
    },

    async replaceAll(incoming) {
      validateSnapshot(incoming);
      await runWrite(
        db,
        STORES.map((s) => s.name),
        (tx, queue) => {
          for (const { name } of STORES) {
            const store = tx.objectStore(name);
            queue(store.clear());
            for (const record of incoming[name]) queue(store.put(record));
          }
        },
      );
    },
  };
}
