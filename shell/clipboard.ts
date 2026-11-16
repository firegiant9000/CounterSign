/**
 * Writes text to the clipboard. Call it synchronously from a click handler
 * (no await before it): Firefox only allows the write during the click's
 * transient activation.
 */
export function copyText(text: string): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    return Promise.reject(new Error('Could not copy.'));
  }
  return navigator.clipboard.writeText(text);
}
