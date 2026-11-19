import { describe, expect, it } from 'vitest';
import { NAV_GROUPS, activeTab, type TabPage } from './nav';
import type { Route } from './route';

describe('nav', () => {
  it('groups in order', () => {
    expect(
      NAV_GROUPS.map((g) => [g.label, g.items.map((t) => t.label)]),
    ).toEqual([
      [
        undefined,
        ['Applications', 'Deadlines', 'Quiet', 'Contacts', 'Targets'],
      ],
      ['Prep', ['Stories', 'Answers', 'My details']],
      ['Review', ['Weekly', 'Data', 'Settings']],
    ]);
  });

  it('every tab page appears once', () => {
    const pages = NAV_GROUPS.flatMap((g) => g.items.map((t) => t.page));
    expect(pages).toHaveLength(11);
    expect(new Set(pages).size).toBe(11);
  });

  it('detail pages mark Applications', () => {
    expect(activeTab({ page: 'application', id: 'a' })).toBe('applications');
    expect(activeTab({ page: 'pack', id: 'a' })).toBe('applications');
    expect(activeTab({ page: 'weekly' })).toBe('weekly');
  });
});

// Typed as a Record over every Route page, so a new route fails tsc here.
const EXPECTED_TAB: Record<Route['page'], TabPage> = {
  applications: 'applications',
  application: 'applications',
  pack: 'applications',
  deadlines: 'deadlines',
  quiet: 'quiet',
  contacts: 'contacts',
  targets: 'targets',
  stories: 'stories',
  answers: 'answers',
  details: 'details',
  weekly: 'weekly',
  data: 'data',
  settings: 'settings',
};

describe('activeTab over every route', () => {
  it.each(Object.entries(EXPECTED_TAB))('%s marks %s', (page, tab) => {
    const route = (
      page === 'application' || page === 'pack' ? { page, id: 'a' } : { page }
    ) as Route;
    expect(activeTab(route)).toBe(tab);
  });

  it('the table covers every tab page plus the detail pages', () => {
    const tabPages = NAV_GROUPS.flatMap((g) => g.items.map((t) => t.page));
    expect(Object.keys(EXPECTED_TAB).sort()).toEqual(
      [...tabPages, 'application', 'pack'].sort(),
    );
  });
});
