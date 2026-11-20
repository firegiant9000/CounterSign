// @vitest-environment happy-dom
import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import { fieldLabel, groupLabel } from './page/label';

function load(body: string): Document {
  const window = new Window({ url: 'https://example.com/apply' });
  window.document.write(`<html><body>${body}</body></html>`);
  return window.document as unknown as Document;
}

const isField = (): boolean => true;

describe('fieldLabel', () => {
  it('aria-labelledby wins over a label for', () => {
    const doc = load(
      '<span id="q">Full name</span><label for="a">Other</label><input id="a" aria-labelledby="q">',
    );
    expect(fieldLabel(doc.getElementById('a')!, isField)).toBe('Full name');
  });

  it('joins two labelledby ids with a space', () => {
    const doc = load(
      '<span id="p">Example Robotics</span><span id="q">Phone</span><input id="a" aria-labelledby="p missing q">',
    );
    expect(fieldLabel(doc.getElementById('a')!, isField)).toBe(
      'Example Robotics Phone',
    );
  });

  it('label for', () => {
    const doc = load('<label for="a">Full name</label><input id="a">');
    expect(fieldLabel(doc.getElementById('a')!, isField)).toBe('Full name');
  });

  it('wrapping label', () => {
    const doc = load('<label>Full name <input id="a"></label>');
    expect(fieldLabel(doc.getElementById('a')!, isField)).toBe('Full name');
  });

  it("a wrapping label leaves out a nested select's options", () => {
    const doc = load(
      '<label>Country <select id="a"><option>Freedonia</option><option>Sylvania</option></select></label>',
    );
    expect(fieldLabel(doc.getElementById('a')!, isField)).toBe('Country');
  });

  it('aria-label when there is no label element', () => {
    const doc = load('<input id="a" aria-label="Phone">');
    expect(fieldLabel(doc.getElementById('a')!, isField)).toBe('Phone');
  });

  it('nearest container, Lever shape', () => {
    const doc = load(
      '<li><div class="application-label">Phone</div><div><input id="a"></div></li>',
    );
    expect(fieldLabel(doc.getElementById('a')!, isField)).toBe('Phone');
  });

  it('does not climb past a container with another field', () => {
    const doc = load(
      '<div><h2>Contact</h2><ul>' +
        '<li><div>Phone</div><div><input id="a"></div></li>' +
        '<li><div>Email</div><div><input id="b"></div></li>' +
        '</ul></div>',
    );
    expect(fieldLabel(doc.getElementById('a')!, isField)).toBe('Phone');
    expect(fieldLabel(doc.getElementById('b')!, isField)).toBe('Email');
  });

  it('a placeholder is not a label', () => {
    const doc = load(
      '<div><input id="a" placeholder="Email" title="Mail"></div>',
    );
    expect(fieldLabel(doc.getElementById('a')!, isField)).toBe('');
  });

  it('caps at 300 characters', () => {
    const doc = load(`<label>${'a'.repeat(500)}<input id="a"></label>`);
    expect(fieldLabel(doc.getElementById('a')!, isField)).toBe('a'.repeat(300));
  });

  it('trims again when the cut ends on a space', () => {
    const doc = load(`<label>${'a'.repeat(299)} bbb<input id="a"></label>`);
    expect(fieldLabel(doc.getElementById('a')!, isField)).toBe('a'.repeat(299));
  });

  it('collapses whitespace and newlines', () => {
    const doc = load('<label>  Full \n\t name  here  <input id="a"></label>');
    expect(fieldLabel(doc.getElementById('a')!, isField)).toBe(
      'Full name here',
    );
  });

  it('does not use a label for an element without an id', () => {
    const doc = load('<label for="">Stray</label><div><input></div>');
    expect(fieldLabel(doc.querySelector('input')!, isField)).toBe('');
  });

  it('respects isCandidate when deciding what a container holds', () => {
    const doc = load(
      '<div><span>Phone</span><input type="hidden" id="h"><input id="a"></div>',
    );
    const notHidden = (o: Element): boolean =>
      o.getAttribute('type') !== 'hidden';
    expect(fieldLabel(doc.getElementById('a')!, notHidden)).toBe('Phone');
    expect(fieldLabel(doc.getElementById('a')!, isField)).toBe('');
  });
});

describe('groupLabel', () => {
  it('uses the legend of a fieldset', () => {
    const doc = load(
      '<fieldset><legend>Work authorisation</legend><label><input type="radio" name="w">Yes</label><label><input type="radio" name="w">No</label></fieldset>',
    );
    const members = [...doc.querySelectorAll('input')];
    expect(groupLabel(members, isField)).toBe('Work authorisation');
  });

  it('uses aria-labelledby on a radiogroup', () => {
    const doc = load(
      '<span id="q">Do you need sponsorship?</span><div role="radiogroup" aria-labelledby="q"><label><input type="radio" name="s">Yes</label><label><input type="radio" name="s">No</label></div>',
    );
    const members = [...doc.querySelectorAll('input')];
    expect(groupLabel(members, isField)).toBe('Do you need sponsorship?');
  });

  it('uses the question text of a container without the members labels', () => {
    const doc = load(
      '<div><p>Do you need sponsorship?</p><label><input type="checkbox">Yes</label><label><input type="checkbox">No</label></div>',
    );
    const members = [...doc.querySelectorAll('input')];
    expect(groupLabel(members, isField)).toBe('Do you need sponsorship?');
  });

  it('leaves out labels that point at a member by id', () => {
    const doc = load(
      '<div><p>Pick one</p><input type="radio" id="r1"><label for="r1">Yes</label><input type="radio" id="r2"><label for="r2">No</label></div>',
    );
    const members = [...doc.querySelectorAll('input')];
    expect(groupLabel(members, isField)).toBe('Pick one');
  });

  it('does not use a fieldset that holds another field', () => {
    const doc = load(
      '<fieldset><legend>Everything</legend><input id="x"><div><p>Pick one</p><label><input type="checkbox">Yes</label></div></fieldset>',
    );
    const members = [doc.querySelector('input[type=checkbox]')!];
    expect(groupLabel(members, isField)).toBe('Pick one');
  });
});
