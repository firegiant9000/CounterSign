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

async function focusExisting(url: string, hash: string): Promise<boolean> {
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
  await browser.tabs.update(
    found.tabId,
    hash ? { active: true, url: url + hash } : { active: true },
  );
  if (found.windowId !== -1)
    await browser.windows.update(found.windowId, { focused: true });
  return true;
}

// hash like '#/deadlines'; anything not starting with '#/' is treated as none.
export async function openDashboard(hash?: string): Promise<void> {
  const url = browser.runtime.getURL('/dashboard.html');
  const suffix = hash?.startsWith('#/') ? hash : '';
  try {
    if (await focusExisting(url, suffix)) return;
  } catch {
    // Lookup or focus failed (for example the tab closed meanwhile): open a new tab.
  }
  await browser.tabs.create({ url: url + suffix });
}
