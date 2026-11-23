import { beforeEach, describe, expect, it, vi } from 'vitest';

const BASE = 'moz-extension://abc/dashboard.html';

const mocks = vi.hoisted(() => ({
  getURL: vi.fn(),
  getContexts: vi.fn(),
  tabsUpdate: vi.fn(),
  tabsCreate: vi.fn(),
  windowsUpdate: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: { getURL: mocks.getURL, getContexts: mocks.getContexts },
    tabs: { update: mocks.tabsUpdate, create: mocks.tabsCreate },
    windows: { update: mocks.windowsUpdate },
  },
}));

import { openDashboard } from './open-dashboard';

const EXISTING = [{ tabId: 7, windowId: 3, documentUrl: BASE }];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getURL.mockReturnValue(BASE);
  mocks.getContexts.mockResolvedValue([]);
});

describe('openDashboard', () => {
  it('with no hash and an existing tab, focuses it exactly as before', async () => {
    mocks.getContexts.mockResolvedValue(EXISTING);
    await openDashboard();
    expect(mocks.tabsUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.tabsUpdate).toHaveBeenCalledWith(7, { active: true });
    expect(mocks.windowsUpdate).toHaveBeenCalledWith(3, { focused: true });
    expect(mocks.tabsCreate).not.toHaveBeenCalled();
  });

  it('with no hash and no tab, creates a tab at the plain URL', async () => {
    await openDashboard();
    expect(mocks.tabsCreate).toHaveBeenCalledTimes(1);
    expect(mocks.tabsCreate).toHaveBeenCalledWith({ url: BASE });
    expect(mocks.tabsUpdate).not.toHaveBeenCalled();
  });

  it('with a hash and an existing tab, updates it to the hashed URL', async () => {
    mocks.getContexts.mockResolvedValue([
      { tabId: 7, windowId: 3, documentUrl: `${BASE}#/people` },
    ]);
    await openDashboard('#/deadlines');
    expect(mocks.tabsUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.tabsUpdate).toHaveBeenCalledWith(7, {
      active: true,
      url: `${BASE}#/deadlines`,
    });
    expect(mocks.windowsUpdate).toHaveBeenCalledWith(3, { focused: true });
    expect(mocks.tabsCreate).not.toHaveBeenCalled();
  });

  it('with a hash and no tab, creates a tab at the hashed URL', async () => {
    await openDashboard('#/deadlines');
    expect(mocks.tabsCreate).toHaveBeenCalledTimes(1);
    expect(mocks.tabsCreate).toHaveBeenCalledWith({
      url: `${BASE}#/deadlines`,
    });
    expect(mocks.tabsUpdate).not.toHaveBeenCalled();
  });

  it('ignores a hash that does not start with #/', async () => {
    mocks.getContexts.mockResolvedValue(EXISTING);
    await openDashboard('#deadlines');
    expect(mocks.tabsUpdate).toHaveBeenCalledWith(7, { active: true });
    mocks.getContexts.mockResolvedValue([]);
    await openDashboard('deadlines');
    expect(mocks.tabsCreate).toHaveBeenCalledWith({ url: BASE });
  });
});
