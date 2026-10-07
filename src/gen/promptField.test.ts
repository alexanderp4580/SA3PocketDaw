import { describe, expect, it } from 'vitest';
import { editField, resetField, startField, syncField } from './promptField';

describe('prompt field', () => {
  it('starts as the suggestion and unedited', () => {
    expect(startField('a')).toEqual({ text: 'a', edited: false });
  });
  it('follows a changed suggestion while unedited', () => {
    expect(syncField(startField('a'), 'b')).toEqual({ text: 'b', edited: false });
  });
  it('keeps user text when the suggestion changes after an edit', () => {
    const f = editField(startField('a'), 'my own words', 'a');
    expect(f).toEqual({ text: 'my own words', edited: true });
    expect(syncField(f, 'b')).toBe(f);
  });
  it('typing the suggestion exactly counts as unedited', () => {
    expect(editField({ text: 'x', edited: true }, 'b', 'b').edited).toBe(false);
  });
  it('reset returns to the current suggestion, unedited', () => {
    expect(resetField('c')).toEqual({ text: 'c', edited: false });
  });
});
