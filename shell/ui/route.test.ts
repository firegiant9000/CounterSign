import { describe, expect, it } from 'vitest';
import { parseRoute, routeHref, type Route } from './route';

describe('route', () => {
  it.each([
    ['', { page: 'applications' }],
    ['#/', { page: 'applications' }],
    ['#/applications', { page: 'applications' }],
    ['#/applications/abc-123', { page: 'application', id: 'abc-123' }],
    ['#/applications/a%20b', { page: 'application', id: 'a b' }],
    ['#/answers', { page: 'answers' }],
    ['#/data', { page: 'data' }],
    ['#/settings', { page: 'settings' }],
    ['#/settings/x', { page: 'applications' }],
    ['#/quiet', { page: 'quiet' }],
    ['#/quiet/x', { page: 'applications' }],
    ['#/contacts', { page: 'contacts' }],
    ['#/contacts/x', { page: 'applications' }],
    ['#/details', { page: 'details' }],
    ['#/details/x', { page: 'applications' }],
    ['#/deadlines', { page: 'deadlines' }],
    ['#/deadlines/x', { page: 'applications' }],
    ['#/pack/abc', { page: 'pack', id: 'abc' }],
    ['#/pack/a%2F1', { page: 'pack', id: 'a/1' }],
    ['#/pack', { page: 'applications' }],
    ['#/pack/', { page: 'applications' }],
    ['#/pack/x/y', { page: 'applications' }],
    ['#/pack/%E0%A4%A', { page: 'applications' }],
    ['#/nonsense', { page: 'applications' }],
  ])('parses %s', (hash, route) => expect(parseRoute(hash)).toEqual(route));

  it('round-trips through routeHref', () => {
    for (const r of [
      { page: 'application', id: 'a b' },
      { page: 'pack', id: 'a/1' },
      { page: 'answers' },
      { page: 'settings' },
      { page: 'quiet' },
      { page: 'deadlines' },
    ] as Route[])
      expect(parseRoute(routeHref(r))).toEqual(r);
  });

  it('builds the quiet href', () => {
    expect(routeHref({ page: 'quiet' })).toBe('#/quiet');
  });

  it('builds the deadlines href', () => {
    expect(routeHref({ page: 'deadlines' })).toBe('#/deadlines');
  });

  it('builds the contacts href', () => {
    expect(routeHref({ page: 'contacts' })).toBe('#/contacts');
  });

  it('builds the details href', () => {
    expect(routeHref({ page: 'details' })).toBe('#/details');
  });

  it('builds the settings href', () => {
    expect(routeHref({ page: 'settings' })).toBe('#/settings');
  });
});
