interface ParsedRecord {
  line: number;
  cells: string[];
  blank: boolean;
}

// Dependency-free RFC 4180 reader for the Google Sheets CSV exports.
export function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const input = text.startsWith('\uFEFF') ? text.slice(1) : text;
  let header: string[] | undefined;
  const rows: string[][] = [];
  // Line of the first blank record since the last non-blank record. It is an
  // error only if real data follows; blank lines at the end are ignored.
  let pendingBlank: number | undefined;
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
            const next = input.charAt(pos);
            const endsField =
              next === '' ||
              next === ',' ||
              next === '\n' ||
              (next === '\r' && input.charAt(pos + 1) === '\n');
            if (!endsField) {
              throw new Error(
                `CSV line ${line}: unexpected character after closing quote`,
              );
            }
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
      } else if (ch === '\r') {
        throw new Error(`CSV line ${line}: unexpected carriage return`);
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

    // Each record is checked as soon as it completes, so an error in an
    // earlier line is reported before a later problem is reached.
    const record: ParsedRecord = { line: recordLine, cells, blank };
    if (record.blank) {
      pendingBlank ??= record.line;
      continue;
    }
    if (pendingBlank !== undefined) {
      throw new Error(`CSV line ${pendingBlank}: blank line`);
    }
    if (header === undefined) {
      header = record.cells;
    } else {
      if (record.cells.length !== header.length) {
        throw new Error(
          `CSV line ${record.line}: expected ${header.length} cells, found ${record.cells.length}`,
        );
      }
      rows.push(record.cells);
    }
  }

  if (header === undefined) {
    throw new Error('CSV is empty');
  }
  return { header, rows };
}
