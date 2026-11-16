import type { VNode } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { backupStatus } from '../../core/src/backup';
import type { BackupState } from '../../core/src/backup';
import { loadBackupState, onBackupStateChanged } from '../storage/backup-state';
import { browserLocalArea } from '../storage/settings';
import { useAppData } from './app-data';

type Loaded =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; state: BackupState };

export function BackupStatus(): VNode | null {
  const { deps } = useAppData();
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });

  useEffect(() => {
    let active = true;
    let pushed = false;
    const unsubscribe = onBackupStateChanged((state) => {
      pushed = true;
      if (active) setLoaded({ kind: 'ready', state });
    });
    loadBackupState(browserLocalArea()).then(
      (state) => {
        if (active && !pushed) setLoaded({ kind: 'ready', state });
      },
      (err: unknown) => {
        if (active) {
          setLoaded({
            kind: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (loaded.kind === 'loading') return null;
  if (loaded.kind === 'error') {
    return (
      <p class="backup-status warn">
        Could not read the backup status: {loaded.message}
      </p>
    );
  }

  const status = backupStatus(loaded.state, deps.now());
  let text = status.text;
  if (status.failure !== undefined) {
    text += ` The last attempt failed: ${status.failure.replace(/\.$/, '')}. It will try again within a day.`;
  }
  if (status.warn) {
    text += ' Export from the Data page if you need a copy now.';
  }
  return (
    <p class={status.warn ? 'backup-status warn' : 'backup-status'}>{text}</p>
  );
}
