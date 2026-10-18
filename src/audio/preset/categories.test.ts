import { expect, it } from 'vitest';
import { categoryOf, previewNotes } from './categories';
it('normalizes unsupported categories without hiding the instrument', () => {
 expect(categoryOf('pads')).toBe('pads');
 expect(categoryOf('invalid')).toBe('other');
 expect(categoryOf(undefined, 'ep-cp80')).toBe('keys');
 expect(categoryOf(undefined, 'custom')).toBe('other');
});
it('previews bass low, pads sustained and drums on GM kit notes', () => {
 expect(previewNotes('bass').map(n => n.midi)).toEqual([36, 36, 43, 39]);
 expect(previewNotes('pads').every(n => n.duration >= 3)).toBe(true);
 expect(previewNotes('drums').map(n => n.midi)).toEqual([36, 42, 38, 42, 36, 46, 38, 49]);
 expect(previewNotes('drums').every(n => n.duration <= .2)).toBe(true);
});

it('fits preview notes to the real instrument range and velocity coverage', async () => {
 const { presetPreview } = await import('./categories');
 const preset = { id: 'bells', category: 'mallets', regions: [
  { file: 0, lokey: 69, hikey: 81, center: 72, lovel: 1, hivel: 127 },
 ] };
 const notes = presetPreview(preset);
 expect(notes.map(n => n.midi)).toEqual([72, 76, 79, 81]);
 expect(presetPreview({ id: 'empty', regions: [] })).toEqual([]);
});
