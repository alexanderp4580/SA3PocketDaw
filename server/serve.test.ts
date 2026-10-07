// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
// @ts-expect-error plain JS module
import { createHandler } from './serve.mjs';

let root: string;
let server: http.Server;
let base: string;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'serve-'));
  const dist = join(root, 'dist');
  const models = join(root, 'models');
  const ext = join(root, 'external');
  mkdirSync(join(dist, 'ort'), { recursive: true });
  mkdirSync(models);
  mkdirSync(ext);
  writeFileSync(join(dist, 'index.html'), '<html>app</html>');
  writeFileSync(join(dist, 'app.js'), 'x');
  writeFileSync(join(dist, 'ort/a.wasm'), 'wasm');
  writeFileSync(join(dist, 'ort/a.mjs'), 'm');
  writeFileSync(join(dist, 'm.webmanifest'), '{}');
  writeFileSync(join(ext, 'real.onnx'), '12345');
  symlinkSync(join(ext, 'real.onnx'), join(models, 'link.onnx'));
  writeFileSync(join(models, 'c.data'), 'abc');
  server = http.createServer(createHandler({ distDir: dist, modelsDir: models }));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.close();
  rmSync(root, { recursive: true, force: true });
});

describe('static server', () => {
  it('sends isolation headers and html no-cache', async () => {
    const r = await fetch(base + '/');
    expect(r.status).toBe(200);
    expect(await r.text()).toBe('<html>app</html>');
    expect(r.headers.get('cross-origin-opener-policy')).toBe('same-origin');
    expect(r.headers.get('cross-origin-embedder-policy')).toBe('require-corp');
    expect(r.headers.get('cache-control')).toBe('no-cache');
    expect(r.headers.get('content-type')).toContain('text/html');
  });
  it('sets MIME types', async () => {
    const t = async (p: string) => (await fetch(base + p)).headers.get('content-type');
    expect(await t('/ort/a.wasm')).toBe('application/wasm');
    expect(await t('/ort/a.mjs')).toContain('text/javascript');
    expect(await t('/app.js')).toContain('text/javascript');
    expect(await t('/m.webmanifest')).toBe('application/manifest+json');
    expect(await t('/models/c.data')).toBe('application/octet-stream');
    expect(await t('/models/link.onnx')).toBe('application/octet-stream');
  });
  it('serves models through symlinks as immutable with Content-Length', async () => {
    const r = await fetch(base + '/models/link.onnx');
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toContain('immutable');
    expect(r.headers.get('content-length')).toBe('5');
    expect(r.headers.get('cross-origin-embedder-policy')).toBe('require-corp');
    expect(await r.text()).toBe('12345');
  });
  it('falls back to index.html for unknown non-file paths only', async () => {
    const spa = await fetch(base + '/tracks/1');
    expect(spa.status).toBe(200);
    expect(await spa.text()).toBe('<html>app</html>');
    expect((await fetch(base + '/missing.js')).status).toBe(404);
    expect((await fetch(base + '/models/nope.onnx')).status).toBe(404);
    expect((await fetch(base + '/models/tracks')).status).toBe(404);
  });
  it('rejects path traversal', async () => {
    const r = await fetch(base + '/models/..%2f..%2fexternal/real.onnx');
    expect([403, 404]).toContain(r.status);
  });
});
