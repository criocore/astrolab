// Local hub server: UI, pack v2, progress, mentor (topic check) and artifact exams. Listens on 127.0.0.1 only.
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { makeConfig } from './config.ts';
import { createApp } from './app.ts';

const config = makeConfig();
const { app, stale, port: PORT, packId: PACK_ID } = createApp(config);
if (stale) console.log(`${stale} exam(s) left running by a previous start were marked stopped`);

// UI: the built Vite bundle. In dev mode Vite serves it itself on :5173.
if (existsSync(config.webDir)) {
  app.use('/*', serveStatic({ root: relative(process.cwd(), config.webDir) || '.' }));
  app.get('*', (c) => c.html(readFileSync(join(config.webDir, 'index.html'), 'utf8')));
}

serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' }, () => {
  console.log(`Astrolabe: http://127.0.0.1:${PORT}  (pack: ${PACK_ID}, mentor: ${config.mentorMode}${config.demo ? ', demo' : ''}, data: ${config.dataDir})`);
});
