import { buildExport, exportFileName } from '../core/src/export';
import type { ExportFile } from '../core/src/export';
import type { Repository } from '../core/src/repository';
import { STORES } from '../core/src/schema';
import type { Deps } from '../core/src/types';
import type { FileSaver } from './files/download';
import { loadSettings, saveSettings } from './storage/settings';
import type { KeyValueArea } from './storage/settings';

const SAFETY_COPY_TIMEOUT_MS = 60_000;

export interface DataService {
  exportNow(): Promise<void>;
  restore(file: ExportFile): Promise<void>;
}

export function createDataService(deps: {
  repo: Repository;
  area: KeyValueArea;
  saver: FileSaver;
  clock: Pick<Deps, 'now'>;
}): DataService {
  const { repo, area, saver, clock } = deps;

  // One clock reading per operation, so a file name matches its contents.
  async function currentAsFile(
    now: string,
  ): Promise<{ file: ExportFile; empty: boolean }> {
    const data = await repo.snapshot();
    const settings = await loadSettings(area);
    const empty =
      STORES.every(({ name }) => data[name].length === 0) &&
      Object.keys(settings).length === 0;
    return { file: buildExport(data, settings, { now: () => now }), empty };
  }

  return {
    async exportNow() {
      const now = clock.now();
      const { file } = await currentAsFile(now);
      await saver.save(
        exportFileName('export', now),
        JSON.stringify(file, null, 2),
        { saveAs: true },
      );
    },

    async restore(file) {
      const now = clock.now();
      const { file: current, empty } = await currentAsFile(now);
      if (!empty) {
        // Restore holds the write lock, so a stalled download must not wait forever.
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(
              new Error(
                'The safety copy did not finish saving within 60 seconds.',
              ),
            );
          }, SAFETY_COPY_TIMEOUT_MS);
        });
        try {
          await Promise.race([
            saver.save(
              `Countersign/${exportFileName('pre-restore', now)}`,
              JSON.stringify(current, null, 2),
              { saveAs: false },
            ),
            timeout,
          ]);
        } finally {
          clearTimeout(timer);
        }
      }
      await repo.replaceAll(file.data);
      try {
        await saveSettings(area, file.settings);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Data was restored, but settings were not saved: ${reason}`,
        );
      }
    },
  };
}
