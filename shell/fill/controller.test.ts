import { describe, expect, it, vi } from 'vitest';
import type {
  ApplyResult,
  FormScan,
  PlanInput,
  ScannedField,
  WriteReport,
} from '../../core/src/fill/types';
import type { IsoInstant } from '../../core/src/types';
import {
  createFillController,
  type FillInjector,
  type FillState,
} from './controller';
import type { ApplyOutcome, ScanOutcome } from './inject';

const NOW = '2026-11-20T10:00:00.000Z' as IsoInstant;
const URL = 'https://jobs.lever.co/example-co/abc123?utm_source=x';

const FULL: PlanInput = {
  profile: {
    full_name: 'Sam Example',
    email: 'sam@example.com',
    phone: '555 0100',
  },
  answers: [],
};
const EMPTY: PlanInput = { profile: {}, answers: [] };

function field(ref: number, overrides: Partial<ScannedField> = {}) {
  const base: ScannedField = {
    ref,
    control: 'text',
    label: '',
    autocomplete: '',
    required: false,
    value: '',
    options: [],
    checked: [],
    multiple: false,
    optionsTruncated: false,
  };
  return { ...base, ...overrides };
}

function scanOf(fields: ScannedField[], frames: string[] = []): FormScan {
  return { fields, frames, truncated: false };
}

const threeFields = (): FormScan =>
  scanOf([
    field(1, { label: 'Full name' }),
    field(2, { label: 'Email' }),
    field(3, { label: 'Phone' }),
  ]);

function okScan(scan: FormScan, tabId = 7): ScanOutcome {
  return { ok: true, tabId, url: URL, scan };
}

function okApply(outcomes: WriteReport[], scan: FormScan): ApplyOutcome {
  const result: ApplyResult = { outcomes, scan };
  return { ok: true, result };
}

function setup(
  scan: ScanOutcome = okScan(threeFields()),
  options: {
    input?: () => PlanInput;
    apply?: FillInjector['apply'];
    relCanonical?: () => string | undefined;
    now?: () => IsoInstant;
  } = {},
) {
  const scanFn = vi.fn<FillInjector['scan']>(() => Promise.resolve(scan));
  const apply = vi.fn<FillInjector['apply']>(
    options.apply ?? (() => Promise.resolve({ ok: false })),
  );
  const controller = createFillController({
    input: options.input ?? (() => FULL),
    now: options.now ?? (() => NOW),
    relCanonical: options.relCanonical,
    injector: { scan: scanFn, apply },
  });
  return { controller, scan: scanFn, apply };
}

function ready(state: FillState) {
  if (state.status !== 'ready') throw new Error(`state is ${state.status}`);
  return state;
}

