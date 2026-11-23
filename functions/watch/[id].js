// /watch/<id> shows the same player page for every movie.
export async function onRequestGet({ request, env }) {
  const res = await env.ASSETS.fetch(new Request(new URL('/watch', request.url), { headers: request.headers }));
  return new Response(res.body, { status: res.status, headers: res.headers });
}
