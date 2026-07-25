import { Hono, type Context, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { PostInput, PostStatus, User } from "../shared/types";
import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  sessionExpiry,
  slugify,
  verifyPassword,
} from "./security";

type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
};

type Variables = {
  user: User;
};

type AppEnv = {
  Bindings: Bindings;
  Variables: Variables;
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  created_at: string;
};

type PostRow = {
  id: string;
  author_id: string;
  author_name: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  status: PostStatus;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

const SESSION_COOKIE = "monolog_session";
const app = new Hono<AppEnv>();

const toUser = (row: UserRow): User => ({
  id: row.id,
  name: row.name,
  email: row.email,
  createdAt: row.created_at,
});

const toPost = (row: PostRow) => ({
  id: row.id,
  authorId: row.author_id,
  authorName: row.author_name,
  title: row.title,
  slug: row.slug,
  excerpt: row.excerpt,
  content: row.content,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  publishedAt: row.published_at,
});

function jsonError(c: Context<AppEnv>, message: string) {
  return c.json({ error: message }, 400);
}

async function readJson(c: Context<AppEnv>) {
  try {
    return await c.req.json<Record<string, unknown>>();
  } catch {
    return null;
  }
}

function validateCredentials(
  body: Record<string, unknown> | null,
  includeName: boolean,
): { name: string; email: string; password: string } | { error: string } {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (includeName && (name.length < 2 || name.length > 32)) {
    return { error: "昵称需为 2–32 个字符。" };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { error: "请输入有效的邮箱地址。" };
  }
  if (password.length < 8 || password.length > 128) {
    return { error: "密码需为 8–128 个字符。" };
  }

  return { name, email, password };
}

function validatePost(body: Record<string, unknown> | null): PostInput | { error: string } {
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  const status = body?.status;

  if (title.length < 2 || title.length > 100) {
    return { error: "标题需为 2–100 个字符。" };
  }
  if (content.length < 10 || content.length > 50_000) {
    return { error: "正文需为 10–50,000 个字符。" };
  }
  if (status !== "draft" && status !== "published") {
    return { error: "文章状态无效。" };
  }

  return { title, content, status };
}

function makeExcerpt(content: string): string {
  const clean = content.replace(/\s+/g, " ").trim();
  return clean.length > 140 ? `${clean.slice(0, 140)}…` : clean;
}

async function currentUser(c: Context<AppEnv>) {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;

  const sessionId = await hashSessionToken(token);
  const row = await c.env.DB.prepare(
    `SELECT users.id, users.name, users.email, users.created_at
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.id = ? AND sessions.expires_at > ?`,
  )
    .bind(sessionId, Date.now())
    .first<UserRow>();

  return row ? toUser(row) : null;
}

const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "请先登录。" }, 401);
  c.set("user", user);
  await next();
};

app.get("/api/health", (c) => c.json({ ok: true }));

app.post("/api/auth/register", async (c) => {
  const input = validateCredentials(await readJson(c), true);
  if ("error" in input) return jsonError(c, input.error);

  const exists = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(input.email)
    .first();
  if (exists) return c.json({ error: "该邮箱已注册。" }, 409);

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(input.password);
  await c.env.DB.prepare(
    "INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)",
  )
    .bind(id, input.name, input.email, passwordHash)
    .run();

  const token = createSessionToken();
  await c.env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await hashSessionToken(token), id, sessionExpiry())
    .run();
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: new URL(c.req.url).protocol === "https:",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });

  const user = await c.env.DB.prepare(
    "SELECT id, name, email, created_at FROM users WHERE id = ?",
  )
    .bind(id)
    .first<UserRow>();
  return c.json({ data: toUser(user!) }, 201);
});

app.post("/api/auth/login", async (c) => {
  const input = validateCredentials(await readJson(c), false);
  if ("error" in input) return jsonError(c, input.error);

  const row = await c.env.DB.prepare(
    "SELECT id, name, email, password_hash, created_at FROM users WHERE email = ?",
  )
    .bind(input.email)
    .first<UserRow & { password_hash: string }>();
  if (!row || !(await verifyPassword(input.password, row.password_hash))) {
    return c.json({ error: "邮箱或密码不正确。" }, 401);
  }

  const token = createSessionToken();
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(Date.now()),
    c.env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
      .bind(await hashSessionToken(token), row.id, sessionExpiry()),
  ]);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: new URL(c.req.url).protocol === "https:",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return c.json({ data: toUser(row) });
});

app.post("/api/auth/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?")
      .bind(await hashSessionToken(token))
      .run();
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ data: true });
});

