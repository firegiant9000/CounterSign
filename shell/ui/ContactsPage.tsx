import type { VNode } from 'preact';
import { useRef, useState } from 'preact/hooks';
import {
  addContactOps,
  contactsAt,
  deleteContactOps,
  updateContactOps,
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

export function ContactsPage(): VNode {
  const appData = useAppData();
  const { data, deps } = appData;
  const [busy, setBusy] = useState(false);
  // Set synchronously so a second click before re-render cannot start a write.
  const inFlight = useRef(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [companyName, setCompanyName] = useState('');
  // Bumped after a successful add so the form remounts empty.
  const [formKey, setFormKey] = useState(0);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);

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
      appData.apply((d) => addContactOps(d, companyName, input, deps).ops),
    );
    if (ok) {
      setCompanyName('');
      setFormKey((k) => k + 1);
    }
  };

  const save = async (id: string, input: ContactInput): Promise<void> => {
    const ok = await run(() =>
      appData.apply((d) => {
        const fresh = d.contacts.find((c) => c.id === id);
        return fresh ? updateContactOps(fresh, input) : [];
      }),
    );
    if (ok) setEditingId(undefined);
  };

  const remove = async (id: string): Promise<void> => {
    if (inFlight.current) return;
    if (!confirm('Delete this contact?')) return;
    await run(() =>
      appData.apply((d) =>
        d.contacts.some((c) => c.id === id) ? deleteContactOps(d, id) : [],
      ),
    );
  };

  const companies = data.companies
    .map((company) => ({
      id: company.id,
      name: company.name ?? '',
      contacts: contactsAt(data, company.id),
    }))
    .filter((c) => c.contacts.length > 0)
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );

  const row = (contact: Contact): VNode =>
    editingId === contact.id ? (
      <li key={contact.id}>
        <ContactForm
          initial={contact}
          submitLabel="Save"
          busy={busy}
          onSubmit={(input) => void save(contact.id, input)}
          onCancel={() => setEditingId(undefined)}
        />
      </li>
    ) : (
      <li key={contact.id}>
        <strong>{str(contact.name) || '(no name)'}</strong>
        {str(contact.role) ? `, ${str(contact.role)}` : ''}
        {str(contact.howKnown) ? (
          <div>How you know them: {str(contact.howKnown)}</div>
        ) : null}
        {str(contact.notes) ? <div>{str(contact.notes)}</div> : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => setEditingId(contact.id)}
        >
          Edit
        </button>{' '}
        <button
          type="button"
          disabled={busy}
          onClick={() => void remove(contact.id)}
        >
          Delete
        </button>
      </li>
    );

  return (
    <div class="data-page">
      <h1>Contacts</h1>
      <section class="data-section">
        <h2>Add a contact</h2>
        <label>
          Company
          <input
            type="text"
            list="contact-companies"
            value={companyName}
            disabled={busy}
            onInput={(e) => setCompanyName(e.currentTarget.value)}
          />
        </label>
        <datalist id="contact-companies">
          {data.companies
            .filter((c) => c.name)
            .map((c) => (
              <option key={c.id} value={c.name} />
            ))}
        </datalist>
        <ContactForm
          key={formKey}
          submitLabel="Add contact"
          busy={busy}
          onSubmit={(input) => void add(input)}
        />
      </section>
      {error ? (
        <span class="field-error" role="alert">
          {error}
        </span>
      ) : null}
      {companies.length === 0 ? (
        <p>No contacts yet.</p>
      ) : (
        companies.map((company) => (
          <section class="data-section" key={company.id}>
            <h2>{company.name || '(no company)'}</h2>
            <ul>{company.contacts.map(row)}</ul>
          </section>
        ))
      )}
    </div>
  );
}
