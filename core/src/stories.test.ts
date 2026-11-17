import { describe, expect, it } from 'vitest';
import { fixedDeps } from '../testing/fixed-deps';
import {
  allTags,
  deleteStoryOps,
  newStoryOps,
  parseTags,
  storiesByTag,
  storyTags,
  updateStoryOps,
} from './stories';
import type { Snapshot, Story } from './types';

const T = '2026-01-01T00:00:00.000Z';
const LATER = '2026-02-01T00:00:00.000Z';

function snap(stories: Story[]): Snapshot {
  return { stories } as unknown as Snapshot;
}

function story(id: string, extra: Record<string, unknown> = {}): Story {
  return { id, createdAt: T, ...extra };
}

function putRecord(ops: ReturnType<typeof updateStoryOps>): Story {
  const op = ops[0];
  if (!op || op.kind !== 'put') throw new Error('expected a put');
  return op.record;
}

describe('parseTags', () => {
  it('splits on commas, trims, collapses spaces, drops blanks and repeats', () => {
    expect(
      parseTags(' Leadership, conflict ,,LEADERSHIP,  team   work '),
    ).toEqual(['Leadership', 'conflict', 'team work']);
  });

  it('gives an empty list for blank text', () => {
    expect(parseTags('')).toEqual([]);
    expect(parseTags(' , ,  ')).toEqual([]);
  });
});

describe('storyTags', () => {
  it('keeps string entries of a stored array', () => {
    expect(storyTags(story('s1', { tags: [1, 'ok'] }))).toEqual(['ok']);
  });

  it('reads anything that is not an array as no tags', () => {
    expect(storyTags(story('s1', { tags: 'x' }))).toEqual([]);
    expect(storyTags(story('s1'))).toEqual([]);
  });
});

describe('newStoryOps', () => {
  it('stores trimmed fields and parsed tags, and returns the new id', () => {
    const { ops, storyId } = newStoryOps(
      {
        title: '  Led a migration ',
        situation: 'Legacy system ',
        task: ' Move it ',
        action: ' Phased cutover ',
        result: ' Zero downtime ',
        tags: ' Leadership, delivery ',
      },
      fixedDeps(),
    );
    expect(ops).toHaveLength(1);
    const r = putRecord(ops);
    expect(r.id).toBe(storyId);
    expect(r).toEqual({
      id: storyId,
      createdAt: '2026-01-05T09:00:00.000Z',
      title: 'Led a migration',
      situation: 'Legacy system',
      task: 'Move it',
      action: 'Phased cutover',
      result: 'Zero downtime',
      tags: ['Leadership', 'delivery'],
    });
  });

  it('omits blank fields', () => {
    const r = putRecord(
      newStoryOps({ title: 'Kept', situation: '   ', tags: ' , ' }, fixedDeps())
        .ops,
    );
    expect(r.title).toBe('Kept');
    expect('situation' in r).toBe(false);
    expect('tags' in r).toBe(false);
  });
});

describe('updateStoryOps', () => {
  it('removes a field patched blank and keeps identity and other fields', () => {
    const s = story('s1', { title: 'Old', result: 'Kept', tags: ['a'] });
    const out = putRecord(updateStoryOps(s, { title: '  ', tags: '' }));
    expect('title' in out).toBe(false);
    expect(out.result).toBe('Kept');
    expect(out.tags).toBeUndefined();
    expect(out.id).toBe('s1');
    expect(out.createdAt).toBe(T);
  });

  it('removes tags when the patch is an empty list', () => {
    const s = story('s1', { tags: ['a'] });
    const out = putRecord(updateStoryOps(s, { tags: [] } as never));
    expect('tags' in out).toBe(false);
  });

  it('leaves undefined patch fields as stored and replaces present ones', () => {
    const s = story('s1', { title: 'Old', action: 'Keep me' });
    const out = putRecord(updateStoryOps(s, { title: ' New ' }));
    expect(out.title).toBe('New');
    expect(out.action).toBe('Keep me');
  });

  it('does not mutate the stored story', () => {
    const s = story('s1', { title: 'Old' });
    updateStoryOps(s, { title: 'New' });
    expect(s.title).toBe('Old');
  });
});

describe('deleteStoryOps', () => {
  it('deletes the story', () => {
    expect(deleteStoryOps('s1')).toEqual([
      { kind: 'delete', store: 'stories', id: 's1' },
    ]);
  });
});

describe('allTags', () => {
  it('merges spellings into the earliest-created one and counts stories', () => {
    const data = snap([
      story('new', { createdAt: LATER, tags: ['leadership'] }),
      story('old', { createdAt: T, tags: ['Leadership'] }),
    ]);
    expect(allTags(data)).toEqual([{ tag: 'Leadership', count: 2 }]);
  });

  it('counts a story once even when it repeats a tag in another spelling', () => {
    const data = snap([story('s1', { tags: ['Team', 'team'] })]);
    expect(allTags(data)).toEqual([{ tag: 'Team', count: 1 }]);
  });

  it('sorts case-insensitively', () => {
    const data = snap([
      story('s1', { tags: ['gamma', 'Beta'] }),
      story('s2', { tags: ['alpha'] }),
    ]);
    expect(allTags(data).map((t) => t.tag)).toEqual(['alpha', 'Beta', 'gamma']);
  });

  it('ignores odd stored tags without throwing', () => {
    const data = snap([
      story('s1', { tags: 'x' }),
      story('s2', { tags: [1, 'ok'] }),
    ]);
    expect(allTags(data)).toEqual([{ tag: 'ok', count: 1 }]);
  });
});

describe('storiesByTag', () => {
  const data = snap([
    story('s1', { title: 'beta story', tags: ['Leadership'] }),
    story('s2', { tags: ['Leadership'] }),
    story('s3', { title: 'Alpha story', tags: ['conflict'] }),
    story('s4', { title: 'Zulu story', tags: ['leadership'] }),
  ]);

  it('matches tags case-insensitively and trimmed', () => {
    expect(storiesByTag(data, ' leadership ').map((s) => s.id)).toEqual([
      's1',
      's4',
      's2',
    ]);
  });

  it('a blank tag gives every story, untitled last', () => {
    expect(storiesByTag(data, '  ').map((s) => s.id)).toEqual([
      's3',
      's1',
      's4',
      's2',
    ]);
  });

  it('breaks title ties by id', () => {
    const tied = snap([
      story('b', { title: 'Same', tags: ['t'] }),
      story('a', { title: 'same', tags: ['t'] }),
    ]);
    expect(storiesByTag(tied, 't').map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('returns nothing for a tag no story has', () => {
    expect(storiesByTag(data, 'nope')).toEqual([]);
  });
});
