export const HISTORY_LIMIT = 100;

export interface History<T> {
  past: T[];
  future: T[];
}

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [] };
}

/** Remember `current` before it is replaced by an edit. */
export function record<T>(h: History<T>, current: T): History<T> {
  return { past: [...h.past, current].slice(-HISTORY_LIMIT), future: [] };
}

export function undo<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  const value = h.past[h.past.length - 1];
  if (value === undefined) return null;
  return { value, history: { past: h.past.slice(0, -1), future: [current, ...h.future] } };
}

export function redo<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  const value = h.future[0];
  if (value === undefined) return null;
  return { value, history: { past: [...h.past, current], future: h.future.slice(1) } };
}
