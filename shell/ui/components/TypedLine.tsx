import type { ComponentChildren, VNode } from 'preact';
import './TypedLine.css';

export function TypedLine(props: {
  children: ComponentChildren;
  tone?: 'muted' | 'warning';
  as?: 'p' | 'span';
}): VNode {
  const Tag = props.as ?? 'p';
  return (
    <Tag class={`cs-typed cs-typed-${props.tone ?? 'muted'}`}>
      {props.children}
    </Tag>
  );
}
