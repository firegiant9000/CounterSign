import type { ComponentChildren, VNode } from 'preact';
import { LedgerSheet } from './LedgerSheet';
import './ContactSheet.css';

export function ContactSheet(props: {
  label: string;
  heading: string;
  action?: ComponentChildren;
  children: ComponentChildren;
}): VNode {
  return (
    <LedgerSheet label={props.label}>
      <div class="cs-contact-head">
        <h2>{props.heading}</h2>
        {props.action}
      </div>
      <ul>{props.children}</ul>
    </LedgerSheet>
  );
}
