import type { ComponentChildren, VNode } from 'preact';
import { TypedLine } from './TypedLine';
import { ledgerRowClass } from './ledger-row';
import './LedgerSheet.css';

export { ledgerRowClass };

export function LedgerSheet(props: {
  label?: string;
  children: ComponentChildren;
}): VNode {
  return (
    <div class="cs-ledger">
      {props.label ? (
        <div class="cs-ledger-label">
          <TypedLine>{props.label}</TypedLine>
        </div>
      ) : null}
      <div class="cs-ledger-body">{props.children}</div>
    </div>
  );
}
