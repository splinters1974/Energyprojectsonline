// Password gate for the four reserved Energy Projects areas.
// Secrets belong in Netlify environment variables, never in this public repository.
// Required Functions-scoped environment variables:
// ENERGY_PROJECTS_ACCESS_PASSWORD
// ENERGY_PROJECTS_SESSION_SECRET (a long random value).
const textEncoder = new TextEncoder();
const cookieName = 'ep_private_access';
const duration = 12 * 60 * 60 * 1000;

function b64url(bytes) {
  let raw = '';
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function digest(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', textEncoder.encode(value)));
}

function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}

async function signingKey(secret) {
  return crypto.subtle.importKey('raw', textEncoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function signature(key, value) {
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, textEncoder.encode(value))));
}

function cookieValue(request) {
  const cookies = request.headers.get('cookie') || '';
  const match = cookies.match(/(?:^|;\s*)ep_private_access=([^;]+)/);
  return match ? match[1] : '';
}

async function authorised(request, key) {
  const value = cookieValue(request);
  const splitAt = value.indexOf('.');
  if (splitAt < 1) return false;
  const expiry = value.substring(0, splitAt);
  const supplied = value.substring(splitAt + 1);
  if (!/^\d{13}$/.test(expiry) || Number(expiry) <= Date.now()) return false;
  const expected = await signature(key, expiry);
  return supplied === expected;
}

function htmlPage(error) {
  return '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>Private area | Energy Projects</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#0b1220;color:white;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif}.panel{width:min(450px,100%)}.label{color:#dcfb4a;font-size:12px;font-weight:900;letter-spacing:.2em;text-transform:uppercase}h1{font-size:clamp(43px,8vw,64px);line-height:1;letter-spacing:-.055em;margin:25px 0}p{color:#b8c2cc;line-height:1.5}label{display:block;margin:30px 0 8px;font-size:13px;font-weight:700}input{width:100%;padding:17px;font:inherit;border:2px solid #637184;background:#101b2b;color:white;border-radius:7px}input:focus{outline:3px solid #dcfb4a}button{cursor:pointer;margin-top:20px;width:100%;border:0;border-radius:7px;padding:18px;background:#dcfb4a;color:#0b1220;font:inherit;font-weight:900}button:hover{background:#e9ff88}.error{color:#ffaeae;font-weight:700}</style></head><body><main class="panel"><div class="label">Energy Projects / Private area</div><h1>Private access.</h1><p>Enter the access password to continue.</p>' + (error ? '<p class="error" role="alert">Incorrect password. Please try again.</p>' : '') + '<form method="post"><label for="password">Password</label><input id="password" type="password" name="password" autocomplete="current-password" required autofocus maxlength="200"><button type="submit">Enter private area</button></form></main></body></html>';
}

function privateHeaders() {
  return { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store, max-age=0', 'x-robots-tag': 'noindex, nofollow, noarchive', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
}

export default async function privateArea(request, context) {
  // Fail closed if environment variables have not been set on the Netlify site.
  const password = Netlify.env.get('ENERGY_PROJECTS_ACCESS_PASSWORD');
  const secret = Netlify.env.get('ENERGY_PROJECTS_SESSION_SECRET');
  if (!password || !secret || secret.length < 32) {
    return new Response('Private area is not yet configured.', { status: 503, headers: privateHeaders() });
  }
  const key = await signingKey(secret);
  if (await authorised(request, key)) {
    // Context.next() serves the original page without rerunning this edge function.
    const response = await context.next();
    const headers = new Headers(response.headers);
    headers.set('cache-control', 'private, no-store, max-age=0');
    headers.set('x-robots-tag', 'noindex, nofollow, noarchive');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
  if (request.method === 'POST') {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) {
      return new Response('Forbidden', { status: 403, headers: privateHeaders() });
    }
    const form = await request.formData();
    const candidate = String(form.get('password') || '').slice(0, 201);
    if (candidate.length && candidate.length <= 200 && sameBytes(await digest(candidate), await digest(password))) {
      const expiry = String(Date.now() + duration);
      const sig = await signature(key, expiry);
      const redirect = new Response(null, { status: 303, headers: { 'location': new URL(request.url).pathname, 'cache-control': 'no-store' } });
      redirect.headers.set('set-cookie', cookieName + '=' + expiry + '.' + sig + '; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=Lax');
      return redirect;
    }
    return new Response(htmlPage(true), { status: 401, headers: privateHeaders() });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { 'allow': 'GET, HEAD, POST', 'cache-control': 'no-store' } });
  }
  return new Response(request.method === 'HEAD' ? null : htmlPage(false), { status: 401, headers: privateHeaders() });
}

export const config = {
  path: [
    '/work-projects', '/work-projects/*',
    '/personal-projects', '/personal-projects/*',
    '/sandbox-area', '/sandbox-area/*',
    '/bits-and-pieces', '/bits-and-pieces/*',
    '/personalarea', '/personalarea/*'
  ]
};