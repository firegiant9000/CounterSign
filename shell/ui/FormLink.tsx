import type { VNode } from 'preact';
import { useState } from 'preact/hooks';
import { applicationRows } from '../../core/src/application-list';
import type { Id, Snapshot } from '../../core/src/types';
import { Button } from './components/Button';
import { Field } from './components/Field';
import { Text } from './components/Text';

const MAX_ROWS = 20;

type Mode = 'idle' | 'choose' | 'new';

function nameOf(value: string | undefined, fallback: string): string {
  return value !== undefined && value.trim() !== '' ? value : fallback;
}

/**
 * Candidate application ids for the picker: active applications, newest
 * created first.
 */
export function pickerCandidates(data: Snapshot): Id[] {
  return applicationRows(data)
    .filter((r) => !r.archived)
    .sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
    )
    .map((r) => r.id);
}

export function FormLink(props: {
  data: Snapshot;
  linkedId?: Id;
  candidates: Id[];
  initialCompany?: string;
  initialTitle?: string;
  /** Resolves true when the write succeeded. */
  onLink: (id: Id) => Promise<boolean>;
  onNew: (input: { companyName: string; title: string }) => Promise<boolean>;
  busy: boolean;
  error?: string;
}): VNode {
  const [mode, setMode] = useState<Mode>('idle');
  const [query, setQuery] = useState('');
  const [company, setCompany] = useState<string | undefined>(undefined);
  const [title, setTitle] = useState<string | undefined>(undefined);

  const rows = applicationRows(props.data);
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  const label = (id: Id): string => {
    const row = byId.get(id);
    return `${nameOf(row?.companyName, 'Unknown company')} · ${nameOf(row?.title, 'Untitled')}`;
  };

  const done = (ok: boolean): void => {
    if (ok) setMode('idle');
  };

  let panel: VNode | null = null;
  if (mode === 'choose') {
    const needle = query.trim().toLowerCase();
    const matching = props.candidates.filter((id) => {
      if (needle === '') return true;
      const row = byId.get(id);
      return (
        (row?.companyName ?? '').toLowerCase().includes(needle) ||
        (row?.title ?? '').toLowerCase().includes(needle)
      );
    });
    panel = (
      <div class="popup-formlink-panel">
        <Field label="Find an application">
          <input
            type="text"
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
        </Field>
        <div class="popup-formlink-list">
          {matching.slice(0, MAX_ROWS).map((id) => (
            <Button
              key={id}
              variant="link"
              disabled={props.busy}
              onClick={() => void props.onLink(id).then(done)}
            >
              {label(id)}
            </Button>
          ))}
        </div>
        <div class="popup-actions">
          <Button variant="link" onClick={() => setMode('idle')}>
            Cancel
          </Button>
        </div>
      </div>
    );
  } else if (mode === 'new') {
    const companyValue = company ?? props.initialCompany ?? '';
    const titleValue = title ?? props.initialTitle ?? '';
    panel = (
      <div class="popup-formlink-panel">
        <Field label="Company">
          <input
            type="text"
            value={companyValue}
            onInput={(e) => setCompany(e.currentTarget.value)}
          />
        </Field>
        <Field label="Title">
          <input
            type="text"
            value={titleValue}
            onInput={(e) => setTitle(e.currentTarget.value)}
          />
        </Field>
        <div class="popup-actions">
          <Button
            variant="primary"
            disabled={props.busy}
            onClick={() =>
              void props
                .onNew({ companyName: companyValue, title: titleValue })
                .then(done)
            }
          >
            Create and link
          </Button>
          <Button variant="link" onClick={() => setMode('idle')}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  const linked = props.linkedId !== undefined;
  return (
    <section class="popup-formlink">
      {mode === 'idle' || linked ? (
        linked && props.linkedId !== undefined ? (
          <div class="popup-formlink-head">
            <Text kind="name">Records to: {label(props.linkedId)}</Text>
            {mode === 'idle' ? (
              <Button variant="link" onClick={() => setMode('choose')}>
                Change
              </Button>
            ) : null}
          </div>
        ) : (
          <div class="popup-formlink-head">
            <Text kind="name">Not linked to an application.</Text>
            <div class="popup-actions">
              <Button onClick={() => setMode('choose')}>Choose…</Button>
              <Button onClick={() => setMode('new')}>
                New application from this page
              </Button>
            </div>
          </div>
        )
      ) : (
        <Text kind="name">Not linked to an application.</Text>
      )}
      {panel}
      {props.error ? (
        <span class="field-error" role="alert">
          {props.error}
        </span>
      ) : null}
    </section>
  );
}
