import type { Deps } from '../core/src/types';

export function browserDeps(): Deps {
  return {
    now: () => new Date().toISOString(),
    newId: () => crypto.randomUUID(),
  };
}
