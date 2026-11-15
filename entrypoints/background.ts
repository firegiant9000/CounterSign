import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { openDashboard } from '../shell/open-dashboard';

export default defineBackground(() => {
  browser.action.onClicked.addListener(() => void openDashboard());
});
