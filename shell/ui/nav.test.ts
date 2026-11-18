import { describe, expect, it } from 'vitest';
import { NAV_GROUPS, activeTab } from './nav';

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
