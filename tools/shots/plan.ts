import { join } from 'node:path';

export type Theme = 'day' | 'night';

export interface Shot {
  name: string;
  path: string;
  width: number;
  height: number;
  fullPage: boolean;
}

// Every route page except 'application' and 'pack', which need an id.
export const DASHBOARD_PAGES: readonly string[] = [
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
];

const DASHBOARD_WIDTH = 1280;
const DASHBOARD_HEIGHT = 900;

function dashboard(name: string, hash: string, width = DASHBOARD_WIDTH): Shot {
  return {
    name,
    path: `dashboard.html#/${hash}`,
    width,
    height: DASHBOARD_HEIGHT,
    fullPage: true,
  };
}

function popup(name: string): Shot {
  return {
    name,
    path: 'popup.html',
    width: 360,
    height: 600,
    fullPage: false,
  };
}

export function shotPlan(ids: { applicationId: string }): Shot[] {
  const id = encodeURIComponent(ids.applicationId);
  return [
    ...DASHBOARD_PAGES.map((page) => dashboard(page, page)),
    dashboard('application', `applications/${id}`),
    dashboard('pack', `pack/${id}`),
    dashboard('applications-900', 'applications', 900),
    popup('popup-paste'),
    popup('popup-filed'),
    popup('popup-long-url'),
  ];
}

export function outputDir(root: string, now: Date, theme: Theme): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
  return join(root, '.shots', stamp, theme);
}
