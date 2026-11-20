// Tells the page that a field's value was set by the extension.
export function notifyChanged(el: Element): void {
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
