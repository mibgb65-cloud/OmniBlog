import { ContentMutationError, unpublishArticles, validateArticleSlugs } from "./github.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  },
});

const studioCookie = "omniblog_studio";
const studioSessionSeconds = 12 * 60 * 60;
const studioCsrfSeconds = 10 * 60;
const maxMediaBytes = 15 * 1024 * 1024;
const mutableMediaCacheControl = "public, max-age=0, must-revalidate";
const encoder = new TextEncoder();

function base64UrlEncode(value) {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlDecode(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function secureEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  return constantTimeEqual(base64UrlEncode(new Uint8Array(leftHash)), base64UrlEncode(new Uint8Array(rightHash)));
}

async function signSession(payload, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return base64UrlEncode(new Uint8Array(signature));
}

async function createStudioSession(secret) {
  const payload = base64UrlEncode(JSON.stringify({ version: 1, expires: Math.floor(Date.now() / 1000) + studioSessionSeconds }));
  return `${payload}.${await signSession(payload, secret)}`;
}

async function createStudioCsrf(secret) {
  const payload = base64UrlEncode(JSON.stringify({
    version: 1,
    purpose: "studio-login",
    expires: Math.floor(Date.now() / 1000) + studioCsrfSeconds,
    nonce: crypto.randomUUID(),
  }));
  return `${payload}.${await signSession(payload, secret)}`;
}

async function verifyStudioSession(value, secret) {
  if (!value || !secret) return false;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra) return false;
  const expectedSignature = await signSession(payload, secret);
  if (!constantTimeEqual(signature, expectedSignature)) return false;
  try {
    const session = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
    return session.version === 1 && Number.isFinite(session.expires) && session.expires > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

async function verifyStudioCsrf(value, secret) {
  if (!value || !secret) return false;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra) return false;
  const expectedSignature = await signSession(payload, secret);
  if (!constantTimeEqual(signature, expectedSignature)) return false;
  try {
    const token = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
    return token.version === 1
      && token.purpose === "studio-login"
      && Number.isFinite(token.expires)
      && token.expires > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function cookieValue(request, name) {
  const prefix = `${name}=`;
  const part = (request.headers.get("cookie") ?? "").split(";").map((value) => value.trim()).find((value) => value.startsWith(prefix));
  return part?.slice(prefix.length) ?? "";
}

function studioCookieHeader(request, value, maxAge) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${studioCookie}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function isSameOrigin(request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

async function enforceRateLimit(binding, key) {
  if (!binding?.limit) return null;
  try {
    const { success } = await binding.limit({ key });
    if (success) return null;
  } catch {
    return null;
  }
  const response = json({ error: "Too many requests. Please try again later." }, 429);
  response.headers.set("retry-after", "60");
  return response;
}

async function studioLoginPage(env, message = "", status = 401) {
  const csrfToken = env.STUDIO_TOKEN ? await createStudioCsrf(env.STUDIO_TOKEN) : "";
  const feedback = message ? `<p class="feedback" role="alert">${message}</p>` : "";
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex,nofollow" />
  <meta name="theme-color" content="#f5f5f7" />
  <title>登录写作台 — Omni Journal</title>
  <style>
    :root{color-scheme:light dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;background:#f5f5f7;color:#1d1d1f}
    *{box-sizing:border-box}body{min-width:320px;min-height:100vh;margin:0;display:grid;place-items:center;padding:24px;background:#f5f5f7}
    main{width:min(100%,420px);padding:34px;border:1px solid rgba(0,0,0,.08);border-radius:22px;background:#fff;box-shadow:0 24px 70px rgba(0,0,0,.08)}
    .mark{display:grid;place-items:center;width:48px;height:48px;border-radius:14px;background:#1d1d1f;color:#f5f5f7}.mark svg{width:22px;height:22px}
    .eyebrow{margin:28px 0 8px;color:#86868b;font-size:12px;font-weight:700;letter-spacing:.12em}.eyebrow,h1{text-transform:uppercase}
    h1{margin:0;font-size:36px;letter-spacing:-.055em;line-height:1.05}main>p:not(.eyebrow):not(.feedback){margin:14px 0 28px;color:#6e6e73;font-size:13px;line-height:1.65}
    label{display:grid;gap:9px;color:#6e6e73;font-size:12px;font-weight:650}input{width:100%;min-height:48px;padding:0 14px;border:1px solid #d2d2d7;border-radius:11px;background:#f5f5f7;color:#1d1d1f;font:inherit}input:focus-visible{border-color:#6e6e73;outline:2px solid #1d1d1f;outline-offset:2px;box-shadow:0 0 0 3px rgba(0,0,0,.07)}
    button{width:100%;min-height:48px;margin-top:14px;border:0;border-radius:999px;background:#1d1d1f;color:#f5f5f7;cursor:pointer;font:inherit;font-size:12px;font-weight:700}.feedback{margin:0 0 16px;color:#b42318;font-size:12px;line-height:1.5}
    footer{margin-top:24px;padding-top:18px;border-top:1px solid rgba(0,0,0,.07);color:#86868b;font-size:12px;line-height:1.5}
    @media(prefers-color-scheme:dark){:root,body{background:#0c0c0d;color:#f5f5f7}main{border-color:rgba(255,255,255,.1);background:#161617;box-shadow:0 24px 70px rgba(0,0,0,.32)}.mark{background:#f5f5f7;color:#1d1d1f}main>p:not(.eyebrow):not(.feedback),label{color:#a1a1a6}input{border-color:#3a3a3c;background:#0c0c0d;color:#f5f5f7}input:focus-visible{border-color:#86868b;outline-color:#f5f5f7;box-shadow:0 0 0 3px rgba(255,255,255,.1)}button{background:#f5f5f7;color:#1d1d1f}footer{border-color:rgba(255,255,255,.1)}}
  </style>
</head>
<body>
  <main>
    <div class="mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 11h8M8 15h5M9 3v3m6-3v3"/></svg></div>
    <p class="eyebrow">Omni / Journal</p>
    <h1>进入写作台</h1>
    <p>这是私有编辑区域。请输入部署时配置的 Studio Token。</p>
    ${feedback}
    <form action="/api/studio/login" method="post">
      <input type="hidden" name="csrf" value="${csrfToken}" />
      <label>Studio Token<input type="password" name="token" autocomplete="current-password" maxlength="512" required autofocus /></label>
      <button type="submit">验证并进入</button>
    </form>
    <footer>Token 仅发送给当前站点，成功后将保存为安全的 HttpOnly 会话。</footer>
  </main>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
    },
  });
}

async function isStudioAuthenticated(request, env) {
  return Boolean(env.STUDIO_TOKEN) && verifyStudioSession(cookieValue(request, studioCookie), env.STUDIO_TOKEN);
}

async function loginStudio(request, env) {
  if (!env.STUDIO_TOKEN) return studioLoginPage(env, "服务器尚未配置 STUDIO_TOKEN。", 503);
  const limited = await enforceRateLimit(env.STUDIO_LOGIN_RATE_LIMITER, "studio-login");
  if (limited) return limited;
  let form;
  try {
    form = await request.formData();
  } catch {
    return studioLoginPage(env, "登录请求无效，请重试。", 400);
  }
  const csrfToken = form.get("csrf");
  if (typeof csrfToken !== "string" || !await verifyStudioCsrf(csrfToken, env.STUDIO_TOKEN)) {
    return studioLoginPage(env, "登录页面已过期，请刷新后重试。", 403);
  }
  const token = form.get("token");
  if (typeof token !== "string" || token.length > 512 || !await secureEqual(token, env.STUDIO_TOKEN)) {
    return studioLoginPage(env, "Token 不正确，请重新输入。", 401);
  }
  const session = await createStudioSession(env.STUDIO_TOKEN);
  return new Response(null, {
    status: 303,
    headers: {
      location: "/studio",
      "cache-control": "no-store",
      "set-cookie": studioCookieHeader(request, session, studioSessionSeconds),
    },
  });
}

function logoutStudio(request) {
  if (!isSameOrigin(request)) return json({ error: "Cross-site requests are not allowed." }, 403);
  return new Response(null, {
    status: 303,
    headers: {
      location: "/studio",
      "cache-control": "no-store",
      "set-cookie": studioCookieHeader(request, "", 0),
    },
  });
}

function validEmail(value) {
  return typeof value === "string"
    && value.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function subscribe(request, env) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return json({ error: "Cross-site requests are not allowed." }, 403);
  }
  const actor = request.headers.get("cf-connecting-ip") ?? "unknown";
  const limited = await enforceRateLimit(env.NEWSLETTER_RATE_LIMITER, actor);
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }
  if (body.website) return json({ ok: true }, 202);
  const email = typeof body.email === "string" ? body.email.trim().toLocaleLowerCase() : "";
  const locale = body.locale === "en" ? "en" : "zh";
  if (!validEmail(email)) return json({ error: "Invalid email address." }, 400);
  if (!env.DB) return json({ error: "Newsletter storage is not configured." }, 503);

  const now = new Date().toISOString();
  try {
    await env.DB.prepare(`
      INSERT INTO subscribers (email, locale, status, source, created_at, updated_at)
      VALUES (?, ?, 'active', 'website', ?, ?)
      ON CONFLICT(email) DO UPDATE SET locale = excluded.locale, status = 'active', updated_at = excluded.updated_at
    `).bind(email, locale, now, now).run();
  } catch {
    return json({ error: "Newsletter storage is temporarily unavailable." }, 503);
  }
  return json({ ok: true }, 201);
}

async function deletePublishedArticles(request, env) {
  if (!isSameOrigin(request)) return json({ error: "Cross-site requests are not allowed." }, 403);
  if (!await isStudioAuthenticated(request, env)) return json({ error: "Unauthorized." }, 401);
  const actor = request.headers.get("cf-connecting-ip") ?? "studio";
  const limited = await enforceRateLimit(env.STUDIO_MUTATION_RATE_LIMITER, actor);
  if (limited) return limited;
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 4096) return json({ error: "Request body is too large." }, 413);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }
  const slugs = validateArticleSlugs(body?.slugs);
  if (!slugs) return json({ error: "Select between 1 and 20 valid article slugs." }, 400);

  try {
    const result = await unpublishArticles(env, slugs);
    return json({ ok: true, slugs, ...result });
  } catch (error) {
    if (error instanceof ContentMutationError) {
      return json({ error: error.message, code: error.code }, error.status);
    }
    return json({ error: "Published article deletion is temporarily unavailable." }, 503);
  }
}

function mediaKey(pathname, prefix) {
  try {
    const key = decodeURIComponent(pathname.slice(prefix.length));
    return /^articles\/[a-z0-9-]+\/[a-z0-9][a-z0-9.-]*$/.test(key) ? key : null;
  } catch {
    return null;
  }
}

async function uploadMedia(request, env, pathname) {
  if (!env.ADMIN_TOKEN && !env.STUDIO_TOKEN) return json({ error: "Media authentication is not configured." }, 503);
  const authorization = request.headers.get("authorization");
  const bearerAllowed = Boolean(env.ADMIN_TOKEN)
    && typeof authorization === "string"
    && authorization.startsWith("Bearer ")
    && await secureEqual(authorization.slice(7), env.ADMIN_TOKEN);
  if (!bearerAllowed && !await isStudioAuthenticated(request, env)) return json({ error: "Unauthorized." }, 401);
  const actor = request.headers.get("cf-connecting-ip") ?? "unknown";
  const limited = await enforceRateLimit(env.MEDIA_RATE_LIMITER, actor);
  if (limited) return limited;
  const key = mediaKey(pathname, "/api/media/");
  if (!key || !request.body) return json({ error: "Invalid media path." }, 400);
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxMediaBytes) return json({ error: "Image is too large." }, 413);
  const contentType = request.headers.get("content-type") ?? "application/octet-stream";
  if (!contentType.startsWith("image/")) return json({ error: "Only images are accepted." }, 415);
  if (!env.MEDIA) return json({ error: "Media storage is not configured." }, 503);

  let body;
  try {
    body = await request.arrayBuffer();
  } catch {
    return json({ error: "Invalid image body." }, 400);
  }
  if (!body.byteLength) return json({ error: "Image is empty." }, 400);
  if (body.byteLength > maxMediaBytes) return json({ error: "Image is too large." }, 413);

  let object;
  try {
    object = await env.MEDIA.put(key, body, {
      httpMetadata: { contentType, cacheControl: mutableMediaCacheControl },
    });
  } catch {
    return json({ error: "Media storage is temporarily unavailable." }, 503);
  }
  return json({ ok: true, key, etag: object.httpEtag }, 201);
}

async function serveMedia(request, env, pathname) {
  const key = mediaKey(pathname, "/media/");
  if (!key) return new Response("Not found", { status: 404 });
  if (!env.MEDIA) return new Response("Not found", { status: 404 });
  if (request.method === "HEAD") {
    const object = await env.MEDIA.head(key);
    if (!object) return new Response("Not found", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", mutableMediaCacheControl);
    headers.set("content-length", String(object.size));
    headers.set("x-content-type-options", "nosniff");
    return new Response(null, { headers });
  }
  const object = await env.MEDIA.get(key, { onlyIf: request.headers });
  if (!object) return new Response("Not found", { status: 404 });
  if (!object.body) return new Response(null, { status: 304, headers: { etag: object.httpEtag } });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", mutableMediaCacheControl);
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/studio/login" && request.method === "POST") return loginStudio(request, env);
    if (url.pathname === "/api/studio/logout" && request.method === "POST") return logoutStudio(request);
    if (url.pathname === "/api/studio/articles/delete" && request.method === "POST") return deletePublishedArticles(request, env);
    if (url.pathname === "/studio" || url.pathname.startsWith("/studio/")) {
      if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "Method not allowed." }, 405);
      if (!env.STUDIO_TOKEN) return studioLoginPage(env, "服务器尚未配置 STUDIO_TOKEN。", 503);
      if (!await isStudioAuthenticated(request, env)) return studioLoginPage(env);
      const asset = await env.ASSETS.fetch(request);
      const headers = new Headers(asset.headers);
      headers.set("cache-control", "private, no-store");
      return new Response(request.method === "HEAD" ? null : asset.body, { status: asset.status, statusText: asset.statusText, headers });
    }
    if (url.pathname === "/api/newsletter" && request.method === "POST") return subscribe(request, env);
    if (url.pathname.startsWith("/api/media/") && request.method === "PUT") return uploadMedia(request, env, url.pathname);
    if (url.pathname.startsWith("/media/") && (request.method === "GET" || request.method === "HEAD")) return serveMedia(request, env, url.pathname);
    if (url.pathname === "/api/health") return json({ ok: true });
    if (url.pathname.startsWith("/api/")) return json({ error: "Not found." }, 404);
    return env.ASSETS.fetch(request);
  },
};
