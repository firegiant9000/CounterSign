import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import {
  BACKUP_ALARM,
  browserBackupDeps,
  ensureBackupAlarm,
  runBackupCheck,
} from '../shell/backup';
import { BACKUP_STATE_KEY } from '../shell/storage/backup-state';

// Event page: runs the automatic backup check on startup, install, the daily alarm and backup-counter changes.
export default defineBackground(() => {
  // Holds no state between wakes: deps are built fresh on each call.
  const wake = async (): Promise<void> => {
    try {
      await ensureBackupAlarm(browser.alarms);
      await runBackupCheck(browserBackupDeps());
    } catch (err) {
      console.error('Countersign: automatic backup check failed', err);
    }
  };

  browser.runtime.onStartup.addListener(() => void wake());
  browser.runtime.onInstalled.addListener(() => void wake());
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === BACKUP_ALARM) void wake();
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && BACKUP_STATE_KEY in changes) void wake();
  });

  void wake();
});
