import { render } from 'preact';
import { App } from '../../shell/ui/App';
import { AppDataProvider } from '../../shell/ui/app-data';
import '../../shell/ui/styles.css';
import '../../shell/ui/theme/tokens.css';
import '../../shell/ui/theme/fonts.css';
import '../../shell/ui/theme/base.css';
import '../../shell/ui/theme/print.css';

const root = document.getElementById('app');
if (root) {
  render(
    <AppDataProvider>
      <App />
    </AppDataProvider>,
    root,
  );
}
