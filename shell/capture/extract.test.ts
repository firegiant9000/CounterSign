// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import { extractPosting } from './extract';

function load(name: string): Document {
  const html = readFileSync(
    join(import.meta.dirname, 'fixtures', name),
    'utf8',
  );
  const window = new Window({ url: 'https://example.com/jobs/1' });
  window.document.write(html);
  return window.document as unknown as Document;
}

function withJsonLd(description: string): Document {
  const window = new Window({ url: 'https://example.com/jobs/1' });
  const json = JSON.stringify({ '@type': 'JobPosting', description });
  window.document.write(
    `<html><head><script type="application/ld+json">${json.replace(/</g, '\\u003c')}</script></head><body></body></html>`,
  );
  return window.document as unknown as Document;
}

describe('extractPosting', () => {
  it('reads a plain JobPosting block', () => {
    const r = extractPosting(load('jsonld.html'), '');
    expect(r.source).toBe('jsonld');
    expect(r.url).toBe('https://example.com/jobs/1');
    expect(r.title).toBe('Robotics Engineer');
    expect(r.companyName).toBe('Acme Robotics');
    expect(r.location).toBe('Springfield, IL');
    expect(r.text).toBe('Build robots for Acme.');
  });

  it('finds a JobPosting inside @graph', () => {
    const r = extractPosting(load('jsonld-graph.html'), '');
    expect(r.source).toBe('jsonld');
    expect(r.title).toBe('Data Analyst');
    expect(r.companyName).toBe('Globex Analytics');
    expect('location' in r).toBe(false);
  });

  it('finds a JobPosting inside a top-level array', () => {
    const r = extractPosting(load('jsonld-array.html'), '');
    expect(r.source).toBe('jsonld');
    expect(r.title).toBe('Support Lead');
    expect(r.companyName).toBe('Initech Labs');
  });

  it('ignores malformed JSON-LD and falls back to none', () => {
    const r = extractPosting(load('jsonld-malformed.html'), '');
    expect(r).toEqual({ source: 'none', url: 'https://example.com/jobs/1' });
  });

  it('uses the selection when there is no JSON-LD', () => {
    const r = extractPosting(
      load('selection-only.html'),
      '  Pack and ship orders.  ',
    );
    expect(r.source).toBe('selection');
    expect(r.text).toBe('Pack and ship orders.');
    expect(r.title).toBe('Warehouse Associate at Hooli Logistics');
  });

  it('returns none when there is nothing to capture', () => {
    const r = extractPosting(load('nothing.html'), '   ');
    expect(r).toEqual({ source: 'none', url: 'https://example.com/jobs/1' });
  });

  it('reads the canonical href as written', () => {
    const r = extractPosting(load('canonical.html'), '');
    expect(r.relCanonical).toBe('/jobs/9');
  });

  it('turns description HTML into text and drops scripts', () => {
    const doc = withJsonLd(
      '<p>Build <b>robots</b></p><script>alert(1)</script>',
    );
    expect(extractPosting(doc, '').text).toBe('Build robots');
  });

  it('keeps words from adjacent blocks apart', () => {
    expect(extractPosting(withJsonLd('<p>One</p><p>Two</p>'), '').text).toBe(
      'One Two',
    );
    expect(extractPosting(withJsonLd('a<br>b'), '').text).toBe('a b');
    expect(
      extractPosting(withJsonLd('<ul><li>a</li><li>b</li></ul>'), '').text,
    ).toBe('a b');
  });

  it('caps a description larger than the cap', () => {
    const doc = withJsonLd(`<p>${'x'.repeat(150_000)}</p>`);
    const r = extractPosting(doc, '');
    expect(r.source).toBe('jsonld');
    expect(r.text?.length).toBe(100_000);
  });

  it('keeps the selection when a named element shadows document.title', () => {
    const window = new Window({ url: 'https://example.com/jobs/1' });
    window.document.write(
      '<html><head><title>T</title></head><body><form name="title"></form></body></html>',
    );
    const doc = window.document as unknown as Document;
    const r = extractPosting(doc, 'Selected text');
    expect(r.source).toBe('selection');
    expect(r.text).toBe('Selected text');
  });

  it('keeps the selection when reading document.title throws or is not a string', () => {
    for (const get of [
      () => {
        throw new Error('x');
      },
      () => ({ tagName: 'FORM' }),
    ]) {
      const doc = load('selection-only.html');
      Object.defineProperty(doc, 'title', { get, configurable: true });
      const r = extractPosting(doc, 'Selected text');
      expect(r.source).toBe('selection');
      expect(r.text).toBe('Selected text');
      expect('title' in r).toBe(false);
    }
  });

  it('caps the text', () => {
    const r = extractPosting(load('nothing.html'), 'a'.repeat(150_000));
    expect(r.text?.length).toBe(100_000);
  });

  it('does not modify the page document', () => {
    const doc = load('jsonld.html');
    const before = doc.documentElement.outerHTML;
    extractPosting(doc, 'x');
    expect(doc.documentElement.outerHTML).toBe(before);
  });

  it('does not throw on a broken document', () => {
    const broken = {
      querySelectorAll: () => {
        throw new Error('boom');
      },
      location: { href: 'https://example.com/x' },
    } as unknown as Document;
    expect(extractPosting(broken, '')).toEqual({
      source: 'none',
      url: 'https://example.com/x',
    });
  });
});
