import type { VNode } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { AnswersPage } from './AnswersPage';
import { ApplicationDetail } from './ApplicationDetail';
import { ApplicationsPage } from './ApplicationsPage';
import { parseRoute, routeHref } from './route';
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
      return <h1>Data</h1>;
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
  const link = (page: 'applications' | 'answers' | 'data', label: string) => (
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
      </nav>
      <main>
        <Page route={route} />
      </main>
    </>
  );
}
