import type { ComponentChildren, VNode } from 'preact';
import { Text } from './Text';

export function ContactRow(props: {
  name: string;
  role: string;
  howKnown: string;
  notes: string;
  activity: ComponentChildren;
  actions: ComponentChildren;
}): VNode {
  const { name, role, howKnown, notes, activity, actions } = props;
  return (
    <li>
      <Text kind="name">{name || '(no name)'}</Text>
      {role ? (
        <>
          , <Text kind="title">{role}</Text>
        </>
      ) : null}
      {howKnown ? (
        <div>
          <Text kind="body">How you know them: {howKnown}</Text>
        </div>
      ) : null}
      {notes ? (
        <div>
          <Text kind="body">{notes}</Text>
        </div>
      ) : null}
      {activity}
      {actions}
    </li>
  );
}
