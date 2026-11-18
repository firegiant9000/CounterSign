import type { ComponentChildren, VNode } from 'preact';
import './Fact.css';

export function Fact(props: {
  tone: 'neutral' | 'warning';
  role?: 'status' | 'alert';
  children: ComponentChildren;
}): VNode {
  return (
    <div class={`cs-fact cs-fact-${props.tone}`} role={props.role}>
      {props.children}
    </div>
  );
}
