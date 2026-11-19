import type { VNode } from 'preact';
import { Stamp } from './Stamp';
import './FiledStamp.css';

export function FiledStamp(): VNode {
  return (
    <span class="cs-filed-stamp">
      <Stamp ink="maroon" decorative>
        FILED
      </Stamp>
    </span>
  );
}
