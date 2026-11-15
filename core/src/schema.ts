import type { Snapshot, StoreName } from './types';

export const APP_ID = 'countersign';
export const SCHEMA_VERSION = 1;

export const STORES: readonly { name: StoreName; since: number }[] = [
  { name: 'companies', since: 1 },
  { name: 'applications', since: 1 },
  { name: 'statusEvents', since: 1 },
  { name: 'documents', since: 1 },
  { name: 'canonicalAnswers', since: 1 },
];

export function emptySnapshot(): Snapshot {
  return {
    companies: [],
    applications: [],
    statusEvents: [],
    documents: [],
    canonicalAnswers: [],
  };
}
