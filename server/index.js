import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { startFreeGenerationWorker } from './free-generation-worker.js';
import { startEcommerceGenerationWorker } from './ecommerce-generation-worker.js';
import { startMediaProcessingWorker } from './media-processing-worker.js';
import { startStorageBillingWorker } from './storage-billing-worker.js';

const root = process.cwd();
const distRoot = path.resolve(root, 'dist');
const apiRoot = path.resolve(root, 'api');
const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 5173);
const apiHandlerCache = new Map();

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function safeRoute(value) {
  const route = String(value || '').replace(/^\/api\/+/, '').replace(/^\/+|\/+$/g, '');
  return /^[a-zA-Z0-9_/-]+$/.test(route) ? route : '';
}

async function readApiHandler(route) {
  const filePath = path.resolve(apiRoot, `${route}.js`);
  if (!filePath.startsWith(`${apiRoot}${path.sep}`) || !fs.existsSync(filePath)) return null;
  if (apiHandlerCache.has(filePath)) return apiHandlerCache.get(filePath);
  const module = await import(pathToFileURL(filePath).href);
  apiHandlerCache.set(filePath, module.default);
  return module.default;
}

function createApiResponse(res) {
  let ended = false;
  const response = {
    status(code) {
      res.statusCode = code;
      return response;
    },
    setHeader(name, value) {
      res.setHeader(name, value);
      return response;
    },
    getHeader(name) {
      return res.getHeader(name);
    },
    json(payload) {
      if (ended) return response;
      ended = true;
      if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(payload));
      return response;
    },
    end(body = '') {
      if (ended) return response;
      ended = true;
      res.end(body);
      return response;
    },
    writeHead(statusCode, headers = {}) {
      res.writeHead(statusCode, headers);
      return response;
    },
    write(chunk) {
      res.write(chunk);
      return response;
    },
    stream(readable) {
      if (ended) return response;
      ended = true;
      readable.on('error', () => res.destroy());
      readable.pipe(res);
      return response;
    },
    redirect(statusOrUrl, maybeUrl) {
      const statusCode = typeof statusOrUrl === 'number' ? statusOrUrl : 302;
      const location = typeof statusOrUrl === 'number' ? maybeUrl : statusOrUrl;
      res.writeHead(statusCode, { Location: location });
      return response.end();
    }
  };
  response.raw = res;
  return { response, isEnded: () => ended };
}

async function handleApi(req, res, requestUrl) {
  const route = safeRoute(requestUrl.pathname);
  if (!route) return false;
  const handler = await readApiHandler(route);
  if (!handler) return false;

  req.query = Object.fromEntries(requestUrl.searchParams.entries());
  const apiResponse = createApiResponse(res);
  try {
    await handler(req, apiResponse.response);
    if (!apiResponse.isEnded() && !res.writableEnded) res.end();
  } catch (error) {
    console.error(`[api] ${req.method} ${requestUrl.pathname}`, error);
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: false, error: 'SERVER_ERROR' }));
    }
  }
  return true;
}

function serveStatic(req, res, requestUrl) {
  const requested = decodeURIComponent(requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname);
  const candidate = path.resolve(distRoot, `.${requested}`);
  const filePath = candidate.startsWith(`${distRoot}${path.sep}`) ? candidate : path.resolve(distRoot, 'index.html');
  const resolvedPath = fs.existsSync(filePath) && fs.statSync(filePath).isFile() ? filePath : path.resolve(distRoot, 'index.html');
  if (!fs.existsSync(resolvedPath)) {
    res.statusCode = 503;
    res.end('Build output is missing. Run npm run build first.');
    return;
  }
  const relativePath = path.relative(distRoot, resolvedPath).replace(/\\/g, '/');
  const extension = path.extname(resolvedPath).toLowerCase();
  const cacheControl = path.basename(resolvedPath) === 'index.html'
    ? 'no-cache'
    : relativePath.startsWith('assets/')
      ? 'public, max-age=31536000, immutable'
      : relativePath.startsWith('images/')
        ? 'public, max-age=86400, stale-while-revalidate=604800'
      : extension === '.json'
        ? 'no-cache'
        : 'public, max-age=3600';
  res.setHeader('Content-Type', contentTypes[path.extname(resolvedPath).toLowerCase()] || 'application/octet-stream');
  res.setHeader('Cache-Control', cacheControl);
  fs.createReadStream(resolvedPath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (requestUrl.pathname.startsWith('/api/')) {
    const handled = await handleApi(req, res, requestUrl);
    if (handled) return;
  }
  serveStatic(req, res, requestUrl);
});

server.listen(port, host, () => {
  startFreeGenerationWorker();
  startEcommerceGenerationWorker();
  startMediaProcessingWorker();
  startStorageBillingWorker();
  console.log(`GPT-Image2 app listening on http://${host}:${port}`);
});
