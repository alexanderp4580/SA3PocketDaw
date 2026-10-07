/** Pure parts of the app-shell service worker. make-sw.mjs inlines this file into dist/sw.js. */

export const CACHE_PREFIX = 'sa3-shell-';
export const MODEL_PATH_PREFIX = '/models/';
export const NAVIGATION_FALLBACK = '/index.html';

/** Precache URLs from build output paths (relative, posix). Skips the worker itself, source maps and model files. */
export function buildPrecacheList(files) {
  const urls = new Set(['/']);
  for (const f of files) {
    const rel = f.replace(/^\/+/, '');
    if (rel === 'sw.js' || rel.endsWith('.map') || rel.startsWith('models/')) continue;
    urls.add('/' + rel);
  }
  return [...urls].sort();
}

export function cacheNameFor(buildId) {
  return CACHE_PREFIX + buildId;
}

/** Old shell caches to delete on activate: ours-prefixed names other than the current one. */
export function staleCacheNames(names, current) {
  return names.filter((n) => n.startsWith(CACHE_PREFIX) && n !== current);
}

/** True when the service worker answers this request itself (same-origin GET outside /models/). */
export function isHandled(request, origin) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== origin) return false;
  if (url.pathname.startsWith(MODEL_PATH_PREFIX)) return false;
  return true;
}

/** Copy of the response with COOP/COEP set; opaque and error responses pass through. */
export function withIsolationHeaders(response) {
  if (response.type === 'opaque' || response.type === 'opaqueredirect' || response.status === 0) return response;
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * Cache-first strategy. `cache.match(urlOrRequest)` resolves a Response or undefined.
 * Navigations that miss fall back to the cached index.html. Misses go to `fetchFn`.
 */
export async function respond({ request, cache, fetchFn, origin }) {
  const url = new URL(request.url);
  let hit = await cache.match(request.url);
  if (!hit && url.search) hit = await cache.match(url.origin + url.pathname);
  if (!hit && request.mode === 'navigate') hit = await cache.match(origin + NAVIGATION_FALLBACK);
  if (hit) return withIsolationHeaders(hit);
  const res = await fetchFn(request);
  return withIsolationHeaders(res);
}
