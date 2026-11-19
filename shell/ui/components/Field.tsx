import type { ComponentChildren, VNode } from 'preact';
import './Field.css';

export function Field(props: {
  label: ComponentChildren;
  error?: string;
  children: ComponentChildren;
}): VNode {
  return (
    <label class="cs-field">
      {props.label}
      {props.children}
      {props.error && (
        <span class="field-error" role="alert">
          {props.error}
        </span>
      )}
    </label>
  );
}
