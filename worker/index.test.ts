import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import initialMigration from "../migrations/0001_initial.sql?raw";
import hardeningMigration from "../migrations/0002_owner_and_auth_limits.sql?raw";
import categoryMigration from "../migrations/0004_add_post_categories.sql?raw";
import categoriesMigration from "../migrations/0005_create_categories.sql?raw";
import visibilityMigration from "../migrations/0006_add_post_visibility.sql?raw";
import likesMigration from "../migrations/0007_add_post_likes.sql?raw";
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
    r2Buckets: { MEDIA: "monolog-media-test" },
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } };",
  });
  database = (await miniflare.getD1Database("DB")) as unknown as D1Database;
  await applyMigration(initialMigration);
  await applyMigration(categoryMigration);
  await applyMigration(categoriesMigration);
  await applyMigration(visibilityMigration);
  await applyMigration(likesMigration);
  bindings = {
    DB: database,
    MEDIA: await miniflare.getR2Bucket("MEDIA") as unknown as R2Bucket,
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

  it("enforces public, unlisted, and private visibility", async () => {
    await seedUser("owner", "Owner", "owner@example.com", "owner password");
    await seedUser("visitor", "Visitor", "visitor@example.com", "visitor password");
    const ownerCookie = await sessionCookie("owner");
    const visitorCookie = await sessionCookie("visitor");

    const createPost = async (title: string, visibility: Post["visibility"]) => {
      const response = await request("/api/me/posts", {
        method: "POST",
        headers: { ...JSON_HEADERS, Cookie: ownerCookie },
        body: JSON.stringify({
          title,
          category: "随笔",
          content: `${title} has enough content for the post validation rule.`,
          status: "published",
          visibility,
        }),
      });
      expect(response.status).toBe(201);
      return ((await response.json()) as { data: Post }).data;
    };

    const publicPost = await createPost("Public article", "public");
    const unlistedPost = await createPost("Unlisted article", "unlisted");
    const privatePost = await createPost("Private article", "private");

    const list = (await (await request("/api/posts")).json()) as { data: Post[] };
    expect(list.data.map((post) => post.id)).toEqual([publicPost.id]);

    const categories = (await (await request("/api/categories")).json()) as {
      data: Category[];
    };
    expect(categories.data.find((category) => category.name === "随笔")?.postCount).toBe(1);

    expect((await request(`/api/posts/${unlistedPost.slug}`)).status).toBe(200);
    expect((await request(`/api/posts/${privatePost.slug}`)).status).toBe(404);
    expect((await request(`/api/posts/${privatePost.slug}`, {
      headers: { Cookie: visitorCookie },
    })).status).toBe(404);
    expect((await request(`/api/posts/${privatePost.slug}`, {
      headers: { Cookie: ownerCookie },
    })).status).toBe(200);

    const forbiddenUpdate = await request(`/api/me/posts/${privatePost.id}/visibility`, {
      method: "PATCH",
      headers: { ...JSON_HEADERS, Cookie: visitorCookie },
      body: JSON.stringify({ visibility: "public" }),
    });
    expect(forbiddenUpdate.status).toBe(404);

    const invalidUpdate = await request(`/api/me/posts/${privatePost.id}/visibility`, {
      method: "PATCH",
      headers: { ...JSON_HEADERS, Cookie: ownerCookie },
      body: JSON.stringify({ visibility: "friends" }),
    });
    expect(invalidUpdate.status).toBe(400);

    const updated = await request(`/api/me/posts/${privatePost.id}/visibility`, {
      method: "PATCH",
      headers: { ...JSON_HEADERS, Cookie: ownerCookie },
      body: JSON.stringify({ visibility: "unlisted" }),
    });
    expect(updated.status).toBe(200);
    expect(((await updated.json()) as { data: Post }).data.visibility).toBe("unlisted");
    expect((await request(`/api/posts/${privatePost.slug}`)).status).toBe(200);
  });
});

