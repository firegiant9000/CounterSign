import type { WriteOp } from './repository';
import type { StatusKey } from './status';
import type { FillOutcome, SiteType } from './formhand';
import type {
  Application,
  Company,
  Deps,
  Id,
  LocalDate,
  Snapshot,
} from './types';

export const DEMO_PREFIX = 'demo-';

/** Calendar arithmetic on Y-M-D through UTC, so the result never depends on the time zone. */
function daysBefore(today: LocalDate, days: number): LocalDate {
  const [y, m, d] = today.split('-').map(Number);
  const t = Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) - days);
  return new Date(t).toISOString().slice(0, 10);
}

function daysAfter(today: LocalDate, days: number): LocalDate {
  return daysBefore(today, -days);
}

/** Demo companies the demo itself flags as targets; a user's own flag is any other. */
const DEMO_TARGET_COMPANY_IDS: ReadonlySet<string> = new Set([
  'demo-company-1',
]);

const DEMO_PROJECTS_SHOWN = 'Sample project: a route planner demo';

const COMPANIES: readonly {
  id: Id;
  name: string;
  anyoneHere?: 'checked_nobody';
}[] = [
  { id: 'demo-company-1', name: 'Example Robotics' },
  {
    id: 'demo-company-2',
    name: 'Brightfold Analytics',
    anyoneHere: 'checked_nobody',
  },
  { id: 'demo-company-3', name: 'Quillmere Labs' },
  { id: 'demo-company-4', name: 'Tarnwick Works' },
];

const DOCUMENTS: readonly {
  id: Id;
  label: string;
  fileName: string;
  sha256: string;
}[] = [
  {
    id: 'demo-document-1',
    label: 'Sample resume',
    fileName: 'sample-resume.pdf',
    sha256: '3f7a1c9e5b2d48806e1fa4c7d92b0358a6c4e17f9d3b5a2086c1e4f7b9a3d520',
  },
  {
    id: 'demo-document-2',
    label: 'Sample cover letter',
    fileName: 'sample-cover-letter.pdf',
    sha256: '9b04e6d2a81c7f35d0e9b6a4c21f8e73540ad9c6b1e2f7a8d3c05b94e6f1a207',
  },
];

interface DemoApplication {
  id: Id;
  companyId: Id;
  title: string;
  path: string;
  notes?: string;
  nextActionIn?: number; // days from today; negative is overdue
  nextActor?: 'me' | 'them';
  resumeDocumentId?: Id;
  coverLetterDocumentId?: Id;
  siteType?: SiteType;
  fillOutcome?: FillOutcome;
  fillNote?: string;
  // Oldest first: [status, days before today].
  history: readonly (readonly [StatusKey, number])[];
}

