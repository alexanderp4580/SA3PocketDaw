/**
 * Absolute URL, ending in a slash, that model files and manifest.json are fetched from.
 * `VITE_MODELS_BASE_URL` (build time) selects a cross-origin host; otherwise `models/` under the app base.
 */
export function modelsBaseUrl(appBase: string, configured: string | undefined = import.meta.env.VITE_MODELS_BASE_URL): string {
  const value = configured?.trim();
  if (!value) return new URL('models/', appBase).href;
  return value.endsWith('/') ? value : value + '/';
}

/** App base URL resolved against the current location (window or worker). */
export function appBaseUrl(): string {
  return new URL(import.meta.env.BASE_URL, globalThis.location?.href ?? 'http://localhost/').href;
}
