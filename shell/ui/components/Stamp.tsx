import type { ComponentChildren, VNode } from 'preact';
import { inkClass, type Ink } from '../status-ink';
import './Stamp.css';

export function Stamp(props: {
  ink: Ink;
  children: ComponentChildren;
  decorative?: boolean;
}): VNode {
  const cls = ['cs-stamp', inkClass(props.ink) ?? 'ink-none'].join(' ');
  return (
    <span class={cls} aria-hidden={props.decorative ? 'true' : undefined}>
      {props.children}
    </span>
  );
}
