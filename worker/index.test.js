import assert from "node:assert/strict";
import test from "node:test";
import worker from "./index.js";

const studioToken = "test-token-that-is-long-enough-for-the-studio";
const env = {
  STUDIO_TOKEN: studioToken,
  ASSETS: { fetch: async () => new Response("studio") },
};

async function loginPage() {
  const response = await worker.fetch(new Request("https://blog.example/studio"), env);
  const html = await response.text();
  const csrfToken = html.match(/name="csrf" value="([^"]+)"/)?.[1];
  assert.ok(csrfToken);
  return csrfToken;
}

async function studioSessionCookie() {
  const csrfToken = await loginPage();
  const response = await worker.fetch(new Request("https://blog.example/api/studio/login", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrf: csrfToken, token: studioToken }),
  }), env);
  assert.equal(response.status, 303);
  return (response.headers.get("set-cookie") ?? "").split(";")[0];
}

test("studio login accepts its signed form token even when Fetch Metadata is misclassified", async () => {
  const csrfToken = await loginPage();
  const body = new URLSearchParams({ csrf: csrfToken, token: studioToken });
  const request = new Request("https://blog.example/api/studio/login", {
    method: "POST",
    headers: {
      origin: "null",
      "sec-fetch-site": "cross-site",
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const response = await worker.fetch(request, env);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/studio");
  assert.match(response.headers.get("set-cookie") ?? "", /^omniblog_studio=/);
});

test("studio login rejects a cross-site request without a valid signed form token", async () => {
  const body = new URLSearchParams({ csrf: "attacker-value", token: studioToken });
  const request = new Request("https://blog.example/api/studio/login", {
    method: "POST",
    headers: {
      origin: "https://attacker.example",
      "sec-fetch-site": "cross-site",
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const response = await worker.fetch(request, env);
  assert.equal(response.status, 403);
  assert.doesNotMatch(await response.text(), /Cross-site requests are not allowed/);
});

test("studio login rejects an incorrect token", async () => {
  const csrfToken = await loginPage();
  const body = new URLSearchParams({ csrf: csrfToken, token: "incorrect-token" });
  const response = await worker.fetch(new Request("https://blog.example/api/studio/login", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  }), env);

  assert.equal(response.status, 401);
  assert.doesNotMatch(response.headers.get("set-cookie") ?? "", /^omniblog_studio=/);
});

test("published article deletion requires a studio session", async () => {
  const response = await worker.fetch(new Request("https://blog.example/api/studio/articles/delete", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://blog.example" },
    body: JSON.stringify({ slugs: ["story"] }),
  }), env);

  assert.equal(response.status, 401);
});

test("published article deletion rejects a cross-site request", async () => {
  const cookie = await studioSessionCookie();
  let githubCalled = false;
  const response = await worker.fetch(new Request("https://blog.example/api/studio/articles/delete", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie,
      origin: "https://attacker.example",
      "sec-fetch-site": "cross-site",
    },
    body: JSON.stringify({ slugs: ["story"] }),
  }), {
    ...env,
    GITHUB_CONTENT_TOKEN: "github-content-token",
    GITHUB_FETCH: async () => { githubCalled = true; return Response.json({}); },
  });

  assert.equal(response.status, 403);
  assert.equal(githubCalled, false);
});

test("published article deletion rejects unsafe slugs", async () => {
  const cookie = await studioSessionCookie();
  const response = await worker.fetch(new Request("https://blog.example/api/studio/articles/delete", {
    method: "POST",
    headers: { "content-type": "application/json", cookie, origin: "https://blog.example" },
    body: JSON.stringify({ slugs: ["../wrangler.jsonc"] }),
  }), env);

  assert.equal(response.status, 400);
});

test("published article deletion commits all locales and media atomically", async () => {
  const cookie = await studioSessionCookie();
  const githubCalls = [];
  const deletedMedia = [];
  const deletionEnv = {
    ...env,
    GITHUB_CONTENT_TOKEN: "github-content-token",
    GITHUB_REPOSITORY: "mibgb65-cloud/OmniBlog",
    GITHUB_BRANCH: "main",
    GITHUB_FETCH: async (input, init = {}) => {
      const url = new URL(input);
      githubCalls.push({ url, init });
      if (url.pathname.endsWith("/git/ref/heads/main")) return Response.json({ object: { sha: "head-sha" } });
      if (url.pathname.endsWith("/git/commits/head-sha")) return Response.json({ tree: { sha: "base-tree" } });
      if (url.pathname.endsWith("/git/trees/base-tree")) {
        return Response.json({
          truncated: false,
          tree: [
            { path: "content/articles/story.zh.md", type: "blob" },
            { path: "content/articles/story.en.md", type: "blob" },
            { path: "public/images/articles/story/cover.webp", type: "blob" },
            { path: "content/articles/keep.zh.md", type: "blob" },
          ],
        });
      }
      if (url.pathname.endsWith("/git/trees") && init.method === "POST") return Response.json({ sha: "next-tree" }, { status: 201 });
      if (url.pathname.endsWith("/git/commits") && init.method === "POST") return Response.json({ sha: "next-commit" }, { status: 201 });
      if (url.pathname.endsWith("/git/refs/heads/main") && init.method === "PATCH") return Response.json({ object: { sha: "next-commit" } });
      return Response.json({ message: "Unexpected GitHub request" }, { status: 500 });
    },
    DEPLOY_FETCH: async () => Response.json({ success: true, result: { build_uuid: "build-id" } }),
    CLOUDFLARE_DEPLOY_HOOK: "https://api.cloudflare.example/deploy-hook",
    MEDIA: {
      list: async ({ prefix }) => ({
        truncated: false,
        objects: [{ key: `${prefix}cover.webp` }, { key: `${prefix}detail.webp` }],
      }),
      delete: async (keys) => { deletedMedia.push(...keys); },
    },
  };
  const response = await worker.fetch(new Request("https://blog.example/api/studio/articles/delete", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie,
      origin: "https://blog.example",
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify({ slugs: ["story", "story"] }),
  }), deletionEnv);

  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.slugs, ["story"]);
  assert.equal(result.commitSha, "next-commit");
  assert.equal(result.deployment.triggered, true);
  assert.deepEqual(deletedMedia, ["articles/story/cover.webp", "articles/story/detail.webp"]);
  const treeCall = githubCalls.find(({ url, init }) => url.pathname.endsWith("/git/trees") && init.method === "POST");
  const deletedPaths = JSON.parse(treeCall.init.body).tree.map((entry) => entry.path);
  assert.deepEqual(deletedPaths, [
    "content/articles/story.en.md",
    "content/articles/story.zh.md",
    "public/images/articles/story/cover.webp",
  ]);
  assert.ok(JSON.parse(treeCall.init.body).tree.every((entry) => entry.sha === null));
});

