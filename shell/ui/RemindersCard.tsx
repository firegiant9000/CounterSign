import type { VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  REMINDER_KINDS,
  reminderSettings,
  withReminders,
} from '../../core/src/reminders';
import type { ReminderKind } from '../../core/src/reminders';
import { hasNotifications, requestNotifications } from '../notify';
import { useAppData } from './app-data';
import { Button } from './components/Button';
import { Field } from './components/Field';
import { CardSection, IndexCard } from './components/IndexCard';

const REFUSED = 'Firefox did not allow notifications, so reminders stay off.';
const ALLOW_REFUSED = "Firefox didn't allow notifications.";
const REMOVED =
  "Reminders are on, but Firefox's notification permission was removed.";

const KIND_LABELS: Record<ReminderKind, string> = {
  follow_up: 'Follow-ups',
  next_action: 'Next actions',
  task: 'Tasks',
  round: 'Interviews',
};

const HOURS = Array.from({ length: 24 }, (_, h) => h);

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function RemindersCard(): VNode {
  const app = useAppData();
  const current = reminderSettings(app.settings);
  const [refused, setRefused] = useState(false);
  const [lost, setLost] = useState(false);
  const [allowRefused, setAllowRefused] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState<string | undefined>(undefined);

  // Once reminders are on (here or in another tab), a refusal message is
  // stale; once they are off, the removed-permission notice is.
  useEffect(() => {
    if (current.on) {
      setRefused(false);
    } else {
      setLost(false);
      setAllowRefused(false);
    }
  }, [current.on]);

  useEffect(() => {
    let alive = true;
    if (current.on) {
      void hasNotifications().then((ok) => {
        if (alive && !ok) setLost(true);
      });
    }
    return () => {
      alive = false;
    };
    // Checked once, at mount.
  }, []);

  const persist = async (
    edit: (cur: typeof app.settings) => typeof app.settings,
  ): Promise<void> => {
    try {
      await app.saveSettings(edit);
      setError(undefined);
    } catch (err) {
      setError(reasonOf(err));
    }
  };

  // The permission request must start synchronously inside the user gesture,
  // so it is the first statement of each handler that can need it.
  const onDailyChange = (box: HTMLInputElement): void => {
    if (busy.current) {
      // A request is in flight: undo this toggle so the DOM does not drift.
      box.checked = !box.checked;
      return;
    }
    if (!box.checked) {
      void persist((cur) => withReminders(cur, { on: false }));
      return;
    }
    const granted = requestNotifications();
    busy.current = true;
    setPending(true);
    setRefused(false);
    void granted
      .then(async (ok) => {
        if (ok) {
          setLost(false);
          setAllowRefused(false);
          await persist((cur) => withReminders(cur, { on: true }));
        } else {
          box.checked = false;
          setRefused(true);
        }
      })
      .finally(() => {
        busy.current = false;
        setPending(false);
      });
  };

  const onAllow = (): void => {
    if (busy.current) return;
    const granted = requestNotifications();
    busy.current = true;
    setPending(true);
    setAllowRefused(false);
    void granted
      .then((ok) => {
        if (ok) setLost(false);
        else setAllowRefused(true);
      })
      .finally(() => {
        busy.current = false;
        setPending(false);
      });
  };

  return (
    <IndexCard title="Reminders" headingLevel={2}>
      <CardSection>
        <label>
          <input
            type="checkbox"
            checked={current.on}
            aria-disabled={pending}
            onChange={(e) => onDailyChange(e.currentTarget)}
          />{' '}
          Daily reminder
        </label>
        {refused ? (
          <p class="field-error" role="alert">
            {REFUSED}
          </p>
        ) : null}
        {lost && current.on ? (
          <p role="status">
            {REMOVED}{' '}
            <Button variant="secondary" onClick={onAllow}>
              Allow notifications
            </Button>
            {allowRefused ? (
              <span class="field-error" role="alert">
                {' '}
                {ALLOW_REFUSED}
              </span>
            ) : null}
          </p>
        ) : null}
        <Field label="Hour">
          <select
            value={String(current.hour)}
            onChange={(e) => {
              const hour = Number(e.currentTarget.value);
              if (!Number.isInteger(hour) || hour < 0 || hour > 23) return;
              void persist((cur) => withReminders(cur, { hour }));
            }}
          >
            {HOURS.map((h) => (
              <option key={h} value={String(h)}>
                {`${h}:00`}
              </option>
            ))}
          </select>
        </Field>
        <fieldset>
          <legend>Counts:</legend>
          {REMINDER_KINDS.map((kind) => (
            <label key={kind}>
              <input
                type="checkbox"
                checked={current.kinds[kind]}
                onChange={(e) => {
                  const checked = e.currentTarget.checked;
                  void persist((cur) =>
                    withReminders(cur, {
                      kinds: {
                        ...reminderSettings(cur).kinds,
                        [kind]: checked,
                      },
                    }),
                  );
                }}
              />{' '}
              {KIND_LABELS[kind]}
            </label>
          ))}
        </fieldset>
        {error ? (
          <span class="field-error" role="alert">
            {error}
          </span>
        ) : null}
      </CardSection>
    </IndexCard>
  );
}
