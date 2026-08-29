import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

const SAFE_PUBLIC_FILES = new Map([
  ['/cases.json', 'cases.json'],
  ['/cases-index.json', 'cases-index.json'],
  ['/style-library.json', 'style-library.json']
]);

const SAFE_PUBLIC_CONTENT_TYPES = {
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

function safePublicDataPlugin() {
  const dataRoot = path.resolve(process.cwd(), 'data');
  const imageRoot = path.resolve(dataRoot, 'images');

  function serveFile(filePath, res, next) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return next();
    res.statusCode = 200;
    res.setHeader('Content-Type', SAFE_PUBLIC_CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    fs.createReadStream(filePath).pipe(res);
  }

  return {
    name: 'safe-public-data',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const requestUrl = new URL(req.url || '/', 'http://localhost');
        const publicFile = SAFE_PUBLIC_FILES.get(requestUrl.pathname);
        if (publicFile) return serveFile(path.resolve(dataRoot, publicFile), res, next);
        if (!requestUrl.pathname.startsWith('/images/')) return next();
        let relativePath;
        try {
          relativePath = decodeURIComponent(requestUrl.pathname.slice('/images/'.length));
        } catch {
          return next();
        }
        const filePath = path.resolve(imageRoot, relativePath);
        if (!filePath.startsWith(`${imageRoot}${path.sep}`)) return next();
        return serveFile(filePath, res, next);
      });
    },
    closeBundle() {
      const distRoot = path.resolve(process.cwd(), 'dist');
      fs.mkdirSync(distRoot, { recursive: true });
      for (const publicFile of SAFE_PUBLIC_FILES.values()) {
        fs.copyFileSync(path.resolve(dataRoot, publicFile), path.resolve(distRoot, publicFile));
      }
      fs.cpSync(imageRoot, path.resolve(distRoot, 'images'), { recursive: true });
    }
  };
}

function localApiPlugin() {
  return {
    name: 'local-api-handlers',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const requestUrl = new URL(req.url || '/', 'http://localhost');
        if (!requestUrl.pathname.startsWith('/api/')) return next();

        const route = requestUrl.pathname.slice('/api/'.length).replace(/^\/+|\/+$/g, '');
        if (!/^[a-zA-Z0-9_/-]+$/.test(route)) return next();
        const routeFile = path.resolve(process.cwd(), 'api', `${route}.js`);
        if (!fs.existsSync(routeFile)) return next();

        req.query = Object.fromEntries(requestUrl.searchParams.entries());
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
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(payload));
            return response;
          },
          end(body = '') {
            if (ended) return response;
            ended = true;
            res.end(body);
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
            const status = typeof statusOrUrl === 'number' ? statusOrUrl : 302;
            const location = typeof statusOrUrl === 'number' ? maybeUrl : statusOrUrl;
            res.statusCode = status;
            res.setHeader('Location', location);
            return response.end();
          }
        };
        response.raw = res;

        try {
          const module = await server.ssrLoadModule(`/api/${route}.js`);
          await module.default(req, response);
          if (!ended && !res.writableEnded) res.end();
        } catch (error) {
          console.error(`[local-api] ${req.method} /api/${route}`, error);
          if (!res.writableEnded) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ ok: false, error: 'LOCAL_API_FAILED' }));
          }
        }
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), '');
  const buildId = process.env.PIC365_BUILD_ID || new Date().toISOString();
  const assetVersion = String(buildId).replace(/[^a-zA-Z0-9_-]/g, '').slice(-24) || String(Date.now());
  for (const [key, value] of Object.entries(fileEnv)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }

  return {
    define: {
      __PIC365_BUILD_ID__: JSON.stringify(buildId)
    },
    plugins: [react(), localApiPlugin(), safePublicDataPlugin()],
    publicDir: false,
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          assetFileNames: `assets/[name]-[hash]-${assetVersion}[extname]`
        }
      }
    }
  };
});