const APPLICATIONS: readonly DemoApplication[] = [
  {
    id: 'demo-application-1',
    companyId: 'demo-company-1',
    title: 'Sample Firmware Engineer',
    path: 'jobs/firmware-engineer',
    notes: 'Fictional demo record.',
    nextActionIn: 3,
    nextActor: 'me',
    resumeDocumentId: 'demo-document-1',
    siteType: 'greenhouse',
    fillOutcome: 'worked',
    history: [
      ['interested', 9],
      ['applied', 6],
    ],
  },
  {
    id: 'demo-application-2',
    companyId: 'demo-company-2',
    title: 'Sample Data Analyst',
    path: 'jobs/data-analyst',
    nextActionIn: -1,
    nextActor: 'them',
    resumeDocumentId: 'demo-document-1',
    coverLetterDocumentId: 'demo-document-2',
    siteType: 'workday',
    fillOutcome: 'partly',
    fillNote: 'Sample note: the address step was skipped.',
    history: [
      ['applied', 21],
      ['recruiter_contact', 14],
      ['phone_screen', 7],
    ],
  },
  {
    id: 'demo-application-3',
    companyId: 'demo-company-3',
    title: 'Sample Platform Engineer',
    path: 'jobs/platform-engineer',
    nextActionIn: 5,
    nextActor: 'them',
    resumeDocumentId: 'demo-document-1',
    history: [
      ['applied', 30],
      ['phone_screen', 20],
      ['interview', 4],
    ],
  },
  {
    id: 'demo-application-4',
    companyId: 'demo-company-4',
    title: 'Sample Support Engineer',
    path: 'jobs/support-engineer',
    notes: 'Fictional demo record.',
    nextActionIn: 0,
    nextActor: 'me',
    coverLetterDocumentId: 'demo-document-2',
    history: [
      ['applied', 40],
      ['interview', 18],
      ['offer', 2],
    ],
  },
  {
    id: 'demo-application-5',
    companyId: 'demo-company-1',
    title: 'Sample Test Engineer',
    path: 'jobs/test-engineer',
    history: [
      ['interested', 60],
      ['applied', 55],
      ['withdrawn', 41],
    ],
  },
  {
    id: 'demo-application-6',
    companyId: 'demo-company-2',
    title: 'Sample Reporting Lead',
    path: 'jobs/reporting-lead',
    resumeDocumentId: 'demo-document-1',
    history: [
      ['applied', 90],
      ['interview', 70],
      ['offer', 58],
      ['accepted', 50],
    ],
  },
  {
    id: 'demo-application-7',
    companyId: 'demo-company-3',
    title: 'Sample Release Manager',
    path: 'jobs/release-manager',
    history: [
      ['applied', 80],
      ['phone_screen', 66],
      ['rejected', 52],
    ],
  },
  {
    id: 'demo-application-8',
    companyId: 'demo-company-4',
    title: 'Sample Integration Developer',
    path: 'jobs/integration-developer',
    history: [
      ['applied', 75],
      ['no_response', 40],
    ],
  },
  {
    id: 'demo-application-9',
    companyId: 'demo-company-2',
    title: 'Sample Data Steward',
    path: 'jobs/data-steward',
    history: [
      ['applied', 45],
      ['position_closed', 30],
    ],
  },
  {
    id: 'demo-application-10',
    companyId: 'demo-company-4',
    title: 'Sample QA Analyst',
    path: 'jobs/qa-analyst',
    history: [['applied', 38]],
  },
];

