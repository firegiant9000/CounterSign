export type Route =
  | { page: 'applications' }
  | { page: 'application'; id: string }
  | { page: 'answers' }
  | { page: 'data' }
  | { page: 'settings' };

const APPLICATIONS: Route = { page: 'applications' };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  const [head, rest, ...extra] = path.split('/');
  if (extra.length > 0) return APPLICATIONS;
  switch (head) {
    case 'answers':
      return rest === undefined ? { page: 'answers' } : APPLICATIONS;
    case 'data':
      return rest === undefined ? { page: 'data' } : APPLICATIONS;
    case 'settings':
      return rest === undefined ? { page: 'settings' } : APPLICATIONS;
    case 'applications':
      if (rest === undefined || rest === '') return APPLICATIONS;
      try {
        return { page: 'application', id: decodeURIComponent(rest) };
      } catch {
        return APPLICATIONS;
      }
    default:
      return APPLICATIONS;
  }
}

export function routeHref(route: Route): string {
  switch (route.page) {
    case 'application':
      return `#/applications/${encodeURIComponent(route.id)}`;
    case 'applications':
      return '#/applications';
    case 'answers':
      return '#/answers';
    case 'data':
      return '#/data';
    case 'settings':
      return '#/settings';
  }
}
