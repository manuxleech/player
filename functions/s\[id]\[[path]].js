// Stream proxy. The browser only ever sees /s/<movieId>/...; the real link stays on the server.
// Playlists made by the workflow use relative paths, so every part is fetched through here too.
import { getMovie } from '../../../lib/db.js';
import { verify, getCookie, uaHash } from '../../../lib/auth.js';
import { upstreamFor, originHeaders } from '../../../lib/origin.js';

const TYPES = {
  m3u8: 'application/vnd.apple.mpegurl',
  ts: 'video/mp2t',
  m4s: 'video/iso.segment',
  mp4: 'video/mp4',
  aac: 'audio/aac',
  vtt: 'text/vtt',
};

function deny(status, msg) {
  return new Response(msg, { status, headers: { 'cache-control': 'no-store', 'content-type': 'text/plain' } });
}

export async function onRequest({ request, env, params }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return deny(405, 'Method not allowed');

  // Opening the address directly in a tab / pasting it in a browser bar
  if (request.headers.get('sec-fetch-mode') === 'navigate') return deny(403, 'Forbidden');

  const url = new URL(request.url);
  // Requests that come from another website
  for (const h of ['origin', 'referer']) {
    const v = request.headers.get(h);
    if (v) { try { if (new URL(v).host !== url.host) return deny(403, 'Forbidden'); } catch { return deny(403, 'Forbidden'); } }
  }

  const id = String(params.id || '');
  const p = (Array.isArray(params.path) ? params.path.join('/') : String(params.path || '')).replace(/^\/+/, '');
  if (!/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(p) || p.split('/').some((s) => s === '..' || s === '.')) {
    return deny(400, 'Bad path');
  }
  const ext = p.split('.').pop().toLowerCase();
  if (!TYPES[ext]) return deny(400, 'Bad file type');

  // Must carry the signed cookie issued by /api/play for THIS movie and THIS browser
  const sess = await verify(env, getCookie(request, 'pv'));
  if (!sess || sess.m !== id || sess.u !== (await uaHash(request))) return deny(401, 'Unauthorized');

  let movie;
  try { movie = await getMovie(env, id); } catch { return deny(502, 'Storage error'); }
  if (!movie) return deny(404, 'Not found');

  const target = upstreamFor(movie.link, p);
  const headers = originHeaders(env, target);
  const range = request.headers.get('range');
  if (range) headers.range = range;

  let up;
  try { up = await fetch(target, { method: request.method, headers, redirect: 'follow' }); }
  catch { return deny(502, 'Could not reach the video source'); }
  if (!up.ok && up.status !== 206) return deny(up.status === 404 ? 404 : 502, 'Source error ' + up.status);

  const out = new Headers({
    'content-type': TYPES[ext],
    'cache-control': ext === 'm3u8' ? 'private, max-age=120' : 'private, max-age=86400',
    'accept-ranges': 'bytes',
  });
  if (up.headers.get('content-range')) out.set('content-range', up.headers.get('content-range'));
  if (up.headers.get('content-length') && !up.headers.get('content-encoding')) {
    out.set('content-length', up.headers.get('content-length'));
  }
  return new Response(request.method === 'HEAD' ? null : up.body, { status: up.status, headers: out });
}
