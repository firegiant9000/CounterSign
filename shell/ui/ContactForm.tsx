import type { VNode } from 'preact';
import { useState } from 'preact/hooks';
import type { ContactInput } from '../../core/src/contacts';

export function ContactForm(props: {
  initial?: ContactInput;
  submitLabel: string;
  busy: boolean;
  onSubmit: (input: ContactInput) => void;
  onCancel?: () => void;
}): VNode {
  const { initial, submitLabel, busy, onSubmit, onCancel } = props;
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
      <label>
        Name
        <input
          type="text"
          value={name}
          disabled={busy}
          onInput={(e) => setName(e.currentTarget.value)}
        />
        {nameError ? (
          <span class="field-error" role="alert">
            {nameError}
          </span>
        ) : null}
      </label>
      <label>
        Role
        <input
          type="text"
          value={role}
          disabled={busy}
          onInput={(e) => setRole(e.currentTarget.value)}
        />
      </label>
      <label>
        How you know them
        <input
          type="text"
          value={howKnown}
          disabled={busy}
          onInput={(e) => setHowKnown(e.currentTarget.value)}
        />
      </label>
      <label>
        Notes
        <textarea
          value={notes}
          disabled={busy}
          onInput={(e) => setNotes(e.currentTarget.value)}
        />
      </label>
      <div>
        <button type="submit" disabled={busy}>
          {submitLabel}
        </button>
        {onCancel ? (
          <button type="button" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
