import type { VNode } from 'preact';
import { useRef, useState } from 'preact/hooks';
import {
  applySettingsEdit,
  noResponseDays,
  parseNoResponseDays,
} from '../../core/src/settings';
import type { SettingsEdit } from '../../core/src/settings';
import { STATUS_KEYS, statusLabel } from '../../core/src/status';
import type { StatusKey } from '../../core/src/status';
import { useAppData } from './app-data';

const DAYS_ERROR = 'Enter a whole number of days from 1 to 365.';

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function SettingsPage(): VNode {
  const app = useAppData();
  const { settings } = app;
  // Inputs start from the settings at mount and are not reset by later reloads,
  // so another tab's change never wipes what is being typed.
  const [days, setDays] = useState(() => String(noResponseDays(settings)));
  const [labels, setLabels] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      STATUS_KEYS.map((key) => [key, statusLabel(key, settings.statusLabels)]),
    ),
  );
  // The texts last mounted or saved; only inputs that differ from these are
  // written, so a stale form never overwrites another tab's changes.
  const baseline = useRef<{ days: string; labels: Record<string, string> }>({
    days,
    labels,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState(false);

  const save = async (): Promise<void> => {
    if (busy) return;
    setSaved(false);
    const edit: SettingsEdit = {};
    if (days !== baseline.current.days) {
      const parsed = parseNoResponseDays(days);
      if (parsed === undefined) {
        setError(DAYS_ERROR);
        return;
      }
      edit.noResponseDays = parsed;
    }
    const changedLabels: Partial<Record<StatusKey, string>> = {};
    let labelsChanged = false;
    for (const key of STATUS_KEYS) {
      const text = labels[key] ?? '';
      if (text !== (baseline.current.labels[key] ?? '')) {
        changedLabels[key] = text;
        labelsChanged = true;
      }
    }
    if (labelsChanged) edit.statusLabels = changedLabels;
    setError(undefined);
    if (edit.noResponseDays === undefined && !labelsChanged) {
      setSaved(true);
      return;
    }
    setBusy(true);
    try {
      await app.saveSettings((cur) => applySettingsEdit(cur, edit));
      baseline.current = { days, labels };
      setSaved(true);
    } catch (err) {
      setError(reasonOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="data-page">
      <h1>Settings</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <section class="data-section">
          <label>
            Quiet after (days)
            <input
              type="text"
              value={days}
              disabled={busy}
              onInput={(e) => setDays(e.currentTarget.value)}
            />
          </label>
        </section>
        <section class="data-section">
          <h2>Status names</h2>
          {STATUS_KEYS.map((key) => (
            <label key={key}>
              {statusLabel(key)}
              <input
                type="text"
                value={labels[key] ?? ''}
                placeholder={statusLabel(key)}
                disabled={busy}
                onInput={(e) => {
                  const text = e.currentTarget.value;
                  setLabels((prev) => ({ ...prev, [key]: text }));
                }}
              />
            </label>
          ))}
        </section>
        <button type="submit" disabled={busy}>
          Save
        </button>
        {error ? <span class="field-error">{error}</span> : null}
        {saved ? <p>Saved</p> : null}
      </form>
    </div>
  );
}
