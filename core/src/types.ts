import type { StatusKey } from './status';

export type Id = string;
export type IsoInstant = string; // from Date.prototype.toISOString()
export type LocalDate = string; // 'YYYY-MM-DD', a calendar day in the user's local time
export type Actor = 'me' | 'them';
export interface BaseRecord {
  id: Id;
  createdAt: IsoInstant;
}

export interface Company extends BaseRecord {
  name?: string;
}
export interface Application extends BaseRecord {
  companyId?: Id;
  title?: string;
  url?: string;
  nextActionDate?: LocalDate;
  nextActor?: Actor;
  resumeDocumentId?: Id;
  coverLetterDocumentId?: Id;
  notes?: string;
}
export interface StatusEvent extends BaseRecord {
  applicationId?: Id;
  status?: StatusKey;
  occurredOn?: LocalDate;
  note?: string;
  voidedAt?: IsoInstant;
}
export interface DocumentRecord extends BaseRecord {
  label?: string;
  fileName?: string;
  sha256?: string;
}

export type AnswerType = 'yes_no' | 'choice' | 'money_range' | 'date' | 'text';
export type AnswerValue =
  | { type: 'yes_no'; value: boolean }
  | { type: 'choice'; value: string }
  | {
      type: 'money_range';
      min?: number;
      max?: number;
      currency?: string;
      period?: 'year' | 'hour';
    }
  | { type: 'date'; value: LocalDate }
  | { type: 'text'; value: string };
export interface AnswerRevision {
  value: AnswerValue;
  replacedAt: IsoInstant;
}
export interface CanonicalAnswer extends BaseRecord {
  key?: string;
  label?: string;
  type?: AnswerType;
  choices?: string[];
  value?: AnswerValue;
  history?: AnswerRevision[];
}

export interface StoreMap {
  companies: Company;
  applications: Application;
  statusEvents: StatusEvent;
  documents: DocumentRecord;
  canonicalAnswers: CanonicalAnswer;
}
export type StoreName = keyof StoreMap;
export type Snapshot = { [S in StoreName]: StoreMap[S][] };
export interface Deps {
  now(): IsoInstant;
  newId(): Id;
}
export interface Settings {
  statusLabels?: Partial<Record<StatusKey, string>>;
}
