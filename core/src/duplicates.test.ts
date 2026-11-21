import { describe, expect, it } from 'vitest';
import { findApplicationMatch, repostFact } from './duplicates';
import { emptySnapshot } from './schema';
import type { Application, Company, Job, Snapshot } from './types';

const AT = 'T12:00:00.000Z';

function snap(parts: {
  companies?: Company[];
  applications?: Application[];
  jobs?: Job[];
}): Snapshot {
  return { ...emptySnapshot(), ...parts };
}

const company: Company = {
  id: 'c1',
  createdAt: `2026-01-01${AT}`,
  name: 'Example Robotics',
};

describe('findApplicationMatch', () => {
  it('already_applied through the job link', () => {
    const data = snap({
      companies: [company],
      jobs: [
        {
          id: 'j1',
          createdAt: `2026-01-01${AT}`,
          canonicalUrl: 'https://example.com/jobs/1',
        },
      ],
      applications: [{ id: 'a1', createdAt: `2026-01-02${AT}`, jobId: 'j1' }],
    });
    expect(
      findApplicationMatch(data, {
        canonicalUrl: 'https://example.com/jobs/1',
      }),
    ).toEqual({ kind: 'already_applied', applicationId: 'a1' });
  });

  describe('URL match against names', () => {
    const url = 'https://example.com/inbox';
    const data = snap({
      companies: [company],
      applications: [
        {
          id: 'a1',
          createdAt: `2026-01-02${AT}`,
          companyId: 'c1',
          title: 'Welder',
          url,
        },
      ],
    });

    it('a different company or title is not already_applied', () => {
      expect(
        findApplicationMatch(data, {
          canonicalUrl: url,
          companyName: 'Other Co',
          title: 'Welder',
        }),
      ).toBeUndefined();
      expect(
        findApplicationMatch(data, {
          canonicalUrl: url,
          companyName: 'Example Robotics',
          title: 'Pipefitter',
        }),
      ).toBeUndefined();
    });

    it('same names or no names is already_applied', () => {
      expect(
        findApplicationMatch(data, {
          canonicalUrl: url,
          companyName: 'example robotics',
          title: 'WELDER',
        }),
      ).toEqual({ kind: 'already_applied', applicationId: 'a1' });
      expect(findApplicationMatch(data, { canonicalUrl: url })).toEqual({
        kind: 'already_applied',
        applicationId: 'a1',
      });
    });
  });

  it('already_applied through app.url with a utm parameter', () => {
    const data = snap({
      applications: [
        {
          id: 'a1',
          createdAt: `2026-01-02${AT}`,
          url: 'https://example.com/jobs/2?utm_source=x',
        },
      ],
    });
    expect(
      findApplicationMatch(data, {
        canonicalUrl: 'https://example.com/jobs/2',
      }),
    ).toEqual({ kind: 'already_applied', applicationId: 'a1' });
  });

  it('possible_match on normalised company and same title, different URL', () => {
    const data = snap({
      companies: [company],
      applications: [
        {
          id: 'a1',
          createdAt: `2026-01-02${AT}`,
          companyId: 'c1',
          title: 'Welder',
          url: 'https://example.com/jobs/3',
        },
      ],
    });
    expect(
      findApplicationMatch(data, {
        canonicalUrl: 'https://example.com/other',
        companyName: ' example  robotics ',
        title: 'welder',
      }),
    ).toEqual({ kind: 'possible_match', applicationId: 'a1' });
  });

  it('no match when only the company matches', () => {
    const data = snap({
      companies: [company],
      applications: [
        {
          id: 'a1',
          createdAt: `2026-01-02${AT}`,
          companyId: 'c1',
          title: 'Welder',
        },
      ],
    });
    expect(
      findApplicationMatch(data, {
        canonicalUrl: 'https://example.com/other',
        companyName: 'Example Robotics',
        title: 'Painter',
      }),
    ).toBeUndefined();
  });

  it('does not throw on missing company or dangling links', () => {
    const data = snap({
      applications: [
        { id: 'a1', createdAt: `2026-01-02${AT}`, title: 'Welder' },
        {
          id: 'a2',
          createdAt: `2026-01-02${AT}`,
          jobId: 'nope',
          companyId: 'nope',
        },
      ],
    });
    expect(
      findApplicationMatch(data, {
        canonicalUrl: 'https://example.com/x',
        companyName: 'Example Robotics',
        title: 'Welder',
      }),
    ).toBeUndefined();
  });

  it('prefers already_applied, then the latest createdAt', () => {
    const data = snap({
      companies: [company],
      applications: [
        {
          id: 'a1',
          createdAt: `2026-01-02${AT}`,
          url: 'https://example.com/jobs/4',
        },
        {
          id: 'a2',
          createdAt: `2026-03-02${AT}`,
          url: 'https://example.com/jobs/4',
        },
        {
          id: 'a3',
          createdAt: `2026-05-02${AT}`,
          companyId: 'c1',
          title: 'Welder',
        },
      ],
    });
    expect(
      findApplicationMatch(data, {
        canonicalUrl: 'https://example.com/jobs/4',
        companyName: 'Example Robotics',
        title: 'Welder',
      }),
    ).toEqual({ kind: 'already_applied', applicationId: 'a2' });
  });

  it('does not match blank URLs', () => {
    const data = snap({
      applications: [{ id: 'a1', createdAt: `2026-01-02${AT}`, url: '  ' }],
    });
    expect(findApplicationMatch(data, { canonicalUrl: '' })).toBeUndefined();
  });
});

