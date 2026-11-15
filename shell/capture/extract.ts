import type { CaptureResult } from '../../core/src/jobposting';
import { MAX_POSTING_TEXT, postingFromJsonLd } from '../../core/src/jobposting';

/** Description HTML to plain text, parsed in a fresh document (never the live page). */
function htmlToText(html: string): string | undefined {
  const parsed = new DOMParser().parseFromString(
    html.slice(0, 4 * MAX_POSTING_TEXT),
    'text/html',
  );
  const body = parsed.body as HTMLElement | null;
  if (!body) return undefined;
  for (const el of Array.from(body.querySelectorAll('script, style'))) {
    el.remove();
  }
  // Keep words from adjacent blocks apart (fresh document only).
  for (const el of Array.from(body.querySelectorAll('br'))) {
    el.replaceWith(parsed.createTextNode(' '));
  }
  for (const el of Array.from(
    body.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6, tr, td, ul, ol'),
  )) {
    el.append(parsed.createTextNode(' '));
  }
  const text = (body.textContent ?? '').replace(/\s+/g, ' ').trim();
  return text === '' ? undefined : text;
}

function cap(text: string): string {
  return text.length > MAX_POSTING_TEXT
    ? text.slice(0, MAX_POSTING_TEXT)
    : text;
}

function extract(doc: Document, selection: string, url: string): CaptureResult {
  const result: CaptureResult = { source: 'none', url };

  try {
    const canonical = doc
      .querySelector('link[rel~="canonical"]')
      ?.getAttribute('href')
      ?.trim();
    if (canonical) result.relCanonical = canonical;
  } catch {
    // A hostile page must not lose the capture over the canonical link.
  }

  const blocks = Array.from(
    doc.querySelectorAll('script[type="application/ld+json"]'),
  ).map((el) => el.textContent ?? '');
  const posting = postingFromJsonLd(blocks);
  if (posting) {
    result.source = 'jsonld';
    if (posting.title !== undefined) result.title = posting.title;
    if (posting.companyName !== undefined) {
      result.companyName = posting.companyName;
    }
    if (posting.location !== undefined) result.location = posting.location;
    if (posting.descriptionHtml !== undefined) {
      const text = htmlToText(posting.descriptionHtml);
      if (text !== undefined) result.text = cap(text);
    }
    return result;
  }

  const trimmed = typeof selection === 'string' ? selection.trim() : '';
  if (trimmed !== '') {
    result.source = 'selection';
    result.text = cap(trimmed);
    try {
      // Named elements can shadow doc.title with a non-string.
      const title = (typeof doc.title === 'string' ? doc.title : '').trim();
      if (title !== '') result.title = title;
    } catch {
      // Keep the selection even if the title cannot be read.
    }
  }
  return result;
}

/** Reads a job posting from a page. Never throws and never modifies `doc`. */
export function extractPosting(
  doc: Document,
  selection: string,
): CaptureResult {
  let url = '';
  try {
    url = doc.location?.href ?? '';
    return extract(doc, selection, url);
  } catch {
    return { source: 'none', url };
  }
}
