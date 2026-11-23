// Movie storage in Cloudflare KV (binding name: MOVIES). One key per movie: "m:<id>".
// The name + created time are also kept in KV metadata, so the public list needs a single KV list call.
const cache = (globalThis.__movieCache ||= new Map()); // id -> { t, movie }   (saves KV reads on every video part)
const TTL_MS = 60 * 1000;

function kv(env) {
  if (!env.MOVIES) throw new Error('KV binding "MOVIES" is missing. Add it in Pages > Settings > Bindings, then redeploy.');
  return env.MOVIES;
}
export const hasStorage = (env) => Boolean(env.MOVIES);

export async function listMovies(env) {
  const out = [];
  let cursor;
  do {
    const r = await kv(env).list({ prefix: 'm:', cursor });
    for (const k of r.keys) out.push({ id: k.name.slice(2), name: k.metadata?.name || '', createdAt: k.metadata?.createdAt || 0 });
    cursor = r.list_complete ? undefined : r.cursor;
  } while (cursor);
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

// Admin list: includes the links (reads each movie)
export async function listMoviesFull(env) {
  const list = await listMovies(env);
  const full = await Promise.all(list.map((m) => kv(env).get('m:' + m.id, 'json')));
  return full.filter(Boolean).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function getMovie(env, id, { fresh = false } = {}) {
  if (!/^[a-z0-9]{6,20}$/.test(id || '')) return null;
  const hit = cache.get(id);
  if (!fresh && hit && Date.now() - hit.t < TTL_MS) return hit.movie;
  const movie = await kv(env).get('m:' + id, 'json');
  cache.set(id, { t: Date.now(), movie });
  return movie;
}

export async function saveMovie(env, movie) {
  await kv(env).put('m:' + movie.id, JSON.stringify(movie), { metadata: { name: movie.name, createdAt: movie.createdAt } });
  cache.delete(movie.id);
  return movie;
}

export async function deleteMovie(env, id) {
  await kv(env).delete('m:' + id);
  cache.delete(id);
}

export function newId() {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return [...b].map((x) => (x % 36).toString(36)).join('');
}
