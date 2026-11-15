import type { Deps, IsoInstant } from '../src/types';

export function fixedDeps(
  start: IsoInstant = '2026-01-05T09:00:00.000Z',
): Deps {
  let ids = 0;
  let ms = new Date(start).getTime();
  return {
    now() {
      const iso = new Date(ms).toISOString();
      ms += 1000;
      return iso;
    },
    newId() {
      ids += 1;
      return `id-${ids}`;
    },
  };
}
