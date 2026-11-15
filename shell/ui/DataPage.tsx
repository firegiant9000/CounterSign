import type { VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { toLocalDate } from '../../core/src/dates';
import {
  buildDemoOps,
  canLoadDemo,
  hasDemoData,
  removeDemoOps,
} from '../../core/src/demo';
import { emptiedStores, parseExport } from '../../core/src/export';
import type { ExportFile } from '../../core/src/export';
import { STORES } from '../../core/src/schema';
import type { StoreName } from '../../core/src/types';
import { requestPersistence } from '../storage/persistence';
import type { PersistenceState } from '../storage/persistence';
import { useAppData } from './app-data';

interface Pending {
  fileName: string;
  file: ExportFile;
  counts: Record<StoreName, number>;
}

const STORAGE_LINE: Record<PersistenceState, string> = {
  persistent: 'Storage is protected from eviction.',
  'best-effort': 'Storage is best-effort; keep exports.',
  unknown: 'Storage status is unknown; keep exports.',
};

const STORE_LABELS: Record<StoreName, string> = {
  companies: 'Companies',
  applications: 'Applications',
  statusEvents: 'Status events',
  documents: 'Documents',
  canonicalAnswers: 'Canonical answers',
};

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function exportDateOf(file: ExportFile): string {
  const at: unknown = file.exportedAt;
  if (typeof at !== 'string' || at === '' || Number.isNaN(Date.parse(at))) {
    return 'unknown date';
  }
  return new Date(at).toLocaleString();
}

export function DataPage(): VNode {
  const app = useAppData();
  const { data, settings, deps, service } = app;
  const busyRef = useRef(false);
  const fileToken = useRef(0);
  const [storage, setStorage] = useState<PersistenceState | undefined>(
    undefined,
  );
  const [exportError, setExportError] = useState<string | undefined>(undefined);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [pending, setPending] = useState<Pending | undefined>(undefined);
  const [restoreError, setRestoreError] = useState<string | undefined>(
    undefined,
  );
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState(false);
  const [demoError, setDemoError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    requestPersistence()
      .then((state) => {
        if (!cancelled) setStorage(state);
      })
      .catch(() => {
        if (!cancelled) setStorage('unknown');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // One shared flag: export, restore and demo changes never overlap. The ref
  // closes the gap before the state update re-renders.
  const startAction = (): boolean => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    return true;
  };
  const endAction = (): void => {
    busyRef.current = false;
    setBusy(false);
  };

  const exportNow = async (): Promise<void> => {
    if (!startAction()) return;
    setExportError(undefined);
    try {
      await service.exportNow();
    } catch (err) {
      setExportError(reasonOf(err));
    } finally {
      endAction();
    }
  };

  const chooseFile = async (event: Event): Promise<void> => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    const token = ++fileToken.current;
    // Clear the selection so the same file can be chosen again.
    input.value = '';
    setPending(undefined);
    setParseErrors([]);
    setRestoreError(undefined);
    setRestored(false);
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch (err) {
      if (token !== fileToken.current) return;
      setParseErrors([`The file could not be read: ${reasonOf(err)}`]);
      return;
    }
    if (token !== fileToken.current) return;
    const result = parseExport(text);
    if (!result.ok) {
      setParseErrors(result.errors);
      return;
    }
    setPending({
      fileName: file.name,
      file: result.file,
      counts: result.counts,
    });
  };

  const hasCurrentData =
    STORES.some(({ name }) => data[name].length > 0) ||
    Object.keys(settings).length > 0;

  const replaceAll = async (): Promise<void> => {
    if (!pending || busyRef.current) return;
    const ok = confirm(
      hasCurrentData
        ? 'Replace all current data with the contents of this file? A copy of your current data is saved first.'
        : 'Replace all current data with the contents of this file? You have no data to copy first.',
    );
    if (!ok) return;
    if (!startAction()) return;
    setRestoreError(undefined);
    setRestored(false);
    let failure: string | undefined;
    let swapped = true;
    try {
      await service.restore(pending.file);
    } catch (err) {
      const message = reasonOf(err);
      failure = message;
      swapped = message.startsWith('Data was restored');
      if (!swapped) failure = `${message} Nothing was changed.`;
    }
    if (swapped) {
      try {
        await app.dataReplaced();
      } catch (err) {
        failure = `${failure ? `${failure} ` : ''}The data was restored, but this page could not refresh: ${reasonOf(err)}. Reload the page.`;
      }
      setPending(undefined);
      setParseErrors([]);
      if (!failure) setRestored(true);
    }
    setRestoreError(failure);
    endAction();
  };

  const demo = async (action: 'load' | 'remove'): Promise<void> => {
    if (!startAction()) return;
    setDemoError(undefined);
    try {
      await app.apply((d) =>
        action === 'load'
          ? canLoadDemo(d)
            ? buildDemoOps(toLocalDate(new Date()), deps)
            : []
          : removeDemoOps(d),
      );
    } catch (err) {
      setDemoError(reasonOf(err));
    } finally {
      endAction();
    }
  };

  const emptied = pending ? emptiedStores(data, pending.counts) : [];

  return (
    <div class="data-page">
      <h1>Data</h1>

      <section class="data-section">
        <h2>Export</h2>
        <p>Save all your data as a JSON file.</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            void exportNow();
          }}
        >
          Export data
        </button>
        {exportError ? <span class="field-error">{exportError}</span> : null}
      </section>

      <section class="data-section">
        <h2>Restore</h2>
        <label>
          Export file
          <input
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={(e) => {
              void chooseFile(e);
            }}
          />
        </label>
        {parseErrors.length > 0 ? (
          <ul class="field-error">
            {parseErrors.map((message, i) => (
              <li key={i}>{message}</li>
            ))}
          </ul>
        ) : null}
        {pending ? (
          <div class="restore-summary">
            <p>
              {pending.fileName}: exported {exportDateOf(pending.file)}.
            </p>
            <ul>
              {STORES.map(({ name }) => (
                <li key={name}>
                  {STORE_LABELS[name]}:{pending.counts[name]}
                </li>
              ))}
            </ul>
            {emptied.length > 0 ? (
              <p class="field-error">
                Warning: this file has no records for{' '}
                {emptied.map((n) => STORE_LABELS[n]).join(', ')}, so restoring
                will empty {emptied.length === 1 ? 'it' : 'them'} although you
                currently have records there.
              </p>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void replaceAll();
              }}
            >
              Replace all data
            </button>
          </div>
        ) : null}
        {restoreError ? <span class="field-error">{restoreError}</span> : null}
        {restored ? <p>Restored.</p> : null}
      </section>

      <section class="data-section">
        <h2>Storage</h2>
        <p>{storage ? STORAGE_LINE[storage] : 'Checking storage…'}</p>
      </section>

      <section class="data-section">
        <h2>Demo data</h2>
        <p>Demo records are fictional.</p>
        {canLoadDemo(data) ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void demo('load');
            }}
          >
            Load demo data
          </button>
        ) : null}
        {hasDemoData(data) ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void demo('remove');
            }}
          >
            Remove demo data
          </button>
        ) : null}
        {demoError ? <span class="field-error">{demoError}</span> : null}
      </section>
    </div>
  );
}
