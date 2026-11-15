import type { Repository, WriteOp } from './repository';
import { STORES, emptySnapshot } from './schema';
import type { BaseRecord, Snapshot, StoreName } from './types';

// Records are plain JSON data, so a JSON round trip is a safe deep copy.
// (structuredClone is not typed under core's lib-only ES2023 config.)
function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function hasId(record: unknown): record is BaseRecord {
  if (typeof record !== 'object' || record === null) return false;
  const id = (record as { id?: unknown }).id;
  return typeof id === 'string' && id !== '';
}

function isStore(name: unknown): name is StoreName {
  return STORES.some((s) => s.name === name);
}

// Validation errors must surface as rejections, never synchronous throws.
function settle(work: () => void): Promise<void> {
  try {
    work();
    return Promise.resolve();
  } catch (err) {
    return Promise.reject(err instanceof Error ? err : new Error(String(err)));
  }
}

export function createMemoryRepository(): Repository {
  let data: Snapshot = emptySnapshot();

  function applySync(ops: readonly WriteOp[]): void {
    for (const op of ops) {
      if (!isStore(op.store))
        throw new Error(`Unknown store: ${String(op.store)}`);
      if (op.kind === 'put') {
        if (!hasId(op.record))
          throw new Error(`Record for ${op.store} needs an id`);
      } else if (op.kind === 'delete') {
        if (typeof op.id !== 'string' || op.id === '') {
          throw new Error(`Delete for ${op.store} needs an id`);
        }
      } else {
        throw new Error('Unknown op kind');
      }
    }
    const next = copy(data);
    for (const op of ops) {
      // Per-store arrays hold different record types; operate on BaseRecord here.
      const list = next[op.store] as BaseRecord[];
      if (op.kind === 'put') {
        const record = copy<BaseRecord>(op.record);
        const at = list.findIndex((r) => r.id === record.id);
        if (at >= 0) list[at] = record;
        else list.push(record);
      } else {
        const at = list.findIndex((r) => r.id === op.id);
        if (at >= 0) list.splice(at, 1);
      }
    }
    data = next;
  }

  function replaceAllSync(incoming: Snapshot): void {
    for (const { name } of STORES) {
      const list: unknown = incoming[name];
      if (!Array.isArray(list))
        throw new Error(`Snapshot is missing store ${name}`);
      for (const record of list) {
        if (!hasId(record)) throw new Error(`Record in ${name} needs an id`);
      }
    }
    data = copy(incoming);
  }

  return {
    snapshot: () => Promise.resolve(copy(data)),
    apply: (ops) => settle(() => applySync(ops)),
    replaceAll: (incoming) => settle(() => replaceAllSync(incoming)),
  };
}
