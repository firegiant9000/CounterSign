import type { VNode } from 'preact';
import './CountGrid.css';

export function CountGrid(props: {
  items: { label: string; value: string | number }[];
}): VNode {
  return (
    <dl class="cs-count-grid">
      {props.items.map((item) => (
        <div class="cs-count-item" key={item.label}>
          <dt class="cs-count-label">{item.label}</dt>
          <dd class="cs-count-figure">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
