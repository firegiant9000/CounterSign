import { CLOSED_STATUSES } from '../../core/src/status';

export interface LedgerMetaInput {
  scope: 'active' | 'archived' | 'all';
  statusKey?: string;
  statusLabel?: string;
  shown: number;
}

/**
 * One upper-cased metadata line for the Applications list: scope, then the
 * chosen status label, then the shown count. The count appears only for the
 * active scope on an open status, so it never reads as a tally of closed outcomes.
 */
export function ledgerMeta(input: LedgerMetaInput): string {
  const parts: string[] = [input.scope];
  if (typeof input.statusLabel === 'string' && input.statusLabel !== '') {
    parts.push(input.statusLabel);
  }
  const closed =
    input.statusKey !== undefined && CLOSED_STATUSES.has(input.statusKey);
  if (input.scope === 'active' && !closed) {
    parts.push(`${input.shown} SHOWN`);
  }
  return parts.join(' · ').toUpperCase();
}