describe('createFillController', () => {
  it('starts in the scanning state', () => {
    expect(setup().controller.state()).toEqual({ status: 'scanning' });
  });

  it('starting never applies', async () => {
    const { controller, apply } = setup();
    await controller.start();

    const state = ready(controller.state());
    expect(state.plan.rows.map((r) => r.status)).toEqual([
      'will_fill',
      'will_fill',
      'will_fill',
    ]);
    expect(state.busy).toBe(false);
    expect(state.failed).toEqual([]);
    expect(state.applyFailed).toBe(false);
    expect(apply).toHaveBeenCalledTimes(0);
  });

  it('refreshing never applies', async () => {
    const { controller, apply } = setup();
    await controller.start();
    controller.refresh();
    expect(apply).toHaveBeenCalledTimes(0);
  });

  it('fill applies once with the tab and the plan writes', async () => {
    const { controller, apply } = setup(okScan(threeFields(), 42), {
      apply: () => Promise.resolve(okApply([], threeFields())),
    });
    await controller.start();
    const writes = ready(controller.state()).plan.writes;
    expect(writes).toHaveLength(3);

    await controller.fill();

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(42, writes);
  });

  it('a double click applies once', async () => {
    let release: (outcome: ApplyOutcome) => void = () => undefined;
    const { controller, apply } = setup(undefined, {
      apply: () =>
        new Promise<ApplyOutcome>((resolve) => {
          release = resolve;
        }),
    });
    await controller.start();

    const first = controller.fill();
    expect(ready(controller.state()).busy).toBe(true);
    const second = controller.fill();
    expect(await second).toBeUndefined();
    expect(apply).toHaveBeenCalledTimes(1);

    release(okApply([], threeFields()));
    await first;
    expect(ready(controller.state()).busy).toBe(false);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('nothing to fill does not apply', async () => {
    const { controller, apply } = setup(
      okScan(
        scanOf([
          field(1, { label: 'Full name', value: 'Sam Example' }),
          field(2, { label: 'Email', value: 'sam@example.com' }),
        ]),
      ),
    );
    await controller.start();
    expect(ready(controller.state()).plan.rows.map((r) => r.status)).toEqual([
      'matches',
      'matches',
    ]);

    expect(await controller.fill()).toBeUndefined();
    expect(apply).toHaveBeenCalledTimes(0);
  });

  it('fill before start does nothing', async () => {
    const { controller, apply } = setup();
    expect(await controller.fill()).toBeUndefined();
    expect(apply).toHaveBeenCalledTimes(0);
    expect(controller.state()).toEqual({ status: 'scanning' });
  });

  it('fill when hidden does nothing', async () => {
    const { controller, apply } = setup({ ok: false, reason: 'refused' });
    await controller.start();
    expect(await controller.fill()).toBeUndefined();
    expect(apply).toHaveBeenCalledTimes(0);
    expect(controller.state()).toEqual({ status: 'hidden' });
  });

  it('after a fill, rebuilds the plan from the returned scan and counts', async () => {
    const after = scanOf([
      field(1, { label: 'Full name', value: 'Sam Example' }),
      field(2, { label: 'Email', value: 'sam@example.com' }),
      field(3, { label: 'Phone' }),
    ]);
    const { controller } = setup(undefined, {
      apply: () =>
        Promise.resolve(
          okApply(
            [
              { ref: 1, outcome: 'written' },
              { ref: 2, outcome: 'written' },
              { ref: 3, outcome: 'gone' },
            ],
            after,
          ),
        ),
    });
    await controller.start();
    await controller.fill();

    const state = ready(controller.state());
    expect(state.plan.rows.map((r) => r.status)).toEqual([
      'matches',
      'matches',
      'will_fill',
    ]);
    expect(state.filled).toBe(2);
    expect(state.failed).toHaveLength(1);
    expect(state.failed[0]).toMatchObject({
      ref: 3,
      status: 'not_filled',
      reason: 'changed',
    });
    expect(state.busy).toBe(false);
    expect(state.applyFailed).toBe(false);
  });

  it('counts a ref reported twice once, by its first report', async () => {
    const { controller } = setup(undefined, {
      apply: () =>
        Promise.resolve(
          okApply(
            [
              { ref: 1, outcome: 'written' },
              { ref: 1, outcome: 'failed' },
              { ref: 2, outcome: 'written' },
              { ref: 3, outcome: 'written' },
            ],
            threeFields(),
          ),
        ),
    });
    await controller.start();
    await controller.fill();

    const state = ready(controller.state());
    expect(state.filled).toBe(3);
    expect(state.failed).toEqual([]);
  });

  it('puts a will_fill row with no report in failed', async () => {
    const { controller } = setup(undefined, {
      apply: () =>
        Promise.resolve(
          okApply(
            [
              { ref: 1, outcome: 'written' },
              { ref: 2, outcome: 'written' },
            ],
            threeFields(),
          ),
        ),
    });
    await controller.start();
    await controller.fill();

    const state = ready(controller.state());
    expect(state.filled).toBe(2);
    expect(state.failed.map((r) => r.ref)).toEqual([3]);
    expect(state.failed[0]).toMatchObject({
      status: 'not_filled',
      reason: 'changed',
    });
  });

  it('apply failed keeps the plan and sets applyFailed', async () => {
    const { controller } = setup(undefined, {
      apply: () => Promise.resolve({ ok: false }),
    });
    await controller.start();
    const before = ready(controller.state()).plan;

    expect(await controller.fill()).toBeUndefined();

    const state = ready(controller.state());
    expect(state.applyFailed).toBe(true);
    expect(state.plan).toBe(before);
    expect(state.busy).toBe(false);
    expect(state.filled).toBeUndefined();
  });

  it('a rejecting apply is treated like a failed apply', async () => {
    const { controller } = setup(undefined, {
      apply: () => Promise.reject(new Error('boom')),
    });
    await controller.start();
    const before = ready(controller.state()).plan;

    expect(await controller.fill()).toBeUndefined();

    const state = ready(controller.state());
    expect(state.applyFailed).toBe(true);
    expect(state.plan).toBe(before);
    expect(state.busy).toBe(false);
  });

  it('a rejecting scan hides the panel', async () => {
    const { controller, scan } = setup();
    scan.mockRejectedValue(new Error('boom'));
    await controller.start();
    expect(controller.state()).toEqual({ status: 'hidden' });
  });

  it.each(['refused', 'not_http', 'no_tab'] as const)(
    'is hidden when the scan is %s',
    async (reason) => {
      const { controller } = setup({ ok: false, reason });
      await controller.start();
      expect(controller.state()).toEqual({ status: 'hidden' });
    },
  );

  it('is hidden when nothing is recognised and there is no frame', async () => {
    const { controller } = setup(
      okScan(scanOf([field(1, { label: 'Favourite colour' })])),
    );
    await controller.start();
    expect(controller.state()).toEqual({ status: 'hidden' });
  });

  it('is ready when only a frame is found', async () => {
    const { controller } = setup(
      okScan(scanOf([], ['https://boards.greenhouse.io/embed/job_app'])),
    );
    await controller.start();
    expect(ready(controller.state()).plan.frames.length).toBeGreaterThan(0);
  });

  it('is ready when only not-filled rows with a target exist', async () => {
    const { controller } = setup(
      okScan(
        scanOf([
          field(1, {
            control: 'custom',
            label: 'Are you legally authorized to work?',
          }),
        ]),
      ),
    );
    await controller.start();
    const state = ready(controller.state());
    expect(state.plan.rows[0]).toMatchObject({
      status: 'not_filled',
      reason: 'custom_control',
    });
  });

  it('start runs one scan when called twice', async () => {
    const { controller, scan } = setup();
    await controller.start();
    await controller.start();
    expect(scan).toHaveBeenCalledTimes(1);
  });

  it('refresh uses the current input', async () => {
    let input = EMPTY;
    const { controller, scan, apply } = setup(undefined, {
      input: () => input,
    });
    await controller.start();
    expect(ready(controller.state()).plan.rows.map((r) => r.reason)).toEqual([
      'no_value',
      'no_value',
      'no_value',
    ]);

    input = FULL;
    controller.refresh();

    expect(ready(controller.state()).plan.rows.map((r) => r.status)).toEqual([
      'will_fill',
      'will_fill',
      'will_fill',
    ]);
    expect(scan).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledTimes(0);
  });

  it('refresh keeps filled, failed and applyFailed', async () => {
    let input = FULL;
    const { controller } = setup(undefined, {
      input: () => input,
      apply: () =>
        Promise.resolve(
          okApply([{ ref: 1, outcome: 'written' }], threeFields()),
        ),
    });
    await controller.start();
    await controller.fill();
    const before = ready(controller.state());

    input = EMPTY;
    controller.refresh();

    const after = ready(controller.state());
    expect(after.filled).toBe(1);
    expect(after.failed).toEqual(before.failed);
    expect(after.applyFailed).toBe(false);
    expect(after.plan.rows.map((r) => r.reason)).toEqual([
      'no_value',
      'no_value',
      'no_value',
    ]);
  });

  it('refresh while busy changes nothing', async () => {
    let release: (outcome: ApplyOutcome) => void = () => undefined;
    let input = FULL;
    const { controller } = setup(undefined, {
      input: () => input,
      apply: () =>
        new Promise<ApplyOutcome>((resolve) => {
          release = resolve;
        }),
    });
    await controller.start();
    const pending = controller.fill();
    const before = controller.state();

    input = EMPTY;
    controller.refresh();

    expect(controller.state()).toBe(before);
    release(okApply([], threeFields()));
    await pending;
  });

  it('refresh before start and when hidden does nothing', async () => {
    const { controller } = setup({ ok: false, reason: 'refused' });
    controller.refresh();
    expect(controller.state()).toEqual({ status: 'scanning' });
    await controller.start();
    controller.refresh();
    expect(controller.state()).toEqual({ status: 'hidden' });
  });

  it('refresh after a fill uses the scan the apply returned', async () => {
    let input = FULL;
    const after = scanOf([field(9, { label: 'Email' })]);
    const { controller } = setup(undefined, {
      input: () => input,
      apply: () => Promise.resolve(okApply([], after)),
    });
    await controller.start();
    await controller.fill();

    input = FULL;
    controller.refresh();
    expect(ready(controller.state()).plan.rows.map((r) => r.ref)).toEqual([9]);
  });

  it('returns a fill result with the canonical address and site type', async () => {
    const { controller } = setup(undefined, {
      relCanonical: () => 'https://jobs.lever.co/example-co/canonical',
      apply: () =>
        Promise.resolve(
          okApply(
            [
              { ref: 1, outcome: 'written' },
              { ref: 2, outcome: 'written' },
              { ref: 3, outcome: 'gone' },
            ],
            threeFields(),
          ),
        ),
    });
    await controller.start();
    const result = await controller.fill();

    expect(result?.url).toBe('https://jobs.lever.co/example-co/canonical');
    expect(result?.siteType).toBe('lever');
    expect(result?.at).toBe(NOW);
    expect(result?.rows.map((r) => r.outcome)).toEqual([
      'written',
      'written',
      'gone',
    ]);
  });

  it('canonicalises the tab address when there is no canonical link', async () => {
    const { controller } = setup(undefined, {
      apply: () => Promise.resolve(okApply([], threeFields())),
    });
    await controller.start();
    const result = await controller.fill();
    expect(result?.url).toBe('https://jobs.lever.co/example-co/abc123');
  });

  it('subscribers hear each change and can unsubscribe', async () => {
    const { controller } = setup(undefined, {
      apply: () => Promise.resolve(okApply([], threeFields())),
    });
    const heard: string[] = [];
    const unsubscribe = controller.subscribe((s) =>
      heard.push(s.status === 'ready' && s.busy ? 'busy' : s.status),
    );

    await controller.start();
    expect(heard).toEqual(['ready']);

    await controller.fill();
    expect(heard).toEqual(['ready', 'busy', 'ready']);

    unsubscribe();
    controller.refresh();
    expect(heard).toHaveLength(3);
  });

  it('keeps the result when the plan rebuild throws after the apply', async () => {
    let calls = 0;
    const { controller } = setup(undefined, {
      input: () => {
        calls += 1;
        if (calls > 1) throw new Error('boom');
        return FULL;
      },
      apply: () =>
        Promise.resolve(
          okApply(
            [
              { ref: 1, outcome: 'written' },
              { ref: 2, outcome: 'written' },
              { ref: 3, outcome: 'gone' },
            ],
            threeFields(),
          ),
        ),
    });
    await controller.start();
    const result = await controller.fill();

    expect(result?.rows.map((r) => r.outcome)).toEqual([
      'written',
      'written',
      'gone',
    ]);
    const state = ready(controller.state());
    expect(state.filled).toBe(2);
    expect(state.failed.map((r) => r.ref)).toEqual([3]);
    expect(state.plan.writes).toEqual([]);
    expect(state.busy).toBe(false);
  });

  it('a throwing subscriber does not leave fill busy', async () => {
    const { controller, apply } = setup(undefined, {
      apply: () =>
        Promise.resolve(
          okApply([{ ref: 1, outcome: 'written' }], threeFields()),
        ),
    });
    const heard: string[] = [];
    controller.subscribe(() => {
      throw new Error('boom');
    });
    controller.subscribe((s) =>
      heard.push(s.status === 'ready' && s.busy ? 'busy' : s.status),
    );
    await controller.start();

    const result = await controller.fill();

    expect(apply).toHaveBeenCalledTimes(1);
    expect(result?.rows.map((r) => r.outcome)).toContain('written');
    expect(heard).toEqual(['ready', 'busy', 'ready']);
    const state = ready(controller.state());
    expect(state.busy).toBe(false);
    expect(state.filled).toBe(1);

    await controller.fill();
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it('keeps the counts and a result when now throws after the apply', async () => {
    const { controller } = setup(undefined, {
      now: () => {
        throw new Error('boom');
      },
      apply: () =>
        Promise.resolve(
          okApply(
            [
              { ref: 1, outcome: 'written' },
              { ref: 2, outcome: 'written' },
              { ref: 3, outcome: 'gone' },
            ],
            threeFields(),
          ),
        ),
    });
    await controller.start();
    const result = await controller.fill();

    expect(result?.rows.map((r) => r.outcome)).toEqual([
      'written',
      'written',
      'gone',
    ]);
    expect(Number.isNaN(Date.parse(result?.at ?? ''))).toBe(false);
    const state = ready(controller.state());
    expect(state.filled).toBe(2);
    expect(state.failed.map((r) => r.ref)).toEqual([3]);
    expect(state.busy).toBe(false);
  });

  it('falls back to the tab address when relCanonical throws', async () => {
    const { controller } = setup(undefined, {
      relCanonical: () => {
        throw new Error('boom');
      },
      apply: () =>
        Promise.resolve(
          okApply([{ ref: 1, outcome: 'written' }], threeFields()),
        ),
    });
    await controller.start();
    const result = await controller.fill();

    expect(result?.url).toBe('https://jobs.lever.co/example-co/abc123');
    expect(ready(controller.state()).filled).toBe(1);
  });

  it('start resolves and hides when input throws', async () => {
    const { controller } = setup(undefined, {
      input: () => {
        throw new Error('boom');
      },
    });
    await expect(controller.start()).resolves.toBeUndefined();
    expect(controller.state()).toEqual({ status: 'hidden' });
  });

  it('refresh leaves the state unchanged when input throws', async () => {
    let broken = false;
    const { controller } = setup(undefined, {
      input: () => {
        if (broken) throw new Error('boom');
        return FULL;
      },
    });
    await controller.start();
    const before = controller.state();
    const heard = vi.fn();
    controller.subscribe(heard);

    broken = true;
    expect(() => controller.refresh()).not.toThrow();

    expect(controller.state()).toBe(before);
    expect(heard).not.toHaveBeenCalled();
  });

  it('a failed second apply keeps the first fill counts', async () => {
    let n = 0;
    const { controller } = setup(undefined, {
      apply: () => {
        n += 1;
        return Promise.resolve(
          n === 1
            ? okApply([{ ref: 1, outcome: 'written' }], threeFields())
            : { ok: false },
        );
      },
    });
    await controller.start();
    await controller.fill();
    const first = ready(controller.state());
    expect(first.filled).toBe(1);
    expect(first.failed).toHaveLength(2);

    expect(await controller.fill()).toBeUndefined();

    const state = ready(controller.state());
    expect(state.applyFailed).toBe(true);
    expect(state.filled).toBe(1);
    expect(state.failed).toEqual(first.failed);
    expect(state.plan).toBe(first.plan);
    expect(state.busy).toBe(false);
  });

  it('counts one will_fill row once when its ref is reported twice as written', async () => {
    const one = scanOf([field(1, { label: 'Email' })]);
    const { controller } = setup(okScan(one), {
      apply: () =>
        Promise.resolve(
          okApply(
            [
              { ref: 1, outcome: 'written' },
              { ref: 1, outcome: 'written' },
            ],
            one,
          ),
        ),
    });
    await controller.start();
    await controller.fill();
    expect(ready(controller.state()).filled).toBe(1);
  });
});
