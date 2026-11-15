import type { Snapshot, StoreName } from './types';

export const APP_ID = 'countersign';
export const SCHEMA_VERSION = 2;

export const STORES: readonly { name: StoreName; since: number }[] = [
  { name: 'companies', since: 1 },
  { name: 'applications', since: 1 },
  { name: 'statusEvents', since: 1 },
  { name: 'documents', since: 1 },
  { name: 'canonicalAnswers', since: 1 },
  { name: 'jobs', since: 2 },
  { name: 'statements', since: 2 },
  { name: 'contacts', since: 2 },
  { name: 'contactEvents', since: 2 },
  { name: 'tasks', since: 2 },
  { name: 'profileFields', since: 2 },
];

export function emptySnapshot(): Snapshot {
  return {
    companies: [],
    applications: [],
    statusEvents: [],
    documents: [],
    canonicalAnswers: [],
    jobs: [],
    statements: [],
    contacts: [],
    contactEvents: [],
    tasks: [],
    profileFields: [],
  };
}