describe("post likes", () => {
  it("persists one anonymous like per visitor and supports toggling it", async () => {
    await seedUser("owner", "Owner", "owner@example.com", "owner password");
    const ownerCookie = await sessionCookie("owner");
    const created = await request("/api/me/posts", {
      method: "POST",
      headers: { ...JSON_HEADERS, Cookie: ownerCookie },
      body: JSON.stringify({
        title: "Liked article",
        category: "随笔",
        content: "## 第一节\n\nThis published post can receive a visitor like.",
        status: "published",
        visibility: "public",
      }),
    });
    const post = ((await created.json()) as { data: Post }).data;
    expect(post.likeCount).toBe(0);

    const firstLike = await request(`/api/posts/${post.slug}/likes`, { method: "POST" });
    expect(firstLike.status).toBe(200);
    expect(await firstLike.json()).toEqual({ data: { likeCount: 1, liked: true } });
    const visitorCookie = firstLike.headers.get("set-cookie")?.split(";", 1)[0];
    expect(visitorCookie).toContain("omniblog_visitor=");

    const duplicateLike = await request(`/api/posts/${post.slug}/likes`, {
      method: "POST",
      headers: { Cookie: visitorCookie! },
    });
    expect(await duplicateLike.json()).toEqual({ data: { likeCount: 1, liked: true } });

    const detail = await request(`/api/posts/${post.slug}`, {
      headers: { Cookie: visitorCookie! },
    });
    expect(((await detail.json()) as { data: Post }).data).toMatchObject({
      likeCount: 1,
      likedByVisitor: true,
    });

    const removed = await request(`/api/posts/${post.slug}/likes`, {
      method: "DELETE",
      headers: { Cookie: visitorCookie! },
    });
    expect(await removed.json()).toEqual({ data: { likeCount: 0, liked: false } });
  });

  it("does not expose likes for private or missing posts", async () => {
    await seedUser("owner", "Owner", "owner@example.com", "owner password");
    const ownerCookie = await sessionCookie("owner");
    const created = await request("/api/me/posts", {
      method: "POST",
      headers: { ...JSON_HEADERS, Cookie: ownerCookie },
      body: JSON.stringify({
        title: "Private liked article",
        category: "随笔",
        content: "Private posts must not expose a public like endpoint.",
        status: "published",
        visibility: "private",
      }),
    });
    const post = ((await created.json()) as { data: Post }).data;

    expect((await request(`/api/posts/${post.slug}/likes`, { method: "POST" })).status)
      .toBe(404);
    expect((await request("/api/posts/missing/likes", { method: "DELETE" })).status)
      .toBe(404);
  });
});

describe("media uploads", () => {
  it("stores a validated image in R2 and serves it with safe cache headers", async () => {
    await seedUser("owner", "Owner", "owner@example.com", "owner password");
    const ownerCookie = await sessionCookie("owner");
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    ]);
    const formData = new FormData();
    formData.set("file", new File([png], "example.png", { type: "image/png" }));

    const uploaded = await request("/api/me/media", {
      method: "POST",
      headers: { Cookie: ownerCookie },
      body: formData,
    });
    expect(uploaded.status).toBe(201);
    const payload = (await uploaded.json()) as {
      data: { contentType: string; key: string; size: number; url: string };
    };
    expect(payload.data).toMatchObject({
      contentType: "image/png",
      size: png.byteLength,
    });
    expect(payload.data.key).toMatch(/^images\/\d{4}\/\d{2}\/[\w-]+\.png$/);

    const image = await request(payload.data.url);
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/png");
    expect(image.headers.get("content-length")).toBe(String(png.byteLength));
    expect(image.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(image.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(png);
  });

  it("requires authentication and rejects files whose bytes are not a supported image", async () => {
    const unauthenticatedData = new FormData();
    unauthenticatedData.set(
      "file",
      new File([new Uint8Array([0xff, 0xd8, 0xff])], "photo.jpg", { type: "image/jpeg" }),
    );
    expect((await request("/api/me/media", {
      method: "POST",
      body: unauthenticatedData,
    })).status).toBe(401);

    await seedUser("owner", "Owner", "owner@example.com", "owner password");
    const ownerCookie = await sessionCookie("owner");
    const invalidData = new FormData();
    invalidData.set(
      "file",
      new File(["<svg><script /></svg>"], "unsafe.svg", { type: "image/svg+xml" }),
    );
    const invalid = await request("/api/me/media", {
      method: "POST",
      headers: { Cookie: ownerCookie },
      body: invalidData,
    });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({
      error: "仅支持 JPEG、PNG、WebP、GIF 或 AVIF 图片。",
    });
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
