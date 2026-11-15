import { describe, expect, it } from 'vitest';
import { fixedDeps } from '../testing/fixed-deps';
import { attachDocumentOps, detachDocumentOps, documentFor } from './documents';
import type { WriteOp } from './repository';
import { emptySnapshot } from './schema';
import type { Application, DocumentRecord, Snapshot } from './types';

const T = '2026-01-05T09:00:00.000Z';

function putRecord<R>(
  ops: readonly WriteOp[],
  store: 'documents' | 'applications',
): R | undefined {
  const op = ops.find((o) => o.kind === 'put' && o.store === store);
  return op?.kind === 'put' ? (op.record as R) : undefined;
}

const app: Application = { id: 'app-1', createdAt: T };

describe('attachDocumentOps', () => {
  it('creates a document record and links it', () => {
    const ops = attachDocumentOps(
      app,
      'resume',
      { fileName: 'cv.pdf', sha256: 'abc123', label: '  Main CV ' },
      emptySnapshot(),
      fixedDeps(),
    );
    expect(ops.map((o) => `${o.kind}:${o.store}`)).toEqual([
      'put:documents',
      'put:applications',
    ]);
    expect(putRecord<DocumentRecord>(ops, 'documents')).toEqual({
      id: 'id-1',
      createdAt: T,
      fileName: 'cv.pdf',
      sha256: 'abc123',
      label: 'Main CV',
    });
    expect(putRecord<Application>(ops, 'applications')).toEqual({
      id: 'app-1',
      createdAt: T,
      resumeDocumentId: 'id-1',
    });
  });

  it('omits a blank label from the new record', () => {
    const ops = attachDocumentOps(
      app,
      'coverLetter',
      { fileName: 'letter.pdf', sha256: 'def456', label: '   ' },
      emptySnapshot(),
      fixedDeps(),
    );
    const doc = putRecord<DocumentRecord>(ops, 'documents');
    expect(doc).toBeDefined();
    expect('label' in (doc ?? {})).toBe(false);
    expect(
      putRecord<Application>(ops, 'applications')?.coverLetterDocumentId,
    ).toBe('id-1');
  });

  it('reuses the record when the hash is already known', () => {
    const data: Snapshot = {
      ...emptySnapshot(),
      documents: [
        { id: 'doc-old', createdAt: T, fileName: 'cv.pdf', sha256: 'abc123' },
      ],
    };
    const ops = attachDocumentOps(
      app,
      'resume',
      { fileName: 'cv-copy.pdf', sha256: 'abc123' },
      data,
      fixedDeps(),
    );
    expect(ops.map((o) => `${o.kind}:${o.store}`)).toEqual([
      'put:applications',
    ]);
    expect(putRecord<Application>(ops, 'applications')?.resumeDocumentId).toBe(
      'doc-old',
    );
  });

  it('leaves the old record in place when a different file is attached', () => {
    const linked: Application = { ...app, resumeDocumentId: 'doc-old' };
    const data: Snapshot = {
      ...emptySnapshot(),
      documents: [
        { id: 'doc-old', createdAt: T, fileName: 'cv.pdf', sha256: 'abc123' },
      ],
    };
    const ops = attachDocumentOps(
      linked,
      'resume',
      { fileName: 'cv-v2.pdf', sha256: 'def456' },
      data,
      fixedDeps(),
    );
    expect(ops.map((o) => `${o.kind}:${o.store}`)).toEqual([
      'put:documents',
      'put:applications',
    ]);
    expect(ops.some((o) => o.kind === 'delete')).toBe(false);
    expect(putRecord<DocumentRecord>(ops, 'documents')?.id).toBe('id-1');
    expect(putRecord<Application>(ops, 'applications')?.resumeDocumentId).toBe(
      'id-1',
    );
    expect(linked.resumeDocumentId).toBe('doc-old');
    expect(data.documents).toEqual([
      { id: 'doc-old', createdAt: T, fileName: 'cv.pdf', sha256: 'abc123' },
    ]);
  });
});

describe('detachDocumentOps', () => {
  it('detaching clears the link and keeps the record', () => {
    const linked: Application = {
      ...app,
      resumeDocumentId: 'doc-1',
      coverLetterDocumentId: 'doc-2',
    };
    const ops = detachDocumentOps(linked, 'resume');
    expect(ops).toHaveLength(1);
    expect(ops[0]?.kind).toBe('put');
    expect(ops[0]?.store).toBe('applications');
    const record = putRecord<Application>(ops, 'applications');
    expect('resumeDocumentId' in (record ?? {})).toBe(false);
    expect(record?.coverLetterDocumentId).toBe('doc-2');
    expect(linked.resumeDocumentId).toBe('doc-1');
  });

  it('still returns one op when the slot is already empty', () => {
    const ops = detachDocumentOps(app, 'coverLetter');
    expect(ops).toHaveLength(1);
    expect(ops[0]?.kind).toBe('put');
    expect(ops[0]?.store).toBe('applications');
  });
});

describe('documentFor', () => {
  it('returns undefined for a dangling link', () => {
    const data: Snapshot = {
      ...emptySnapshot(),
      documents: [
        { id: 'doc-1', createdAt: T, fileName: 'cv.pdf', sha256: 'abc123' },
      ],
    };
    expect(
      documentFor(data, { ...app, resumeDocumentId: 'gone' }, 'resume'),
    ).toBeUndefined();
    expect(documentFor(data, app, 'resume')).toBeUndefined();
    expect(
      documentFor(data, { ...app, resumeDocumentId: 'doc-1' }, 'resume')
        ?.fileName,
    ).toBe('cv.pdf');
  });
});

describe('attachDocumentOps hash matching', () => {
  it('reuses a lower-case record for an upper-case hash and keeps its name', () => {
    const data: Snapshot = {
      ...emptySnapshot(),
      documents: [
        { id: 'd1', createdAt: T, fileName: 'cv.pdf', sha256: 'abc123' },
      ],
    };
    const ops = attachDocumentOps(
      app,
      'resume',
      { fileName: 'other.pdf', sha256: 'ABC123' },
      data,
      fixedDeps(),
    );
    expect(putRecord<DocumentRecord>(ops, 'documents')).toBeUndefined();
    expect(putRecord<Application>(ops, 'applications')?.resumeDocumentId).toBe(
      'd1',
    );
  });

  it('tolerates an existing record with a non-string sha256', () => {
    const data = {
      ...emptySnapshot(),
      documents: [{ id: 'd1', createdAt: T, sha256: null }],
    } as unknown as Snapshot;
    const ops = attachDocumentOps(
      app,
      'resume',
      { fileName: 'cv.pdf', sha256: 'abc' },
      data,
      fixedDeps(),
    );
    expect(putRecord<DocumentRecord>(ops, 'documents')?.sha256).toBe('abc');
  });
});