test("published article deletion reports missing GitHub configuration", async () => {
  const cookie = await studioSessionCookie();
  const response = await worker.fetch(new Request("https://blog.example/api/studio/articles/delete", {
    method: "POST",
    headers: { "content-type": "application/json", cookie, origin: "https://blog.example" },
    body: JSON.stringify({ slugs: ["story"] }),
  }), env);

  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "github_not_configured");
});

test("newsletter writes through the migrated subscribers table without creating schema", async () => {
  const statements = [];
  const values = [];
  const newsletterEnv = {
    DB: {
      prepare(sql) {
        statements.push(sql);
        return {
          bind(...boundValues) {
            values.push(...boundValues);
            return { run: async () => ({ success: true }) };
          },
        };
      },
    },
  };
  const response = await worker.fetch(new Request("https://blog.example/api/newsletter", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: " Reader@Example.com ", locale: "en" }),
  }), newsletterEnv);

  assert.equal(response.status, 201);
  assert.equal(statements.length, 1);
  assert.doesNotMatch(statements[0], /CREATE TABLE/i);
  assert.equal(values[0], "reader@example.com");
  assert.equal(values[1], "en");
});

test("newsletter reports unavailable storage instead of throwing", async () => {
  const response = await worker.fetch(new Request("https://blog.example/api/newsletter", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "reader@example.com", locale: "zh" }),
  }), {});

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});

test("newsletter returns retry guidance when its rate limit is exceeded", async () => {
  const response = await worker.fetch(new Request("https://blog.example/api/newsletter", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "reader@example.com", locale: "zh" }),
  }), {
    NEWSLETTER_RATE_LIMITER: { limit: async () => ({ success: false }) },
  });

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
});

test("media upload checks the actual body size when content-length is absent", async () => {
  let uploaded = false;
  const mediaEnv = {
    ADMIN_TOKEN: "media-admin-token",
    MEDIA: {
      put: async () => {
        uploaded = true;
        return { httpEtag: '"etag"' };
      },
    },
  };
  const response = await worker.fetch(new Request("https://blog.example/api/media/articles/story/detail.webp", {
    method: "PUT",
    headers: {
      authorization: "Bearer media-admin-token",
      "content-type": "image/webp",
    },
    body: new Uint8Array(15 * 1024 * 1024 + 1),
  }), mediaEnv);

  assert.equal(response.status, 413);
  assert.equal(uploaded, false);
});

test("media upload stores mutable paths with revalidation caching", async () => {
  let storedBody;
  let storedOptions;
  const mediaEnv = {
    ADMIN_TOKEN: "media-admin-token",
    MEDIA: {
      put: async (_key, body, options) => {
        storedBody = body;
        storedOptions = options;
        return { httpEtag: '"etag"' };
      },
    },
  };
  const response = await worker.fetch(new Request("https://blog.example/api/media/articles/story/detail.webp", {
    method: "PUT",
    headers: {
      authorization: "Bearer media-admin-token",
      "content-type": "image/webp",
    },
    body: new Uint8Array([1, 2, 3]),
  }), mediaEnv);

  assert.equal(response.status, 201);
  assert.ok(storedBody instanceof ArrayBuffer);
  assert.equal(storedBody.byteLength, 3);
  assert.equal(storedOptions.httpMetadata.cacheControl, "public, max-age=0, must-revalidate");
});

test("media HEAD returns metadata without downloading the object", async () => {
  let headCalls = 0;
  const mediaEnv = {
    MEDIA: {
      head: async () => {
        headCalls += 1;
        return {
          size: 3,
          httpEtag: '"etag"',
          writeHttpMetadata(headers) {
            headers.set("content-type", "image/webp");
          },
        };
      },
    },
  };
  const response = await worker.fetch(
    new Request("https://blog.example/media/articles/story/detail.webp", { method: "HEAD" }),
    mediaEnv,
  );

  assert.equal(response.status, 200);
  assert.equal(headCalls, 1);
  assert.equal(response.headers.get("content-length"), "3");
  assert.equal(response.headers.get("cache-control"), "public, max-age=0, must-revalidate");
});
