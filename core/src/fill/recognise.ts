import type { ProfileKey } from '../profile';
import { containsPhrase, normalizeLabel } from './normalize';
import type { RecognitionTables } from './tables';
import type { ScannedField } from './types';

/**
 * The profile key a field means, or undefined. A known autocomplete token
 * decides; an unknown token is ignored and the label must equal a phrase.
 */
export function recogniseProfile(
  field: Pick<ScannedField, 'label' | 'autocomplete'>,
  tables: RecognitionTables,
): ProfileKey | undefined {
  const byToken = tables.profileAutocomplete.get(field.autocomplete);
  if (byToken !== undefined) return byToken;
  const label = normalizeLabel(field.label);
  if (label === '') return undefined;
  for (const [key, phrases] of tables.profilePhrases) {
    if (phrases.includes(label)) return key;
  }
  return undefined;
}

/** Every answer key whose phrase the label contains as whole words, once each, in table order. */
export function recogniseAnswers(
  field: Pick<ScannedField, 'label'>,
  tables: RecognitionTables,
): string[] {
  const label = normalizeLabel(field.label);
  const keys: string[] = [];
  for (const [key, phrases] of tables.answerPhrases) {
    if (phrases.some((phrase) => containsPhrase(label, phrase))) keys.push(key);
  }
  return keys;
}
