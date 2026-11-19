import { render } from 'preact';
import { AppDataProvider } from '../../shell/ui/app-data';
import { Popup } from '../../shell/ui/Popup';
import '../../shell/ui/theme/popup-layout.css';
import '../../shell/ui/theme/tokens.css';
import '../../shell/ui/theme/fonts.css';
import '../../shell/ui/theme/base.css';

const root = document.getElementById('app');
if (root) {
  render(
    <AppDataProvider>
      <Popup />
    </AppDataProvider>,
    root,
  );
}
