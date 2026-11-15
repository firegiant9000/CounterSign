import { browser } from 'wxt/browser';

interface TabContext {
  documentUrl?: string;
  tabId: number;
  windowId: number;
}

// runtime.getContexts is not in WXT's typings; narrow local shape instead of any.
type GetContexts = (filter: {
  contextTypes: string[];
}) => Promise<TabContext[]>;

export async function openDashboard(): Promise<void> {
  const url = browser.runtime.getURL('/dashboard.html');
  const getContexts = (
    browser.runtime as unknown as { getContexts?: GetContexts }
  ).getContexts;
  if (typeof getContexts === 'function') {
    const contexts = await getContexts.call(browser.runtime, {
      contextTypes: ['TAB'],
    });
    const found = contexts.find(
      (c) => c.tabId !== -1 && (c.documentUrl ?? '').split('#')[0] === url,
    );
    if (found) {
      await browser.tabs.update(found.tabId, { active: true });
      if (found.windowId !== -1)
        await browser.windows.update(found.windowId, { focused: true });
      return;
    }
  }
  await browser.tabs.create({ url });
}
