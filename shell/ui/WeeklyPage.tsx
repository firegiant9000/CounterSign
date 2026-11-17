import type { VNode } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { addDays, toLocalDate } from '../../core/src/dates';
import { statusLabel } from '../../core/src/status';
import type { Settings } from '../../core/src/types';
import {
  capNote,
  furthestStageCounts,
  parsePlanNumber,
  planFor,
  setPlanOps,
  totalCounts,
  weekStart,
  weeklyCounts,
} from '../../core/src/weekly';
import type { WeeklyCounts } from '../../core/src/weekly';
import { useAppData } from './app-data';

type Plan = { outreachTarget?: number; applicationCap?: number };

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function PlanForm(props: {
  monday: string;
  plan: Plan;
  onSaved?: () => void;
  onCancel?: () => void;
}): VNode {
  const appData = useAppData();
  const { deps } = appData;
  const { monday, plan } = props;
  const [target, setTarget] = useState(
    plan.outreachTarget === undefined ? '' : String(plan.outreachTarget),
  );
  const [cap, setCap] = useState(
    plan.applicationCap === undefined ? '' : String(plan.applicationCap),
  );
  const [busy, setBusy] = useState(false);
  // Set synchronously so a second submit before re-render cannot start a write.
  const inFlight = useRef(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const onSubmit = async (event: Event): Promise<void> => {
    event.preventDefault();
    if (inFlight.current) return;
    const outreachTarget = parsePlanNumber(target);
    const applicationCap = parsePlanNumber(cap);
    if (outreachTarget === 'invalid' || applicationCap === 'invalid') {
      setError('Enter a whole number from 0 to 999.');
      return;
    }
    inFlight.current = true;
    setError(undefined);
    setBusy(true);
    try {
      const next: Plan = {};
      if (outreachTarget !== undefined) next.outreachTarget = outreachTarget;
      if (applicationCap !== undefined) next.applicationCap = applicationCap;
      await appData.apply((d) => setPlanOps(d, monday, next, deps));
      props.onSaved?.();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void onSubmit(e)}>
      <label>
        Outreach target
        <input
          type="text"
          inputMode="numeric"
          value={target}
          disabled={busy}
          onInput={(e) => setTarget(e.currentTarget.value)}
        />
      </label>{' '}
      <label>
        Application cap
        <input
          type="text"
          inputMode="numeric"
          value={cap}
          disabled={busy}
          onInput={(e) => setCap(e.currentTarget.value)}
        />
      </label>{' '}
      <button type="submit" disabled={busy}>
        Save plan
      </button>
      {props.onCancel ? (
        <>
          {' '}
          <button type="button" disabled={busy} onClick={props.onCancel}>
            Cancel
          </button>
        </>
      ) : null}
      {error ? (
        <span class="field-error" role="alert">
          {' '}
          {error}
        </span>
      ) : null}
    </form>
  );
}

function CountsList(props: { counts: WeeklyCounts; plan: Plan }): VNode {
  const { counts, plan } = props;
  const note = capNote(counts, plan.applicationCap);
  return (
    <>
      <ul>
        <li>
          Outreach:{' '}
          {plan.outreachTarget === undefined
            ? counts.outreach
            : `${counts.outreach} of ${plan.outreachTarget}`}
        </li>
        <li>Conversations: {counts.conversations}</li>
        <li>
          Applications: {counts.applications}
          {plan.applicationCap === undefined
            ? ''
            : ` of ${plan.applicationCap} planned`}
        </li>
        <li>Follow-ups: {counts.followUps}</li>
      </ul>
      {note ? <p>{note}</p> : null}
    </>
  );
}

function ReadOnlyPlan(props: { plan: Plan }): VNode {
  const { plan } = props;
  if (plan.outreachTarget === undefined && plan.applicationCap === undefined) {
    return <p>No plan set.</p>;
  }
  return (
    <p>
      Plan:{' '}
      {[
        plan.outreachTarget === undefined
          ? ''
          : `outreach target ${plan.outreachTarget}`,
        plan.applicationCap === undefined
          ? ''
          : `application cap ${plan.applicationCap}`,
      ]
        .filter((s) => s !== '')
        .join(', ')}
    </p>
  );
}

function stagesLine(
  stages: { stage: Parameters<typeof statusLabel>[0]; count: number }[],
  labels: Settings['statusLabels'],
): string {
  if (stages.length === 0) return 'Furthest stage: none yet.';
  return `Furthest stage: ${stages
    .map((s) => `${statusLabel(s.stage, labels)} ${s.count}`)
    .join(' · ')}`;
}

export function WeeklyPage(): VNode {
  const { data, settings } = useAppData();
  const [editing, setEditing] = useState(false);

  const thisMonday = weekStart(toLocalDate(new Date()));
  if (thisMonday === undefined) {
    return (
      <div class="data-page">
        <h1>Weekly</h1>
        <p>Today's date could not be read.</p>
      </div>
    );
  }
  const lastMonday = addDays(thisMonday, -7) ?? thisMonday;
  const nextMonday = addDays(thisMonday, 7) ?? thisMonday;

  const thisPlan = planFor(data, thisMonday);
  const lastPlan = planFor(data, lastMonday);
  const nextPlan = planFor(data, nextMonday);
  const totals = totalCounts(data);
  const stages = furthestStageCounts(data);
  const planKey = (p: Plan): string =>
    `${p.outreachTarget ?? ''}/${p.applicationCap ?? ''}`;

  return (
    <div class="data-page">
      <h1>Weekly</h1>
      <section class="data-section">
        <h2>This week (from {thisMonday})</h2>
        <CountsList counts={weeklyCounts(data, thisMonday)} plan={thisPlan} />
        {editing ? (
          <PlanForm
            key={`${thisMonday}:${planKey(thisPlan)}`}
            monday={thisMonday}
            plan={thisPlan}
            onSaved={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            <ReadOnlyPlan plan={thisPlan} />
            <button type="button" onClick={() => setEditing(true)}>
              Edit plan
            </button>
          </>
        )}
      </section>
      <section class="data-section">
        <h2>Last week (from {lastMonday})</h2>
        <CountsList counts={weeklyCounts(data, lastMonday)} plan={lastPlan} />
        <ReadOnlyPlan plan={lastPlan} />
      </section>
      <section class="data-section">
        <h2>Plan for next week (from {nextMonday})</h2>
        <PlanForm
          key={`${nextMonday}:${planKey(nextPlan)}`}
          monday={nextMonday}
          plan={nextPlan}
        />
      </section>
      <details>
        <summary>Totals and stages</summary>
        <ul>
          <li>Outreach: {totals.outreach}</li>
          <li>Conversations: {totals.conversations}</li>
          <li>Applications: {totals.applications}</li>
          <li>Follow-ups: {totals.followUps}</li>
        </ul>
        <p>{stagesLine(stages, settings.statusLabels)}</p>
      </details>
    </div>
  );
}
