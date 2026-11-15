import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';

describe('parseCsv', () => {
  it('parses a plain file into a header and rows', () => {
    expect(parseCsv('name,status\nAcme,Applied\nBeta,Offer\n')).toEqual({
      header: ['name', 'status'],
      rows: [
        ['Acme', 'Applied'],
        ['Beta', 'Offer'],
      ],
    });
  });

  it('accepts a header with no rows', () => {
    expect(parseCsv('a,b\n')).toEqual({ header: ['a', 'b'], rows: [] });
  });

  it('keeps commas inside quoted fields', () => {
    expect(parseCsv('a,b\n"Doe, Jane","x, y"\n').rows).toEqual([
      ['Doe, Jane', 'x, y'],
    ]);
  });

  it('turns doubled quotes into a literal quote', () => {
    expect(parseCsv('a,b\n"say ""hi""",plain\n').rows).toEqual([
      ['say "hi"', 'plain'],
    ]);
  });

  it('keeps line breaks inside quoted fields and counts them for errors', () => {
    const parsed = parseCsv('a,b\n"one\ntwo",x\n');
    expect(parsed.rows).toEqual([['one\ntwo', 'x']]);

    // Physical lines: 1 header, 2-3 the quoted record, 4 the short record.
    expect(() => parseCsv('a,b\n"one\ntwo",x\nonly\n')).toThrow(
      'CSV line 4: expected 2 cells, found 1',
    );
  });

  it('reads CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n3,4\r\n')).toEqual({
      header: ['a', 'b'],
      rows: [
        ['1', '2'],
        ['3', '4'],
      ],
    });
  });

  it('strips a leading byte-order mark', () => {
    expect(parseCsv('﻿a,b\n1,2\n')).toEqual({
      header: ['a', 'b'],
      rows: [['1', '2']],
    });
  });

  it('ignores trailing blank lines', () => {
    expect(parseCsv('a,b\n1,2\n\n\n').rows).toEqual([['1', '2']]);
    expect(parseCsv('a,b\r\n1,2\r\n\r\n').rows).toEqual([['1', '2']]);
  });

  it('throws naming the line when a row has the wrong cell count', () => {
    expect(() => parseCsv('a,b,c\n1,2,3\n4,5\n')).toThrow(
      'CSV line 3: expected 3 cells, found 2',
    );
  });

  it('throws naming the line where an unterminated quote opened', () => {
    expect(() => parseCsv('a,b\n1,"open\n2,3')).toThrow(
      'CSV line 2: unterminated quoted field',
    );
  });

  it('throws on empty input', () => {
    expect(() => parseCsv('')).toThrow('CSV is empty');
    expect(() => parseCsv('﻿')).toThrow('CSV is empty');
    expect(() => parseCsv('\n\r\n')).toThrow('CSV is empty');
  });

  it('returns cell text exactly as written apart from quote removal', () => {
    expect(parseCsv('a, b \n 1 ,2\n')).toEqual({
      header: ['a', ' b '],
      rows: [[' 1 ', '2']],
    });
  });

  it('keeps Unicode text unchanged', () => {
    expect(parseCsv('title,note\nCo — Ltd™,"résumé ✓"\n').rows).toEqual([
      ['Co — Ltd™', 'résumé ✓'],
    ]);
  });
});
