import type { ComponentChildren, VNode } from 'preact';
import { useState } from 'preact/hooks';
import type { ContactInput } from '../../core/src/contacts';
import { Button } from './components/Button';
import { Field } from './components/Field';

export function ContactForm(props: {
  initial?: ContactInput;
  submitLabel: string;
  busy: boolean;
  onSubmit: (input: ContactInput) => void;
  onCancel?: () => void;
  // Extra fields rendered first, inside the form so Enter submits it.
  children?: ComponentChildren;
}): VNode {
  const { initial, submitLabel, busy, onSubmit, onCancel, children } = props;
  // Restored data may hold odd types; only strings seed the fields.
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const [name, setName] = useState(str(initial?.name));
  const [role, setRole] = useState(str(initial?.role));
  const [howKnown, setHowKnown] = useState(str(initial?.howKnown));
  const [notes, setNotes] = useState(str(initial?.notes));
  const [nameError, setNameError] = useState<string | undefined>(undefined);

  const submit = (event: Event): void => {
    event.preventDefault();
    if (busy) return;
    if (name.trim() === '') {
      setNameError('Enter a name.');
      return;
    }
    setNameError(undefined);
    // All four keys are always sent so a cleared field removes the stored one.
    onSubmit({ name, role, howKnown, notes });
  };

  return (
    <form class="app-form" onSubmit={submit}>
      {children}
      <Field label="Name" error={nameError}>
        <input
          type="text"
          value={name}
          disabled={busy}
          onInput={(e) => setName(e.currentTarget.value)}
        />
      </Field>
      <Field label="Role">
        <input
          type="text"
          value={role}
          disabled={busy}
          onInput={(e) => setRole(e.currentTarget.value)}
        />
      </Field>
      <Field label="How you know them">
        <input
          type="text"
          value={howKnown}
          disabled={busy}
          onInput={(e) => setHowKnown(e.currentTarget.value)}
        />
      </Field>
      <Field label="Notes">
        <textarea
          value={notes}
          disabled={busy}
          onInput={(e) => setNotes(e.currentTarget.value)}
        />
      </Field>
      <div>
        <Button variant="primary" type="submit" disabled={busy}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
