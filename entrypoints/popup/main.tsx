import { render } from 'preact';
import { AppDataProvider } from '../../shell/ui/app-data';
import { Popup } from '../../shell/ui/Popup';
import '../../shell/ui/popup.css';

const root = document.getElementById('app');
if (root) {
  render(
    <AppDataProvider>
      <Popup />
    </AppDataProvider>,
    root,
  );
}
