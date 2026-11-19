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
import { Button } from './components/Button';
import { ContactRow } from './components/ContactRow';
import { ContactSheet } from './components/ContactSheet';
import { Field } from './components/Field';
import { IndexCard } from './components/IndexCard';
import { LedgerSheet } from './components/LedgerSheet';
import { TypedLine } from './components/TypedLine';

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
      <ContactRow
        key={contact.id}
        name={str(contact.name)}
        role={str(contact.role)}
        howKnown={str(contact.howKnown)}
        notes={str(contact.notes)}
        activity={<ContactActivity contact={contact} />}
        actions={
          <>
            <Button
              disabled={busy}
              onClick={() => {
                setOpened(contact);
                setEditingId(contact.id);
              }}
            >
              Edit
            </Button>{' '}
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => void remove(contact.id)}
            >
              Delete
            </Button>
          </>
        }
      />
    );

  return (
    <div class="data-page">
      <h1>Contacts</h1>
      <IndexCard title="Add a contact">
        <ContactForm
          key={formKey}
          submitLabel="Add contact"
          busy={busy}
          onSubmit={(input) => void add(input)}
        >
          <Field label="Company">
            <input
              type="text"
              list="contact-companies"
              value={companyName}
              disabled={busy}
              onInput={(e) => setCompanyName(e.currentTarget.value)}
            />
          </Field>
          <datalist id="contact-companies">
            {data.companies
              .filter((c) => c.name)
              .map((c) => (
                <option key={c.id} value={c.name} />
              ))}
          </datalist>
        </ContactForm>
      </IndexCard>
      {error ? (
        <span class="field-error" role="alert">
          {error}
        </span>
      ) : null}
      {companies.length === 0 && orphans.length === 0 ? (
        <LedgerSheet>
          <TypedLine>No contacts yet.</TypedLine>
        </LedgerSheet>
      ) : (
        companies.map((company) => (
          <ContactSheet
            key={company.id}
            label={company.name || '(no company)'}
            heading={company.name || '(no company)'}
            action={
              <Button
                disabled={busy}
                onClick={() => void toggleTarget(company.id, !company.isTarget)}
              >
                {company.isTarget ? 'Remove target' : 'Mark as target'}
              </Button>
            }
          >
            {company.contacts.map(row)}
          </ContactSheet>
        ))
      )}
      {orphans.length > 0 ? (
        <ContactSheet label="(unknown company)" heading="(unknown company)">
          {orphans.map(row)}
        </ContactSheet>
      ) : null}
    </div>
  );
}
