import type { VNode } from 'preact';
import { useState } from 'preact/hooks';
import {
  noResponseDays,
  parseNoResponseDays,
  withStatusLabel,
} from '../../core/src/settings';
import { STATUS_KEYS, statusLabel } from '../../core/src/status';
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState(false);

  const save = async (): Promise<void> => {
    if (busy) return;
    setSaved(false);
    const parsed = parseNoResponseDays(days);
    if (parsed === undefined) {
      setError(DAYS_ERROR);
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      let statusLabels = settings.statusLabels;
      for (const key of STATUS_KEYS) {
        statusLabels = withStatusLabel(statusLabels, key, labels[key] ?? '');
      }
      await app.saveSettings({ noResponseDays: parsed, statusLabels });
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
