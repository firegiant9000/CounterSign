import type { VNode } from 'preact';
import { useState } from 'preact/hooks';
import type { NewApplicationInput } from '../../core/src/application-ops';
import { newApplicationOps } from '../../core/src/application-ops';
import { isLocalDate, toLocalDate } from '../../core/src/dates';
import { STATUS_KEYS, statusLabel } from '../../core/src/status';
import type { StatusKey } from '../../core/src/status';
import type { Id } from '../../core/src/types';
import { useAppData } from './app-data';
import { Button } from './components/Button';
import { Field } from './components/Field';
import { IndexCard } from './components/IndexCard';

type WhoActs = '' | 'me' | 'them';

export function ApplicationForm(props: { onSaved(id: Id): void }): VNode {
  const app = useAppData();
  const { settings, deps } = app;
  const [companyName, setCompanyName] = useState('');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<StatusKey>('applied');
  const [occurredOn, setOccurredOn] = useState(() => toLocalDate(new Date()));
  const [nextActionDate, setNextActionDate] = useState('');
  const [nextActor, setNextActor] = useState<WhoActs>('');
  const [notes, setNotes] = useState('');
  const [dateError, setDateError] = useState<string | undefined>(undefined);
  const [nextError, setNextError] = useState<string | undefined>(undefined);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const reset = (): void => {
    setCompanyName('');
    setTitle('');
    setUrl('');
    setStatus('applied');
    setOccurredOn(toLocalDate(new Date()));
    setNextActionDate('');
    setNextActor('');
    setNotes('');
  };

  const onSubmit = async (event: Event): Promise<void> => {
    event.preventDefault();
    if (saving) return;
    const badDate = occurredOn !== '' && !isLocalDate(occurredOn);
    const badNext = nextActionDate !== '' && !isLocalDate(nextActionDate);
    setDateError(badDate ? 'Enter a valid date (YYYY-MM-DD).' : undefined);
    setNextError(badNext ? 'Enter a valid date (YYYY-MM-DD).' : undefined);
    setSaveError(undefined);
    if (badDate || badNext) return;

    const input: NewApplicationInput = {
      companyName,
      title,
      url,
      notes,
      status,
    };
    if (occurredOn !== '') input.occurredOn = occurredOn;
    if (nextActionDate !== '') input.nextActionDate = nextActionDate;
    if (nextActor !== '') input.nextActor = nextActor;

    setSaving(true);
    try {
      let id: Id | undefined;
      await app.apply((d) => {
        const result = newApplicationOps(input, d, deps);
        id = result.applicationId;
        return result.ops;
      });
      reset();
      if (id !== undefined) props.onSaved(id);
    } catch (err) {
      setSaveError(
        `Could not save: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <IndexCard title="Add an application">
      <form
        class="app-form"
        onSubmit={(e) => {
          void onSubmit(e);
        }}
      >
        <Field label="Company">
          <input
            type="text"
            value={companyName}
            onInput={(e) => setCompanyName(e.currentTarget.value)}
          />
        </Field>
        <Field label="Title">
          <input
            type="text"
            value={title}
            onInput={(e) => setTitle(e.currentTarget.value)}
          />
        </Field>
        <Field label="URL">
          <input
            type="url"
            value={url}
            onInput={(e) => setUrl(e.currentTarget.value)}
          />
        </Field>
        <Field label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.currentTarget.value as StatusKey)}
          >
            {STATUS_KEYS.map((key) => (
              <option key={key} value={key}>
                {statusLabel(key, settings.statusLabels)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date" error={dateError}>
          <input
            type="date"
            value={occurredOn}
            onInput={(e) => setOccurredOn(e.currentTarget.value)}
          />
        </Field>
        <Field label="Next action date" error={nextError}>
          <input
            type="date"
            value={nextActionDate}
            onInput={(e) => setNextActionDate(e.currentTarget.value)}
          />
        </Field>
        <Field label="Who acts next">
          <select
            value={nextActor}
            onChange={(e) => setNextActor(e.currentTarget.value as WhoActs)}
          >
            <option value="">—</option>
            <option value="me">Me</option>
            <option value="them">Them</option>
          </select>
        </Field>
        <Field label="Notes">
          <textarea
            value={notes}
            onInput={(e) => setNotes(e.currentTarget.value)}
          />
        </Field>
        <div>
          <Button type="submit" variant="primary" disabled={saving}>
            Save
          </Button>
          {saveError ? <span class="field-error">{saveError}</span> : null}
        </div>
      </form>
    </IndexCard>
  );
}
