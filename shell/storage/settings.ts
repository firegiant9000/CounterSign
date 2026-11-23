import { browser } from 'wxt/browser';
import type { Settings } from '../../core/src/types';

export const SETTINGS_KEY = 'settings';

export interface KeyValueArea {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

// The browser is touched only when a method is called.
export function browserLocalArea(): KeyValueArea {
  return {
    get: async (key) => {
      const found: Record<string, unknown> =
        await browser.storage.local.get(key);
      return found[key];
    },
    set: async (key, value) => {
      await browser.storage.local.set({ [key]: value });
    },
  };
}

export async function loadSettings(area: KeyValueArea): Promise<Settings> {
  const value = await area.get(SETTINGS_KEY);
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value;
  }
  return {};
}

export function saveSettings(
  area: KeyValueArea,
  settings: Settings,
): Promise<void> {
  return area.set(SETTINGS_KEY, settings);
}
