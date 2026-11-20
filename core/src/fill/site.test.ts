import { describe, expect, it } from 'vitest';
import { FRAME_HOSTS, frameAdvice, siteTypeForUrl } from './site';

describe('FRAME_HOSTS', () => {
  it('maps the Greenhouse and Ashby embed hosts', () => {
    expect(FRAME_HOSTS.size).toBe(3);
    expect(FRAME_HOSTS.get('job-boards.greenhouse.io')).toBe('greenhouse');
    expect(FRAME_HOSTS.get('boards.greenhouse.io')).toBe('greenhouse');
    expect(FRAME_HOSTS.get('jobs.ashbyhq.com')).toBe('ashby');
  });
});

describe('siteTypeForUrl', () => {
  it.each([
    ['https://job-boards.greenhouse.io/exampleco/jobs/1', 'greenhouse'],
    ['https://jobs.lever.co/exampleco/abc/apply', 'lever'],
    ['https://jobs.ashbyhq.com/exampleco/abc/application', 'ashby'],
    ['https://exampleco.wd5.myworkdayjobs.com/x', 'workday'],
    ['https://www.linkedin.com/jobs/view/1', 'linkedin'],
    ['https://uk.indeed.com/viewjob', 'indeed'],
    ['https://example.com/careers', 'other'],
    ['https://evil-greenhouse.io/', 'other'],
    ['https://greenhouse.io.example.com/', 'other'],
    ['not a url', 'other'],
    ['', 'other'],
    ['about:addons', 'other'],
    ['ftp://jobs.lever.co/x', 'other'],
    ['HTTPS://JOBS.LEVER.CO/x', 'lever'],
    ['https://lever.co/', 'lever'],
  ])('siteTypeForUrl(%j) is %s', (url, expected) => {
    expect(siteTypeForUrl(url)).toBe(expected);
  });
});

describe('frameAdvice', () => {
  it('returns one greenhouse entry with the original src', () => {
    const src =
      'https://job-boards.greenhouse.io/embed/job_app?for=exampleco&token=1';
    expect(frameAdvice(['https://example.com/video', src])).toEqual([
      { site: 'greenhouse', src },
    ]);
  });

  it('returns an ashby entry for an Ashby frame', () => {
    const src = 'https://jobs.ashbyhq.com/exampleco';
    expect(frameAdvice([src])).toEqual([{ site: 'ashby', src }]);
  });

  it('keeps only the first frame for a site', () => {
    const first = 'https://boards.greenhouse.io/embed/a';
    const second = 'https://job-boards.greenhouse.io/embed/b';
    expect(frameAdvice([first, second])).toEqual([
      { site: 'greenhouse', src: first },
    ]);
  });

  it('puts greenhouse before ashby whatever the order', () => {
    const ashby = 'https://jobs.ashbyhq.com/exampleco';
    const greenhouse = 'https://boards.greenhouse.io/embed/a';
    expect(frameAdvice([ashby, greenhouse])).toEqual([
      { site: 'greenhouse', src: greenhouse },
      { site: 'ashby', src: ashby },
    ]);
  });

  it('ignores frames that do not parse', () => {
    expect(frameAdvice(['nonsense'])).toEqual([]);
  });

  it('ignores a look-alike host', () => {
    expect(frameAdvice(['https://jobs.ashbyhq.com.example.com/x'])).toEqual([]);
  });

  it('ignores non-https frames', () => {
    expect(frameAdvice(['http://jobs.ashbyhq.com/exampleco'])).toEqual([]);
  });

  it('returns an empty list for no frames', () => {
    expect(frameAdvice([])).toEqual([]);
  });
});
