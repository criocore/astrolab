// Hub application: API routes on top of the pack, the database and the agent adapter. index.ts starts it on 127.0.0.1 and serves the UI;
// tests create the app in memory via createApp and call it without a network.
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { type Config, requestLang } from './config.ts';
import { appendChatMessage, closeStaleExams, deleteChat, deleteRow, examsPassed, EXPORT_FORMAT, exportState, getChat, getMeta, importState, insertChat, isList, listChats, listExams, openDb, readState, setTopic, topicHistory, upsertRow } from './db.ts';
import { findPack, loadPack } from './pack.ts';
import { askInPanel, openInTerminal, type ChatRequest } from './chat.ts';
import { createAttempt, createCheck, noteAgentAnswered } from './mentor.ts';
import { startExam, stopExam, subscribe } from './exam.ts';
import { agentHealth, agentsStatus, type Ctl, isSessionId, killTree, setDefaultPreset, setPresetOptions } from './adapter.ts';
import { checkAgentCall, runProbes } from './probes.ts';

export function createApp(config: Config) {
  const PORT = config.port;
  const TOKEN = randomBytes(24).toString('hex');
  const lp = loadPack(findPack(config.root));
  const PACK_ID = lp.pack.id;
  const db = openDb(join(config.dataDir, 'hub.db'));
  const stale = closeStaleExams(db); // exams interrupted by the previous run
  let health = agentHealth(config);
  // Era I probes at startup: terminal, Node, git, agent. They light the stars before the user has clicked anything.
  let probes = health.then((h) => runProbes(config, lp, db, h));

  const app = new Hono();
  const allowedHosts = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`, '127.0.0.1:5173', 'localhost:5173']);

  // Local API protection: a foreign page in the browser must not change data, let alone start the agent.
  app.use('/api/*', async (c, next) => {
    if (!allowedHosts.has(c.req.header('host') ?? '')) return c.text('bad host', 403);
    if (c.req.method !== 'GET') {
      const origin = c.req.header('origin');
      if (origin && !allowedHosts.has(origin.replace(/^https?:\/\//, ''))) return c.text('bad origin', 403);
      if (c.req.header('x-hub-token') !== TOKEN) return c.text('bad token', 403);
    }
    await next();
  });

  app.get('/api/session', async (c) => c.json({ token: TOKEN, pack: PACK_ID, packPath: lp.path, mentorMode: config.mentorMode, demo: config.demo, lang: config.lang, agent: await health }));
  app.get('/api/pack', (c) => c.body(lp.raw, 200, { 'content-type': 'application/json; charset=utf-8' }));
  app.get('/api/state', (c) => c.json(readState(db, PACK_ID)));

  // Topic: note and hours by hand; the status is changed only by the mentor. The topic key contains "/", so it goes in the request body.
  app.put('/api/topic', async (c) => {
    const b = await c.req.json();
    const key = String(b.key ?? '');
    const topic = lp.topics.get(key);
    if (!topic) return c.json({ error: 'not_found' }, 404);
    // Manual status only for topics with a manual probe (era without gates): "read" and back.
    const manual = topic.probe === 'manual' && (b.status === 'learned' || b.status === 'not_started');
    setTopic(db, PACK_ID, key, {
      ...(typeof b.note === 'string' ? { note: b.note } : {}), ...(b.hours === null || typeof b.hours === 'number' ? { hours: b.hours } : {}),
      ...(manual ? { status: b.status, learnedAt: b.status === 'learned' ? new Date().toISOString() : null } : {}),
    });
    return c.json({ ok: true });
  });
  app.get('/api/topic/history', (c) => c.json({ checks: topicHistory(db, PACK_ID, c.req.query('key') ?? '') }));
  app.post('/api/topic/check', async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const r = await createCheck(config, db, lp, String(b.key ?? ''), requestLang(b.lang, config));
    return c.json(r.body, r.status as 200);
  });
  app.post('/api/check/:id/attempt', async (c) => {
    const r = await createAttempt(config, db, lp, c.req.param('id'), await c.req.json().catch(() => ({})));
    return c.json(r.body, r.status as 200);
  });

  // Grade exam or level check on the artifact folder.
  app.get('/api/exams', (c) => c.json({ exams: listExams(db, PACK_ID), passed: examsPassed(db, PACK_ID) }));
  app.post('/api/exam', async (c) => {
    const r = startExam(config, db, lp, await c.req.json().catch(() => ({})));
    return c.json(r.body, r.status as 200);
  });
  app.post('/api/exam/:id/stop', async (c) => { const r = await stopExam(c.req.param('id')); return c.json(r.body, r.status as 200); });
  app.get('/api/exam/:id/events', (c) => {
    const id = c.req.param('id');
    return streamSSE(c, async (stream) => {
      // Writes are chained, and the stream is closed only after the last event has been sent to the client.
      let chain = Promise.resolve();
      await new Promise<void>((done) => {
        const unsub = subscribe(id, (e) => { chain = chain.then(() => stream.writeSSE({ data: JSON.stringify(e) })); }, () => { void chain.then(done); });
        if (!unsub) { void stream.writeSSE({ data: JSON.stringify({ type: 'error', error: 'not_found' }) }).then(done); return; }
        stream.onAbort(() => { unsub(); done(); });
      });
    });
  });

  // Journal, radar, ADR.
  app.post('/api/list/:list', async (c) => {
    const list = c.req.param('list');
    if (!isList(list)) return c.text('unknown list', 404);
    return c.json({ id: upsertRow(db, list, await c.req.json()) });
  });
  app.put('/api/list/:list/:id', async (c) => {
    const list = c.req.param('list');
    if (!isList(list)) return c.text('unknown list', 404);
    return c.json({ id: upsertRow(db, list, await c.req.json(), Number(c.req.param('id'))) });
  });
  app.delete('/api/list/:list/:id', (c) => {
    const list = c.req.param('list');
    if (!isList(list)) return c.text('unknown list', 404);
    deleteRow(db, list, Number(c.req.param('id')));
    return c.json({ ok: true });
  });

  app.get('/api/export', (c) => c.json({ app: 'astrolab', format: EXPORT_FORMAT, pack: PACK_ID, exportedAt: new Date().toISOString(), state: exportState(db, PACK_ID) }));
  app.post('/api/import', async (c) => {
    const b = await c.req.json().catch(() => null);
    if (!b || typeof b !== 'object') return c.json({ error: 'bad_request' }, 400);
    if (typeof b.format === 'number' && b.format > EXPORT_FORMAT) return c.json({ error: 'format_unsupported', format: b.format }, 400);
    if (b.pack && b.pack !== PACK_ID) return c.json({ error: 'pack_mismatch', pack: b.pack }, 400);
    importState(db, PACK_ID, b.state ?? b);
    return c.json({ ok: true });
  });

  // Conversation with the mentor in the panel (explain, task, own question). The conversation is saved: reopening does not call the agent.
  // Closing the panel on the client does not break the stream: the answer is appended to the database and waits.
  app.get('/api/chats', (c) => c.json({ chats: listChats(db, PACK_ID, c.req.query('key') ?? '') }));
  app.get('/api/chat/:id', (c) => { const ch = getChat(db, c.req.param('id')); return ch ? c.json(ch) : c.json({ error: 'not_found' }, 404); });
  // Answers being written right now: chat id -> controls of the agent processes (two tabs can ask in one chat at once).
  // "Stop" in the panel kills them; closing the panel does not.
  const running = new Map<string, Set<Ctl>>();
  // Deleting a chat that is answering stops its agents first: the answer would have nowhere to go.
  app.delete('/api/chat/:id', (c) => {
    for (const ctl of running.get(c.req.param('id')) ?? []) { ctl.stopped = true; killTree(ctl.child); }
    deleteChat(db, c.req.param('id'));
    return c.json({ ok: true });
  });
  app.post('/api/chat/:id/stop', (c) => {
    const ctls = running.get(c.req.param('id'));
    if (!ctls) return c.json({ error: 'not_running' }, 409);
    for (const ctl of ctls) { ctl.stopped = true; killTree(ctl.child); }
    return c.json({ ok: true });
  });
  app.post('/api/agent/ask', async (c) => {
    const req = (await c.req.json()) as ChatRequest & { key?: string; chatId?: string };
    if (req.sessionId !== undefined && !isSessionId(req.sessionId)) return c.json({ error: 'bad_request' }, 400); // it goes into argv
    req.lang = requestLang(req.lang, config);
    const key = typeof req.key === 'string' ? req.key : '';
    let chatId = typeof req.chatId === 'string' ? req.chatId : '';
    const existing = chatId ? getChat(db, chatId) : null;
    if (!existing) {
      chatId = `ch-${randomBytes(6).toString('hex')}`;
      insertChat(db, { id: chatId, pack: PACK_ID, topic_key: key, template: req.template, title: req.context?.title ?? '', lang: req.lang ?? '' });
    } else {
      if (existing.lang) req.lang = existing.lang as 'ru' | 'en'; // a conversation keeps its language: its saved answer is looked up by it
      req.key = existing.topic_key; // the conversation's own topic, whatever the request says (it keys a resumed follow-up's recording)
      if (!req.sessionId && existing.session_id) req.sessionId = existing.session_id;
    }
    appendChatMessage(db, chatId, 'user', [req.template !== 'free' ? req.template : '', req.question ?? ''].filter(Boolean).join(': '));
    // Events are kept until the end: the stream may subscribe after a fast (replayed or refused) answer has already finished.
    const events: unknown[] = [];
    const subs = new Set<(e: unknown) => void>();
    const send = (e: unknown) => { events.push(e); for (const s of subs) s(e); };
    let text = '';
    let sessionId = '';
    // Errors are saved after the answer text: a chat ending with an error row is not taken for a finished answer.
    const errors: string[] = [];
    const ctl: Ctl = { stopped: false };
    const ctls = running.get(chatId) ?? new Set<Ctl>();
    running.set(chatId, ctls.add(ctl));
    // Saving must not throw out of the chain below: an unhandled rejection would stop the whole server.
    const save = (role: 'agent' | 'error', t: string, session?: string) => { try { appendChatMessage(db, chatId, role, t, session); } catch (e) { console.error(`chat ${chatId}: not saved: ${(e as Error).message}`); } };
    void askInPanel(config, req, (e) => {
      if (e.type === 'delta') text += e.text;
      else if (e.type === 'session') sessionId = e.id;
      else if (e.type === 'error') errors.push(e.message);
      if (e.type !== 'done') send(e); // "done" goes to the client after the database write
    }, ctl).catch((e) => {
      const message = String((e as Error)?.message ?? e);
      errors.push(message);
      send({ type: 'error', message });
    }).finally(() => {
      ctls.delete(ctl);
      if (!ctls.size) running.delete(chatId);
      save('agent', text, sessionId);
      for (const m of errors) save('error', m);
      if (ctl.stopped) save('error', 'stopped'); // the client shows the code as "Stopped"
      send({ type: 'done' });
      subs.clear();
    });
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({ data: JSON.stringify({ type: 'chat', id: chatId }) });
      let chain = Promise.resolve();
      await new Promise<void>((done) => {
        const sub = (e: unknown) => { chain = chain.then(() => stream.writeSSE({ data: JSON.stringify(e) })); if ((e as any).type === 'done') void chain.then(done); };
        for (const e of events) sub(e);
        if (events.some((e) => (e as any).type === 'done')) return;
        subs.add(sub);
        stream.onAbort(() => { subs.delete(sub); done(); }); // client left: the agent finishes, the answer lands in the database
      });
    });
  });
  app.post('/api/agent/terminal', async (c) => { const req = (await c.req.json()) as ChatRequest; if (req.sessionId !== undefined && !isSessionId(req.sessionId)) return c.json({ error: 'bad_request' }, 400); req.lang = requestLang(req.lang, config); return c.json(openInTerminal(config, req)); });

  // Era I probes: rerun on request (after installing git or an agent), without a model call.
  app.get('/api/probes', async (c) => { probes = runProbes(config, lp, db, await health); return c.json({ probes: await probes, agentCall: getMeta(db, 'agent_call') }); });
  // "Check call": one short call of the selected agent, only on an explicit button press. Answer: ok or an error code (auth, limit, not_found...).
  // A successful live answer is remembered in meta, like any live topic check; in replay the call comes from a recording.
  app.post('/api/agents/check', async (c) => {
    const r = await checkAgentCall(config);
    if (r.ok && r.source === 'live') noteAgentAnswered(config, db, r.ms, 'button');
    return c.json(r);
  });

  // Agents: what is installed (only `--version`, from the whitelist in agents.json) and which one is selected. The choice is written to data/agents.local.json.
  app.get('/api/agents', async (c) => c.json(await agentsStatus(config)));
  // Body: {name, options?}. options = the selected CLI parameters of this preset (model, effort), validated against agents.json.
  app.put('/api/agents/default', async (c) => {
    const b = await c.req.json().catch(() => ({}));
    try {
      setDefaultPreset(config, String(b.name ?? ''));
      if (b.options && typeof b.options === 'object') setPresetOptions(config, String(b.name), b.options);
    } catch (e) { return c.json({ error: /unknown/.test(String(e)) ? 'unknown_preset' : 'bad_option' }, /unknown/.test(String(e)) ? 404 : 400); }
    health = agentHealth(config);
    probes = health.then((h) => runProbes(config, lp, db, h)); // new agent found -> the "Coding agent" topic star
    return c.json({ ok: true, agent: await health });
  });

  return { app, token: TOKEN, lp, db, packId: PACK_ID, port: PORT, stale };
}
