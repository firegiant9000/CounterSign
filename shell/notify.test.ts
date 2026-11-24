import { beforeEach, describe, expect, it, vi } from 'vitest';

type Fn = (...args: never[]) => void;

const mocks = vi.hoisted(() => ({
  clickListeners: [] as Fn[],
  addedListeners: [] as Fn[],
  browser: {},
}));

function makeNotifications() {
  return {
    onClicked: {
      addListener: (fn: Fn) => mocks.clickListeners.push(fn),
      hasListener: (fn: Fn) => mocks.clickListeners.includes(fn),
    },
  };
}

vi.mock('wxt/browser', () => ({ browser: mocks.browser }));

import { DAILY_ID, onDailyClicked } from './notify';

const fake = mocks.browser as Record<string, unknown>;

beforeEach(() => {
  mocks.clickListeners.length = 0;
  mocks.addedListeners.length = 0;
  fake.notifications = undefined;
  fake.permissions = {
    onAdded: { addListener: (fn: Fn) => mocks.addedListeners.push(fn) },
  };
});

const fireAdded = (permissions: string[]): void => {
  for (const fn of mocks.addedListeners)
    (fn as (a: unknown) => void)({ permissions });
};

describe('onDailyClicked', () => {
  it('does not throw without the notifications API and waits for the permission', () => {
    expect(() => onDailyClicked(() => {})).not.toThrow();
    expect(mocks.clickListeners).toHaveLength(0);
    expect(mocks.addedListeners).toHaveLength(1);
  });

  it('attaches once when the permission is added, even if added twice', () => {
    onDailyClicked(() => {});
    fake.notifications = makeNotifications();
    fireAdded(['notifications']);
    fireAdded(['notifications']);
    expect(mocks.clickListeners).toHaveLength(1);
  });

  it('ignores other added permissions', () => {
    onDailyClicked(() => {});
    fake.notifications = makeNotifications();
    fireAdded(['downloads']);
    expect(mocks.clickListeners).toHaveLength(0);
  });

  it('calls the handler only for the daily notification', () => {
    const handler = vi.fn();
    fake.notifications = makeNotifications();
    onDailyClicked(handler);
    const click = mocks.clickListeners[0] as (id: string) => void;
    click('other');
    expect(handler).not.toHaveBeenCalled();
    click(DAILY_ID);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('attaches immediately when the API already exists', () => {
    fake.notifications = makeNotifications();
    onDailyClicked(() => {});
    expect(mocks.clickListeners).toHaveLength(1);
  });
});
