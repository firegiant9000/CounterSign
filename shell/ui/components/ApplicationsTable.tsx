import type { VNode } from 'preact';
import { inkFor } from '../status-ink';
import { ledgerRowClass } from './LedgerSheet';
import { Stamp } from './Stamp';
import { Text } from './Text';
import { TypedLine } from './TypedLine';

export interface ApplicationsTableRow {
  id: string;
  companyName: string;
  title: string;
  status?: string;
  statusLabel: string;
  nextActionDate?: string;
  nextActor?: string;
}

export function ApplicationsTable(props: {
  rows: readonly ApplicationsTableRow[];
  hrefFor(id: string): string;
}): VNode {
  return (
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
        {props.rows.map((row) => {
          const ink = inkFor(row.status);
          return (
            <tr key={row.id} class={ledgerRowClass(ink)}>
              <td>
                <Text kind="name">
                  <a href={props.hrefFor(row.id)}>
                    {row.companyName || '(no company)'}
                  </a>
                </Text>
              </td>
              <td>
                <Text kind="title">{row.title}</Text>
              </td>
              <td>
                <Stamp ink={ink}>{row.statusLabel}</Stamp>
              </td>
              <td>
                <TypedLine as="span">{row.nextActionDate ?? ''}</TypedLine>
              </td>
              <td>
                <TypedLine as="span">
                  {row.nextActor === 'me'
                    ? 'Me'
                    : row.nextActor === 'them'
                      ? 'Them'
                      : ''}
                </TypedLine>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
