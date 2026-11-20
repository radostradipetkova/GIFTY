/** GIFTY AI: authenticated, cost-conscious Cloudflare Workers AI gateway.
 * Never put provider credentials in the browser. A browser request can incur charges.
 * No generation is allowed until the owner explicitly enables it and configures verification.
 */
export type AIEnv = {
  ASSETS?: { fetch(request: Request): Promise<Response> };
  AI?: { run(model: string, input: Record<string, unknown>, options?: { gateway: { id: string } }): Promise<unknown> };
  AI_RATE?: { limit(input: { key: string }): Promise<{ success: boolean }> };
  GIFTY_AI_ENABLED?: string;
  GIFTY_TURNSTILE_SITE_KEY?: string;
  GIFTY_TURNSTILE_SECRET?: string;
  GIFTY_OWNER_PASSCODE?: string;
};

const MODEL = 'vidu/q3-turbo';
const MAX_IMAGE = 2 * 1024 * 1024;
const NO_STORE = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: NO_STORE }); }
function enabled(env: AIEnv) {
  return env.GIFTY_AI_ENABLED === 'true' && Boolean(env.AI) && Boolean(env.AI_RATE) &&
    Boolean((env.GIFTY_TURNSTILE_SITE_KEY && env.GIFTY_TURNSTILE_SECRET) || env.GIFTY_OWNER_PASSCODE);
}
function ownerValid(candidate: string, secret?: string) {
  if (!secret || !candidate || candidate.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= candidate.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}
function validJpeg(bytes: Uint8Array) {
  return bytes.length > 100 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff &&
    bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
}
function base64url(bytes: Uint8Array) {
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function hmac(data: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))));
}
function getSigningKey(env: AIEnv) { return env.GIFTY_TURNSTILE_SECRET || env.GIFTY_OWNER_PASSCODE || ''; }
function safeProviderVideo(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2500) return false;
  try { const url = new URL(value); return url.protocol === 'https:' &&
    (url.hostname === 'vidu.com' || url.hostname.endsWith('.vidu.com')) && !url.username && !url.password;
  } catch { return false; }
}
async function verifyTurnstile(token: string, ip: string, secret: string, hostname: string) {
  if (!token || token.length > 2048) return false;
  const body = new URLSearchParams({ secret, response: token, remoteip: ip });
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  if (!res.ok) return false;
  const result = await res.json() as { success?: boolean; hostname?: string; action?: string };
  return result.success === true && result.hostname === hostname && result.action === 'gifty_ai';
}
async function generate(request: Request, env: AIEnv) {
  if (request.headers.get('Origin') !== new URL(request.url).origin) return json({ error: 'Invalid request origin.' }, 403);
  if (!enabled(env)) return json({ error: 'AI generation is not enabled by the site owner.' }, 503);
  const size = Number(request.headers.get('Content-Length') || '0');
  if (size > MAX_IMAGE + 140_000) return json({ error: 'Image upload exceeds the size limit.' }, 413);
  if (!request.headers.get('Content-Type')?.startsWith('multipart/form-data;')) return json({ error: 'Expected a form upload.' }, 415);
  const form = await request.formData();
  const image = form.get('image'); const prompt = form.get('prompt');
  if (!(image instanceof File) || image.type !== 'image/jpeg' || image.size > MAX_IMAGE || image.size < 100) return json({ error: 'Upload a valid JPEG image smaller than 2 MB.' }, 422);
  if (typeof prompt !== 'string' || prompt.trim().length < 8 || prompt.length > 900) return json({ error: 'Describe the motion in 8–900 characters.' }, 422);
  const duration = Number(form.get('duration'));
  if (duration !== 3 && duration !== 5) return json({ error: 'Choose a 3 or 5 second video.' }, 422);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const passcode = request.headers.get('X-Gifty-Owner') || '';
  const authenticated = ownerValid(passcode, env.GIFTY_OWNER_PASSCODE);
  if (!authenticated) {
    if (!env.GIFTY_TURNSTILE_SECRET || !env.GIFTY_TURNSTILE_SITE_KEY) return json({ error: 'Public AI generation is not configured.' }, 403);
    const turnstile = form.get('turnstile');
    if (typeof turnstile !== 'string' || !await verifyTurnstile(turnstile, ip, env.GIFTY_TURNSTILE_SECRET, new URL(request.url).hostname)) return json({ error: 'Please complete the verification and try again.' }, 403);
  }
  const rate = await env.AI_RATE!.limit({ key: authenticated ? 'owner:' + ip : 'visitor:' + ip });
  if (!rate.success) return json({ error: 'Generation limit reached. Please try again in a minute.' }, 429);
  const bytes = new Uint8Array(await image.arrayBuffer());
  if (!validJpeg(bytes)) return json({ error: 'The image is invalid or corrupted.' }, 422);
  const encoded = base64url(bytes);
  const start_image = 'data:image/jpeg;base64,' + encoded.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(encoded.length / 4) * 4, '=');
  try {
    const response = await env.AI!.run(MODEL, { prompt: prompt.trim(), start_image, duration, resolution: '540p', audio: false }, { gateway: { id: 'default' } }) as {
      result?: { video?: unknown }; state?: string; video?: unknown;
    };
    if (response.state && response.state.toLowerCase() !== 'completed') return json({ error: 'The provider did not finish the video: ' + response.state }, 502);
    const source = response.result?.video || response.video;
    if (!safeProviderVideo(source)) return json({ error: 'The provider returned an unsupported video URL.' }, 502);
    const expires = Date.now() + 2 * 60 * 60 * 1000;
    const sign = await hmac(`${expires}:${source}`, getSigningKey(env));
    const videoUrl = `/api/ai/video?e=${expires}&u=${encodeURIComponent(source)}&s=${sign}`;
    return json({ status: 'completed', videoUrl, duration, model: MODEL });
  } catch (error) {
    console.error('AI video generation failed', error instanceof Error ? error.message : String(error));
    return json({ error: 'The AI provider could not generate a video. Check your Cloudflare AI credits and model access.' }, 502);
  }
}
async function video(request: Request, env: AIEnv) {
  const u = new URL(request.url);
  const source = u.searchParams.get('u'); const exp = Number(u.searchParams.get('e')); const sig = u.searchParams.get('s');
  const signingKey = getSigningKey(env);
  if (!signingKey || !safeProviderVideo(source) || !sig || !Number.isSafeInteger(exp) || exp < Date.now() || exp > Date.now() + 2 * 60 * 60 * 1000 + 60_000) return new Response('Video link expired or invalid.', { status: 403 });
  const expected = await hmac(`${exp}:${source}`, signingKey);
  if (!ownerValid(sig, expected)) return new Response('Invalid video signature.', { status: 403 });
  const headers = new Headers();
  const range = request.headers.get('range');
  if (range && /^bytes=\d*-\d*$/.test(range)) headers.set('Range', range);
  const upstream = await fetch(source, { headers, redirect: 'error' });
  if (!upstream.ok && upstream.status !== 206) return new Response('Video unavailable.', { status: 502 });
  const responseHeaders = new Headers({ 'Content-Type': 'video/mp4', 'Cache-Control': 'private, max-age=900', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes' });
  for (const key of ['content-length', 'content-range']) { const val = upstream.headers.get(key); if (val) responseHeaders.set(key, val); }
  if (u.searchParams.get('download') === '1') responseHeaders.set('Content-Disposition', 'attachment; filename="gifty-ai-motion.mp4"');
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}
export async function routeAI(request: Request, env: AIEnv): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  if (pathname === '/api/ai/config' && request.method === 'GET') return json({ enabled: enabled(env), siteKey: enabled(env) ? env.GIFTY_TURNSTILE_SITE_KEY || null : null, requiresOwner: !env.GIFTY_TURNSTILE_SITE_KEY, model: MODEL, durationOptions: [3, 5], costPerSecond540pUSD: 0.04 });
  if (pathname === '/api/ai/generate' && request.method === 'POST') return generate(request, env);
  if (pathname === '/api/ai/video' && (request.method === 'GET' || request.method === 'HEAD')) return video(request, env);
  return json({ error: 'Not found' }, 404);
}
export default { async fetch(request: Request, env: AIEnv) {
  if (new URL(request.url).pathname.startsWith('/api/ai/')) return routeAI(request, env);
  return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
} };
