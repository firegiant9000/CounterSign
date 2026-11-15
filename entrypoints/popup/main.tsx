import { render } from 'preact';
import { openDashboard } from '../../shell/open-dashboard';

function Popup() {
  const open = () => {
    void openDashboard().then(() => window.close());
  };
  return (
    <main>
      <h1>Countersign</h1>
      <button type="button" onClick={open}>
        Open dashboard
      </button>
    </main>
  );
}

const root = document.getElementById('app');
if (root) render(<Popup />, root);
