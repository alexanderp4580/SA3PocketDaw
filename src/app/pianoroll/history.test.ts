import { describe, expect, it } from 'vitest';
import { HISTORY_LIMIT, emptyHistory, record, redo, undo } from './history';

describe('history', () => {
  it('undoes and redoes in order', () => {
    let h = record(emptyHistory<string>(), 'a');
    h = record(h, 'b');
    const u1 = undo(h, 'c')!;
    expect(u1.value).toBe('b');
    const u2 = undo(u1.history, 'b')!;
    expect(u2.value).toBe('a');
    expect(undo(u2.history, 'a')).toBeNull();
    const r1 = redo(u2.history, 'a')!;
    expect(r1.value).toBe('b');
    expect(redo(r1.history, 'b')!.value).toBe('c');
  });
  it('clears redo on a new edit and caps the stack', () => {
    let h = record(emptyHistory<number>(), 1);
    h = undo(h, 2)!.history;
    expect(h.future).toEqual([2]);
    h = record(h, 3);
    expect(h.future).toEqual([]);
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) h = record(h, i);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
  });
});
