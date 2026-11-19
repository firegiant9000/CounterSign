import type { VNode } from 'preact';
import { useState } from 'preact/hooks';
import {
  attachDocumentOps,
  detachDocumentOps,
  documentFor,
} from '../../core/src/documents';
import type { DocumentSlot } from '../../core/src/documents';
import type { Application } from '../../core/src/types';
import { sha256Hex } from '../files/hash';
import { useAppData } from './app-data';
import { Button } from './components/Button';
import { Field } from './components/Field';
import { Text } from './components/Text';
import { TypedLine } from './components/TypedLine';

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function DocumentField(props: {
  app: Application;
  slot: DocumentSlot;
  label: string;
}): VNode {
  const appData = useAppData();
  const { data, deps } = appData;
  const { slot } = props;
  const id = props.app.id;
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const doc = documentFor(data, props.app, slot);
  const hash = typeof doc?.sha256 === 'string' ? doc.sha256 : '';

  const onChoose = async (input: HTMLInputElement): Promise<void> => {
    const file = input.files?.[0];
    if (!file || busy) return;
    setError(undefined);
    setBusy(true);
    try {
      const sha256 = await sha256Hex(await file.arrayBuffer());
      await appData.apply((d) => {
        const fresh = d.applications.find((a) => a.id === id);
        return fresh
          ? attachDocumentOps(
              fresh,
              slot,
              { fileName: file.name, sha256 },
              d,
              deps,
            )
          : [];
      });
    } catch (err) {
      setError(`Could not attach the file: ${messageOf(err)}`);
    } finally {
      input.value = '';
      setBusy(false);
    }
  };

  const onRemove = async (): Promise<void> => {
    if (busy) return;
    setError(undefined);
    setBusy(true);
    try {
      await appData.apply((d) => {
        const fresh = d.applications.find((a) => a.id === id);
        return fresh ? detachDocumentOps(fresh, slot) : [];
      });
    } catch (err) {
      setError(`Could not remove the file: ${messageOf(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="document-field">
      <TypedLine as="span">{props.label}</TypedLine>
      {doc ? (
        <span class="document-meta">
          <Text kind="body">
            {doc.label ? `${doc.label} · ` : ''}
            {doc.fileName ?? 'unnamed file'}
            {hash ? ` · ${hash.slice(0, 12)}` : ''}
          </Text>
        </span>
      ) : (
        <TypedLine as="span" tone="muted">
          no file
        </TypedLine>
      )}
      <Field label="Choose file">
        <input
          type="file"
          disabled={busy}
          onChange={(e) => {
            void onChoose(e.currentTarget);
          }}
        />
      </Field>
      {props.app[
        slot === 'resume' ? 'resumeDocumentId' : 'coverLetterDocumentId'
      ] !== undefined ? (
        <Button
          variant="danger"
          disabled={busy}
          onClick={() => {
            void onRemove();
          }}
        >
          Remove
        </Button>
      ) : null}
      {error ? <span class="field-error">{error}</span> : null}
    </div>
  );
}
