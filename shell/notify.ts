import { browser } from 'wxt/browser';

export const DAILY_ID = 'countersign-daily';

const NOTIFICATIONS = { permissions: ['notifications' as const] };

export async function hasNotifications(): Promise<boolean> {
  try {
    return await browser.permissions.contains(NOTIFICATIONS);
  } catch {
    return false;
  }
}

// Not async, and no await before the call: Firefox refuses a permission
// request that is not in the synchronous path of the user's gesture.
export function requestNotifications(): Promise<boolean> {
  try {
    const request = browser.permissions.request(NOTIFICATIONS);
    return request.catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

export async function showDaily(title: string, message: string): Promise<void> {
  await browser.notifications.create(DAILY_ID, {
    type: 'basic',
    title,
    message,
    iconUrl: browser.runtime.getURL('/icon.svg'),
  });
}

export async function clearDaily(): Promise<void> {
  await browser.notifications.clear(DAILY_ID);
}

export function onDailyClicked(handler: () => void): void {
  browser.notifications.onClicked.addListener((id) => {
    if (id === DAILY_ID) handler();
  });
}
