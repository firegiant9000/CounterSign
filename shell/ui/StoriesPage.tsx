import { Fragment } from 'preact';
import type { VNode } from 'preact';
import { useRef, useState } from 'preact/hooks';
import {
  allTags,
  deleteStoryOps,
  newStoryOps,
  storiesByTag,
  storyTags,
  updateStoryOps,
} from '../../core/src/stories';
import type { StoryInput } from '../../core/src/stories';
import type { Id, Story } from '../../core/src/types';
import { useAppData } from './app-data';

const NEED_TITLE = 'Enter a title.';

const STAR_FIELDS = [
  ['situation', 'Situation'],
  ['task', 'Task'],
  ['action', 'Action'],
  ['result', 'Result'],
] as const;

type FormState = Required<StoryInput>;

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function text(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function blankForm(): FormState {
  return {
    title: '',
    situation: '',
    task: '',
    action: '',
    result: '',
    tags: '',
  };
}

function formFrom(story: Story): FormState {
  return {
    title: text(story.title),
    situation: text(story.situation),
    task: text(story.task),
    action: text(story.action),
    result: text(story.result),
    tags: storyTags(story).join(', '),
  };
}

export function StoriesPage(): VNode {
  const appData = useAppData();
  const { data, deps } = appData;

  const [busy, setBusy] = useState(false);
  // Set synchronously so a second click before re-render cannot start a write.
  const inFlight = useRef(false);
  const [error, setError] = useState<string | undefined>(undefined);
  // undefined = form closed, null = adding, string = editing that story id.
  const [editing, setEditing] = useState<Id | null | undefined>(undefined);
  const [form, setForm] = useState<FormState>(blankForm);
  // The values the edit form opened with; only changes are saved.
  const [start, setStart] = useState<FormState | undefined>(undefined);
  const [selected, setSelected] = useState('');

  const tags = allTags(data);
  const selectedKey = selected.trim().toLowerCase();
  // A tag that no story carries any more falls back to showing everything.
  const activeTag = tags.find((t) => t.tag.toLowerCase() === selectedKey);
  const stories = storiesByTag(data, activeTag ? activeTag.tag : '');

  const patchForm = (patch: Partial<FormState>): void =>
    setForm((f) => ({ ...f, ...patch }));

  const run = async (write: () => Promise<void>): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setError(undefined);
    setBusy(true);
    try {
      await write();
      return true;
    } catch (err) {
      setError(messageOf(err));
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const openAdd = (): void => {
    setError(undefined);
    setForm(blankForm());
    setStart(undefined);
    setEditing(null);
  };

  const openEdit = (story: Story): void => {
    setError(undefined);
    const opened = formFrom(story);
    setForm(opened);
    setStart(opened);
    setEditing(story.id);
  };

  const onSubmit = async (event: Event): Promise<void> => {
    event.preventDefault();
    if (inFlight.current || editing === undefined) return;
    if (form.title.trim() === '') {
      setError(NEED_TITLE);
      return;
    }
    let input: StoryInput = form;
    if (editing !== null && start !== undefined) {
      // Send only what the user changed, so another tab's edits are kept.
      const changed: Record<string, string> = {};
      for (const [key, value] of Object.entries(form)) {
        if (value !== start[key as keyof FormState]) changed[key] = value;
      }
      input = changed;
    }
    const target = editing;
    const ok = await run(() =>
      appData.apply((d) => {
        if (target === null) return newStoryOps(input, deps).ops;
        const fresh = d.stories.find((s) => s.id === target);
        if (!fresh) throw new Error('This story no longer exists.');
        return updateStoryOps(fresh, input);
      }),
    );
    if (ok) setEditing(undefined);
  };

  const onDelete = async (storyId: Id): Promise<void> => {
    if (inFlight.current) return;
    if (!confirm('Delete this story?')) return;
    const ok = await run(() => appData.apply(() => deleteStoryOps(storyId)));
    if (ok && editing === storyId) setEditing(undefined);
  };

  const renderStory = (story: Story): VNode => {
    const title = text(story.title).trim();
    const storyTagList = storyTags(story);
    return (
      <li key={story.id}>
        <strong>{title || 'Untitled story'}</strong>
        {storyTagList.length > 0 ? <div>{storyTagList.join(', ')}</div> : null}
        {STAR_FIELDS.map(([key, label]) => {
          const value = text(story[key]);
          return value.trim() === '' ? null : (
            <div key={key}>
              <strong>{label}</strong>
              <div>{value}</div>
            </div>
          );
        })}
        <button type="button" disabled={busy} onClick={() => openEdit(story)}>
          Edit
        </button>{' '}
        <button
          type="button"
          disabled={busy}
          onClick={() => void onDelete(story.id)}
        >
          Delete
        </button>
      </li>
    );
  };

  return (
    <div>
      <h1>Stories</h1>
      <div>
        <button
          type="button"
          disabled={busy}
          aria-pressed={!activeTag}
          onClick={() => setSelected('')}
        >
          All
        </button>
        {tags.map((t) => (
          <Fragment key={t.tag}>
            {' '}
            <button
              type="button"
              disabled={busy}
              aria-pressed={activeTag === t}
              onClick={() => setSelected(t.tag)}
            >
              {t.tag} ({t.count})
            </button>
          </Fragment>
        ))}
      </div>
      {stories.length === 0 ? (
        <p>No stories yet.</p>
      ) : (
        <ul>{stories.map(renderStory)}</ul>
      )}
      {editing === undefined ? (
        <button type="button" disabled={busy} onClick={openAdd}>
          Add a story
        </button>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)}>
          <label>
            Title
            <input
              type="text"
              value={form.title}
              disabled={busy}
              onInput={(e) => patchForm({ title: e.currentTarget.value })}
            />
          </label>
          {STAR_FIELDS.map(([key, label]) => (
            <label key={key}>
              {label}
              <textarea
                value={form[key]}
                disabled={busy}
                onInput={(e) => patchForm({ [key]: e.currentTarget.value })}
              />
            </label>
          ))}
          <label>
            Tags (comma-separated)
            <input
              type="text"
              value={form.tags}
              disabled={busy}
              onInput={(e) => patchForm({ tags: e.currentTarget.value })}
            />
          </label>
          <button type="submit" disabled={busy}>
            Save story
          </button>{' '}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setError(undefined);
              setEditing(undefined);
            }}
          >
            Cancel
          </button>
        </form>
      )}
      {error ? (
        <span class="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
