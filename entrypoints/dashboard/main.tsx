import { render } from 'preact';
import { App } from '../../shell/ui/App';
import { AppDataProvider } from '../../shell/ui/app-data';
import '../../shell/ui/styles.css';

const root = document.getElementById('app');
if (root) {
  render(
    <AppDataProvider>
      <App />
    </AppDataProvider>,
    root,
  );
}
