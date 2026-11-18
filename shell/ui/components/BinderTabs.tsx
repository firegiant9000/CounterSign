import type { VNode } from 'preact';
import { NAV_GROUPS, type TabPage } from '../nav';
import { routeHref } from '../route';
import { TypedLine } from './TypedLine';
import './BinderTabs.css';

export function BinderTabs(props: { current: TabPage }): VNode {
  return (
    <div class="cs-binder-tabs">
      <p class="cs-binder-wordmark">Countersign</p>
      <nav aria-label="Sections">
        {NAV_GROUPS.map((group) => (
          <div class="cs-binder-group" key={group.label ?? 'main'}>
            {group.label ? (
              <TypedLine as="span">{group.label}</TypedLine>
            ) : null}
            {group.items.map((tab) => (
              <a
                key={tab.page}
                class="cs-binder-tab"
                href={routeHref({ page: tab.page })}
                aria-current={props.current === tab.page ? 'page' : undefined}
              >
                {tab.label}
              </a>
            ))}
          </div>
        ))}
      </nav>
    </div>
  );
}
