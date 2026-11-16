import type { VNode } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { AnswersPage } from './AnswersPage';
import { ApplicationDetail } from './ApplicationDetail';
import { ApplicationsPage } from './ApplicationsPage';
import { BackupStatus } from './BackupStatus';
import { DataPage } from './DataPage';
import { parseRoute, routeHref } from './route';
import { SettingsPage } from './SettingsPage';
import type { Route } from './route';

function Page(props: { route: Route }): VNode {
  const { route } = props;
  switch (route.page) {
    case 'applications':
      return <ApplicationsPage />;
    case 'application':
      return <ApplicationDetail id={route.id} />;
    case 'answers':
      return <AnswersPage />;
    case 'data':
      return <DataPage />;
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

  const current = route.page === 'application' ? 'applications' : route.page;
  const link = (
    page: 'applications' | 'answers' | 'data' | 'settings',
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
        {link('answers', 'Answers')}
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
