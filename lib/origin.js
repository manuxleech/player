// Works out the real upstream address from the link the admin saved. Server-side only.
export function upstreamFor(link, p) {
  const u = new URL(link);
  let masterName = 'master.m3u8';
  let dir = u.pathname;
  if (/\.m3u8$/i.test(dir)) {
    const i = dir.lastIndexOf('/');
    masterName = dir.slice(i + 1);
    dir = dir.slice(0, i + 1);
  } else if (!dir.endsWith('/')) {
    dir += '/';
  }
  const rel = p === 'master.m3u8' ? masterName : p;
  const out = new URL(u.origin + dir + rel);
  out.search = u.search; // keep signed-link query strings
  return out;
}

// Headers sent to the source (shared so the admin "Test" button behaves exactly like the player proxy).
export function originHeaders(env, target) {
  const headers = { 'user-agent': 'Mozilla/5.0 (HLS-Proxy)' };
  if (env.ORIGIN_KEY) headers['x-proxy-key'] = env.ORIGIN_KEY;
  if (target.hostname === 'raw.githubusercontent.com' && env.GITHUB_TOKEN) {
    headers.authorization = `token ${env.GITHUB_TOKEN}`; // keeps the GitHub repo private
  }
  return headers;
}
