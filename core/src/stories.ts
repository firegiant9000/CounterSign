import type { WriteOp } from './repository';
import type { Deps, Id, Snapshot, Story } from './types';

export interface StoryInput {
  title?: string;
  situation?: string;
  task?: string;
  action?: string;
  result?: string;
  tags?: string; // tags as typed text
}

const TEXT_FIELDS = ['title', 'situation', 'task', 'action', 'result'] as const;

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function tagKey(tag: string): string {
  return tag.trim().toLowerCase();
}

/** Comma-separated typed tags: trimmed, inner spaces collapsed, blanks and repeats (any case) dropped; first spelling wins. */
export function parseTags(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of text.split(',')) {
    const tag = part.trim().replace(/\s+/g, ' ');
    if (!tag) continue;
    const key = tagKey(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

/** String entries of a stored tag list. Anything that is not an array reads as no tags. */
export function storyTags(story: Story): string[] {
  const tags: unknown = story.tags;
  if (!Array.isArray(tags)) return [];
  return (tags as unknown[]).filter((t): t is string => typeof t === 'string');
}

/** Normalised values for the fields present in `input`; `undefined` means "remove". */
function normalise(
  input: StoryInput,
): Partial<Record<keyof StoryInput, unknown>> {
  const out: Partial<Record<keyof StoryInput, unknown>> = {};
  const raw = input as Record<string, unknown>;
  for (const field of TEXT_FIELDS) {
    const value = raw[field];
    if (value === undefined) continue;
    const text = typeof value === 'string' ? value.trim() : '';
    out[field] = text || undefined;
  }
  if (raw.tags !== undefined) {
    const tags = typeof raw.tags === 'string' ? parseTags(raw.tags) : [];
    out.tags = tags.length > 0 ? tags : undefined;
  }
  return out;
}

function apply(record: Record<string, unknown>, values: object): void {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete record[key];
    else record[key] = value;
  }
}

export function newStoryOps(
  input: StoryInput,
  deps: Deps,
): { ops: WriteOp[]; storyId: Id } {
  const record: Story = { id: deps.newId(), createdAt: deps.now() };
  apply(record as unknown as Record<string, unknown>, normalise(input));
  return {
    ops: [{ kind: 'put', store: 'stories', record }],
    storyId: record.id,
  };
}

export function updateStoryOps(story: Story, input: StoryInput): WriteOp[] {
  const record: Story = { ...story };
  apply(record as unknown as Record<string, unknown>, normalise(input));
  return [{ kind: 'put', store: 'stories', record }];
}

export function deleteStoryOps(storyId: Id): WriteOp[] {
  return [{ kind: 'delete', store: 'stories', id: storyId }];
}

/** Stories oldest first, then id, so the earliest spelling of a tag is seen first. */
function oldestFirst(data: Snapshot): Story[] {
  return [...data.stories].sort(
    (a, b) =>
      compareText(String(a.createdAt), String(b.createdAt)) ||
      compareText(String(a.id), String(b.id)),
  );
}

/** Each distinct tag (case-insensitive) once, spelled as on the earliest story that has it, with the number of stories using it. */
export function allTags(data: Snapshot): { tag: string; count: number }[] {
  const byKey = new Map<string, { tag: string; count: number }>();
  for (const story of oldestFirst(data)) {
    const keys = new Set<string>();
    for (const tag of storyTags(story)) {
      const key = tagKey(tag);
      if (!key || keys.has(key)) continue;
      keys.add(key);
      const entry = byKey.get(key);
      if (entry) entry.count += 1;
      else byKey.set(key, { tag: tag.trim(), count: 1 });
    }
  }
  return [...byKey.entries()]
    .sort(([a], [b]) => compareText(a, b))
    .map(([, entry]) => entry);
}

function titleOf(story: Story): string {
  const title: unknown = story.title;
  return typeof title === 'string' ? title.trim() : '';
}

/** Stories carrying `tag` (case-insensitive, trimmed); a blank tag gives all. Sorted by title, untitled last, then id. */
export function storiesByTag(data: Snapshot, tag: string): Story[] {
  const wanted = tagKey(tag);
  const matches = data.stories.filter(
    (s) => !wanted || storyTags(s).some((t) => tagKey(t) === wanted),
  );
  return matches.sort((a, b) => {
    const at = titleOf(a);
    const bt = titleOf(b);
    if (!at !== !bt) return at ? -1 : 1;
    return (
      compareText(at.toLowerCase(), bt.toLowerCase()) ||
      compareText(String(a.id), String(b.id))
    );
  });
}
