import type { Route } from './route';

export type TabPage =
  | 'applications'
  | 'deadlines'
  | 'quiet'
  | 'contacts'
  | 'targets'
  | 'stories'
  | 'answers'
  | 'details'
  | 'weekly'
  | 'data'
  | 'settings';

export interface NavGroup {
  label?: string;
  items: readonly { page: TabPage; label: string }[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    items: [
      { page: 'applications', label: 'Applications' },
      { page: 'deadlines', label: 'Deadlines' },
      { page: 'quiet', label: 'Quiet' },
      { page: 'contacts', label: 'Contacts' },
      { page: 'targets', label: 'Targets' },
    ],
  },
  {
    label: 'Prep',
    items: [
      { page: 'stories', label: 'Stories' },
      { page: 'answers', label: 'Answers' },
      { page: 'details', label: 'My details' },
    ],
  },
  {
    label: 'Review',
    items: [
      { page: 'weekly', label: 'Weekly' },
      { page: 'data', label: 'Data' },
      { page: 'settings', label: 'Settings' },
    ],
  },
];

export function activeTab(route: Route): TabPage {
  switch (route.page) {
    case 'application':
    case 'pack':
      return 'applications';
    default:
      return route.page;
  }
}
