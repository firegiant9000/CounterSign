import { describe, expect, it } from 'vitest';
import type {
  FillPlan,
  FillWrite,
  FrameAdvice,
  NotFilledReason,
  PlanRow,
} from '../../core/src/fill/types';
import type { FillState } from '../fill/controller';
import { fillView } from './fill-view';

type Ready = Extract<FillState, { status: 'ready' }>;

function row(over: Partial<PlanRow> = {}): PlanRow {
  return {
    ref: 1,
    label: 'Full name',
    control: 'text',
    required: false,
    status: 'will_fill',
    formValue: '',
    ownValue: 'Sam Example',
    ...over,
  };
}

function valueWrite(ref: number, value = 'Sam Example'): FillWrite {
  return { ref, kind: 'value', value };
}

function ready(
  over: {
    rows?: PlanRow[];
    writes?: FillWrite[];
    unrecognisedOptional?: number;
    frames?: FrameAdvice[];
    filled?: number;
    failed?: PlanRow[];
    applyFailed?: boolean;
  } = {},
): Ready {
  const plan: FillPlan = {
    rows: over.rows ?? [],
    writes: over.writes ?? [],
    unrecognisedOptional: over.unrecognisedOptional ?? 0,
    frames: over.frames ?? [],
  };
  return {
    status: 'ready',
    plan,
    busy: false,
    filled: over.filled,
    failed: over.failed ?? [],
    applyFailed: over.applyFailed ?? false,
  };
}

function notFilled(
  reason: NotFilledReason,
  over: Partial<PlanRow> = {},
): PlanRow {
  return row({
    status: 'not_filled',
    reason,
    ownValue: '',
    target: { kind: 'answer', key: 'work_authorisation' },
    ...over,
  });
}

const GREENHOUSE: FrameAdvice = {
  site: 'greenhouse',
  src: 'https://job-boards.greenhouse.io/embed/job_app?for=examplecorp&token=123',
};
const ASHBY: FrameAdvice = {
  site: 'ashby',
  src: 'https://jobs.ashbyhq.com/examplecorp/abc',
};

