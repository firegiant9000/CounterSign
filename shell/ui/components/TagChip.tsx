import type { ComponentChildren, VNode } from 'preact';
import './TagChip.css';

export function TagChip(props: { children: ComponentChildren }): VNode {
  return <span class="cs-tag-chip">{props.children}</span>;
}
