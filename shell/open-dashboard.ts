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

async function focusExisting(url: string): Promise<boolean> {
  const getContexts = (
    browser.runtime as unknown as { getContexts?: GetContexts }
  ).getContexts;
  if (typeof getContexts !== 'function') return false;
  const contexts = await getContexts.call(browser.runtime, {
    contextTypes: ['TAB'],
  });
  const found = contexts.find(
    (c) => c.tabId !== -1 && (c.documentUrl ?? '').split('#')[0] === url,
  );
  if (!found) return false;
  await browser.tabs.update(found.tabId, { active: true });
  if (found.windowId !== -1)
    await browser.windows.update(found.windowId, { focused: true });
  return true;
}

export async function openDashboard(): Promise<void> {
  const url = browser.runtime.getURL('/dashboard.html');
  try {
    if (await focusExisting(url)) return;
  } catch {
    // Lookup or focus failed (for example the tab closed meanwhile): open a new tab.
  }
  await browser.tabs.create({ url });
}
