import type { ComponentChildren, VNode } from 'preact';
import './Text.css';

export function Text(props: {
  kind: 'name' | 'title' | 'body';
  children: ComponentChildren;
}): VNode {
  return <span class={`cs-text cs-text-${props.kind}`}>{props.children}</span>;
}
