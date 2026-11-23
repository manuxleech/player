// Called by the player page. Gives the browser a short-lived signed cookie that the stream proxy
// requires. The cookie is tied to this movie and to the browser's User-Agent, so copying the stream
// address into VLC / a download manager / a new tab does not work.
import { getMovie } from '../../lib/db.js';
import { sign, json, setCookie, uaHash, configured } from '../../lib/auth.js';

const SESSION_HOURS = 8;

export async function onRequestGet({ request, env }) {
  if (!configured(env)) {
    return json({ error: 'Server not configured: add ADMIN_PASSWORD and SESSION_SECRET in Pages > Settings > Variables and Secrets.' }, 500);
  }
  const id = new URL(request.url).searchParams.get('id') || '';
  let movie;
  try { movie = await getMovie(env, id, { fresh: true }); } catch (e) { return json({ error: String(e.message || e) }, 500); }
  if (!movie) return json({ error: 'Movie not found' }, 404);

  const token = await sign(env, { m: movie.id, u: await uaHash(request) }, SESSION_HOURS * 3600);
  return json(
    { id: movie.id, name: movie.name, src: `/s/${movie.id}/master.m3u8` },
    200,
    { 'set-cookie': setCookie(request, 'pv', token, { maxAge: SESSION_HOURS * 3600, sameSite: 'Lax' }) },
  );
}
