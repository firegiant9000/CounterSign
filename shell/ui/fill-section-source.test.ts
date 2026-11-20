import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string): string =>
  readFileSync(join(import.meta.dirname, name), 'utf8');

const section = read('FillSection.tsx');
const popup = read('Popup.tsx');

describe('fill section source', () => {
  it('FillSection calls fill() exactly once, inside an onClick', () => {
    expect(section.match(/\.fill\(/g)).toHaveLength(1);
    expect(section).toMatch(
      /onClick=\{\(\) =>\s*void props\.controller\.fill\(\)/,
    );
  });

  it('Popup never calls fill()', () => {
    expect(popup).not.toMatch(/\.fill\(/);
  });

  it('neither file imports the injector', () => {
    expect(section).not.toMatch(/fill\/inject/);
    expect(popup).not.toMatch(/fill\/inject/);
  });

  it('shows what will be filled before the click', () => {
    expect(section).toMatch(/group\('Will fill', view\.willFill, true\)/);
  });

  it('the popup starts the scan beside capture', () => {
    const effect = /useEffect\(\(\) => \{[\s\S]*?\}, \[\]\)/.exec(popup);
    expect(effect).not.toBeNull();
    expect(effect?.[0]).toContain('.start()');
    expect(effect?.[0]).toContain('capturePage()');
  });
});
