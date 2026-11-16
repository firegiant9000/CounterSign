/**
 * Writes text to the clipboard. Call it synchronously from a click handler
 * (no await before it): Firefox only allows the write during the click's
 * transient activation.
 */
export function copyText(text: string): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      throw new Error('Could not copy.');
    }
    return navigator.clipboard
      .writeText(text)
      .catch(() => Promise.reject(new Error('Could not copy.')));
  } catch {
    return Promise.reject(new Error('Could not copy.'));
  }
}
