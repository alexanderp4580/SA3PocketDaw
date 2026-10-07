import http from 'node:http';
import https from 'node:https';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
  '.data': 'application/octet-stream',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function fileInfo(path) {
  try {
    const s = statSync(path); // follows symlinks
    return s.isFile() ? s : null;
  } catch {
    return null;
  }
}

/** Resolve a URL path below root; returns null when it escapes root. */
function within(root, rel) {
  const full = resolve(join(root, normalize(rel)));
  return full === root || full.startsWith(root + sep) ? full : null;
}

export function createHandler({ distDir, modelsDir }) {
  const dist = resolve(distDir);
  const models = resolve(modelsDir);

  return function handler(req, res) {
    const send = (status, headers, stream, length) => {
      res.writeHead(status, {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        ...headers,
      });
      if (!stream || req.method === 'HEAD') return res.end();
      stream.pipe(res);
    };
    const fail = (status) => send(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': 0 });

    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(405);

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      return fail(400);
    }

    const isModel = pathname.startsWith('/models/');
    let file = null;
    if (isModel) {
      const full = within(models, pathname.slice('/models/'.length));
      if (!full) return fail(403);
      file = fileInfo(full) ? full : null;
      if (!file) return fail(404);
    } else {
      const full = within(dist, pathname.replace(/^\/+/, ''));
      if (!full) return fail(403);
      if (fileInfo(full)) file = full;
      else if (extname(pathname) === '') file = join(dist, 'index.html');
      else return fail(404);
    }

    const stat = fileInfo(file);
    if (!stat) return fail(404);
    const ext = extname(file).toLowerCase();
    const cache = isModel ? 'public, max-age=31536000, immutable' : 'no-cache';
    send(
      200,
      {
        'Content-Type': MIME[ext] ?? 'application/octet-stream',
        'Content-Length': stat.size,
        'Cache-Control': ext === '.html' ? 'no-cache' : cache,
      },
      createReadStream(file),
    );
  };
}

export function startServers({ distDir, modelsDir, certDir, httpsPort = 8443, httpPort = 8082, httpsHost = '0.0.0.0', httpHost = '127.0.0.1' }) {
  const handler = createHandler({ distDir, modelsDir });
  const servers = [];
  const httpServer = http.createServer(handler).listen(httpPort, httpHost);
  servers.push(httpServer);
  const cert = join(certDir, 'cert.pem');
  const key = join(certDir, 'key.pem');
  if (existsSync(cert) && existsSync(key)) {
    servers.push(https.createServer({ cert: readFileSync(cert), key: readFileSync(key) }, handler).listen(httpsPort, httpsHost));
  } else {
    console.warn('certs/cert.pem or certs/key.pem missing; HTTPS disabled (run scripts/make-cert.sh)');
  }
  return servers;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const httpsPort = Number(process.env.HTTPS_PORT ?? 8443);
  const httpPort = Number(process.env.HTTP_PORT ?? 8082);
  startServers({ distDir: join(root, 'dist'), modelsDir: join(root, 'models'), certDir: join(root, 'certs'), httpsPort, httpPort });
  console.log(`serving dist/ and /models/ on https://0.0.0.0:${httpsPort} and http://127.0.0.1:${httpPort}`);
}
