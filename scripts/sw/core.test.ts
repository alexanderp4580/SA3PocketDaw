// @vitest-environment node
import { describe, it, expect } from 'vitest';
// @ts-expect-error plain JS module
import { buildPrecacheList, cacheNameFor, staleCacheNames, isHandled, withIsolationHeaders, respond } from './core.mjs';
// @ts-expect-error plain JS module
import { buildSwSource, buildIdFor } from './build.mjs';

const ORIGIN = 'https://deck.local:8443';
const req = (path: string, init: { method?: string; mode?: string } = {}) => ({
  url: ORIGIN + path,
  method: init.method ?? 'GET',
  mode: init.mode ?? 'cors',
});

function fakeCache(entries: Record<string, string>) {
  const asked: string[] = [];
  return {
    asked,
    match: async (u: string) => {
      asked.push(u);
      return u in entries ? new Response(entries[u], { headers: { 'content-type': 'text/plain' } }) : undefined;
    },
  };
}

describe('buildPrecacheList', () => {
  it('lists shell files, adds root, skips sw, maps and models', () => {
    const list = buildPrecacheList(['index.html', 'assets/a.js', 'assets/a.js.map', 'ort/x.wasm', 'gpu-probe.onnx', 'sw.js', 'models/manifest.json', 'manifest.webmanifest', 'icons/icon-192.png']);
    expect(list).toEqual(['/', '/assets/a.js', '/gpu-probe.onnx', '/icons/icon-192.png', '/index.html', '/manifest.webmanifest', '/ort/x.wasm']);
  });
});

describe('cache names', () => {
  it('versions the name and picks stale shell caches only', () => {
    expect(cacheNameFor('abc')).toBe('sa3-shell-abc');
    expect(staleCacheNames(['sa3-shell-old', 'sa3-shell-abc', 'sa3-models-v1', 'sa3-manifest-v1'], 'sa3-shell-abc')).toEqual(['sa3-shell-old']);
  });
});

describe('isHandled', () => {
  it('handles same-origin GET except /models/', () => {
    expect(isHandled(req('/assets/a.js'), ORIGIN)).toBe(true);
    expect(isHandled(req('/models/manifest.json'), ORIGIN)).toBe(false);
    expect(isHandled(req('/models/small/x.onnx'), ORIGIN)).toBe(false);
    expect(isHandled(req('/x', { method: 'POST' }), ORIGIN)).toBe(false);
    expect(isHandled({ url: 'https://other.example/x.js', method: 'GET' }, ORIGIN)).toBe(false);
  });
  it('passes cross-origin model requests through, including paths under /models/ and Hugging Face URLs', () => {
    const hf = 'https://huggingface.co/u/sa3-browser-models/resolve/main/';
    expect(isHandled({ url: hf + 'manifest.json', method: 'GET', mode: 'cors' }, ORIGIN)).toBe(false);
    expect(isHandled({ url: hf + 'small/dit.onnx', method: 'GET', mode: 'cors' }, ORIGIN)).toBe(false);
    expect(isHandled({ url: 'https://cdn.example/models/x.onnx', method: 'GET', mode: 'cors' }, ORIGIN)).toBe(false);
  });
});

describe('withIsolationHeaders', () => {
  it('adds COOP and COEP and keeps status and body', async () => {
    const out = withIsolationHeaders(new Response('hi', { status: 201, headers: { 'x-a': '1' } }));
    expect(out.status).toBe(201);
    expect(out.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(out.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
    expect(out.headers.get('x-a')).toBe('1');
    expect(await out.text()).toBe('hi');
  });
  it('passes opaque responses through', () => {
    const opaque = { type: 'opaque', status: 0, headers: new Headers() } as unknown as Response;
    expect(withIsolationHeaders(opaque)).toBe(opaque);
  });
});

describe('respond', () => {
  const never = async () => {
    throw new Error('network used');
  };
  it('serves a cached file without the network, with isolation headers', async () => {
    const res = await respond({ request: req('/assets/a.js'), cache: fakeCache({ [ORIGIN + '/assets/a.js']: 'js' }), fetchFn: never, origin: ORIGIN });
    expect(await res.text()).toBe('js');
    expect(res.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
  });
  it('ignores the query string on a miss', async () => {
    const res = await respond({ request: req('/ort/x.wasm?v=1'), cache: fakeCache({ [ORIGIN + '/ort/x.wasm']: 'w' }), fetchFn: never, origin: ORIGIN });
    expect(await res.text()).toBe('w');
  });
  it('answers navigations from cached index.html', async () => {
    const res = await respond({ request: req('/some/route', { mode: 'navigate' }), cache: fakeCache({ [ORIGIN + '/index.html']: '<html>' }), fetchFn: never, origin: ORIGIN });
    expect(await res.text()).toBe('<html>');
  });
  it('goes to the network on a miss and adds headers', async () => {
    const res = await respond({ request: req('/other.txt'), cache: fakeCache({}), fetchFn: async () => new Response('net'), origin: ORIGIN });
    expect(await res.text()).toBe('net');
    expect(res.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
  });
  it('rejects when offline and not cached', async () => {
    await expect(respond({ request: req('/other.txt'), cache: fakeCache({}), fetchFn: never, origin: ORIGIN })).rejects.toThrow('network used');
  });
});

describe('buildSwSource', () => {
  const files = ['index.html', 'assets/a.js', 'sw.js'];
  it('inlines constants and code without export keywords; id follows content', () => {
    const a = buildSwSource(files, () => Buffer.from('1'));
    const b = buildSwSource(files, () => Buffer.from('2'));
    expect(a.source).toContain(`const CACHE_NAME = "sa3-shell-${a.buildId}"`);
    expect(a.source).toContain('"/assets/a.js"');
    expect(a.source).not.toMatch(/^export /m);
    expect(a.source).toContain("addEventListener('fetch'");
    expect(a.buildId).not.toBe(b.buildId);
    expect(buildIdFor(['/'], () => Buffer.from(''))).toHaveLength(12);
  });
});
