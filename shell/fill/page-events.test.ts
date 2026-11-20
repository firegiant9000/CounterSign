// @vitest-environment happy-dom
import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import { notifyChanged } from './page/events';

const WATCHED = [
  'input',
  'change',
  'keydown',
  'keyup',
  'click',
  'focus',
  'blur',
  'submit',
];

function build(): { document: Document; input: Element } {
  const window = new Window({ url: 'https://example.com/apply' });
  window.document.write('<form><input name="full"></form>');
  const document = window.document as unknown as Document;
  const input = document.querySelector('input');
  if (!input) throw new Error('fixture has no input');
  return { document, input };
}

describe('notifyChanged', () => {
  it('dispatches exactly input then change', () => {
    const { document, input } = build();
    const events: Event[] = [];
    // Capture listeners see focus and blur, which do not bubble.
    for (const type of WATCHED) {
      document.addEventListener(type, (event) => events.push(event), {
        capture: true,
      });
    }

    notifyChanged(input);

    expect(events.map((event) => event.type)).toEqual(['input', 'change']);
    for (const event of events) {
      expect(event.bubbles).toBe(true);
      expect(event.target).toBe(input);
    }
  });
});
