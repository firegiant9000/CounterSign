import { describe, expect, it } from 'vitest';
import { STATUS_KEYS } from '../../core/src/status';
import { inkClass, inkFor, type Ink } from './status-ink';

describe('status-ink', () => {
  it('maps every status key', () => {
    const table: Record<(typeof STATUS_KEYS)[number], Ink> = {
      interested: 'faded',
      applied: 'faded',
      recruiter_contact: 'ochre',
      phone_screen: 'blue',
      interview: 'maroon',
      offer: 'green',
      accepted: 'green',
      rejected: 'faded',
      position_closed: 'faded',
      no_response: 'faded',
      withdrawn: 'faded',
    };
    expect(STATUS_KEYS.length).toBe(11);
    for (const key of STATUS_KEYS) {
      expect(inkFor(key), key).toBe(table[key]);
    }
  });

  it('handles odd values', () => {
    expect(inkFor('zoom')).toBe('faded');
    expect(inkFor('')).toBe('none');
    expect(inkFor(undefined)).toBe('none');
    expect(inkFor(null)).toBe('none');
    expect(inkFor(42)).toBe('none');
    expect(inkFor('toString')).toBe('faded');
  });

  it('inkClass', () => {
    expect(inkClass('none')).toBeUndefined();
    expect(inkClass('blue')).toBe('ink-blue');
  });
});
