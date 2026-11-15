import { browser } from 'wxt/browser';

export interface FileSaver {
  // Resolves only when the file is fully written; rejects when the download
  // is cancelled or interrupted.
  save(path: string, text: string, options: { saveAs: boolean }): Promise<void>;
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

        const finish = (error?: Error): void => {
          if (finished) return;
          finished = true;
          browser.downloads.onChanged.removeListener(onChanged);
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

        browser.downloads.onChanged.addListener(onChanged);
        browser.downloads
          .download({
            url,
            filename: path,
            saveAs: options.saveAs,
            conflictAction: 'uniquify',
          })
          .then(
            (id) => {
              downloadId = id;
              for (const delta of early) {
                if (delta.id === id) handle(delta);
              }
              early.length = 0;
            },
            (error: unknown) => {
              finish(
                error instanceof Error ? error : new Error('Download failed.'),
              );
            },
          );
      }),
  };
}
