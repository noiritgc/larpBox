import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express, type RequestHandler } from 'express';

/** Client routes that a browser may load directly (refresh, QR link, bookmark). */
const SPA_ROUTES = [
  /^\/$/,
  /^\/host\/new\/?$/,
  /^\/host\/[A-Za-z]{4}\/?$/,
  /^\/join\/?$/,
  /^\/join\/[A-Za-z]{4}\/?$/,
  /^\/play\/[A-Za-z]{4}\/?$/,
  /^\/help\/?$/,
];

/**
 * apps/web/dist, resolved from this module rather than process.cwd(). Both apps/server/src/*.ts
 * (dev) and the bundled apps/server/dist/index.js sit one directory below apps/server.
 */
export function defaultWebDistDir(): string {
  return fileURLToPath(new URL('../../web/dist/', import.meta.url));
}

function wantsHtml(accept: string | undefined): boolean {
  return typeof accept === 'string' && accept.includes('text/html');
}

function looksLikeFile(urlPath: string): boolean {
  return path.posix.extname(urlPath) !== '';
}

/**
 * Serves the built SPA after the API: hashed assets are immutable, index.html is never cached,
 * recognized client routes get index.html, unknown HTML navigations get index.html with a 404 status
 * (the client renders the branded 404), and unknown file/asset URLs get a plain 404, never HTML
 * disguised as JavaScript.
 */
export function installStaticClient(app: Express, webDistDir: string): boolean {
  const indexPath = path.join(webDistDir, 'index.html');
  if (!existsSync(indexPath)) return false;

  app.use(
    '/assets',
    express.static(path.join(webDistDir, 'assets'), {
      index: false,
      immutable: true,
      maxAge: '365d',
    }),
    (_req, res) => {
      res.status(404).type('text/plain').send('Not found');
    },
  );
  app.use(
    express.static(webDistDir, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
        else res.setHeader('Cache-Control', 'public, max-age=3600');
      },
    }),
  );

  const spaFallback: RequestHandler = (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }
    if (looksLikeFile(req.path) || !wantsHtml(req.headers.accept)) {
      res.status(404).type('text/plain').send('Not found');
      return;
    }
    const known = SPA_ROUTES.some((route) => route.test(req.path));
    res.status(known ? 200 : 404);
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexPath);
  };
  app.use(spaFallback);
  return true;
}
