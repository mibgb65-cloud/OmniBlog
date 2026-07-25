import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import initialMigration from "../migrations/0001_initial.sql?raw";
import hardeningMigration from "../migrations/0002_owner_and_auth_limits.sql?raw";
import categoryMigration from "../migrations/0004_add_post_categories.sql?raw";
import categoriesMigration from "../migrations/0005_create_categories.sql?raw";
import type { Category, Post } from "../shared/types";
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
    .split(/;\s*(?=(?:PRAGMA|CREATE|ALTER|INSERT|DELETE)\b|$)/i)
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
  await applyMigration(categoryMigration);
  await applyMigration(categoriesMigration);
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
        category: "随笔",
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
        category: "技术",
        content: "This draft should not be public.",
        status: "draft",
      }),
    });
    expect(created.status).toBe(201);
    const draft = (await created.json() as { data: Post }).data;
    expect(draft.category).toBe("技术");

    const legacyCreate = await request("/api/me/posts", {
      method: "POST",
      headers: { ...JSON_HEADERS, Cookie: ownerCookie },
      body: JSON.stringify({
        title: "Legacy client post",
        content: "## Legacy heading\n\nOlder clients can still create a categorized post.",
        status: "draft",
      }),
    });
    const legacyPost = ((await legacyCreate.json()) as { data: Post }).data;
    expect(legacyPost.category).toBe("随笔");
    expect(legacyPost.excerpt).toBe("Legacy heading Older clients can still create a categorized post.");

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
        category: "随笔",
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
        category: "生活",
        content: "The owner can publish the original private draft.",
        status: "published",
      }),
    });
    expect(published.status).toBe(200);
    const publicPost = (await published.json() as { data: Post }).data;
    expect(publicPost.category).toBe("生活");

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

describe("category management", () => {
  it("provides presets and keeps category changes consistent with posts", async () => {
    await database.prepare("DROP TABLE categories").run();
    const publicCategories = await request("/api/categories");
    expect(publicCategories.status).toBe(200);
    expect(
      ((await publicCategories.json()) as { data: Category[] }).data.map(
        (category) => category.name,
      ),
    ).toEqual(["随笔", "技术", "生活", "读书", "项目"]);

    const unauthorized = await request("/api/me/categories");
    expect(unauthorized.status).toBe(401);

    await seedUser("owner", "Owner", "owner@example.com", "owner password");
    const ownerCookie = await sessionCookie("owner");
    const created = await request("/api/me/categories", {
      method: "POST",
      headers: { ...JSON_HEADERS, Cookie: ownerCookie },
      body: JSON.stringify({ name: "观察" }),
    });
    expect(created.status).toBe(201);
    const category = ((await created.json()) as { data: Category }).data;
    expect(category).toMatchObject({ name: "观察", postCount: 0 });

    const duplicate = await request("/api/me/categories", {
      method: "POST",
      headers: { ...JSON_HEADERS, Cookie: ownerCookie },
      body: JSON.stringify({ name: "观察" }),
    });
    expect(duplicate.status).toBe(409);

    const unknownCategory = await request("/api/me/posts", {
      method: "POST",
      headers: { ...JSON_HEADERS, Cookie: ownerCookie },
      body: JSON.stringify({
        title: "Unknown category",
        category: "不存在",
        content: "Unknown categories must be rejected.",
        status: "draft",
      }),
    });
    expect(unknownCategory.status).toBe(400);

    const createdPost = await request("/api/me/posts", {
      method: "POST",
      headers: { ...JSON_HEADERS, Cookie: ownerCookie },
      body: JSON.stringify({
        title: "Observed notes",
        category: "观察",
        content: "A post connected to a managed category.",
        status: "draft",
      }),
    });
    const post = ((await createdPost.json()) as { data: Post }).data;

    const renamed = await request(`/api/me/categories/${category.id}`, {
      method: "PUT",
      headers: { ...JSON_HEADERS, Cookie: ownerCookie },
      body: JSON.stringify({ name: "见闻" }),
    });
    expect(renamed.status).toBe(200);
    expect(((await renamed.json()) as { data: Category }).data).toMatchObject({
      name: "见闻",
      postCount: 1,
    });

    const updatedPost = await request(`/api/me/posts/${post.id}`, {
      headers: { Cookie: ownerCookie },
    });
    expect(((await updatedPost.json()) as { data: Post }).data.category).toBe("见闻");

    const inUse = await request(`/api/me/categories/${category.id}`, {
      method: "DELETE",
      headers: { Cookie: ownerCookie },
    });
    expect(inUse.status).toBe(409);

    await request(`/api/me/posts/${post.id}`, {
      method: "DELETE",
      headers: { Cookie: ownerCookie },
    });
    const removed = await request(`/api/me/categories/${category.id}`, {
      method: "DELETE",
      headers: { Cookie: ownerCookie },
    });
    expect(removed.status).toBe(200);
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
