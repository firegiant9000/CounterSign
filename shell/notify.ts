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

// browser.notifications is undefined until the optional permission is granted,
// so this must never throw: it attaches the click listener now if it can, and
// again when the permission is added. Attaching is idempotent.
export function onDailyClicked(handler: () => void): void {
  const onClicked = (id: string): void => {
    if (id === DAILY_ID) handler();
  };
  const attach = (): void => {
    try {
      const clicks = browser.notifications?.onClicked;
      if (clicks && !clicks.hasListener(onClicked))
        clicks.addListener(onClicked);
    } catch {
      // Nothing to attach to yet.
    }
  };
  try {
    attach();
    browser.permissions.onAdded.addListener((added) => {
      if (added.permissions?.includes('notifications')) attach();
    });
  } catch {
    // Never let registration break the event page.
  }
}
