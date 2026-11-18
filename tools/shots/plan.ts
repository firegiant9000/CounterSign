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

export interface ElementMeasure {
  tag: string;
  className: string;
  scrollWidth: number;
  clientWidth: number;
}

export interface PopupMeasurement {
  rootWidth: number;
  bodyWidth: number;
  elements: ElementMeasure[];
}

// Elements that grow sideways. An input or textarea scrolling its own value is
// fine, and inline elements report clientWidth 0 (their block container is
// still checked); any other element with scrollWidth > clientWidth is overflow.
export function findOverflows(elements: ElementMeasure[]): ElementMeasure[] {
  return elements.filter(
    (e) =>
      e.tag !== 'input' &&
      e.tag !== 'textarea' &&
      e.clientWidth > 0 &&
      e.scrollWidth > e.clientWidth,
  );
}

export function popupProblem(
  m: PopupMeasurement,
  expectedWidth: number,
): string | undefined {
  if (m.rootWidth !== expectedWidth) {
    return `popup was measured at ${m.rootWidth}px, expected ${expectedWidth}px`;
  }
  const over = findOverflows(m.elements);
  if (over.length === 0) return undefined;
  const list = over
    .map(
      (o) =>
        `<${o.tag}${o.className ? ` class="${o.className}"` : ''}> scrollWidth ${o.scrollWidth} > clientWidth ${o.clientWidth}`,
    )
    .join('; ');
  return `popup scrolls sideways at ${expectedWidth}px (body ${m.bodyWidth}px): ${list}`;
}