describe('form apply-page addresses', () => {
  const stored = 'https://jobs.lever.co/example/abc';
  const data = snap({
    jobs: [{ id: 'j1', createdAt: `2026-06-12${AT}`, canonicalUrl: stored }],
    applications: [{ id: 'a1', createdAt: `2026-06-13${AT}`, jobId: 'j1' }],
  });

  it('findApplicationMatch matches the /apply address of a stored job', () => {
    expect(
      findApplicationMatch(data, { canonicalUrl: `${stored}/apply` }),
    ).toEqual({ kind: 'already_applied', applicationId: 'a1' });
    expect(
      findApplicationMatch(data, {
        canonicalUrl: 'https://jobs.lever.co/example/other/apply',
      }),
    ).toBeUndefined();
  });

  it('matches the Ashby /application address of a stored job', () => {
    const ashby = 'https://jobs.ashbyhq.com/example/abc';
    const ashbyData = snap({
      jobs: [{ id: 'j2', createdAt: `2026-06-12${AT}`, canonicalUrl: ashby }],
      applications: [{ id: 'a2', createdAt: `2026-06-13${AT}`, jobId: 'j2' }],
    });
    expect(
      findApplicationMatch(ashbyData, { canonicalUrl: `${ashby}/application` }),
    ).toEqual({ kind: 'already_applied', applicationId: 'a2' });
    expect(
      repostFact(
        ashbyData,
        { canonicalUrl: `${ashby}/application` },
        '2026-11-15',
      )?.firstSavedOn,
    ).toBe('2026-06-12');
    expect(
      findApplicationMatch(ashbyData, {
        canonicalUrl: 'https://jobs.ashbyhq.com/example/zzz/application',
      }),
    ).toBeUndefined();
  });

  it('repostFact matches the /apply address of a stored job', () => {
    expect(
      repostFact(data, { canonicalUrl: `${stored}/apply` }, '2026-11-15')
        ?.firstSavedOn,
    ).toBe('2026-06-12');
    expect(
      repostFact(
        data,
        { canonicalUrl: 'https://jobs.lever.co/example/other/apply' },
        '2026-11-15',
      ),
    ).toBeUndefined();
  });
});