/** Synthetic records: invented companies, example.com addresses, made-up hashes. */
export function buildDemoOps(
  today: LocalDate,
  deps: Pick<Deps, 'now'>,
): WriteOp[] {
  const ops: WriteOp[] = [];
  for (const c of COMPANIES) {
    ops.push({
      kind: 'put',
      store: 'companies',
      record: {
        id: c.id,
        createdAt: deps.now(),
        name: c.name,
        ...(c.anyoneHere !== undefined ? { anyoneHere: c.anyoneHere } : {}),
        ...(DEMO_TARGET_COMPANY_IDS.has(c.id) ? { isTarget: true } : {}),
      },
    });
  }
  const contacts = [
    {
      id: 'demo-contact-1',
      companyId: 'demo-company-1',
      name: 'Sample Recruiter',
      role: 'Recruiter',
      howKnown: 'Met at a meetup',
    },
    {
      id: 'demo-contact-2',
      companyId: 'demo-company-3',
      name: 'Sample Engineer',
      role: 'Engineer',
      howKnown: 'Former colleague',
      followUpOn: daysAfter(today, 2),
    },
  ];
  for (const c of contacts) {
    ops.push({
      kind: 'put',
      store: 'contacts',
      record: { ...c, createdAt: deps.now() },
    });
  }
  ops.push(
    {
      kind: 'put',
      store: 'tasks',
      record: {
        id: 'demo-task-1',
        createdAt: deps.now(),
        title: 'Update the sample portfolio',
        dueOn: daysAfter(today, 2),
      },
    },
    {
      kind: 'put',
      store: 'tasks',
      record: {
        id: 'demo-task-2',
        createdAt: deps.now(),
        title: 'Sample finished task',
        doneAt: deps.now(),
      },
    },
    {
      kind: 'put',
      store: 'statements',
      record: {
        id: 'demo-statement-1',
        createdAt: deps.now(),
        applicationId: 'demo-application-2',
        answerKey: 'salary_range',
        value: {
          type: 'money_range',
          min: 95000,
          currency: 'USD',
          period: 'year',
        },
      },
    },
    {
      kind: 'put',
      store: 'statements',
      record: {
        id: 'demo-statement-2',
        createdAt: deps.now(),
        applicationId: 'demo-application-3',
        answerKey: 'earliest_start_date',
        value: { type: 'date', value: daysAfter(today, 10) },
      },
    },
  );
  for (const d of DOCUMENTS) {
    ops.push({
      kind: 'put',
      store: 'documents',
      record: {
        id: d.id,
        createdAt: deps.now(),
        label: d.label,
        fileName: d.fileName,
        sha256: d.sha256,
      },
    });
  }
  for (const a of APPLICATIONS) {
    ops.push({
      kind: 'put',
      store: 'applications',
      record: {
        id: a.id,
        createdAt: deps.now(),
        companyId: a.companyId,
        title: a.title,
        url: `https://example.com/${a.path}`,
        ...(a.notes !== undefined ? { notes: a.notes } : {}),
        ...(a.nextActionIn !== undefined
          ? { nextActionDate: daysAfter(today, a.nextActionIn) }
          : {}),
        ...(a.nextActor !== undefined ? { nextActor: a.nextActor } : {}),
        ...(a.resumeDocumentId !== undefined
          ? { resumeDocumentId: a.resumeDocumentId }
          : {}),
        ...(a.coverLetterDocumentId !== undefined
          ? { coverLetterDocumentId: a.coverLetterDocumentId }
          : {}),
        ...(a.siteType !== undefined ? { siteType: a.siteType } : {}),
        ...(a.fillOutcome !== undefined ? { fillOutcome: a.fillOutcome } : {}),
        ...(a.fillNote !== undefined ? { fillNote: a.fillNote } : {}),
        ...(a.id === 'demo-application-2'
          ? { projectsShown: DEMO_PROJECTS_SHOWN }
          : {}),
      },
    });
    a.history.forEach(([status, ago], i) => {
      ops.push({
        kind: 'put',
        store: 'statusEvents',
        record: {
          id: `${a.id}-event-${i + 1}`,
          createdAt: deps.now(),
          applicationId: a.id,
          status,
          occurredOn: daysBefore(today, ago),
        },
      });
    });
  }
  for (const [id, kind, ago] of [
    ['demo-contact-event-1', 'reached_out', 10],
    ['demo-contact-event-2', 'followed_up', 3],
  ] as const) {
    ops.push({
      kind: 'put',
      store: 'contactEvents',
      record: {
        id,
        createdAt: deps.now(),
        contactId: 'demo-contact-1',
        applicationId: 'demo-application-2',
        kind,
        occurredOn: daysBefore(today, ago),
      },
    });
  }
  ops.push(
    {
      kind: 'put',
      store: 'rounds',
      record: {
        id: 'demo-round-1',
        createdAt: deps.now(),
        applicationId: 'demo-application-2',
        kind: 'phone_screen',
        date: daysBefore(today, 5),
        interviewerIds: ['demo-contact-1'],
        notes: 'Sample notes: a friendly first call.',
        debriefAsked:
          'Sample answer: asked about dashboards I had built and how I checked the numbers.',
        debriefWentWell:
          'Sample answer: the walk through my reporting project.',
        debriefToChange: 'Sample answer: give the headline result first.',
        debriefStoriesUsed: 'Sample answer: the story about a data mix-up.',
      },
    },
    {
      kind: 'put',
      store: 'rounds',
      record: {
        id: 'demo-round-2',
        createdAt: deps.now(),
        applicationId: 'demo-application-2',
        kind: 'technical',
        date: daysAfter(today, 3),
        time: '10:00',
      },
    },
    {
      kind: 'put',
      store: 'stories',
      record: {
        id: 'demo-story-1',
        createdAt: deps.now(),
        title: 'Sample story: settling a scope disagreement',
        situation: 'Two teams wanted different things from one report.',
        task: 'Agree on a single version before the deadline.',
        action: 'Set up a short call and wrote down what each side needed.',
        result: 'Both teams signed off on one report.',
        tags: ['Leadership', 'Conflict'],
      },
    },
    {
      kind: 'put',
      store: 'stories',
      record: {
        id: 'demo-story-2',
        createdAt: deps.now(),
        title: 'Sample story: tracing a data mix-up',
        situation: 'A weekly figure suddenly looked far too high.',
        task: 'Find the cause before the numbers went out.',
        action: 'Compared each step of the pipeline against the source.',
        result: 'Found a duplicated join and fixed it the same day.',
        tags: ['Leadership', 'Debugging'],
      },
    },
  );
  return ops;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? (value as unknown[]) : [];
}

