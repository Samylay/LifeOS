/**
 * The one way to read a single-key page shortcut (a, d, x, j, k, arrows).
 * Returns the key only for a deliberate, unmodified press outside a text field
 * or dialog; otherwise null. Ctrl+A, Cmd+X, Alt+D and held-key repeats are the
 * browser's or the OS's, never an action (field-test finding CU-03).
 */
export function pageShortcut(event: KeyboardEvent): string | null {
  if (event.defaultPrevented || event.repeat || event.isComposing) return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const target = typeof Element !== "undefined" && event.target instanceof Element ? event.target : null;
  if (target?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']")) return null;
  if (typeof document !== "undefined" && document.querySelector('[role="dialog"]')) return null;
  return event.key;
}
