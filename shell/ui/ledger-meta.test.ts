import { describe, expect, it } from 'vitest';
import { ledgerMeta } from './ledger-meta';

describe('ledgerMeta', () => {
  it('shows the count for an active scope with no status', () => {
    expect(ledgerMeta({ scope: 'active', shown: 6 })).toBe('ACTIVE · 6 SHOWN');
  });

  it('shows the status label and count for an open status', () => {
    expect(
      ledgerMeta({
        scope: 'active',
        statusKey: 'interview',
        statusLabel: 'Interview',
        shown: 2,
      }),
    ).toBe('ACTIVE · INTERVIEW · 2 SHOWN');
  });

  it('gives only the scope word for archived', () => {
    expect(ledgerMeta({ scope: 'archived', shown: 12 })).toBe('ARCHIVED');
  });

  it('gives the scope and label for all, with no count', () => {
    expect(
      ledgerMeta({
        scope: 'all',
        statusKey: 'rejected',
        statusLabel: 'Rejected',
        shown: 4,
      }),
    ).toBe('ALL · REJECTED');
  });

  it('uses a custom label on a closed status and still omits the count', () => {
    expect(
      ledgerMeta({
        scope: 'active',
        statusKey: 'no_response',
        statusLabel: 'Ghosted',
        shown: 0,
      }),
    ).toBe('ACTIVE · GHOSTED');
  });

  it('gives only the scope word for all with no status', () => {
    expect(ledgerMeta({ scope: 'all', shown: 30 })).toBe('ALL');
  });

  it('omits the count for an active scope on a closed status with no label', () => {
    expect(
      ledgerMeta({ scope: 'active', statusKey: 'rejected', shown: 3 }),
    ).toBe('ACTIVE');
  });

  it('adds no status word for an empty label, but still counts an open key', () => {
    expect(
      ledgerMeta({
        scope: 'active',
        statusKey: 'interview',
        statusLabel: '',
        shown: 5,
      }),
    ).toBe('ACTIVE · 5 SHOWN');
  });
});
