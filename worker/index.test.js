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
