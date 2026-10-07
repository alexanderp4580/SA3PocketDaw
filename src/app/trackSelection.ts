import type { Track } from '../store/projectModel';

/** The selected track id when it exists, otherwise the first track, otherwise null. */
export function resolveSelected(tracks: Pick<Track, 'id'>[], selectedId: string | null): string | null {
  if (selectedId && tracks.some((t) => t.id === selectedId)) return selectedId;
  return tracks[0]?.id ?? null;
}

/** Id of the track that appeared between two track lists, or null when none was added. */
export function idAfterAdd(before: Pick<Track, 'id'>[], after: Pick<Track, 'id'>[]): string | null {
  const known = new Set(before.map((t) => t.id));
  return after.find((t) => !known.has(t.id))?.id ?? null;
}
