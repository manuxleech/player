// Signed-cookie helpers (Web Crypto). `env` is the Cloudflare environment (variables / secrets).
const enc = new TextEncoder();

const secretOf = (env) => env.SESSION_SECRET || env.ADMIN_PASSWORD || '';
export const configured = (env) => Boolean(secretOf(env));

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(env, data) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secretOf(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

function safeEqualBytes(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

// Compare two strings without leaking where they differ (compares their HMACs).
export async function safeEqual(env, a, b) {
  return safeEqualBytes(await hmac(env, 'eq:' + a), await hmac(env, 'eq:' + b));
}

export async function sign(env, payload, ttlSeconds) {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const part = b64url(enc.encode(JSON.stringify(body)));
  return part + '.' + b64url(await hmac(env, part));
}

export async function verify(env, token) {
  if (!token || !configured(env)) return null;
  const [part, sig] = String(token).split('.');
  if (!part || !sig) return null;
  let given;
  try { given = b64urlDecode(sig); } catch { return null; }
  if (!safeEqualBytes(given, await hmac(env, part))) return null;
  try {
    const body = JSON.parse(new TextDecoder().decode(b64urlDecode(part)));
    if (!body.exp || body.exp < Date.now() / 1000) return null;
    return body;
  } catch { return null; }
}

export function getCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const p of raw.split(';')) {
    const i = p.indexOf('=');
    if (i > 0 && p.slice(0, i).trim() === name) return p.slice(i + 1).trim();
  }
  return '';
}

export function setCookie(request, name, value, { maxAge, sameSite = 'Lax' }) {
  const https = new URL(request.url).protocol === 'https:';
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=${sameSite}${https ? '; Secure' : ''}`;
}

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });
}

// Short fingerprint of the browser's User-Agent (binds the play cookie to one browser).
export async function uaHash(request) {
  const ua = request.headers.get('user-agent') || '';
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(ua)));
  return [...d.slice(0, 6)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
