import type { VNode } from 'preact';
import { useRef, useState } from 'preact/hooks';
import {
  addContactOps,
  contactsAt,
  deleteContactOps,
  updateContactOps,
  type ContactInput,
} from '../../core/src/contacts';
import { isTarget, setTargetOps } from '../../core/src/targets';
import type { Contact } from '../../core/src/types';
import { useAppData } from './app-data';
import { ContactActivity } from './ContactActivity';
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
  // The contact as it was when Edit opened; the form seeds from this too.
  const [opened, setOpened] = useState<Contact | undefined>(undefined);

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
    // Send only the fields changed since the form opened, so another tab's
    // edits to untouched fields survive.
    const base = opened?.id === id ? opened : undefined;
    const patch: ContactInput = {};
    for (const key of ['name', 'role', 'howKnown', 'notes'] as const) {
      if (!base || input[key] !== str(base[key])) patch[key] = input[key];
    }
    if (Object.keys(patch).length === 0) {
      setEditingId(undefined);
      return;
    }
    const ok = await run(() =>
      appData.apply((d) => {
        const fresh = d.contacts.find((c) => c.id === id);
        return fresh ? updateContactOps(fresh, patch) : [];
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

  const toggleTarget = async (id: string, flag: boolean): Promise<void> => {
    await run(() =>
      appData.apply((d) => {
        const fresh = d.companies.find((c) => c.id === id);
        return fresh ? setTargetOps(fresh, flag) : [];
      }),
    );
  };

  const companies = data.companies
    .map((company) => ({
      id: company.id,
      name: typeof company.name === 'string' ? company.name : '',
      isTarget: isTarget(company),
      contacts: contactsAt(data, company.id),
    }))
    .filter((c) => c.contacts.length > 0)
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );

  // Contacts whose company is missing still show, in a last group.
  const knownIds = new Set(data.companies.map((c) => c.id));
  const orphans = data.contacts
    .filter((c) => c.companyId === undefined || !knownIds.has(c.companyId))
    .sort((a, b) =>
      str(a.name).localeCompare(str(b.name), undefined, {
        sensitivity: 'base',
      }),
    );

  const row = (contact: Contact): VNode =>
    editingId === contact.id ? (
      <li key={contact.id}>
        <ContactForm
          initial={opened?.id === contact.id ? opened : contact}
          submitLabel="Save"
          busy={busy}
          onSubmit={(input) => void save(contact.id, input)}
          onCancel={() => {
            setError(undefined);
            setEditingId(undefined);
          }}
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
        <ContactActivity contact={contact} />
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setOpened(contact);
            setEditingId(contact.id);
          }}
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
        <ContactForm
          key={formKey}
          submitLabel="Add contact"
          busy={busy}
          onSubmit={(input) => void add(input)}
        >
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
        </ContactForm>
      </section>
      {error ? (
        <span class="field-error" role="alert">
          {error}
        </span>
      ) : null}
      {companies.length === 0 && orphans.length === 0 ? (
        <p>No contacts yet.</p>
      ) : (
        companies.map((company) => (
          <section class="data-section" key={company.id}>
            <h2>{company.name || '(no company)'}</h2>
            <button
              type="button"
              disabled={busy}
              onClick={() => void toggleTarget(company.id, !company.isTarget)}
            >
              {company.isTarget ? 'Remove target' : 'Mark as target'}
            </button>
            <ul>{company.contacts.map(row)}</ul>
          </section>
        ))
      )}
      {orphans.length > 0 ? (
        <section class="data-section">
          <h2>(unknown company)</h2>
          <ul>{orphans.map(row)}</ul>
        </section>
      ) : null}
    </div>
  );
}
