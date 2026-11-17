export type Route =
  | { page: 'applications' }
  | { page: 'application'; id: string }
  | { page: 'pack'; id: string }
  | { page: 'deadlines' }
  | { page: 'answers' }
  | { page: 'data' }
  | { page: 'quiet' }
  | { page: 'contacts' }
  | { page: 'stories' }
  | { page: 'details' }
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
    case 'deadlines':
      return rest === undefined ? { page: 'deadlines' } : APPLICATIONS;
    case 'quiet':
      return rest === undefined ? { page: 'quiet' } : APPLICATIONS;
    case 'contacts':
      return rest === undefined ? { page: 'contacts' } : APPLICATIONS;
    case 'stories':
      return rest === undefined ? { page: 'stories' } : APPLICATIONS;
    case 'details':
      return rest === undefined ? { page: 'details' } : APPLICATIONS;
    case 'settings':
      return rest === undefined ? { page: 'settings' } : APPLICATIONS;
    case 'applications':
      if (rest === undefined || rest === '') return APPLICATIONS;
      try {
        return { page: 'application', id: decodeURIComponent(rest) };
      } catch {
        return APPLICATIONS;
      }
    case 'pack':
      if (rest === undefined || rest === '') return APPLICATIONS;
      try {
        return { page: 'pack', id: decodeURIComponent(rest) };
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
    case 'pack':
      return `#/pack/${encodeURIComponent(route.id)}`;
    case 'deadlines':
      return '#/deadlines';
    case 'answers':
      return '#/answers';
    case 'data':
      return '#/data';
    case 'quiet':
      return '#/quiet';
    case 'contacts':
      return '#/contacts';
    case 'stories':
      return '#/stories';
    case 'details':
      return '#/details';
    case 'settings':
      return '#/settings';
  }
}
