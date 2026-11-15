import type { WriteOp } from './repository';
import type { Application, Deps, DocumentRecord, Snapshot } from './types';

export type DocumentSlot = 'resume' | 'coverLetter';

function slotField(
  slot: DocumentSlot,
): 'resumeDocumentId' | 'coverLetterDocumentId' {
  return slot === 'resume' ? 'resumeDocumentId' : 'coverLetterDocumentId';
}

// Stores a record of the file (name, hash, label) only; never its contents.
export function attachDocumentOps(
  app: Application,
  slot: DocumentSlot,
  file: { fileName: string; sha256: string; label?: string },
  data: Snapshot,
  deps: Deps,
): WriteOp[] {
  const ops: WriteOp[] = [];
  let documentId: string;
  // Hashes match case-insensitively. Reuse keeps the existing record's
  // fileName and label; the new file's name is not stored.
  const wanted = file.sha256.toLowerCase();
  const known = data.documents.find(
    (d) => typeof d.sha256 === 'string' && d.sha256.toLowerCase() === wanted,
  );
  if (known) {
    documentId = known.id;
  } else {
    const doc: DocumentRecord = {
      id: deps.newId(),
      createdAt: deps.now(),
      fileName: file.fileName,
      sha256: file.sha256,
    };
    if (file.label !== undefined && file.label.trim() !== '') {
      doc.label = file.label.trim();
    }
    documentId = doc.id;
    ops.push({ kind: 'put', store: 'documents', record: doc });
  }
  const linked: Application = { ...app };
  linked[slotField(slot)] = documentId;
  ops.push({ kind: 'put', store: 'applications', record: linked });
  return ops;
}

// Clears the link only; the document record is kept.
export function detachDocumentOps(
  app: Application,
  slot: DocumentSlot,
): WriteOp[] {
  const record: Application = { ...app };
  delete record[slotField(slot)];
  return [{ kind: 'put', store: 'applications', record }];
}

export function documentFor(
  data: Snapshot,
  app: Application,
  slot: DocumentSlot,
): DocumentRecord | undefined {
  const id = app[slotField(slot)];
  if (id === undefined) return undefined;
  return data.documents.find((d) => d.id === id);
}
