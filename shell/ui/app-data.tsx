import { createContext } from 'preact';
import type { ComponentChildren, VNode } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import { missingDefaultAnswers } from '../../core/src/answers';
import type { WriteOp } from '../../core/src/repository';
import type { Deps, Settings, Snapshot } from '../../core/src/types';
import type { ExportFile } from '../../core/src/export';
import { browserDeps } from '../deps';
import { browserFileSaver } from '../files/download';
import { createDataService } from '../data-service';
import type { DataService } from '../data-service';
import { recordWrite } from '../storage/backup-state';
import { openIdbRepository } from '../storage/idb-repository';
import {
  browserLocalArea,
  loadSettings,
  saveSettings as storeSettings,
} from '../storage/settings';
import { createWriteQueue } from './write-queue';
import type { OpsBuilder } from './write-queue';

export interface AppData {
  data: Snapshot;
  settings: Settings;
  deps: Deps;
  service: DataService;
  /** Writes through the queue; a builder gets the fresh snapshot at its turn. Then publishes the new snapshot and tells other tabs. */
  apply(ops: readonly WriteOp[] | OpsBuilder): Promise<void>;
  /** Restores an export as one exclusive queue turn, so no write is lost. Call dataReplaced() afterwards. */
  restore(file: ExportFile): Promise<void>;
  /** Loads the stored settings, applies update to them and saves the result in one exclusive queue turn (under the write lock), then reloads and tells other tabs. Other tabs are told even if the reload fails; that error is then rethrown. */
  saveSettings(update: (current: Settings) => Settings): Promise<void>;
  /** Re-reads snapshot and settings. Does not broadcast. */
  reload(): Promise<void>;
  /** After a restore (Task 18): ensure default answers, reload snapshot and settings, tell other tabs. */
  dataReplaced(): Promise<void>;
}

const CHANNEL_NAME = 'countersign-data';

const AppDataContext = createContext<AppData | undefined>(undefined);

export function useAppData(): AppData {
  const value = useContext(AppDataContext);
  if (!value) throw new Error('useAppData used outside AppDataProvider');
  return value;
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; value: AppData };

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function AppDataProvider(props: { children: ComponentChildren }): VNode {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [notice, setNotice] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    let channel: BroadcastChannel | undefined;

    async function start(): Promise<void> {
      const deps = browserDeps();
      const area = browserLocalArea();
      const repo = await openIdbRepository({
        onWrite: () => recordWrite(area, deps.now()),
      });
      const service = createDataService({
        repo,
        area,
        saver: browserFileSaver(),
        clock: deps,
      });
      const queue = createWriteQueue(repo);

      const ensureDefaults = (): Promise<Snapshot> =>
        queue.run((d) =>
          missingDefaultAnswers(d.canonicalAnswers, deps).map(
            (record): WriteOp => ({
              kind: 'put',
              store: 'canonicalAnswers',
              record,
            }),
          ),
        );

      const initial = await ensureDefaults();
      const initialSettings = await loadSettings(area);
      if (cancelled) return;

      const ch = new BroadcastChannel(CHANNEL_NAME);
      channel = ch;

      let current: { data: Snapshot; settings: Settings } = {
        data: initial,
        settings: initialSettings,
      };

      // Operations start in call order and the queue runs them in that
      // order, so a higher sequence number always holds newer data. A slower
      // earlier operation must not publish over a later one.
      let started = 0;
      let published = 0;

      const publish = (
        seq: number,
        data: Snapshot,
        settings: Settings,
      ): void => {
        if (seq < published) return;
        published = seq;
        current = { data, settings };
        if (cancelled) return;
        setNotice(undefined);
        setState({ status: 'ready', value: view() });
      };

      const tellOtherTabs = (): void => {
        if (cancelled) return;
        try {
          ch.postMessage('changed');
        } catch {
          // The write is already stored; other tabs just will not hear of it.
        }
      };

      const reload = async (): Promise<void> => {
        const seq = ++started;
        const data = await queue.run(() => []);
        const settings = await loadSettings(area);
        publish(seq, data, settings);
      };

      const apply: AppData['apply'] = async (ops) => {
        const seq = ++started;
        const data = await queue.run(
          typeof ops === 'function' ? ops : () => ops,
        );
        publish(seq, data, current.settings);
        tellOtherTabs();
      };

      const dataReplaced: AppData['dataReplaced'] = async () => {
        const seq = ++started;
        const data = await ensureDefaults();
        const settings = await loadSettings(area);
        publish(seq, data, settings);
        tellOtherTabs();
      };

      const restore: AppData['restore'] = (file) =>
        queue.exclusive(() => service.restore(file));

      const saveSettings: AppData['saveSettings'] = async (update) => {
        await queue.exclusive(async () => {
          const loaded = await loadSettings(area);
          await storeSettings(area, update(loaded));
        });
        try {
          await reload();
        } finally {
          tellOtherTabs();
        }
      };

      // Callbacks are created once; only data and settings change per publish.
      const view = (): AppData => ({
        data: current.data,
        settings: current.settings,
        deps,
        service,
        apply,
        restore,
        saveSettings,
        reload,
        dataReplaced,
      });

      ch.onmessage = () => {
        reload().catch((err: unknown) => {
          console.error('Countersign: cross-tab reload failed', err);
          if (!cancelled) {
            setNotice(
              `Another tab changed the data, but this tab could not reload it: ${messageOf(err)}. Reload the page.`,
            );
          }
        });
      };

      setState({ status: 'ready', value: view() });
    }

    start().catch((err: unknown) => {
      if (!cancelled) {
        setState({
          status: 'error',
          message: `Countersign could not open its database: ${messageOf(err)}`,
        });
      }
    });

    return () => {
      cancelled = true;
      channel?.close();
    };
  }, []);

  if (state.status === 'error')
    return <p class="cs-app-message">{state.message}</p>;
  if (state.status === 'loading') return <p class="cs-app-message">Loading…</p>;
  return (
    <AppDataContext.Provider value={state.value}>
      {notice ? <p class="cs-app-message">{notice}</p> : null}
      {props.children}
    </AppDataContext.Provider>
  );
}
