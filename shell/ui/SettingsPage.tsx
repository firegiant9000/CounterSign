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
import { Button } from './components/Button';
import { Field } from './components/Field';
import { CardSection, IndexCard } from './components/IndexCard';

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
  // Fields the user has typed into since mount or the last successful save.
  // Exactly these are written, so an untouched stale field never overwrites
  // another tab's change.
  const dirty = useRef<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState(false);

  const save = async (): Promise<void> => {
    if (busy) return;
    setSaved(false);
    const sent = new Set(dirty.current);
    const edit: SettingsEdit = {};
    if (sent.has('days')) {
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
      if (sent.has('label:' + key)) {
        changedLabels[key] = labels[key] ?? '';
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
      dirty.current.clear();
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
        <IndexCard title="Settings" headingLevel={2}>
          <CardSection>
            <Field label="Quiet after (days)">
              <input
                type="text"
                value={days}
                disabled={busy}
                onInput={(e) => {
                  dirty.current.add('days');
                  setDays(e.currentTarget.value);
                }}
              />
            </Field>
          </CardSection>
          <CardSection title={<h2>Status names</h2>}>
            {STATUS_KEYS.map((key) => (
              <Field key={key} label={statusLabel(key)}>
                <input
                  type="text"
                  value={labels[key] ?? ''}
                  placeholder={statusLabel(key)}
                  disabled={busy}
                  onInput={(e) => {
                    const text = e.currentTarget.value;
                    dirty.current.add('label:' + key);
                    setLabels((prev) => ({ ...prev, [key]: text }));
                  }}
                />
              </Field>
            ))}
          </CardSection>
          <p>
            <Button variant="primary" type="submit" disabled={busy}>
              Save
            </Button>
          </p>
          {error ? <span class="field-error">{error}</span> : null}
          {saved ? <p>Saved</p> : null}
        </IndexCard>
      </form>
    </div>
  );
}
