// Public list: only id + name. The stream link is NEVER returned here.
import { listMovies } from '../../lib/db.js';
import { json } from '../../lib/auth.js';

export async function onRequestGet({ env }) {
  try {
    const movies = await listMovies(env);
    return json(movies.map((m) => ({ id: m.id, name: m.name })));
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}
