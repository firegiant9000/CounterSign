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
import { Button } from './components/Button';
import { ContactRow } from './components/ContactRow';
import { TypedLine } from './components/TypedLine';
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
      <ContactRow
        key={contact.id}
        name={str(contact.name)}
        role={str(contact.role)}
        howKnown={props.compact ? '' : str(contact.howKnown)}
        notes=""
        activity={null}
        actions={null}
      />
    );
    return (
      <div class="anyone-here">
        <TypedLine>You know people here:</TypedLine>
        <ul>{contactsAt(data, companyId).map(row)}</ul>
      </div>
    );
  }

  return (
    <div class="anyone-here">
      <TypedLine>Do you know anyone at {name.trim()}?</TypedLine>
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
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => setAdding(true)}
          >
            Add a contact
          </Button>{' '}
          <Button disabled={busy} onClick={() => void checkedNobody()}>
            Checked, nobody
          </Button>
        </div>
      )}
      {errorNode}
    </div>
  );
}
