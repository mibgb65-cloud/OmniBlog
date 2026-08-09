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
