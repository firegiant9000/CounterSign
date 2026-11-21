import { applicationRows } from './application-list';
import { formatAnswer } from './answers';
import { contactsAt } from './contacts';
import { documentFor } from './documents';
import { checkStatement } from './mismatch';
import type { MismatchResult } from './mismatch';
import { ROUND_KIND_LABELS, isRoundKind } from './round-kinds';
import { interviewersOf, roundsFor } from './rounds';
import { statementsFor } from './statements';
import type {
  CanonicalAnswer,
  Contact,
  DocumentRecord,
  Id,
  Job,
  Round,
  Settings,
  Snapshot,
  Statement,
} from './types';

export interface PackStatement {
  id: Id;
  label: string;
  told: string;
  canonical?: string;
  question?: string;
  fromFill: boolean;
  result: MismatchResult;
}

export interface PackRound {
  round: Round;
  kindLabel: string;
  interviewers: Contact[];
}

export interface InterviewPack {
  applicationId: Id;
  companyName: string;
  title: string;
  url?: string;
  statusLabel?: string;
  job?: Job;
  resume?: DocumentRecord;
  coverLetter?: DocumentRecord;
  projectsShown?: string;
  statements: PackStatement[];
  unresolved: number; // count of result === 'mismatch'
  contacts: Contact[];
  rounds: PackRound[];
}

// Same lookup as the statements section on the application page.
function answerFor(
  answers: CanonicalAnswer[],
  statement: Statement,
): CanonicalAnswer | undefined {
  return answers.find(
    (a) => a.key !== undefined && a.key === statement.answerKey,
  );
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** Everything to read before an interview. Undefined only for a missing application. */
export function interviewPack(
  data: Snapshot,
  applicationId: Id,
  settings: Settings,
): InterviewPack | undefined {
  const app = data.applications.find((a) => a.id === applicationId);
  if (!app) return undefined;

  const row = applicationRows(data, settings.statusLabels).find(
    (r) => r.id === applicationId,
  );
  const pack: InterviewPack = {
    applicationId,
    companyName: nonEmpty(row?.companyName) ?? 'Unknown company',
    title: nonEmpty(row?.title) ?? 'Untitled',
    statements: [],
    unresolved: 0,
    contacts: [],
    rounds: [],
  };
  const url = nonEmpty(row?.url);
  if (url !== undefined) pack.url = url;
  const statusLabel = nonEmpty(row?.statusLabel);
  if (statusLabel !== undefined) pack.statusLabel = statusLabel;

  const job =
    app.jobId === undefined
      ? undefined
      : data.jobs.find((j) => j.id === app.jobId);
  if (job) pack.job = job;
  const resume = documentFor(data, app, 'resume');
  if (resume) pack.resume = resume;
  const coverLetter = documentFor(data, app, 'coverLetter');
  if (coverLetter) pack.coverLetter = coverLetter;
  const projects = nonEmpty(app.projectsShown);
  if (projects !== undefined) pack.projectsShown = projects;

  for (const statement of statementsFor(data, applicationId)) {
    const answer = answerFor(data.canonicalAnswers, statement);
    const result = checkStatement(statement, answer);
    const item: PackStatement = {
      id: statement.id,
      label:
        nonEmpty(answer?.label) ??
        nonEmpty(answer?.key) ??
        nonEmpty(statement.answerKey) ??
        'Unknown answer',
      told: formatAnswer(statement.value),
      fromFill: statement.source === 'fill',
      result,
    };
    if (answer) item.canonical = formatAnswer(answer.value);
    if (
      typeof statement.question === 'string' &&
      statement.question.trim() !== ''
    ) {
      item.question = statement.question;
    }
    if (result === 'mismatch') pack.unresolved += 1;
    pack.statements.push(item);
  }

  if (app.companyId !== undefined) {
    pack.contacts = contactsAt(data, app.companyId);
  }

  pack.rounds = roundsFor(data, applicationId).map((round) => ({
    round,
    kindLabel: isRoundKind(round.kind)
      ? ROUND_KIND_LABELS[round.kind]
      : ROUND_KIND_LABELS.other,
    interviewers: interviewersOf(data, round),
  }));

  return pack;
}
