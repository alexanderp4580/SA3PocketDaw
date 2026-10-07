import { describe, expect, it } from 'vitest';
import { resolveSelected, idAfterAdd } from './trackSelection';
import { addTrack, createProject } from '../store/projectModel';

describe('track selection', () => {
  it('falls back to the first track when nothing valid is selected', () => {
    const p = addTrack(addTrack(createProject(), 'A', 'a'), 'B', 'b');
    expect(resolveSelected(p.tracks, null)).toBe('a');
    expect(resolveSelected(p.tracks, 'gone')).toBe('a');
    expect(resolveSelected(p.tracks, 'b')).toBe('b');
    expect(resolveSelected([], 'b')).toBeNull();
  });
  it('selects the newly added track so Generate targets it', () => {
    const before = addTrack(createProject(), 'A', 'a');
    const after = addTrack(before, 'B', 'b');
    expect(idAfterAdd(before.tracks, after.tracks)).toBe('b');
    expect(idAfterAdd(before.tracks, before.tracks)).toBeNull();
  });
});
