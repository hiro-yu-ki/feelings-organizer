import { AppService } from './service.js';
import { createAIProvider } from './infra/ai.js';
import { D1Store } from './infra/d1-store.js';

const securityHeaders = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  'cache-control': 'no-store'
};
const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), x => x.toString(16).padStart(2, '0')).join('');
const tokenHash = async (token) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), x => x.toString(16).padStart(2, '0')).join('');
const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { ...securityHeaders, ...headers } });
const match = (path, regex) => path.match(regex)?.slice(1).map(decodeURIComponent);
const fail = (message, status) => { throw Object.assign(new Error(message), { status }); };

async function readBody(request) {
  if (Number(request.headers.get('content-length') || 0) > 1_000_000) fail('送信内容が大きすぎます', 413);
  const reader = request.body?.getReader();
  if (!reader) return {};
  const parts = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 1_000_000) { await reader.cancel(); fail('送信内容が大きすぎます', 413); }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  return size ? JSON.parse(new TextDecoder().decode(bytes)) : {};
}

async function rateLimit(db, request, scope, max) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const windowStart = Math.floor(Date.now() / 60_000);
  const row = await db.prepare(`INSERT INTO request_limits (scope, ip, window_start, count)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(scope, ip, window_start) DO UPDATE SET count = count + 1
    RETURNING count`).bind(scope, ip, windowStart).first();
  if (row.count > max) fail('リクエストが多すぎます。少し待ってください', 429);
}

async function loginResponse(db, user) {
  const token = randomToken();
  const csrf = randomToken();
  const expiresAt = Date.now() + 12 * 60 * 60 * 1000;
  await db.prepare('INSERT INTO login_sessions (token_hash, user_id, csrf, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await tokenHash(token), user.id, csrf, expiresAt).run();
  return json({ user, csrfToken: csrf }, 200, {
    'set-cookie': `sid=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`
  });
}

async function sessionFor(db, request) {
  const cookie = request.headers.get('cookie')?.match(/(?:^|;\s*)sid=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!cookie) return null;
  return db.prepare('SELECT user_id, csrf, expires_at FROM login_sessions WHERE token_hash = ?')
    .bind(await tokenHash(cookie)).first();
}

async function api(request, env, url) {
  const path = url.pathname;
  const method = request.method;
  const db = env.DB;
  const aiAction = method !== 'GET' && /\/(prepare|opening|turns|complete)$/.test(path);
  const scope = path.startsWith('/api/auth/') ? 'auth' : aiAction ? 'ai' : 'api';
  await rateLimit(db, request, scope, scope === 'auth' ? 12 : scope === 'ai' ? 12 : 240);
  if (method === 'GET' && path === '/api/health') return json({ ok: true });
  const store = await D1Store.load(db);
  const service = new AppService(store, createAIProvider(env));

  if (method === 'POST' && path === '/api/auth/register') return loginResponse(db, await service.register(await readBody(request)));
  if (method === 'POST' && path === '/api/auth/login') return loginResponse(db, service.login(await readBody(request)));

  const session = await sessionFor(db, request);
  if (!session || session.expires_at <= Date.now()) fail('ログインが必要です', 401);
  if (method !== 'GET' && method !== 'HEAD' && request.headers.get('x-csrf-token') !== session.csrf) fail('CSRF token is invalid', 403);
  const uid = session.user_id;
  if (method === 'POST' && path === '/api/auth/logout') {
    const token = request.headers.get('cookie')?.match(/(?:^|;\s*)sid=([a-f0-9]{64})(?:;|$)/)?.[1];
    if (token) await db.prepare('DELETE FROM login_sessions WHERE token_hash = ?').bind(await tokenHash(token)).run();
    return json({ ok: true }, 200, { 'set-cookie': 'sid=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0' });
  }
  if (method === 'GET' && path === '/api/me') return json({ user: service.user(uid), csrfToken: session.csrf, aiProvider: service.ai.name, aiModel: service.ai.model });
  if (method === 'GET' && path === '/api/sessions') return json(service.listSessions(uid));
  if (method === 'POST' && path === '/api/sessions') return json(await service.createSession(uid, await readBody(request)), 201);
  if (method === 'POST' && path === '/api/sessions/join') return json(await service.joinSession(uid, (await readBody(request)).inviteCode));
  let p;
  if ((p = match(path, /^\/api\/sessions\/([^/]+)$/))) {
    if (method === 'GET') return json(service.getSession(uid, p[0]));
    if (method === 'DELETE') return json(await service.deleteSession(uid, p[0]));
  }
  if ((p = match(path, /^\/api\/sessions\/([^/]+)\/prepare$/)) && method === 'POST') return json(await service.prepare(uid, p[0], await readBody(request)));
  if ((p = match(path, /^\/api\/sessions\/([^/]+)\/opening$/)) && method === 'POST') return json(await service.createOpening(uid, p[0]));
  if ((p = match(path, /^\/api\/sessions\/([^/]+)\/analysis$/)) && method === 'PUT') return json(await service.confirmAnalysis(uid, p[0], (await readBody(request)).analysis));
  if ((p = match(path, /^\/api\/sessions\/([^/]+)\/shares\/([^/]+)$/)) && method === 'PUT') return json(await service.approveShare(uid, p[0], p[1], await readBody(request)));
  if ((p = match(path, /^\/api\/sessions\/([^/]+)\/turns$/)) && method === 'POST') return json(await service.addTurn(uid, p[0], await readBody(request)), 201);
  if ((p = match(path, /^\/api\/sessions\/([^/]+)\/turns\/([^/]+)$/)) && method === 'PUT') return json(await service.editTurn(uid, p[0], p[1], (await readBody(request)).text));
  if ((p = match(path, /^\/api\/sessions\/([^/]+)\/state$/)) && method === 'PUT') return json(await service.setState(uid, p[0], (await readBody(request)).event));
  if ((p = match(path, /^\/api\/sessions\/([^/]+)\/complete$/)) && method === 'POST') return json(await service.complete(uid, p[0]));
  if ((p = match(path, /^\/api\/sessions\/([^/]+)\/history$/))) {
    if (method === 'GET') return json(service.historicalContext(uid, p[0]));
    if (method === 'POST') return json(await service.proposeHistory(uid, p[0], await readBody(request)), 201);
  }
  if ((p = match(path, /^\/api\/sessions\/([^/]+)\/history\/([^/]+)$/)) && method === 'PUT') return json(await service.approveHistory(uid, p[0], p[1], Boolean((await readBody(request)).approved)));
  return json({ error: 'not_found' }, 404);
}

export default {
  async fetch(request, env) {
    const requestId = crypto.randomUUID();
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/')) {
        const response = await api(request, env, url);
        response.headers.set('x-request-id', requestId);
        return response;
      }
      const response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(securityHeaders)) if (key !== 'cache-control') headers.set(key, value);
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      const status = error instanceof SyntaxError ? 400 : error.status || 500;
      console.error(JSON.stringify({ event: 'request_error', requestId, method: request.method, path: new URL(request.url).pathname, status, name: error.name, message: String(error.message).slice(0, 240) }));
      return json({ error: error instanceof SyntaxError ? 'invalid_json' : error.status ? error.message : '処理に失敗しました。もう一度お試しください', requestId }, status, { 'x-request-id': requestId });
    }
  },
  async scheduled(_event, env) {
    const expired = Date.now();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM login_sessions WHERE expires_at < ?').bind(expired),
      env.DB.prepare('DELETE FROM request_limits WHERE window_start < ?').bind(Math.floor(expired / 60_000) - 1440)
    ]);
  }
};
