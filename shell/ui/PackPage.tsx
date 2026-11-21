import type { VNode } from 'preact';
import { interviewPack } from '../../core/src/pack';
import type { PackRound, PackStatement } from '../../core/src/pack';
import type { Contact, DocumentRecord, Id } from '../../core/src/types';
import { useAppData } from './app-data';
import { Button } from './components/Button';
import { Fact } from './components/Fact';
import { IndexCard } from './components/IndexCard';
import { Stamp } from './components/Stamp';
import { TypedLine } from './components/TypedLine';
import { routeHref } from './route';

const DEBRIEF_FIELDS = [
  ['debriefAsked', 'What they asked'],
  ['debriefWentWell', 'What went well'],
  ['debriefToChange', 'What to change'],
  ['debriefStoriesUsed', 'Stories used'],
] as const;

function text(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function contactName(c: Contact): string {
  const name = text(c.name).trim();
  return name !== '' ? name : 'Unnamed contact';
}

function documentName(doc: DocumentRecord): string {
  const label = text(doc.label).trim();
  if (label !== '') return label;
  const file = text(doc.fileName).trim();
  return file !== '' ? file : 'Unnamed document';
}

function None(): VNode {
  return <TypedLine>None recorded.</TypedLine>;
}

function StatementItem(props: { item: PackStatement }): VNode {
  const { item } = props;
  const differs = item.canonical !== undefined && item.canonical !== item.told;
  return (
    <li>
      <strong>{item.label}</strong>: {item.told}
      {item.question ? <div>They asked: {item.question}</div> : null}
      {item.fromFill ? <Fact tone="neutral">From a fill</Fact> : null}
      {differs ? <div>Your canonical answer: {item.canonical}</div> : null}
      {item.result === 'mismatch' ? (
        <Fact tone="warning">Unresolved mismatch</Fact>
      ) : null}
      {item.result === 'exception' ? <div>Kept as an exception</div> : null}
    </li>
  );
}

function RoundItem(props: { entry: PackRound }): VNode {
  const { entry } = props;
  const { round } = entry;
  const when = [text(round.date), text(round.time)]
    .filter((s) => s !== '')
    .join(' ');
  const names = entry.interviewers.map(contactName);
  const notes = text(round.notes);
  const debrief = DEBRIEF_FIELDS.flatMap(([key, label]) => {
    const value = text(round[key]);
    return value.trim() === '' ? [] : [{ key, label, value }];
  });
  return (
    <li class="pack-round">
      <strong>{entry.kindLabel}</strong>
      {when ? ` · ${when}` : ''}
      {names.length > 0 ? <div>Interviewers: {names.join(', ')}</div> : null}
      {notes ? <div class="pack-text">{notes}</div> : null}
      <div>
        <strong>Debrief</strong>
        {debrief.length === 0 ? (
          <div>No debrief yet.</div>
        ) : (
          debrief.map((d) => (
            <div key={d.key} class="pack-text">
              {d.label}: {d.value}
            </div>
          ))
        )}
      </div>
    </li>
  );
}

export function PackPage(props: { id: Id }): VNode {
  const { data, settings } = useAppData();
  const pack = interviewPack(data, props.id, settings);

  if (!pack) {
    return (
      <div class="detail">
        <p>Application not found.</p>
        <p>
          <a href={routeHref({ page: 'applications' })}>Back to applications</a>
        </p>
      </div>
    );
  }

  const job = pack.job;
  const jobTitle = job ? text(job.title) : '';
  const jobLocation = job ? text(job.location) : '';
  const jobText = job ? text(job.text) : '';
  const documents = [
    pack.resume ? ['Resume', documentName(pack.resume)] : undefined,
    pack.coverLetter
      ? ['Cover letter', documentName(pack.coverLetter)]
      : undefined,
  ].filter((d): d is string[] => d !== undefined);

  return (
    <div class="detail pack">
      <p>
        <a href={routeHref({ page: 'application', id: pack.applicationId })}>
          Back to application
        </a>{' '}
        <Button variant="primary" onClick={() => window.print()}>
          Print
        </Button>
      </p>
      <h1>
        {pack.companyName} — {pack.title}
      </h1>
      <p>Status: {pack.statusLabel ?? 'No status'}</p>
      {pack.url ? <p>URL: {pack.url}</p> : null}
      {pack.unresolved > 0 ? (
        <p>
          <Stamp ink="maroon">
            {pack.unresolved === 1
              ? '1 unresolved mismatch in what you told them'
              : `${pack.unresolved} unresolved mismatches in what you told them`}
          </Stamp>
        </p>
      ) : null}

      <IndexCard title="Posting">
        {job ? (
          <>
            {jobTitle ? <p>{jobTitle}</p> : null}
            {jobLocation ? <p>{jobLocation}</p> : null}
            {jobText ? <div class="pack-text">{jobText}</div> : null}
          </>
        ) : (
          <TypedLine>No saved posting.</TypedLine>
        )}
      </IndexCard>

      <IndexCard title="Documents">
        {documents.length === 0 ? (
          <None />
        ) : (
          <ul>
            {documents.map(([kind, name]) => (
              <li key={kind}>
                {kind}: {name}
              </li>
            ))}
          </ul>
        )}
      </IndexCard>

      <IndexCard title="Projects shown">
        {pack.projectsShown ? (
          <div class="pack-text">{pack.projectsShown}</div>
        ) : (
          <None />
        )}
      </IndexCard>

      <IndexCard title="What I told them">
        {pack.statements.length === 0 ? (
          <None />
        ) : (
          <ul>
            {pack.statements.map((s) => (
              <StatementItem key={s.id} item={s} />
            ))}
          </ul>
        )}
      </IndexCard>

      <IndexCard title="People">
        {pack.contacts.length === 0 ? (
          <None />
        ) : (
          <ul>
            {pack.contacts.map((c) => {
              const role = text(c.role).trim();
              return (
                <li key={c.id}>
                  {contactName(c)}
                  {role ? ` · ${role}` : ''}
                </li>
              );
            })}
          </ul>
        )}
      </IndexCard>

      <IndexCard title="Rounds">
        {pack.rounds.length === 0 ? (
          <None />
        ) : (
          <ul>
            {pack.rounds.map((r) => (
              <RoundItem key={r.round.id} entry={r} />
            ))}
          </ul>
        )}
      </IndexCard>
    </div>
  );
}
