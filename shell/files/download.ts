import { browser } from 'wxt/browser';

export interface FileSaver {
  // Resolves only when the file is fully written; rejects when the download
  // is cancelled or interrupted.
  save(
    path: string,
    text: string,
    options: { saveAs: boolean; conflictAction?: 'uniquify' | 'overwrite' },
  ): Promise<void>;
}

interface DownloadDelta {
  id: number;
  state?: { current?: string };
}

export function browserFileSaver(): FileSaver {
  return {
    save: (path, text, options) =>
      new Promise<void>((resolve, reject) => {
        const url = URL.createObjectURL(
          new Blob([text], { type: 'application/json' }),
        );
        if (!url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
          reject(new Error('Could not prepare the file for download.'));
          return;
        }

        let downloadId: number | undefined;
        // onChanged can fire before download() resolves; keep what arrives.
        const early: DownloadDelta[] = [];
        let finished = false;

        const earlyErased: number[] = [];
        const ERASED_MESSAGE = 'The download was removed before it finished.';

        const finish = (error?: Error): void => {
          if (finished) return;
          finished = true;
          browser.downloads.onChanged.removeListener(onChanged);
          browser.downloads.onErased.removeListener(onErased);
          URL.revokeObjectURL(url);
          if (error) reject(error);
          else resolve();
        };

        const handle = (delta: DownloadDelta): void => {
          const state = delta.state?.current;
          if (state === 'complete') finish();
          else if (state === 'interrupted') {
            finish(new Error('The download was interrupted or cancelled.'));
          }
        };

        function onChanged(delta: DownloadDelta): void {
          if (downloadId === undefined) early.push(delta);
          else if (delta.id === downloadId) handle(delta);
        }

        function onErased(id: number): void {
          if (downloadId === undefined) earlyErased.push(id);
          else if (id === downloadId) finish(new Error(ERASED_MESSAGE));
        }

        // The item may already be done by the time we start listening.
        const checkCurrentState = (id: number): void => {
          browser.downloads.search({ id }).then(
            (items) => {
              const state = items[0]?.state;
              if (state === 'complete') finish();
              else if (state === 'interrupted') {
                finish(new Error('The download was interrupted or cancelled.'));
              }
            },
            () => undefined,
          );
        };

        try {
          browser.downloads.onChanged.addListener(onChanged);
          browser.downloads.onErased.addListener(onErased);
          browser.downloads
            .download({
              url,
              filename: path,
              saveAs: options.saveAs,
              conflictAction: options.conflictAction ?? 'uniquify',
            })
            .then(
              (id) => {
                downloadId = id;
                for (const delta of early) {
                  if (delta.id === id) handle(delta);
                }
                early.length = 0;
                if (earlyErased.includes(id)) {
                  finish(new Error(ERASED_MESSAGE));
                }
                earlyErased.length = 0;
                checkCurrentState(id);
              },
              (error: unknown) => {
                finish(
                  error instanceof Error
                    ? error
                    : new Error('Download failed.'),
                );
              },
            );
        } catch (error: unknown) {
          finish(
            error instanceof Error ? error : new Error('Download failed.'),
          );
        }
      }),
  };
}
