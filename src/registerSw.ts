import { log } from './log';

/** Registers the app-shell service worker on secure contexts of production builds. */
export function registerServiceWorker(env: { secure: boolean; prod: boolean; sw?: Pick<ServiceWorkerContainer, 'register'> }): Promise<void> {
  const scope = log.scope('sw');
  if (!env.prod) return Promise.resolve();
  if (!env.secure || !env.sw) {
    scope.info('service worker not registered', { secure: env.secure, supported: !!env.sw });
    return Promise.resolve();
  }
  return env.sw.register('/sw.js').then(
    (reg) => scope.info('service worker registered', { scope: reg.scope }),
    (e) => scope.error('service worker registration failed', { error: String(e) }),
  );
}
