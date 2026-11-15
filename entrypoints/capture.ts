import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { extractPosting } from '../shell/capture/extract';

export default defineUnlistedScript(() =>
  extractPosting(document, String(window.getSelection() ?? '')),
);
