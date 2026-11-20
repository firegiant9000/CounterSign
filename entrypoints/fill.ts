import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import type { ApplyResult } from '../core/src/fill/types';
import { createSession } from '../shell/fill/page/session';

interface FillHook {
  apply: (writes: unknown) => ApplyResult;
}

export default defineUnlistedScript(() => {
  const session = createSession(document);
  (globalThis as { __countersignFill?: FillHook }).__countersignFill = {
    apply: (writes: unknown) => session.apply(writes),
  };
  return session.scan();
});
