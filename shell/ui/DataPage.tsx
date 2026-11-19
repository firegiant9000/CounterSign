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
import { Button } from './components/Button';
import { Field } from './components/Field';
import { IndexCard } from './components/IndexCard';
import { LedgerSheet, ledgerRowClass } from './components/LedgerSheet';

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
  jobs: 'Jobs',
  statements: 'Statements',
  contacts: 'Contacts',
  contactEvents: 'Contact events',
  tasks: 'Tasks',
  profileFields: 'Profile fields',
  rounds: 'Interview rounds',
  stories: 'Stories',
  weeklyReviews: 'Weekly plans',
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

// Busy flag and the last export/restore outcome live outside the component, so
// leaving the Data page mid-action and coming back still shows them.
interface Outcome {
  busy: boolean;
  restoring: boolean;
  exportError: string | undefined;
  restoreError: string | undefined;
  restored: boolean;
}

let outcome: Outcome = {
  busy: false,
  restoring: false,
  exportError: undefined,
  restoreError: undefined,
  restored: false,
};
const listeners = new Set<() => void>();

function setOutcome(patch: Partial<Outcome>): void {
  outcome = { ...outcome, ...patch };
  listeners.forEach((l) => l());
}

function useOutcome(): Outcome {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = (): void => setTick((n) => n + 1);
    listeners.add(listener);
    // Catch a change made between the first render and this effect.
    listener();
    return () => {
      listeners.delete(listener);
      // A finished result is shown once on return, then cleared.
      if (!outcome.busy) {
        setOutcome({
          restored: false,
          restoreError: undefined,
          exportError: undefined,
        });
      }
    };
  }, []);
  return outcome;
}

export function DataPage(): VNode {
  const app = useAppData();
  const { data, settings, deps, service } = app;
  const { busy, restoring, exportError, restoreError, restored } = useOutcome();
  const fileToken = useRef(0);
  const [storage, setStorage] = useState<PersistenceState | undefined>(
    undefined,
  );
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [pending, setPending] = useState<Pending | undefined>(undefined);
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

  // One shared module-level flag: export, restore and demo changes never
  // overlap, even across a remount. It is set synchronously, so there is no gap.
  const startAction = (): boolean => {
    if (outcome.busy) return false;
    setOutcome({ busy: true });
    return true;
  };
  const endAction = (): void => {
    setOutcome({ busy: false });
  };

  const exportNow = async (): Promise<void> => {
    if (!startAction()) return;
    setOutcome({ exportError: undefined });
    try {
      await service.exportNow();
    } catch (err) {
      setOutcome({ exportError: reasonOf(err) });
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
    setOutcome({ restoreError: undefined, restored: false });
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
    if (!pending || outcome.busy) return;
    const ok = confirm(
      hasCurrentData
        ? 'Replace all current data with the contents of this file? A copy of your current data is saved first.'
        : 'Replace all current data with the contents of this file? You have no data to copy first.',
    );
    if (!ok) return;
    if (!startAction()) return;
    setOutcome({
      restoring: true,
      restoreError: undefined,
      restored: false,
    });
    let failure: string | undefined;
    let swapped = true;
    try {
      await app.restore(pending.file);
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
    }
    setOutcome({
      restoreError: failure,
      restored: swapped && !failure,
      busy: false,
      restoring: false,
    });
  };

  const demo = async (action: 'load' | 'remove'): Promise<void> => {
    if (!startAction()) return;
    setOutcome({
      restored: false,
      restoreError: undefined,
      exportError: undefined,
    });
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

      <IndexCard title="Export" headingLevel={2}>
        <p>Save all your data as a JSON file.</p>
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => {
            void exportNow();
          }}
        >
          Export data
        </Button>
        {exportError ? <span class="field-error">{exportError}</span> : null}
      </IndexCard>

      <IndexCard title="Restore" headingLevel={2}>
        <Field label="Export file">
          <input
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={(e) => {
              void chooseFile(e);
            }}
          />
        </Field>
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
            <LedgerSheet>
              <ul>
                {STORES.map(({ name }) => (
                  <li key={name} class={ledgerRowClass('none')}>
                    {STORE_LABELS[name]}: {pending.counts[name]}
                  </li>
                ))}
              </ul>
            </LedgerSheet>
            {emptied.length > 0 ? (
              <p class="field-error">
                Warning: this file has no records for{' '}
                {emptied.map((n) => STORE_LABELS[n]).join(', ')}, so restoring
                will empty {emptied.length === 1 ? 'it' : 'them'} although you
                currently have records there.
              </p>
            ) : null}
            <p>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => {
                  void replaceAll();
                }}
              >
                Replace all data
              </Button>
            </p>
          </div>
        ) : null}
        {restoring ? <p>Saving a safety copy before restoring…</p> : null}
        {restoreError ? <span class="field-error">{restoreError}</span> : null}
        {restored ? <p>Restored.</p> : null}
      </IndexCard>

      <IndexCard title="Storage" headingLevel={2}>
        <p>{storage ? STORAGE_LINE[storage] : 'Checking storage…'}</p>
      </IndexCard>

      <IndexCard title="Demo data" headingLevel={2}>
        <p>Demo records are fictional.</p>
        {canLoadDemo(data) ? (
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => {
              void demo('load');
            }}
          >
            Load demo data
          </Button>
        ) : null}
        {hasDemoData(data) ? (
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => {
              void demo('remove');
            }}
          >
            Remove demo data
          </Button>
        ) : null}
        {demoError ? <span class="field-error">{demoError}</span> : null}
      </IndexCard>
    </div>
  );
}
