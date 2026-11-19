import type { ComponentChildren, VNode } from 'preact';
import type { Ink } from '../status-ink';
import { Button } from './Button';
import { ledgerRowClass } from './LedgerSheet';
import { Text } from './Text';
import { TypedLine } from './TypedLine';

export function DeadlineItem(props: {
  ink: Ink;
  date: string;
  overdue: boolean;
  label: ComponentChildren;
  actor: string;
  extra?: ComponentChildren;
  actions?: ComponentChildren;
}): VNode {
  return (
    <li class={ledgerRowClass(props.ink)}>
      <TypedLine as="span">
        <strong>{props.date}</strong>
      </TypedLine>
      {props.overdue ? (
        <>
          {' '}
          <TypedLine as="span" tone="warning">
            (Overdue)
          </TypedLine>
        </>
      ) : null}{' '}
      <Text kind="name">{props.label}</Text>{' '}
      <TypedLine as="span">Next: {props.actor}</TypedLine>
      {props.extra}
      {props.actions}
    </li>
  );
}

export function RowButton(props: {
  variant?: 'secondary' | 'danger';
  disabled: boolean;
  onClick: () => void;
  children: ComponentChildren;
}): VNode {
  return (
    <>
      {' '}
      <Button
        variant={props.variant}
        disabled={props.disabled}
        onClick={props.onClick}
      >
        {props.children}
      </Button>
    </>
  );
}
