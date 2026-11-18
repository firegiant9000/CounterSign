import type { ComponentChildren, VNode } from 'preact';
import type { TabPage } from '../nav';
import { BinderTabs } from './BinderTabs';
import './Page.css';

export function Page(props: {
  current: TabPage;
  status: ComponentChildren;
  children: ComponentChildren;
}): VNode {
  return (
    <div class="cs-page">
      <BinderTabs current={props.current} />
      <div class="cs-page-content">
        <div class="cs-page-status">{props.status}</div>
        <main class="cs-page-main">{props.children}</main>
      </div>
    </div>
  );
}
