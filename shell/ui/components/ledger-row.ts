import { inkClass, type Ink } from '../status-ink';

/** Class for a ledger row: 'cs-row ink-<ink>', or plain 'cs-row' for 'none'. */
export function ledgerRowClass(ink: Ink): string {
  const cls = inkClass(ink);
  return cls ? `cs-row ${cls}` : 'cs-row';
}