describe('repostFact', () => {
  const job = (id: string, day: string, extra: Partial<Job> = {}): Job => ({
    id,
    createdAt: `${day}${AT}`,
    canonicalUrl: 'https://example.com/jobs/9',
    ...extra,
  });
  const cand = { canonicalUrl: 'https://example.com/jobs/9' };

  it('months ago, same year omits the year', () => {
    expect(
      repostFact(snap({ jobs: [job('j1', '2026-06-12')] }), cand, '2026-11-15'),
    ).toEqual({
      firstSavedOn: '2026-06-12',
      text: 'You saved this posting on 12 June (5 months ago).',
    });
  });

  it('days ago across a year boundary includes the year', () => {
    expect(
      repostFact(snap({ jobs: [job('j1', '2026-12-20')] }), cand, '2027-01-02')
        ?.text,
    ).toBe('You saved this posting on 20 December 2026 (13 days ago).');
  });

  it('today and yesterday', () => {
    const data = snap({ jobs: [job('j1', '2026-11-15')] });
    expect(repostFact(data, cand, '2026-11-15')?.text).toBe(
      'You saved this posting on 15 November (today).',
    );
    expect(repostFact(data, cand, '2026-11-16')?.text).toBe(
      'You saved this posting on 15 November (yesterday).',
    );
  });

  it('1 month ago', () => {
    expect(
      repostFact(snap({ jobs: [job('j1', '2026-10-15')] }), cand, '2026-11-15')
        ?.text,
    ).toBe('You saved this posting on 15 October (1 month ago).');
  });

  it('matches by company and title and picks the earliest', () => {
    const data = snap({
      jobs: [
        job('j2', '2026-09-01', {
          canonicalUrl: undefined,
          companyName: 'Acme Co',
          title: 'Welder',
        }),
        job('j1', '2026-08-01', {
          canonicalUrl: undefined,
          companyName: ' acme  co',
          title: 'WELDER',
        }),
      ],
    });
    expect(
      repostFact(
        data,
        { companyName: 'Acme Co', title: 'Welder' },
        '2026-11-15',
      )?.firstSavedOn,
    ).toBe('2026-08-01');
  });

  it('ignores excludeJobId', () => {
    const data = snap({ jobs: [job('j1', '2026-06-12')] });
    expect(
      repostFact(data, { ...cand, excludeJobId: 'j1' }, '2026-11-15'),
    ).toBeUndefined();
  });

  it('returns undefined with no matching job, bad today, or unparseable date', () => {
    expect(repostFact(snap({}), cand, '2026-11-15')).toBeUndefined();
    expect(
      repostFact(snap({ jobs: [job('j1', '2026-06-12')] }), cand, 'nope'),
    ).toBeUndefined();
    const bad = snap({
      jobs: [
        { id: 'j1', createdAt: 'garbage', canonicalUrl: cand.canonicalUrl },
      ],
    });
    expect(repostFact(bad, cand, '2026-11-15')).toBeUndefined();
  });

  it('a shared URL with a different company or title is not a repost', () => {
    const named = job('j1', '2026-06-12', {
      companyName: 'Acme Co',
      title: 'Welder',
    });
    const data = snap({ jobs: [named] });
    expect(
      repostFact(data, { ...cand, companyName: 'Other Co' }, '2026-11-15'),
    ).toBeUndefined();
    expect(
      repostFact(
        data,
        { ...cand, companyName: 'Acme Co', title: 'Pipefitter' },
        '2026-11-15',
      ),
    ).toBeUndefined();
  });

  it('a shared URL with the same names or no candidate names keeps the URL wording', () => {
    const data = snap({
      jobs: [
        job('j1', '2026-06-12', { companyName: 'Acme Co', title: 'Welder' }),
      ],
    });
    const text = 'You saved this posting on 12 June (5 months ago).';
    expect(
      repostFact(
        data,
        { ...cand, companyName: 'acme co', title: 'welder' },
        '2026-11-15',
      )?.text,
    ).toBe(text);
    expect(repostFact(data, cand, '2026-11-15')?.text).toBe(text);
  });

  it('a name-only repost uses the company and title wording', () => {
    const data = snap({
      jobs: [
        job('j1', '2026-06-12', {
          canonicalUrl: undefined,
          companyName: 'Acme Co',
          title: 'Welder',
        }),
      ],
    });
    expect(
      repostFact(
        data,
        { companyName: 'Acme Co', title: 'Welder' },
        '2026-11-15',
      )?.text,
    ).toBe(
      'You saved a posting with the same company and title on 12 June (5 months ago).',
    );
  });

  it('uses today when firstSavedOn is in the future', () => {
    expect(
      repostFact(snap({ jobs: [job('j1', '2026-11-20')] }), cand, '2026-11-15')
        ?.text,
    ).toBe('You saved this posting on 20 November (today).');
  });
});
