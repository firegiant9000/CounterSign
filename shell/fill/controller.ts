import { buildPlan } from '../../core/src/fill/plan';
import { buildFillResult, type FillResult } from '../../core/src/fill/result';
import type {
  FillPlan,
  FillWrite,
  FormScan,
  PlanInput,
  PlanRow,
} from '../../core/src/fill/types';
import type { IsoInstant } from '../../core/src/types';
import {
  applyToPage,
  scanPage,
  type ApplyOutcome,
  type ScanOutcome,
} from './inject';

export interface FillInjector {
  scan(): Promise<ScanOutcome>;
  apply(tabId: number, writes: readonly FillWrite[]): Promise<ApplyOutcome>;
}

export type FillState =
  | { status: 'scanning' }
  | { status: 'hidden' }
  | {
      status: 'ready';
      plan: FillPlan;
      busy: boolean;
      filled?: number;
      failed: PlanRow[];
      applyFailed: boolean;
    };

export interface FillController {
  state(): FillState;
  subscribe(listener: (state: FillState) => void): () => void;
  /** Scans and plans. Never applies. */
  start(): Promise<void>;
  /** Rebuilds the plan from the newest scan with the current input. */
  refresh(): void;
  /** The only caller of injector.apply. */
  fill(): Promise<FillResult | undefined>;
}

export function createFillController(options: {
  input(): PlanInput;
  now(): IsoInstant;
  relCanonical?(): string | undefined;
  injector?: FillInjector;
}): FillController {
  const injector: FillInjector = options.injector ?? {
    scan: () => scanPage(),
    apply: (tabId, writes) => applyToPage(tabId, writes),
  };

  let state: FillState = { status: 'scanning' };
  let started = false;
  let tabId = 0;
  let tabUrl = '';
  let lastScan: FormScan | undefined;
  const listeners = new Set<(state: FillState) => void>();

  function set(next: FillState): void {
    state = next;
    for (const listener of [...listeners]) listener(state);
  }

  async function start(): Promise<void> {
    if (started) return;
    started = true;
    let outcome: ScanOutcome;
    try {
      outcome = await injector.scan();
    } catch {
      set({ status: 'hidden' });
      return;
    }
    if (!outcome.ok) {
      set({ status: 'hidden' });
      return;
    }
    tabId = outcome.tabId;
    tabUrl = outcome.url;
    lastScan = outcome.scan;
    let plan: FillPlan;
    try {
      plan = buildPlan(outcome.scan, options.input());
    } catch {
      set({ status: 'hidden' });
      return;
    }
    const recognised = plan.rows.some((row) => row.target !== undefined);
    if (!recognised && outcome.scan.frames.length === 0) {
      set({ status: 'hidden' });
      return;
    }
    set({ status: 'ready', plan, busy: false, failed: [], applyFailed: false });
  }

  function refresh(): void {
    if (state.status !== 'ready' || state.busy || lastScan === undefined) {
      return;
    }
    let plan: FillPlan;
    try {
      plan = buildPlan(lastScan, options.input());
    } catch {
      return;
    }
    set({ ...state, plan });
  }

  async function fill(): Promise<FillResult | undefined> {
    if (state.status !== 'ready' || state.busy) return undefined;
    const applied = state.plan;
    if (applied.writes.length === 0) return undefined;
    // Set busy before the first await so a second click is refused.
    set({ ...state, busy: true });

    try {
      let outcome: ApplyOutcome;
      try {
        outcome = await injector.apply(tabId, applied.writes);
      } catch {
        outcome = { ok: false };
      }
      if (!outcome.ok) {
        if (state.status === 'ready') {
          set({ ...state, busy: false, applyFailed: true });
        }
        return undefined;
      }

      const { outcomes, scan } = outcome.result;
      const reported = new Map<number, string>();
      for (const report of outcomes) {
        if (!reported.has(report.ref)) reported.set(report.ref, report.outcome);
      }
      let filled = 0;
      const failed: PlanRow[] = [];
      for (const row of applied.rows) {
        if (row.status !== 'will_fill') continue;
        if (reported.get(row.ref) === 'written') {
          filled += 1;
        } else {
          failed.push({ ...row, status: 'not_filled', reason: 'changed' });
        }
      }

      const result = buildFillResult({
        tabUrl,
        relCanonical: options.relCanonical?.(),
        at: options.now(),
        plan: applied,
        outcomes,
      });

      lastScan = scan;
      let plan: FillPlan;
      try {
        plan = buildPlan(scan, options.input());
      } catch {
        // No fresh plan: keep the applied one but with nothing left to write.
        plan = { ...applied, writes: [] };
      }
      set({
        status: 'ready',
        plan,
        busy: false,
        filled,
        failed,
        applyFailed: false,
      });
      return result;
    } finally {
      if (state.status === 'ready' && state.busy) {
        set({ ...state, busy: false });
      }
    }
  }

  return {
    state: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start,
    refresh,
    fill,
  };
}
