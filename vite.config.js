import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

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
          redirect(statusOrUrl, maybeUrl) {
            const status = typeof statusOrUrl === 'number' ? statusOrUrl : 302;
            const location = typeof statusOrUrl === 'number' ? maybeUrl : statusOrUrl;
            res.statusCode = status;
            res.setHeader('Location', location);
            return response.end();
          }
        };

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
  for (const [key, value] of Object.entries(fileEnv)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }

  return {
    plugins: [react(), localApiPlugin()],
    publicDir: 'data',
    build: {
      outDir: 'dist',
      sourcemap: false
    }
  };
});
