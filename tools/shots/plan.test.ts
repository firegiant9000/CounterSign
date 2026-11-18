import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DASHBOARD_PAGES, findOverflows, outputDir, shotPlan } from './plan';

const plan = () => shotPlan({ applicationId: 'abc' });

describe('shotPlan', () => {
  it('covers every dashboard page', () => {
    const names = plan().map((s) => s.name);
    for (const name of [
      'applications',
      'deadlines',
      'quiet',
      'contacts',
      'targets',
      'stories',
      'weekly',
      'answers',
      'details',
      'data',
      'settings',
      'application',
      'pack',
      'applications-900',
      'popup-paste',
      'popup-filed',
      'popup-long-url',
    ]) {
      expect(names).toContain(name);
    }
    expect(DASHBOARD_PAGES).not.toContain('application');
    expect(DASHBOARD_PAGES).not.toContain('pack');
  });

  it('names are unique', () => {
    const names = plan().map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('popup shots are 360 wide', () => {
    const popups = plan().filter((s) => s.name.startsWith('popup-'));
    expect(popups).toHaveLength(3);
    for (const s of popups) {
      expect(s.width).toBe(360);
      expect(s.height).toBe(600);
      expect(s.path).toBe('popup.html');
    }
  });

  it('puts the application id in the detail and pack paths', () => {
    const byName = new Map(plan().map((s) => [s.name, s]));
    expect(byName.get('application')?.path).toBe(
      'dashboard.html#/applications/abc',
    );
    expect(byName.get('pack')?.path).toBe('dashboard.html#/pack/abc');
    expect(byName.get('applications-900')?.width).toBe(900);
  });
});

describe('findOverflows', () => {
  const el = (tag: string, scrollWidth: number, clientWidth = 352) => ({
    tag,
    className: '',
    scrollWidth,
    clientWidth,
  });

  it('reports a container that grows sideways', () => {
    const wide = el('section', 600);
    expect(findOverflows([el('body', 352), wide, el('p', 300)])).toEqual([
      wide,
    ]);
  });

  it('ignores inputs and textareas scrolling their own value', () => {
    expect(
      findOverflows([el('input', 1800, 300), el('textarea', 900)]),
    ).toEqual([]);
  });

  it('ignores inline elements, which report clientWidth 0', () => {
    expect(findOverflows([el('strong', 128, 0)])).toEqual([]);
  });

  it('passes when nothing overflows', () => {
    expect(findOverflows([el('html', 352), el('body', 352)])).toEqual([]);
  });
});

describe('outputDir', () => {
  it('pads the time', () => {
    expect(outputDir('/r', new Date(2026, 0, 5, 9, 7), 'night')).toBe(
      join('/r', '.shots', '2026-01-05-0907', 'night'),
    );
  });
});
