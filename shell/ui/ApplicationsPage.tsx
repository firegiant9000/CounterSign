import type { VNode } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { applicationRows, filterRows } from '../../core/src/application-list';
import type { RowFilter } from '../../core/src/application-list';
import { STATUS_KEYS, statusLabel } from '../../core/src/status';
import { ApplicationForm } from './ApplicationForm';
import { useAppData } from './app-data';
import { routeHref } from './route';
import { ApplicationsTable } from './components/ApplicationsTable';
import { Field } from './components/Field';
import { LedgerSheet } from './components/LedgerSheet';
import { TypedLine } from './components/TypedLine';
import { ledgerMeta } from './ledger-meta';

type Scope = NonNullable<RowFilter['scope']>;

export function ApplicationsPage(): VNode {
  const { data, settings } = useAppData();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [scope, setScope] = useState<Scope>('active');

  const rows = useMemo(
    () => applicationRows(data, settings.statusLabels),
    [data, settings.statusLabels],
  );
  const shown = filterRows(rows, {
    query,
    status: status === '' ? undefined : status,
    scope,
  });

  const chosenStatusLabel =
    status === '' ? undefined : statusLabel(status, settings.statusLabels);

  return (
    <>
      <h1>Applications</h1>
      <div class="filters">
        <Field label={null}>
          <input
            type="search"
            placeholder="Search company, title, notes"
            aria-label="Search"
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
        </Field>
        <Field label={null}>
          <select
            aria-label="Status"
            value={status}
            onChange={(e) => setStatus(e.currentTarget.value)}
          >
            <option value="">All</option>
            {STATUS_KEYS.map((key) => (
              <option key={key} value={key}>
                {statusLabel(key, settings.statusLabels)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={null}>
          <select
            aria-label="Scope"
            value={scope}
            onChange={(e) => setScope(e.currentTarget.value as Scope)}
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="all">All</option>
          </select>
        </Field>
      </div>
      <LedgerSheet
        label={ledgerMeta({
          scope,
          statusKey: status === '' ? undefined : status,
          statusLabel: chosenStatusLabel,
          shown: shown.length,
        })}
      >
        {shown.length === 0 ? (
          <TypedLine>No applications match.</TypedLine>
        ) : (
          <ApplicationsTable
            rows={shown}
            hrefFor={(id) => routeHref({ page: 'application', id })}
          />
        )}
      </LedgerSheet>
      {/* The new row appears in the table; stay here so several can be added. */}
      <ApplicationForm onSaved={() => undefined} />
    </>
  );
}
