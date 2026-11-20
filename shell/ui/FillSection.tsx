import type { VNode } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { FillResult } from '../../core/src/fill/result';
import type { FillController, FillState } from '../fill/controller';
import { copyText } from '../clipboard';
import { Button } from './components/Button';
import { CardSection } from './components/IndexCard';
import { Disclosure } from './components/Disclosure';
import { Fact } from './components/Fact';
import { Text } from './components/Text';
import { TypedLine } from './components/TypedLine';
import { fillView } from './fill-view';
import type { FillViewRow } from './fill-view';

type CopyState = { key: string; ok: boolean; message: string };

export function FillSection(props: {
  controller: FillController;
  onFilled?: (result: FillResult) => void;
}): VNode | null {
  const [state, setState] = useState<FillState>(() => props.controller.state());
  const [copy, setCopy] = useState<CopyState | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = props.controller.subscribe(setState);
    // A change between render and subscribe must not be missed.
    setState(props.controller.state());
    return unsubscribe;
  }, [props.controller]);

  if (state.status !== 'ready') return null;
  const view = fillView(state);

  // Called synchronously from onClick: no await before copyText.
  const doCopy = (key: string, text: string): void => {
    copyText(text).then(
      () => setCopy({ key, ok: true, message: 'Copied' }),
      () => setCopy({ key, ok: false, message: 'Could not copy.' }),
    );
  };

  const status = (key: string): VNode | null => {
    if (copy?.key !== key) return null;
    return copy.ok ? (
      <span role="status"> {copy.message}</span>
    ) : (
      <span class="field-error" role="alert">
        {' '}
        {copy.message}
      </span>
    );
  };

  const row = (r: FillViewRow): VNode => (
    <div class="popup-fill-row" key={r.key}>
      <Text kind="name">{r.label}</Text>
      <div class="popup-fill-lines">
        {r.lines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
      {r.copy !== undefined ? (
        <>
          <Button
            variant="secondary"
            aria-label={`Copy ${r.label}`}
            onClick={() => doCopy(r.key, r.copy as string)}
          >
            Copy
          </Button>
          {status(r.key)}
        </>
      ) : null}
    </div>
  );

  const group = (
    title: string,
    rows: FillViewRow[],
    open: boolean,
  ): VNode | null =>
    rows.length === 0 ? null : (
      <Disclosure summary={`${title} (${rows.length})`} open={open}>
        {rows.map(row)}
      </Disclosure>
    );

  return (
    <CardSection title="Application form">
      <div class="popup-fill">
        {view.frames.map((message) => (
          <Fact tone="neutral" key={message}>
            {message}
          </Fact>
        ))}
        {view.button !== undefined ? (
          <Button
            variant="primary"
            disabled={state.busy}
            onClick={() =>
              void props.controller.fill().then((result) => {
                if (result) props.onFilled?.(result);
              })
            }
          >
            {view.button}
          </Button>
        ) : (
          <p>{view.nothing}</p>
        )}
        {view.filledLine !== undefined ? (
          <p role="status">{view.filledLine}</p>
        ) : null}
        {view.error !== undefined ? (
          <p class="field-error" role="alert">
            {view.error}
          </p>
        ) : null}
        {group('Will fill', view.willFill, true)}
        {group('Matches your details', view.matches, false)}
        {group('Already has a different value', view.differs, true)}
        {group('Not filled', view.notFilled, true)}
        {view.optionalLine !== undefined ? <p>{view.optionalLine}</p> : null}
        <TypedLine tone="muted">{view.footer}</TypedLine>
      </div>
    </CardSection>
  );
}
