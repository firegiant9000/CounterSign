import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import {
  BACKUP_ALARM,
  browserBackupDeps,
  ensureBackupAlarm,
  runBackupCheck,
} from '../shell/backup';
import { BACKUP_STATE_KEY } from '../shell/storage/backup-state';
import { SETTINGS_KEY, browserLocalArea } from '../shell/storage/settings';
import { clearDaily, onDailyClicked } from '../shell/notify';
import { openDashboard } from '../shell/open-dashboard';
import {
  REMINDER_ALARM,
  browserReminderDeps,
  runReminderCheck,
  syncReminderAlarm,
} from '../shell/reminders';

// Event page: runs the automatic backup check on startup, install, the daily alarm and backup-counter changes,
// and the daily reminder check on startup, install, its own alarm and settings changes.
// The 30-minute reminder alarm exists only while reminders are on; each reminder wake syncs it first.
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
    // Own try/catch: a failed alarm update must not skip the check.
    try {
      await syncReminderAlarm(browser.alarms, browserLocalArea());
    } catch (err) {
      console.error('Countersign: reminder alarm update failed', err);
    }
    try {
      const outcome = await runReminderCheck(browserReminderDeps());
      if (outcome === 'failed')
        console.error('Countersign: reminder check failed');
    } catch (err) {
      console.error('Countersign: reminder check failed', err);
    }
  };

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

  // Registered synchronously, after the listeners above, so Firefox sees it on
  // every event-page start. Each call is caught separately so the dashboard
  // still opens if clearing the notification fails.
  onDailyClicked(() => {
    clearDaily().catch((err: unknown) => {
      console.error('Countersign: clearing the reminder failed', err);
    });
    openDashboard('#/deadlines').catch((err: unknown) => {
      console.error('Countersign: opening the dashboard failed', err);
    });
  });
});
