import type { VNode } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { applicationRows, filterRows } from '../../core/src/application-list';
import type { RowFilter } from '../../core/src/application-list';
import { STATUS_KEYS, statusLabel } from '../../core/src/status';
import { ApplicationForm } from './ApplicationForm';
import { useAppData } from './app-data';
import { routeHref } from './route';

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

  return (
    <>
      <h1>Applications</h1>
      <div class="filters">
        <input
          type="search"
          placeholder="Search company, title, notes"
          aria-label="Search"
          value={query}
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
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
        <select
          aria-label="Scope"
          value={scope}
          onChange={(e) => setScope(e.currentTarget.value as Scope)}
        >
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">All</option>
        </select>
      </div>
      {shown.length === 0 ? (
        <p>No applications match.</p>
      ) : (
        <table class="app-table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Title</th>
              <th>Status</th>
              <th>Next action</th>
              <th>Who acts</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.id}>
                <td>
                  <a href={routeHref({ page: 'application', id: row.id })}>
                    {row.companyName || '(no company)'}
                  </a>
                </td>
                <td>{row.title}</td>
                <td>{row.statusLabel}</td>
                <td>{row.nextActionDate ?? ''}</td>
                <td>
                  {row.nextActor === 'me'
                    ? 'Me'
                    : row.nextActor === 'them'
                      ? 'Them'
                      : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {/* The new row appears in the table; stay here so several can be added. */}
      <ApplicationForm onSaved={() => undefined} />
    </>
  );
}
