import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import initialMigration from "../migrations/0001_initial.sql?raw";
import hardeningMigration from "../migrations/0002_owner_and_auth_limits.sql?raw";
import type { Post } from "../shared/types";
import app, { type Bindings } from "./index";
import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  sessionExpiry,
} from "./security";

const SETUP_TOKEN = "test-owner-setup-secret";
const JSON_HEADERS = { "Content-Type": "application/json" };

let miniflare: Miniflare;
let database: D1Database;
let bindings: Bindings;

async function applyMigration(sql: string) {
  const statements = sql
    .trim()
    .split(/;\s*(?=(?:PRAGMA|CREATE)\b|$)/i)
    .map((statement) => statement.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await database.prepare(statement).run();
  }
}

beforeEach(async () => {
  miniflare = new Miniflare({
    compatibilityDate: "2026-07-24",
    d1Databases: { DB: "monolog-test" },
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } };",
  });
  database = (await miniflare.getD1Database("DB")) as unknown as D1Database;
  await applyMigration(initialMigration);
  bindings = {
    DB: database,
    ASSETS: {
      fetch: () => Promise.resolve(new Response("Not found", { status: 404 })),
    } as unknown as Fetcher,
    OWNER_SETUP_TOKEN: SETUP_TOKEN,
  };
});

afterEach(async () => {
  await miniflare.dispose();
});

function request(path: string, init?: RequestInit, env: Bindings = bindings) {
  return app.request(`http://monolog.test${path}`, init, env);
}

async function seedUser(id: string, name: string, email: string, password: string) {
  await database.prepare(
    "INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)",
  )
    .bind(id, name, email, await hashPassword(password))
    .run();
}

async function sessionCookie(userId: string) {
  const token = createSessionToken();
  await database.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await hashSessionToken(token), userId, sessionExpiry())
    .run();
  return `monolog_session=${token}`;
}

describe("owner registration", () => {
  it("requires the setup token and permanently closes after the first account", async () => {
    await applyMigration(hardeningMigration);

    const statusBefore = await request("/api/auth/registration");
    expect(await statusBefore.json()).toEqual({
      data: { open: true, configured: true },
    });

    const wrongToken = await request("/api/auth/register", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        name: "Owner",
        email: "owner@example.com",
        password: "correct horse battery staple",
        setupToken: "wrong-token",
      }),
    });
    expect(wrongToken.status).toBe(403);

    const registered = await request("/api/auth/register", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        name: "Owner",
        email: "owner@example.com",
        password: "correct horse battery staple",
        setupToken: SETUP_TOKEN,
      }),
    });
    expect(registered.status).toBe(201);
    expect(registered.headers.get("set-cookie")).toContain("monolog_session=");
    expect(registered.headers.get("set-cookie")).toContain("HttpOnly");

    const statusAfter = await request("/api/auth/registration");
    expect(await statusAfter.json()).toEqual({
      data: { open: false, configured: true },
    });

    const secondRegistration = await request("/api/auth/register", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        name: "Another writer",
        email: "writer@example.com",
        password: "another secure password",
        setupToken: SETUP_TOKEN,
      }),
    });
    expect(secondRegistration.status).toBe(403);

    await expect(
      database.prepare(
        "INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)",
      )
        .bind("second-user", "Another writer", "writer@example.com", "unused")
        .run(),
    ).rejects.toThrow();
  });

  it("refuses initialization when the setup token is not configured", async () => {
    await applyMigration(hardeningMigration);
    const unconfigured = { ...bindings, OWNER_SETUP_TOKEN: undefined };

    const status = await request("/api/auth/registration", undefined, unconfigured);
    expect(await status.json()).toEqual({
      data: { open: true, configured: false },
    });

    const response = await request(
      "/api/auth/register",
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          name: "Owner",
          email: "owner@example.com",
          password: "correct horse battery staple",
          setupToken: SETUP_TOKEN,
        }),
      },
      unconfigured,
    );
    expect(response.status).toBe(503);
  });
});

