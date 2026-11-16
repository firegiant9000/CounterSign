import type { FillOutcome, SiteType } from './formhand';
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
  anyoneHere?: 'checked_nobody';
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
  jobId?: Id;
  siteType?: SiteType;
  fillOutcome?: FillOutcome;
  fillNote?: string;
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

export type CaptureSource = 'jsonld' | 'selection' | 'paste';
export interface Job extends BaseRecord {
  title?: string;
  companyName?: string;
  location?: string;
  url?: string;
  canonicalUrl?: string;
  relCanonical?: string;
  text?: string;
  source?: CaptureSource;
}
export interface Statement extends BaseRecord {
  applicationId?: Id;
  answerKey?: string;
  value?: AnswerValue;
  exception?: boolean;
}
export interface Contact extends BaseRecord {
  companyId?: Id;
  name?: string;
  role?: string;
  howKnown?: string;
  notes?: string;
}
export type ContactEventKind =
  'reached_out' | 'replied' | 'referred' | 'followed_up' | 'call_held';
export interface ContactEvent extends BaseRecord {
  contactId?: Id;
  applicationId?: Id;
  kind?: ContactEventKind;
  occurredOn?: LocalDate;
  note?: string;
}
export interface Task extends BaseRecord {
  title?: string;
  dueOn?: LocalDate;
  doneAt?: IsoInstant;
  applicationId?: Id;
}
export interface ProfileField extends BaseRecord {
  key?: string;
  label?: string;
  value?: string;
}

export interface StoreMap {
  companies: Company;
  applications: Application;
  statusEvents: StatusEvent;
  documents: DocumentRecord;
  canonicalAnswers: CanonicalAnswer;
  jobs: Job;
  statements: Statement;
  contacts: Contact;
  contactEvents: ContactEvent;
  tasks: Task;
  profileFields: ProfileField;
}
export type StoreName = keyof StoreMap;
export type Snapshot = { [S in StoreName]: StoreMap[S][] };
export interface Deps {
  now(): IsoInstant;
  newId(): Id;
}
export interface Settings {
  statusLabels?: Partial<Record<StatusKey, string>>;
  noResponseDays?: number;
}
