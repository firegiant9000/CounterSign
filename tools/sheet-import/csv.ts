interface Record {
  line: number;
  cells: string[];
  blank: boolean;
}

// Dependency-free RFC 4180 reader for the Google Sheets CSV exports.
export function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const input = text.startsWith('﻿') ? text.slice(1) : text;
  const records: Record[] = [];
  let pos = 0;
  let line = 1;

  while (pos < input.length) {
    const recordLine = line;
    const recordStart = pos;
    const cells: string[] = [];
    let field = '';
    let atFieldStart = true;
    let inQuotes = false;
    let quoteLine = 0;
    let blank = false;
    let terminated = false;

    while (!terminated && pos < input.length) {
      const ch = input.charAt(pos);

      if (inQuotes) {
        if (ch === '"') {
          if (input.charAt(pos + 1) === '"') {
            field += '"';
            pos += 2;
          } else {
            inQuotes = false;
            pos += 1;
          }
        } else {
          if (ch === '\n') line += 1;
          field += ch;
          pos += 1;
        }
      } else if (ch === '"' && atFieldStart) {
        inQuotes = true;
        quoteLine = line;
        atFieldStart = false;
        pos += 1;
      } else if (ch === ',') {
        cells.push(field);
        field = '';
        atFieldStart = true;
        pos += 1;
      } else if (
        ch === '\n' ||
        (ch === '\r' && input.charAt(pos + 1) === '\n')
      ) {
        blank = pos === recordStart;
        pos += ch === '\n' ? 1 : 2;
        line += 1;
        terminated = true;
      } else {
        field += ch;
        atFieldStart = false;
        pos += 1;
      }
    }

    if (inQuotes) {
      throw new Error(`CSV line ${quoteLine}: unterminated quoted field`);
    }
    cells.push(field);
    records.push({ line: recordLine, cells, blank });
  }

  while (records.length > 0 && records[records.length - 1]?.blank) {
    records.pop();
  }
  const first = records.shift();
  if (!first) {
    throw new Error('CSV is empty');
  }

  const header = first.cells;
  for (const record of records) {
    if (record.cells.length !== header.length) {
      throw new Error(
        `CSV line ${record.line}: expected ${header.length} cells, found ${record.cells.length}`,
      );
    }
  }
  return { header, rows: records.map((record) => record.cells) };
}
