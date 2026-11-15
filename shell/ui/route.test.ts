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
    ['#/nonsense', { page: 'applications' }],
  ])('parses %s', (hash, route) => expect(parseRoute(hash)).toEqual(route));

  it('round-trips through routeHref', () => {
    for (const r of [
      { page: 'application', id: 'a b' },
      { page: 'answers' },
    ] as Route[])
      expect(parseRoute(routeHref(r))).toEqual(r);
  });
});
