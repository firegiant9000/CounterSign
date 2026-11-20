import type { ApplyResult, FormScan } from '../../../core/src/fill/types';
import { applyWrites } from './apply';
import { scanForm, type FieldElements } from './scan';

export interface FillSession {
  scan(): FormScan;
  apply(writes: unknown): ApplyResult;
}

export function createSession(doc: Document): FillSession {
  let elements: FieldElements[] = [];

  function scan(): FormScan {
    const page = scanForm(doc);
    elements = page.elements;
    return page.scan;
  }

  return {
    scan,
    apply(writes: unknown): ApplyResult {
      const outcomes = applyWrites(elements, writes);
      return { outcomes, scan: scan() };
    },
  };
}
