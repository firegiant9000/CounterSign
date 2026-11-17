import type { VNode } from 'preact';
import { useRef, useState } from 'preact/hooks';
import {
  addContactOps,
  anyoneHereForName,
  contactsAt,
  markCheckedNobodyOps,
  type ContactInput,
} from '../../core/src/contacts';
import type { Contact } from '../../core/src/types';
import { useAppData } from './app-data';
import { ContactForm } from './ContactForm';

// Restored data may hold odd types; render only strings.
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function AnyoneHere(props: {
  companyName: string | undefined;
  compact?: boolean;
}): VNode | null {
  const appData = useAppData();
  const { data, deps } = appData;
  const [busy, setBusy] = useState(false);
  // Set synchronously so a second click before re-render cannot start a write.
  const inFlight = useRef(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [adding, setAdding] = useState(false);

  const name = typeof props.companyName === 'string' ? props.companyName : '';
  const { prompt, companyId } = anyoneHereForName(data, name);

  const run = async (write: () => Promise<void>): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await write();
      return true;
    } catch (err) {
      setError(reasonOf(err));
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const add = async (input: ContactInput): Promise<void> => {
    const ok = await run(() =>
      appData.apply((d) => addContactOps(d, name, input, deps).ops),
    );
    if (ok) setAdding(false);
  };

  const checkedNobody = async (): Promise<void> => {
    await run(() => appData.apply((d) => markCheckedNobodyOps(d, name, deps)));
  };

  const errorNode = error ? (
    <span class="field-error" role="alert">
      {error}
    </span>
  ) : null;

  if (prompt === 'none') return null;

  if (prompt === 'show_contacts' && companyId !== undefined) {
    const row = (contact: Contact): VNode => (
      <li key={contact.id}>
        <strong>{str(contact.name) || '(no name)'}</strong>
        {str(contact.role) ? `, ${str(contact.role)}` : ''}
        {!props.compact && str(contact.howKnown) ? (
          <div>How you know them: {str(contact.howKnown)}</div>
        ) : null}
      </li>
    );
    return (
      <div class="anyone-here">
        <p>You know people here:</p>
        <ul>{contactsAt(data, companyId).map(row)}</ul>
      </div>
    );
  }

  return (
    <div class="anyone-here">
      <p>Do you know anyone at {name.trim()}?</p>
      {adding ? (
        <ContactForm
          submitLabel="Add contact"
          busy={busy}
          onSubmit={(input) => void add(input)}
          onCancel={() => {
            setError(undefined);
            setAdding(false);
          }}
        />
      ) : (
        <div class="popup-actions">
          <button type="button" disabled={busy} onClick={() => setAdding(true)}>
            Add a contact
          </button>{' '}
          <button
            type="button"
            disabled={busy}
            onClick={() => void checkedNobody()}
          >
            Checked, nobody
          </button>
        </div>
      )}
      {errorNode}
    </div>
  );
}
