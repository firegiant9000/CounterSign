import { describe, expect, it } from 'vitest';
import { interviewPack } from './pack';
import type { Snapshot } from './types';

const T = '2026-01-01T00:00:00.000Z';

function snap(parts: Record<string, unknown> = {}): Snapshot {
  return {
    applications: [],
    companies: [],
    jobs: [],
    documents: [],
    statements: [],
    canonicalAnswers: [],
    contacts: [],
    rounds: [],
    statusEvents: [],
    ...parts,
  } as unknown as Snapshot;
}

describe('interviewPack', () => {
  it('gives undefined for a missing application', () => {
    expect(interviewPack(snap(), 'nope', {})).toBeUndefined();
  });

  it('a bare application still gives a pack', () => {
    const data = snap({ applications: [{ id: 'a1', createdAt: T }] });
    const pack = interviewPack(data, 'a1', {});
    expect(pack).toBeDefined();
    expect(pack?.applicationId).toBe('a1');
    expect(pack?.companyName).toBe('Unknown company');
    expect(pack?.title).toBe('Untitled');
    expect(pack?.statements).toEqual([]);
    expect(pack?.contacts).toEqual([]);
    expect(pack?.rounds).toEqual([]);
    expect(pack?.unresolved).toBe(0);
    expect(pack?.job).toBeUndefined();
    expect(pack?.resume).toBeUndefined();
    expect(pack?.coverLetter).toBeUndefined();
    expect(pack?.projectsShown).toBeUndefined();
    expect(pack?.url).toBeUndefined();
  });

  it('dangling links', () => {
    const data = snap({
      applications: [
        {
          id: 'a1',
          createdAt: T,
          jobId: 'gone',
          resumeDocumentId: 'gone-doc',
          coverLetterDocumentId: 'gone-doc2',
          companyId: 'gone-co',
          projectsShown: 42,
          url: 7,
        },
      ],
    });
    const pack = interviewPack(data, 'a1', {});
    expect(pack?.job).toBeUndefined();
    expect(pack?.resume).toBeUndefined();
    expect(pack?.coverLetter).toBeUndefined();
    expect(pack?.projectsShown).toBeUndefined();
    expect(pack?.contacts).toEqual([]);
  });

  it('fills in the linked records and details', () => {
    const data = snap({
      companies: [{ id: 'co1', createdAt: T, name: 'Example Robotics' }],
      applications: [
        {
          id: 'a1',
          createdAt: T,
          companyId: 'co1',
          title: 'Firmware Engineer',
          url: 'https://example.com/jobs/1',
          jobId: 'j1',
          resumeDocumentId: 'd1',
          coverLetterDocumentId: 'd2',
          projectsShown: 'Motor controller demo',
        },
      ],
      jobs: [{ id: 'j1', createdAt: T, text: 'Posting text' }],
      documents: [
        { id: 'd1', createdAt: T, fileName: 'resume.pdf' },
        { id: 'd2', createdAt: T, fileName: 'letter.pdf' },
      ],
      contacts: [
        { id: 'c1', createdAt: T, companyId: 'co1', name: 'Sam Example' },
        { id: 'c2', createdAt: T, companyId: 'other', name: 'Not Here' },
      ],
      statusEvents: [
        {
          id: 'e1',
          createdAt: T,
          applicationId: 'a1',
          status: 'applied',
          occurredOn: '2026-01-02',
        },
      ],
    });
    const pack = interviewPack(data, 'a1', {
      statusLabels: { applied: 'Sent' },
    });
    expect(pack?.companyName).toBe('Example Robotics');
    expect(pack?.title).toBe('Firmware Engineer');
    expect(pack?.url).toBe('https://example.com/jobs/1');
    expect(pack?.statusLabel).toBe('Sent');
    expect(pack?.job?.id).toBe('j1');
    expect(pack?.resume?.id).toBe('d1');
    expect(pack?.coverLetter?.id).toBe('d2');
    expect(pack?.projectsShown).toBe('Motor controller demo');
    expect(pack?.contacts.map((c) => c.id)).toEqual(['c1']);
  });

  it('counts unresolved mismatches', () => {
    const yes = { type: 'yes_no', value: true };
    const no = { type: 'yes_no', value: false };
    const data = snap({
      applications: [{ id: 'a1', createdAt: T }],
      canonicalAnswers: [
        {
          id: 'k1',
          createdAt: T,
          key: 'relocate',
          label: 'Willing to relocate',
          value: yes,
        },
        { id: 'k2', createdAt: T, key: 'remote', value: yes },
        { id: 'k3', createdAt: T, key: 'visa', label: 'Visa', value: yes },
      ],
      statements: [
        {
          id: 's1',
          createdAt: '2026-01-01T00:00:01.000Z',
          applicationId: 'a1',
          answerKey: 'relocate',
          value: no,
        },
        {
          id: 's2',
          createdAt: '2026-01-01T00:00:02.000Z',
          applicationId: 'a1',
          answerKey: 'remote',
          value: no,
          exception: true,
        },
        {
          id: 's3',
          createdAt: '2026-01-01T00:00:03.000Z',
          applicationId: 'a1',
          answerKey: 'visa',
          value: yes,
        },
        {
          id: 's4',
          createdAt: '2026-01-01T00:00:04.000Z',
          applicationId: 'other',
          answerKey: 'visa',
          value: no,
        },
      ],
    });
    const pack = interviewPack(data, 'a1', {});
    expect(pack?.statements.map((s) => [s.id, s.result])).toEqual([
      ['s1', 'mismatch'],
      ['s2', 'exception'],
      ['s3', 'ok'],
    ]);
    expect(pack?.unresolved).toBe(1);
    expect(pack?.statements[0]).toEqual({
      id: 's1',
      label: 'Willing to relocate',
      told: 'No',
      canonical: 'Yes',
      fromFill: false,
      result: 'mismatch',
    });
    // No label on the answer: falls back to its key.
    expect(pack?.statements[1]?.label).toBe('remote');
  });

  it('a statement with no canonical answer omits canonical', () => {
    const data = snap({
      applications: [{ id: 'a1', createdAt: T }],
      statements: [
        {
          id: 's1',
          createdAt: T,
          applicationId: 'a1',
          answerKey: 'lost',
          value: { type: 'text', value: 'hi' },
        },
        { id: 's2', createdAt: T, applicationId: 'a1' },
      ],
    });
    const pack = interviewPack(data, 'a1', {});
    const first = pack?.statements.find((s) => s.id === 's1');
    const second = pack?.statements.find((s) => s.id === 's2');
    expect(first?.label).toBe('lost');
    expect(first && 'canonical' in first).toBe(false);
    expect(second?.label).toBe('Unknown answer');
    expect(second?.told).toBe('');
    expect(pack?.unresolved).toBe(0);
  });

  it('marks fill statements and carries their question', () => {
    const data = snap({
      applications: [{ id: 'a1', createdAt: T }],
      statements: [
        {
          id: 's1',
          createdAt: T,
          applicationId: 'a1',
          answerKey: 'sponsor',
          value: { type: 'text', value: 'No' },
          source: 'fill',
          question: 'Will you require sponsorship?',
        },
        {
          id: 's2',
          createdAt: T,
          applicationId: 'a1',
          answerKey: 'sponsor',
          value: { type: 'text', value: 'No' },
        },
        {
          id: 's3',
          createdAt: T,
          applicationId: 'a1',
          answerKey: 'sponsor',
          value: { type: 'text', value: 'No' },
          source: 'other',
          question: 42,
        },
        {
          id: 's4',
          createdAt: T,
          applicationId: 'a1',
          answerKey: 'sponsor',
          value: { type: 'text', value: 'No' },
          source: 'fill',
          question: '   ',
        },
      ],
    });
    const pack = interviewPack(data, 'a1', {});
    const [first, second, third, fourth] = pack?.statements ?? [];
    expect(first?.fromFill).toBe(true);
    expect(first?.question).toBe('Will you require sponsorship?');
    expect(second?.fromFill).toBe(false);
    expect(second && 'question' in second).toBe(false);
    expect(third?.fromFill).toBe(false);
    expect(third && 'question' in third).toBe(false);
    expect(fourth?.fromFill).toBe(true);
    expect(fourth && 'question' in fourth).toBe(false);
  });

  it('lists rounds in order with resolved interviewers and kind labels', () => {
    const data = snap({
      applications: [{ id: 'a1', createdAt: T }],
      contacts: [{ id: 'c1', createdAt: T, name: 'Sam Example' }],
      rounds: [
        {
          id: 'r2',
          createdAt: T,
          applicationId: 'a1',
          kind: 'zoom',
          date: '2026-03-02',
          interviewerIds: 'x',
        },
        {
          id: 'r1',
          createdAt: T,
          applicationId: 'a1',
          kind: 'technical',
          date: '2026-03-01',
          interviewerIds: ['c1', 'deleted'],
        },
        { id: 'r3', createdAt: T, applicationId: 'other', kind: 'panel' },
      ],
    });
    const pack = interviewPack(data, 'a1', {});
    expect(pack?.rounds.map((r) => r.round.id)).toEqual(['r1', 'r2']);
    expect(pack?.rounds[0]?.kindLabel).toBe('Technical');
    expect(pack?.rounds[0]?.interviewers.map((c) => c.id)).toEqual(['c1']);
    expect(pack?.rounds[1]?.kindLabel).toBe('Other');
    expect(pack?.rounds[1]?.interviewers).toEqual([]);
  });
});