function isDemoId(id: unknown): id is string {
  return typeof id === 'string' && id.startsWith(DEMO_PREFIX);
}

/** True only with no applications and no companies. */
export function canLoadDemo(data: Snapshot): boolean {
  return (
    list(data.applications).length === 0 && list(data.companies).length === 0
  );
}

/** True while a removal would still change something; kept records don't count. */
export function hasDemoData(data: Snapshot): boolean {
  return removeDemoOps(data).length > 0;
}

/**
 * Deletes every record whose id starts with DEMO_PREFIX, except a demo company
 * or document that a non-demo application still references, a demo company the
 * user flagged as a target, a demo application a non-demo round hangs on, and a
 * demo contact a non-demo contact event hangs on (each with its company).
 * Never touches weeklyReviews.
 */
export function removeDemoOps(data: Snapshot): WriteOp[] {
  const kept = new Set<string>();
  // Demo applications and contacts the user hung their own records on.
  const keptApps = new Set<string>();
  for (const raw of list(data.rounds)) {
    const round = raw as Record<string, unknown> | null;
    if (!round || isDemoId(round['id'])) continue;
    const ref = round['applicationId'];
    if (isDemoId(ref)) keptApps.add(ref);
  }
  for (const store of ['statusEvents', 'statements'] as const) {
    for (const raw of list(data[store])) {
      const rec = raw as Record<string, unknown> | null;
      if (!rec || isDemoId(rec['id'])) continue;
      const ref = rec['applicationId'];
      if (isDemoId(ref)) keptApps.add(ref);
    }
  }
  const keptContacts = new Set<string>();
  for (const raw of list(data.contactEvents)) {
    const event = raw as Record<string, unknown> | null;
    if (!event || isDemoId(event['id'])) continue;
    const ref = event['contactId'];
    if (isDemoId(ref)) keptContacts.add(ref);
  }
  for (const raw of list(data.applications)) {
    const app = raw as Record<string, unknown> | null;
    if (!app || !keptApps.has(app['id'] as string)) continue;
    const ref = app['companyId'];
    if (typeof ref === 'string') kept.add(ref);
  }
  for (const raw of list(data.contacts)) {
    const contact = raw as Record<string, unknown> | null;
    if (!contact || !keptContacts.has(contact['id'] as string)) continue;
    const ref = contact['companyId'];
    if (typeof ref === 'string') kept.add(ref);
  }
  for (const raw of list(data.applications)) {
    const app = raw as Record<string, unknown> | null;
    if (!app || isDemoId(app['id'])) continue;
    for (const field of [
      'companyId',
      'resumeDocumentId',
      'coverLetterDocumentId',
    ]) {
      const ref = app[field];
      if (typeof ref === 'string') kept.add(ref);
    }
  }
  for (const raw of list(data.contacts)) {
    const contact = raw as Record<string, unknown> | null;
    if (!contact || isDemoId(contact['id'])) continue;
    const ref = contact['companyId'];
    if (typeof ref === 'string') kept.add(ref);
  }
  // Demo applications being removed, and the documents they reference.
  const removedApps = new Set<string>();
  const removedDocRefs = new Set<string>();
  for (const raw of list(data.applications)) {
    const app = raw as Record<string, unknown> | null;
    if (!app || !isDemoId(app['id']) || keptApps.has(app['id'])) continue;
    removedApps.add(app['id']);
    for (const field of ['resumeDocumentId', 'coverLetterDocumentId']) {
      const ref = app[field];
      if (typeof ref === 'string') removedDocRefs.add(ref);
    }
  }
  const ops: WriteOp[] = [];
  const idOf = (raw: unknown): unknown => (raw as { id?: unknown } | null)?.id;
  for (const raw of list(data.companies)) {
    const id = idOf(raw);
    if (!isDemoId(id)) continue;
    const company = raw as Record<string, unknown>;
    const demoFlagged = DEMO_TARGET_COMPANY_IDS.has(id);
    // A target flag on a company the demo does not itself flag is the user's.
    const userTarget = company['isTarget'] === true && !demoFlagged;
    if (!kept.has(id) && !userTarget) {
      ops.push({ kind: 'delete', store: 'companies', id });
    } else if (
      'anyoneHere' in company ||
      (demoFlagged && 'isTarget' in company)
    ) {
      // Kept because real data uses it: drop the answers the user never gave.
      const rest = { ...company };
      delete rest['anyoneHere'];
      if (demoFlagged) delete rest['isTarget'];
      ops.push({
        kind: 'put',
        store: 'companies',
        record: rest as unknown as Company,
      });
    }
  }
  for (const raw of list(data.applications)) {
    const id = idOf(raw);
    if (isDemoId(id) && !keptApps.has(id)) {
      ops.push({ kind: 'delete', store: 'applications', id });
    } else if (
      isDemoId(id) &&
      (raw as Record<string, unknown>)['projectsShown'] === DEMO_PROJECTS_SHOWN
    ) {
      // Kept for the user's records: drop the demo text, not one they edited.
      const rest = { ...(raw as Record<string, unknown>) };
      delete rest['projectsShown'];
      ops.push({
        kind: 'put',
        store: 'applications',
        record: rest as unknown as Application,
      });
    }
  }
  for (const raw of list(data.rounds)) {
    const id = idOf(raw);
    if (typeof id !== 'string') continue;
    const appId = (raw as { applicationId?: unknown }).applicationId;
    if (isDemoId(id) || (typeof appId === 'string' && removedApps.has(appId))) {
      ops.push({ kind: 'delete', store: 'rounds', id });
    }
  }
  for (const raw of list(data.stories)) {
    const id = idOf(raw);
    if (isDemoId(id)) ops.push({ kind: 'delete', store: 'stories', id });
  }
  for (const raw of list(data.statusEvents)) {
    const id = idOf(raw);
    if (typeof id !== 'string') continue;
    const appId = (raw as { applicationId?: unknown }).applicationId;
    if (isDemoId(id) || (typeof appId === 'string' && removedApps.has(appId))) {
      ops.push({ kind: 'delete', store: 'statusEvents', id });
    }
  }
  for (const raw of list(data.statements)) {
    const id = idOf(raw);
    if (typeof id !== 'string') continue;
    const appId = (raw as { applicationId?: unknown }).applicationId;
    if (isDemoId(id) || (typeof appId === 'string' && removedApps.has(appId))) {
      ops.push({ kind: 'delete', store: 'statements', id });
    }
  }
  const removedContacts = new Set<string>();
  for (const raw of list(data.contacts)) {
    const id = idOf(raw);
    if (isDemoId(id) && !keptContacts.has(id)) {
      removedContacts.add(id);
      ops.push({ kind: 'delete', store: 'contacts', id });
    }
  }
  for (const raw of list(data.contactEvents)) {
    const id = idOf(raw);
    if (typeof id !== 'string') continue;
    const contactId = (raw as { contactId?: unknown }).contactId;
    if (
      isDemoId(id) ||
      (typeof contactId === 'string' && removedContacts.has(contactId))
    ) {
      ops.push({ kind: 'delete', store: 'contactEvents', id });
    }
  }
  for (const raw of list(data.tasks)) {
    const id = idOf(raw);
    if (isDemoId(id)) ops.push({ kind: 'delete', store: 'tasks', id });
  }
  for (const raw of list(data.documents)) {
    const id = idOf(raw);
    if (typeof id !== 'string' || kept.has(id)) continue;
    if (isDemoId(id) || removedDocRefs.has(id)) {
      ops.push({ kind: 'delete', store: 'documents', id });
    }
  }
  return ops;
}
