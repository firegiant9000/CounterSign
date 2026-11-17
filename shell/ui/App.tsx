import type { VNode } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { AnswersPage } from './AnswersPage';
import { ApplicationDetail } from './ApplicationDetail';
import { ApplicationsPage } from './ApplicationsPage';
import { BackupStatus } from './BackupStatus';
import { ContactsPage } from './ContactsPage';
import { CopyPanel } from './CopyPanel';
import { DataPage } from './DataPage';
import { DeadlinesPage } from './DeadlinesPage';
import { PackPage } from './PackPage';
import { QuietList } from './QuietList';
import { parseRoute, routeHref } from './route';
import { SettingsPage } from './SettingsPage';
import { StoriesPage } from './StoriesPage';
import type { Route } from './route';

function Page(props: { route: Route }): VNode {
  const { route } = props;
  switch (route.page) {
    case 'applications':
      return <ApplicationsPage />;
    case 'application':
      return <ApplicationDetail key={route.id} id={route.id} />;
    case 'pack':
      return <PackPage key={route.id} id={route.id} />;
    case 'answers':
      return <AnswersPage />;
    case 'data':
      return <DataPage />;
    case 'deadlines':
      return <DeadlinesPage />;
    case 'quiet':
      return <QuietList />;
    case 'contacts':
      return <ContactsPage />;
    case 'stories':
      return <StoriesPage />;
    case 'details':
      return <CopyPanel />;
    case 'settings':
      return <SettingsPage />;
  }
}

export function App(): VNode {
  const [route, setRoute] = useState<Route>(() => parseRoute(location.hash));

  useEffect(() => {
    const onChange = (): void => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const current =
    route.page === 'application' || route.page === 'pack'
      ? 'applications'
      : route.page;
  const link = (
    page:
      | 'applications'
      | 'deadlines'
      | 'quiet'
      | 'contacts'
      | 'stories'
      | 'answers'
      | 'details'
      | 'data'
      | 'settings',
    label: string,
  ) => (
    <a
      href={routeHref({ page })}
      class={current === page ? 'active' : undefined}
    >
      {label}
    </a>
  );

  return (
    <>
      <nav class="nav">
        {link('applications', 'Applications')}
        {link('deadlines', 'Deadlines')}
        {link('quiet', 'Quiet')}
        {link('contacts', 'Contacts')}
        {link('stories', 'Stories')}
        {link('answers', 'Answers')}
        {link('details', 'My details')}
        {link('data', 'Data')}
        {link('settings', 'Settings')}
      </nav>
      <BackupStatus />
      <main>
        <Page route={route} />
      </main>
    </>
  );
}
