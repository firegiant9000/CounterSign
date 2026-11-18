import type { ComponentChildren, VNode } from 'preact';
import './Disclosure.css';

export function Disclosure(props: {
  summary: ComponentChildren;
  open?: boolean;
  children: ComponentChildren;
}): VNode {
  return (
    <details class="cs-disclosure" open={props.open}>
      <summary>{props.summary}</summary>
      <div class="cs-disclosure-body">{props.children}</div>
    </details>
  );
}
