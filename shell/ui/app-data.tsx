import { createContext } from 'preact';
import type { ComponentChildren, VNode } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import { missingDefaultAnswers } from '../../core/src/answers';
import type { WriteOp } from '../../core/src/repository';
import type { Deps, Settings, Snapshot } from '../../core/src/types';
import { browserDeps } from '../deps';
import { browserFileSaver } from '../files/download';
import { createDataService } from '../data-service';
import type { DataService } from '../data-service';
import { openIdbRepository } from '../storage/idb-repository';
import { browserLocalArea, loadSettings } from '../storage/settings';
import { createWriteQueue } from './write-queue';
import type { OpsBuilder } from './write-queue';

export interface AppData {
  data: Snapshot;
  settings: Settings;
  deps: Deps;
  service: DataService;
  /** Writes through the queue; a builder gets the fresh snapshot at its turn. Then publishes the new snapshot and tells other tabs. */
  apply(ops: readonly WriteOp[] | OpsBuilder): Promise<void>;
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

  useEffect(() => {
    let cancelled = false;
    let channel: BroadcastChannel | undefined;

    async function start(): Promise<void> {
      const repo = await openIdbRepository();
      const deps = browserDeps();
      const area = browserLocalArea();
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

      const publish = (data: Snapshot, settings: Settings): void => {
        current = { data, settings };
        if (cancelled) return;
        setState({ status: 'ready', value: build() });
      };

      const reload = async (): Promise<void> => {
        const [data, settings] = await Promise.all([
          queue.run(() => []),
          loadSettings(area),
        ]);
        publish(data, settings);
      };

      const build = (): AppData => ({
        data: current.data,
        settings: current.settings,
        deps,
        service,
        async apply(ops) {
          const data = await queue.run(
            typeof ops === 'function' ? ops : () => ops,
          );
          publish(data, current.settings);
          ch.postMessage('changed');
        },
        reload,
        async dataReplaced() {
          const data = await ensureDefaults();
          const settings = await loadSettings(area);
          publish(data, settings);
          ch.postMessage('changed');
        },
      });

      ch.onmessage = () => {
        reload().catch(() => undefined);
      };

      setState({ status: 'ready', value: build() });
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

  if (state.status === 'error') return <p>{state.message}</p>;
  if (state.status === 'loading') return <p>Loading…</p>;
  return (
    <AppDataContext.Provider value={state.value}>
      {props.children}
    </AppDataContext.Provider>
  );
}
