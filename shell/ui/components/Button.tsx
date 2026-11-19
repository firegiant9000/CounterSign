import type { ComponentChildren, VNode } from 'preact';
import './Button.css';

export function Button(props: {
  variant?: 'primary' | 'secondary' | 'link' | 'danger';
  type?: 'button' | 'submit';
  disabled?: boolean;
  onClick?: () => void;
  'aria-label'?: string;
  children: ComponentChildren;
}): VNode {
  const variant = props.variant ?? 'secondary';
  return (
    <button
      class={`cs-button cs-button-${variant}`}
      type={props.type ?? 'button'}
      disabled={props.disabled}
      onClick={props.onClick}
      aria-label={props['aria-label']}
    >
      {props.children}
    </button>
  );
}
