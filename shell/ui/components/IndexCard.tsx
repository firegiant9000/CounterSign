import type { ComponentChildren, VNode } from 'preact';
import { inkClass, type Ink } from '../status-ink';
import './IndexCard.css';

export function IndexCard(props: {
  title?: ComponentChildren;
  edge?: Ink;
  headingLevel?: 2 | 3;
  children: ComponentChildren;
}): VNode {
  const Heading = props.headingLevel === 3 ? 'h3' : 'h2';
  const cls = ['cs-card', props.edge ? inkClass(props.edge) : undefined]
    .filter(Boolean)
    .join(' ');
  return (
    <section class={cls}>
      {props.title ? (
        <Heading class="cs-card-title">{props.title}</Heading>
      ) : null}
      {props.children}
    </section>
  );
}

export function CardSection(props: {
  title?: ComponentChildren;
  children: ComponentChildren;
}): VNode {
  return (
    <div class="cs-card-section">
      {props.title ? (
        <div class="cs-card-section-title">{props.title}</div>
      ) : null}
      {props.children}
    </div>
  );
}