describe("post authorization and lifecycle", () => {
  it("keeps drafts private and restricts every mutation to the author", async () => {
    await seedUser("owner", "Owner", "owner@example.com", "owner password");
    await seedUser("legacy-user", "Legacy", "legacy@example.com", "legacy password");
    await applyMigration(hardeningMigration);
    const ownerCookie = await sessionCookie("owner");
    const legacyCookie = await sessionCookie("legacy-user");

    const unauthenticated = await request("/api/me/posts", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        title: "Private notes",
        content: "This draft should not be public.",
        status: "draft",
      }),
    });
    expect(unauthenticated.status).toBe(401);

    const created = await request("/api/me/posts", {
      method: "POST",
      headers: { ...JSON_HEADERS, Cookie: ownerCookie },
      body: JSON.stringify({
        title: "Private notes",
        content: "This draft should not be public.",
        status: "draft",
      }),
    });
    expect(created.status).toBe(201);
    const draft = (await created.json() as { data: Post }).data;

    const hiddenDraft = await request(`/api/posts/${draft.slug}`);
    expect(hiddenDraft.status).toBe(404);

    const otherRead = await request(`/api/me/posts/${draft.id}`, {
      headers: { Cookie: legacyCookie },
    });
    expect(otherRead.status).toBe(404);

    const otherUpdate = await request(`/api/me/posts/${draft.id}`, {
      method: "PUT",
      headers: { ...JSON_HEADERS, Cookie: legacyCookie },
      body: JSON.stringify({
        title: "Stolen post",
        content: "A different author must not update this post.",
        status: "published",
      }),
    });
    expect(otherUpdate.status).toBe(404);

    const published = await request(`/api/me/posts/${draft.id}`, {
      method: "PUT",
      headers: { ...JSON_HEADERS, Cookie: ownerCookie },
      body: JSON.stringify({
        title: "Published notes",
        content: "The owner can publish the original private draft.",
        status: "published",
      }),
    });
    expect(published.status).toBe(200);
    const publicPost = (await published.json() as { data: Post }).data;

    const visiblePost = await request(`/api/posts/${publicPost.slug}`);
    expect(visiblePost.status).toBe(200);

    const otherDelete = await request(`/api/me/posts/${draft.id}`, {
      method: "DELETE",
      headers: { Cookie: legacyCookie },
    });
    expect(otherDelete.status).toBe(404);

    const ownerDelete = await request(`/api/me/posts/${draft.id}`, {
      method: "DELETE",
      headers: { Cookie: ownerCookie },
    });
    expect(ownerDelete.status).toBe(200);
    expect((await request(`/api/posts/${publicPost.slug}`)).status).toBe(404);
  });
});

describe("login rate limiting", () => {
  it("blocks repeated attempts by source address without blocking another address", async () => {
    await seedUser("owner", "Owner", "owner@example.com", "correct password");
    await applyMigration(hardeningMigration);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await request("/api/auth/login", {
        method: "POST",
        headers: { ...JSON_HEADERS, "CF-Connecting-IP": "203.0.113.10" },
        body: JSON.stringify({
          email: "owner@example.com",
          password: "wrong password",
        }),
      });
      expect(response.status).toBe(401);
    }

    const blocked = await request("/api/auth/login", {
      method: "POST",
      headers: { ...JSON_HEADERS, "CF-Connecting-IP": "203.0.113.10" },
      body: JSON.stringify({
        email: "owner@example.com",
        password: "correct password",
      }),
    });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);

    const allowedElsewhere = await request("/api/auth/login", {
      method: "POST",
      headers: { ...JSON_HEADERS, "CF-Connecting-IP": "203.0.113.11" },
      body: JSON.stringify({
        email: "owner@example.com",
        password: "correct password",
      }),
    });
    expect(allowedElsewhere.status).toBe(200);
  });
});
