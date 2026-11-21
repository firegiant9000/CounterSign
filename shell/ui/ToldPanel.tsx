import type { VNode } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { voidStatusEventOps } from '../../core/src/application-ops';
import { toLocalDate } from '../../core/src/dates';
import type { WriteOp } from '../../core/src/repository';
import {
  markAppliedOps,
  recordTickedOps,
  toldPanel,
} from '../../core/src/told-panel';
import type { Deps, Id, Snapshot } from '../../core/src/types';
import { Button } from './components/Button';
import { Text } from './components/Text';

const MISSING = 'The application is no longer there. Choose another.';

export interface ToldPanelProps {
  data: Snapshot;
  applicationId: Id;
  statusLabel: string;
  deps: Deps;
  onApply(build: (d: Snapshot) => WriteOp[]): Promise<void>;
}

export function ToldPanel(props: ToldPanelProps): VNode | null {
  const { data, applicationId, deps } = props;
  const [ticked, setTicked] = useState<string[]>([]);
  const [markedEvent, setMarkedEvent] = useState<Id | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const busyRef = useRef(false);

  const panel = toldPanel(data, applicationId);
  if (
    panel.unrecorded.length === 0 &&
    !panel.offerApplied &&
    markedEvent === undefined
  ) {
    return null;
  }

  // One write at a time; the decision is made against the builder's fresh data.
  const run = (
    build: (d: Snapshot, got: { missing: boolean }) => WriteOp[],
    done: () => void,
  ): void => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(undefined);
    const got = { missing: false };
    props
      .onApply((d) => {
        const ops = build(d, got);
        return got.missing ? [] : ops;
      })
      .then(
        () => {
          busyRef.current = false;
          setBusy(false);
          if (got.missing) setError(MISSING);
          else done();
        },
        (err: unknown) => {
          busyRef.current = false;
          setBusy(false);
          setError(err instanceof Error ? err.message : String(err));
        },
      );
  };

  const toggle = (key: string, on: boolean): void =>
    setTicked((t) => (on ? [...t, key] : t.filter((k) => k !== key)));

  const record = (): void =>
    run(
      (d, got) => {
        const r = recordTickedOps(d, applicationId, ticked, deps);
        got.missing = r.missing;
        return r.ops;
      },
      () => setTicked([]),
    );

  let newEventId: Id | undefined;
  const markApplied = (): void =>
    run(
      (d, got) => {
        const r = markAppliedOps(
          d,
          applicationId,
          toLocalDate(new Date()),
          deps,
        );
        got.missing = r.missing;
        newEventId = r.eventId;
        return r.ops;
      },
      () => setMarkedEvent(newEventId),
    );

  const undo = (): void => {
    const id = markedEvent;
    run(
      (d) => {
        const event = d.statusEvents.find((e) => e.id === id);
        return event === undefined ? [] : voidStatusEventOps(event, deps);
      },
      () => setMarkedEvent(undefined),
    );
  };

  return (
    <section class="popup-told">
      {panel.unrecorded.length > 0 ? (
        <div class="popup-told-list">
          <Text kind="title">Also told them?</Text>
          {panel.unrecorded.map((a) => {
            const key = a.key ?? '';
            return (
              <label key={a.id} class="popup-told-row">
                <input
                  type="checkbox"
                  checked={ticked.includes(key)}
                  disabled={busy}
                  onChange={(e) => toggle(key, e.currentTarget.checked)}
                />{' '}
                <Text kind="body">{a.label || key}</Text>
              </label>
            );
          })}
          <div class="popup-actions">
            <Button disabled={busy || ticked.length === 0} onClick={record}>
              Record
            </Button>
          </div>
        </div>
      ) : null}
      {markedEvent !== undefined ? (
        <div class="popup-actions">
          <Text kind="name">Marked Applied.</Text>
          <Button variant="link" disabled={busy} onClick={undo}>
            Undo
          </Button>
        </div>
      ) : panel.offerApplied ? (
        <div class="popup-actions">
          <Text kind="name">Status: {props.statusLabel}</Text>
          <Button disabled={busy} onClick={markApplied}>
            Mark Applied
          </Button>
        </div>
      ) : null}
      {error ? (
        <span class="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </section>
  );
}
