import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import {
  BACKUP_ALARM,
  browserBackupDeps,
  ensureBackupAlarm,
  runBackupCheck,
} from '../shell/backup';
import { BACKUP_STATE_KEY } from '../shell/storage/backup-state';
import { SETTINGS_KEY } from '../shell/storage/settings';
import { clearDaily, onDailyClicked } from '../shell/notify';
import { openDashboard } from '../shell/open-dashboard';
import {
  REMINDER_ALARM,
  browserReminderDeps,
  ensureReminderAlarm,
  runReminderCheck,
} from '../shell/reminders';

// Event page: runs the automatic backup check on startup, install, the daily alarm and backup-counter changes,
// and the daily reminder check on startup, install, its own alarm and settings changes.
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

  // Separate from wake(): a reminder failure must never disturb the backup check.
  const remind = async (): Promise<void> => {
    try {
      await ensureReminderAlarm(browser.alarms);
      await runReminderCheck(browserReminderDeps());
    } catch (err) {
      console.error('Countersign: reminder check failed', err);
    }
  };

  // Registered synchronously so Firefox sees it on every event-page start.
  onDailyClicked(() => {
    void clearDaily();
    void openDashboard('#/deadlines');
  });

  browser.runtime.onStartup.addListener(() => {
    void wake();
    void remind();
  });
  browser.runtime.onInstalled.addListener(() => {
    void wake();
    void remind();
  });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === BACKUP_ALARM) void wake();
    if (alarm.name === REMINDER_ALARM) void remind();
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (BACKUP_STATE_KEY in changes) void wake();
    if (SETTINGS_KEY in changes) void remind();
  });

  void wake();
  void remind();
});
