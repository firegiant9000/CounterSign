// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import { toApplyResult } from '../../core/src/fill/validate';
import { createSession } from './page/session';

function load(name: string): Document {
  const window = new Window({ url: 'https://example.com/jobs/1' });
  window.document.write(
    readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8'),
  );
  return window.document as unknown as Document;
}

const WRITE = [{ ref: 0, kind: 'value', value: 'Sam Example' }];

describe('createSession', () => {
  it('scan then apply writes the field and rescans', () => {
    const session = createSession(load('lever-like.html'));
    session.scan();
    const result = session.apply(WRITE);
    expect(result.outcomes).toEqual([{ ref: 0, outcome: 'written' }]);
    expect(result.scan.fields[0]?.value).toBe('Sam Example');
  });

  it('reports every write as gone when apply runs before scan', () => {
    const session = createSession(load('lever-like.html'));
    const result = session.apply(WRITE);
    expect(result.outcomes).toEqual([{ ref: 0, outcome: 'gone' }]);
    expect(result.scan.fields.length).toBeGreaterThan(0);
  });

  it('a second scan replaces the elements', () => {
    const doc = load('lever-like.html');
    const session = createSession(doc);
    const first = session.scan();
    const firstId = first.fields[0]?.label;
    const el = doc.querySelector('input[name="name"]');
    el?.remove();
    const second = session.scan();
    expect(second.fields.length).toBe(first.fields.length - 1);
    const result = session.apply(WRITE);
    expect(result.outcomes).toEqual([{ ref: 0, outcome: 'written' }]);
    expect(result.scan.fields[0]?.value).toBe('Sam Example');
    expect(result.scan.fields[0]?.label).toBe(second.fields[0]?.label);
    expect(result.scan.fields[0]?.label).not.toBe(firstId);
  });

  it('returns plain data that passes validation', () => {
    const session = createSession(load('lever-like.html'));
    session.scan();
    const result = session.apply(WRITE);
    expect(toApplyResult(result)).toEqual(result);
    expect(Object.keys(result).sort()).toEqual(['outcomes', 'scan']);
    expect(Object.keys(session.scan())).not.toContain('elements');
  });
});