describe('fillView', () => {
  it('counts and plurals', () => {
    const one = fillView(ready({ writes: [valueWrite(1)] }));
    expect(one.button).toBe('Fill 1 empty field');
    expect(one.nothing).toBeUndefined();

    const many = fillView(
      ready({ writes: [1, 2, 3, 4, 5, 6, 7].map((n) => valueWrite(n)) }),
    );
    expect(many.button).toBe('Fill 7 empty fields');
    expect(many.nothing).toBeUndefined();

    const none = fillView(ready());
    expect(none.button).toBeUndefined();
    expect(none.nothing).toBe('Nothing to fill.');

    expect(fillView(ready({ filled: 1 })).filledLine).toBe('Filled 1 field.');
    expect(fillView(ready({ filled: 3 })).filledLine).toBe('Filled 3 fields.');
    expect(fillView(ready()).filledLine).toBeUndefined();

    expect(fillView(ready({ unrecognisedOptional: 1 })).optionalLine).toBe(
      '1 optional field not recognised',
    );
    expect(fillView(ready({ unrecognisedOptional: 4 })).optionalLine).toBe(
      '4 optional fields not recognised',
    );
    expect(fillView(ready()).optionalLine).toBeUndefined();
  });

  it('has the footer', () => {
    expect(fillView(ready()).footer).toBe(
      'Countersign never submits. Check the form, then submit it yourself.',
    );
  });

  it('writes the value for a value write and the own value for an option write', () => {
    const view = fillView(
      ready({
        rows: [
          row({
            ref: 1,
            write: valueWrite(1, 'sam@example.com'),
            ownValue: 'ignored',
          }),
          row({
            ref: 2,
            label: 'Country',
            write: { ref: 2, kind: 'option', index: 3 },
            ownValue: 'Canada',
          }),
        ],
      }),
    );
    expect(view.willFill).toEqual([
      { key: '1', label: 'Full name', lines: ['sam@example.com'] },
      { key: '2', label: 'Country', lines: ['Canada'] },
    ]);
  });

  it('matches rows show the form value', () => {
    const view = fillView(
      ready({
        rows: [row({ status: 'matches', formValue: 'Sam Example' })],
      }),
    );
    expect(view.matches).toEqual([
      { key: '1', label: 'Full name', lines: ['Sam Example'] },
    ]);
  });

  it.each<[NotFilledReason, string]>([
    ['custom_control', 'custom dropdown, choose it yourself'],
    ['unsupported_control', 'this kind of field is not filled'],
    ['never_auto', 'never auto-filled'],
    ['ambiguous', 'more than one match, not filled'],
    ['negated', 'worded as a negative, answer it yourself'],
    ['other_country', 'names another place, answer it yourself'],
    ['file', 'attach it yourself'],
    ['not_recognised', 'required, not recognised'],
    ['changed', 'changed while filling'],
  ])('each reason has its line: %s', (reason, line) => {
    const view = fillView(ready({ rows: [notFilled(reason)] }));
    expect(view.notFilled).toHaveLength(1);
    expect(view.notFilled[0]?.lines).toEqual([line]);
  });

  it('no_value names the profile field for a profile target', () => {
    const view = fillView(
      ready({
        rows: [
          notFilled('no_value', {
            target: { kind: 'profile', key: 'first_name' },
          }),
        ],
      }),
    );
    expect(view.notFilled[0]?.lines).toEqual(['add First name in My details']);
  });

  it('no_value points to the Answers page for an answer target', () => {
    const view = fillView(ready({ rows: [notFilled('no_value')] }));
    expect(view.notFilled[0]?.lines).toEqual(['add it on the Answers page']);
  });

  it('differs shows both values and a copy', () => {
    const view = fillView(
      ready({
        rows: [
          row({
            status: 'differs',
            formValue: 'S. Example',
            ownValue: 'Sam Example',
          }),
        ],
      }),
    );
    expect(view.differs).toEqual([
      {
        key: '1',
        label: 'Full name',
        lines: ['form: S. Example', 'yours: Sam Example'],
        copy: 'Sam Example',
      },
    ]);
  });

  it('a differs row with an empty own value has no copy', () => {
    const view = fillView(
      ready({
        rows: [row({ status: 'differs', formValue: 'x', ownValue: '' })],
      }),
    );
    expect(view.differs[0]?.copy).toBeUndefined();
  });

  it('a salary row copies the formatted range', () => {
    const view = fillView(
      ready({
        rows: [
          row({
            label: 'Salary expectations',
            status: 'differs',
            formValue: '90000',
            ownValue: '$100,000 to $120,000',
            target: { kind: 'answer', key: 'salary' },
          }),
        ],
      }),
    );
    expect(view.differs[0]?.copy).toBe('$100,000 to $120,000');
  });

  it('a negated row has no copy, because the plan blanks its own value', () => {
    const view = fillView(ready({ rows: [notFilled('negated')] }));
    expect(view.notFilled[0]?.copy).toBeUndefined();
  });

  it('a not_filled row with a copyable reason copies its own value', () => {
    const view = fillView(
      ready({ rows: [notFilled('custom_control', { ownValue: 'Canada' })] }),
    );
    expect(view.notFilled[0]?.copy).toBe('Canada');
  });

  it('a no_value row has no copy', () => {
    const view = fillView(
      ready({ rows: [notFilled('no_value', { ownValue: 'stray' })] }),
    );
    expect(view.notFilled[0]?.copy).toBeUndefined();
  });

  it.each<NotFilledReason>(['file', 'not_recognised', 'changed'])(
    'a %s row has no copy',
    (reason) => {
      const view = fillView(
        ready({ rows: [notFilled(reason, { ownValue: 'stray' })] }),
      );
      expect(view.notFilled[0]?.copy).toBeUndefined();
    },
  );

  it('frame messages', () => {
    expect(fillView(ready({ frames: [GREENHOUSE] })).frames).toEqual([
      'This form is inside a Greenhouse frame, which Countersign cannot reach from here. Right-click the form, choose This Frame, then Open Frame in New Tab, and open Countersign there.',
    ]);
    expect(fillView(ready({ frames: [ASHBY] })).frames).toEqual([
      'This form is inside an Ashby frame, which Countersign cannot reach from here. Right-click the form, choose This Frame, then Open Frame in New Tab, and open Countersign there.',
    ]);
    expect(fillView(ready()).frames).toEqual([]);
  });

  it('gives one sentence per site, in the order first seen', () => {
    const view = fillView(
      ready({ frames: [GREENHOUSE, ASHBY, { ...GREENHOUSE }] }),
    );
    expect(view.frames).toHaveLength(2);
    expect(view.frames[0]).toContain('a Greenhouse frame');
    expect(view.frames[1]).toContain('an Ashby frame');
  });

  it('failed rows come first under not filled, as changed while filling', () => {
    const failed = notFilled('changed', { ref: 9, label: 'Phone' });
    const planned = notFilled('never_auto', { ref: 4, label: 'Password' });
    const view = fillView(ready({ rows: [planned], failed: [failed] }));
    expect(view.notFilled.map((r) => [r.key, r.lines])).toEqual([
      ['failed-9', ['changed while filling']],
      ['4', ['never auto-filled']],
    ]);
  });

  it('an empty label reads (no label)', () => {
    const view = fillView(ready({ rows: [row({ label: '' })] }));
    expect(view.willFill[0]?.label).toBe('(no label)');
  });

  it('apply failed sets the error', () => {
    expect(fillView(ready({ applyFailed: true })).error).toBe(
      'Countersign could not confirm the fill. Check the form before you submit it.',
    );
    expect(fillView(ready()).error).toBeUndefined();
  });

  it('groups rows by status in plan order', () => {
    const view = fillView(
      ready({
        rows: [
          row({ ref: 1, status: 'will_fill', write: valueWrite(1) }),
          row({ ref: 2, status: 'matches' }),
          row({ ref: 3, status: 'differs' }),
          row({ ref: 4, status: 'will_fill', write: valueWrite(4) }),
        ],
      }),
    );
    expect(view.willFill.map((r) => r.key)).toEqual(['1', '4']);
    expect(view.matches.map((r) => r.key)).toEqual(['2']);
    expect(view.differs.map((r) => r.key)).toEqual(['3']);
  });
});
