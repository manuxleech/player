// Admin API (password protected). Ops: ?op=login | logout | me | list | add | update | test | delete
import { listMoviesFull, getMovie, saveMovie, deleteMovie, newId, hasStorage } from '../../lib/db.js';
import { upstreamFor, originHeaders } from '../../lib/origin.js';
import { sign, verify, getCookie, setCookie, safeEqual, json } from '../../lib/auth.js';

const DAYS = 7;

async function isAdmin(request, env) {
  const s = await verify(env, getCookie(request, 'pa'));
  return Boolean(s && s.r === 'admin');
}

function cleanLink(v) {
  try {
    const u = new URL(String(v || '').trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    return u.toString();
  } catch { return null; }
}
const cleanName = (v) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, 200);

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const op = url.searchParams.get('op') || '';

  // CSRF guard: only same-site requests
  const origin = request.headers.get('origin');
  if (origin) { try { if (new URL(origin).host !== url.host) return json({ error: 'Forbidden' }, 403); } catch { return json({ error: 'Forbidden' }, 403); } }
  if (request.method !== 'GET' && !(request.headers.get('content-type') || '').includes('application/json')) {
    return json({ error: 'Send JSON' }, 415);
  }

  let body = {};
  if (request.method !== 'GET') { try { body = await request.json(); } catch { body = {}; } }

  try {
    if (op === 'login') {
      const pw = env.ADMIN_PASSWORD;
      if (!pw) return json({ error: 'ADMIN_PASSWORD is not set (Pages > Settings > Variables and Secrets).' }, 503);
      if (!(await safeEqual(env, String(body.password || ''), pw))) {
        await new Promise((r) => setTimeout(r, 700)); // slow down guessing
        return json({ error: 'Wrong password' }, 401);
      }
      const token = await sign(env, { r: 'admin' }, DAYS * 86400);
      return json({ ok: true }, 200, { 'set-cookie': setCookie(request, 'pa', token, { maxAge: DAYS * 86400, sameSite: 'Strict' }) });
    }
    if (op === 'logout') {
      return json({ ok: true }, 200, { 'set-cookie': setCookie(request, 'pa', '', { maxAge: 0, sameSite: 'Strict' }) });
    }
    if (op === 'me') return json({ admin: await isAdmin(request, env), storage: hasStorage(env) ? 'kv' : 'memory' });

    if (!(await isAdmin(request, env))) return json({ error: 'Not logged in' }, 401);

    if (op === 'list') return json(await listMoviesFull(env));

    if (op === 'add') {
      const name = cleanName(body.name), link = cleanLink(body.link);
      if (!name) return json({ error: 'Movie name is required' }, 400);
      if (!link) return json({ error: 'Link must start with http:// or https://' }, 400);
      return json(await saveMovie(env, { id: newId(), name, link, createdAt: Date.now() }));
    }
    if (op === 'update') {
      const m = await getMovie(env, String(body.id || ''), { fresh: true });
      if (!m) return json({ error: 'Movie not found' }, 404);
      const name = body.name === undefined ? m.name : cleanName(body.name);
      const link = body.link === undefined ? m.link : cleanLink(body.link);
      if (!name) return json({ error: 'Movie name is required' }, 400);
      if (!link) return json({ error: 'Link must start with http:// or https://' }, 400);
      return json(await saveMovie(env, { ...m, name, link }));
    }
    if (op === 'test') {
      // Makes the same request the player proxy makes, and reports the exact answer (admin only)
      const m = await getMovie(env, String(body.id || ''), { fresh: true });
      if (!m) return json({ error: 'Movie not found' }, 404);
      const target = upstreamFor(m.link, 'master.m3u8');
      const shown = target.toString().replace(/\?.*$/, '');
      try {
        const r = await fetch(target, { headers: originHeaders(env, target), redirect: 'follow' });
        const text = (await r.text()).slice(0, 20000);
        const media = (text.match(/#EXT-X-MEDIA/g) || []).length, qual = (text.match(/#EXT-X-STREAM-INF/g) || []).length;
        return json({ requested: shown, status: r.status, ok: r.ok, isPlaylist: text.startsWith('#EXTM3U'), qualities: qual, audioTracks: media, body: text.slice(0, 200) });
      } catch (e) {
        return json({ requested: shown, status: 0, ok: false, body: 'Could not connect: ' + String(e.message || e) });
      }
    }
    if (op === 'delete') {
      const m = await getMovie(env, String(body.id || ''), { fresh: true });
      if (!m) return json({ error: 'Movie not found' }, 404);
      await deleteMovie(env, m.id);
      return json({ ok: true });
    }
    return json({ error: 'Unknown op' }, 400);
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}