app.get("/api/auth/me", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "未登录。" }, 401);
  return c.json({ data: user });
});

app.get("/api/posts", async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT posts.*, users.name AS author_name
     FROM posts
     JOIN users ON users.id = posts.author_id
     WHERE posts.status = 'published'
     ORDER BY posts.published_at DESC
     LIMIT 50`,
  ).all<PostRow>();
  return c.json({ data: result.results.map(toPost) });
});

app.get("/api/posts/:slug", async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT posts.*, users.name AS author_name
     FROM posts
     JOIN users ON users.id = posts.author_id
     WHERE posts.slug = ? AND posts.status = 'published'`,
  )
    .bind(c.req.param("slug"))
    .first<PostRow>();
  if (!row) return c.json({ error: "文章不存在或尚未发布。" }, 404);
  return c.json({ data: toPost(row) });
});

app.use("/api/me/*", requireUser);

app.get("/api/me/posts", async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT posts.*, users.name AS author_name
     FROM posts
     JOIN users ON users.id = posts.author_id
     WHERE posts.author_id = ?
     ORDER BY posts.updated_at DESC`,
  )
    .bind(c.get("user").id)
    .all<PostRow>();
  return c.json({ data: result.results.map(toPost) });
});

app.get("/api/me/posts/:id", async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT posts.*, users.name AS author_name
     FROM posts
     JOIN users ON users.id = posts.author_id
     WHERE posts.id = ? AND posts.author_id = ?`,
  )
    .bind(c.req.param("id"), c.get("user").id)
    .first<PostRow>();
  if (!row) return c.json({ error: "没有找到这篇文章。" }, 404);
  return c.json({ data: toPost(row) });
});

app.post("/api/me/posts", async (c) => {
  const input = validatePost(await readJson(c));
  if ("error" in input) return jsonError(c, input.error);

  let slug = slugify(input.title);
  const duplicate = await c.env.DB.prepare("SELECT id FROM posts WHERE slug = ?")
    .bind(slug)
    .first();
  if (duplicate) slug = `${slug}-${crypto.randomUUID().slice(0, 6)}`;

  const id = crypto.randomUUID();
  const publishedAt = input.status === "published" ? new Date().toISOString() : null;
  await c.env.DB.prepare(
    `INSERT INTO posts (id, author_id, title, slug, excerpt, content, status, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      c.get("user").id,
      input.title,
      slug,
      makeExcerpt(input.content),
      input.content,
      input.status,
      publishedAt,
    )
    .run();

  const row = await c.env.DB.prepare(
    `SELECT posts.*, users.name AS author_name
     FROM posts JOIN users ON users.id = posts.author_id
     WHERE posts.id = ?`,
  )
    .bind(id)
    .first<PostRow>();
  return c.json({ data: toPost(row!) }, 201);
});

app.put("/api/me/posts/:id", async (c) => {
  const input = validatePost(await readJson(c));
  if ("error" in input) return jsonError(c, input.error);

  const existing = await c.env.DB.prepare(
    "SELECT id, status, published_at FROM posts WHERE id = ? AND author_id = ?",
  )
    .bind(c.req.param("id"), c.get("user").id)
    .first<{ id: string; status: PostStatus; published_at: string | null }>();
  if (!existing) return c.json({ error: "没有找到这篇文章。" }, 404);

  const publishedAt =
    input.status === "published" ? existing.published_at ?? new Date().toISOString() : null;
  await c.env.DB.prepare(
    `UPDATE posts
     SET title = ?, excerpt = ?, content = ?, status = ?, published_at = ?, updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(
      input.title,
      makeExcerpt(input.content),
      input.content,
      input.status,
      publishedAt,
      existing.id,
    )
    .run();

  const row = await c.env.DB.prepare(
    `SELECT posts.*, users.name AS author_name
     FROM posts JOIN users ON users.id = posts.author_id
     WHERE posts.id = ?`,
  )
    .bind(existing.id)
    .first<PostRow>();
  return c.json({ data: toPost(row!) });
});

app.delete("/api/me/posts/:id", async (c) => {
  const result = await c.env.DB.prepare("DELETE FROM posts WHERE id = ? AND author_id = ?")
    .bind(c.req.param("id"), c.get("user").id)
    .run();
  if (!result.meta.changes) return c.json({ error: "没有找到这篇文章。" }, 404);
  return c.json({ data: true });
});

app.notFound((c) => c.json({ error: "接口不存在。" }, 404));
app.onError((error, c) => {
  console.error(error);
  return c.json({ error: "服务暂时不可用，请稍后再试。" }, 500);
});

export default app;
