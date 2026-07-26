import { Hono, type Context, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type {
  Category,
  Post,
  PostInput,
  PostStatus,
  PostVisibility,
  User,
} from "../shared/types";
import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  sessionExpiry,
  slugify,
  verifySecret,
  verifyPassword,
} from "./security";

export type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  OWNER_SETUP_TOKEN?: string;
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
  category: string;
  excerpt: string;
  content: string;
  like_count: number;
  status: PostStatus;
  visibility: PostVisibility;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

type CategoryRow = {
  id: string;
  name: string;
  sort_order: number;
  post_count: number;
  created_at: string;
};

const SESSION_COOKIE = "monolog_session";
const VISITOR_COOKIE = "omniblog_visitor";
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const REGISTER_LIMIT = 5;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;
const app = new Hono<AppEnv>();
const categoryInitialization = new WeakMap<D1Database, Promise<void>>();

const toUser = (row: UserRow): User => ({
  id: row.id,
  name: row.name,
  email: row.email,
  createdAt: row.created_at,
});

const toPost = (row: PostRow, likedByVisitor?: boolean): Post => ({
  id: row.id,
  authorId: row.author_id,
  authorName: row.author_name,
  title: row.title,
  slug: row.slug,
  category: row.category,
  excerpt: row.excerpt,
  content: row.content,
  likeCount: Number(row.like_count ?? 0),
  ...(likedByVisitor === undefined ? {} : { likedByVisitor }),
  status: row.status,
  visibility: row.visibility,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  publishedAt: row.published_at,
});

const toCategory = (row: CategoryRow): Category => ({
  id: row.id,
  name: row.name,
  sortOrder: row.sort_order,
  postCount: Number(row.post_count),
  createdAt: row.created_at,
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
  const category = typeof body?.category === "string" ? body.category.trim() : "随笔";
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  const status = body?.status;
  const visibility = body?.visibility ?? "public";

  if (title.length < 2 || title.length > 100) {
    return { error: "标题需为 2–100 个字符。" };
  }
  if (category.length < 1 || category.length > 24) {
    return { error: "分类需为 1–24 个字符。" };
  }
  if (content.length < 10 || content.length > 50_000) {
    return { error: "正文需为 10–50,000 个字符。" };
  }
  if (status !== "draft" && status !== "published") {
    return { error: "文章状态无效。" };
  }
  if (visibility !== "public" && visibility !== "unlisted" && visibility !== "private") {
    return { error: "文章可见性无效。" };
  }

  return { title, category, content, status, visibility };
}

function validateVisibility(
  body: Record<string, unknown> | null,
): { visibility: PostVisibility } | { error: string } {
  const visibility = body?.visibility;
  if (visibility !== "public" && visibility !== "unlisted" && visibility !== "private") {
    return { error: "文章可见性无效。" };
  }
  return { visibility };
}

function validateCategory(
  body: Record<string, unknown> | null,
): { name: string } | { error: string } {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (name.length < 1 || name.length > 24) {
    return { error: "分类名称需为 1–24 个字符。" };
  }
  return { name };
}

async function categoryExists(database: D1Database, name: string) {
  await ensureCategories(database);
  return Boolean(
    await database.prepare("SELECT id FROM categories WHERE name = ? COLLATE NOCASE")
      .bind(name)
      .first(),
  );
}

async function ensureCategories(database: D1Database) {
  const active = categoryInitialization.get(database);
  if (active) return active;

  const initialization = (async () => {
    await database.prepare(
      `CREATE TABLE IF NOT EXISTS categories (
         id TEXT PRIMARY KEY,
         name TEXT NOT NULL COLLATE NOCASE UNIQUE,
         sort_order INTEGER NOT NULL DEFAULT 0,
         created_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
    ).run();
    await database.prepare(
      `INSERT OR IGNORE INTO categories (id, name, sort_order) VALUES
         ('category-essay', '随笔', 10),
         ('category-tech', '技术', 20),
         ('category-life', '生活', 30),
         ('category-reading', '读书', 40),
         ('category-project', '项目', 50)`,
    ).run();
    await database.prepare(
      `INSERT OR IGNORE INTO categories (id, name, sort_order)
       SELECT 'category-' || lower(hex(randomblob(8))), category, 1000
       FROM posts
       WHERE trim(category) <> ''
       GROUP BY category`,
    ).run();
  })().catch((error) => {
    categoryInitialization.delete(database);
    throw error;
  });

  categoryInitialization.set(database, initialization);
  return initialization;
}

function makeExcerpt(content: string): string {
  const clean = content
    .replace(/^---[\s\S]*?\r?\n---\r?\n?/, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^(?:#{1,6}|>|[*+-]|\d+\.)\s+/gm, "")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > 140 ? `${clean.slice(0, 140)}…` : clean;
}

async function rateLimitKey(c: Context<AppEnv>, scope: string): Promise<string> {
  const address = c.req.header("CF-Connecting-IP") ?? "local";
  return hashSessionToken(`${scope}:${address}`);
}

async function consumeAuthAttempt(
  c: Context<AppEnv>,
  scope: string,
  limit: number,
  windowMs: number,
) {
  const key = await rateLimitKey(c, scope);
  const now = Date.now();
  const nextReset = now + windowMs;
  await c.env.DB.prepare("DELETE FROM auth_rate_limits WHERE reset_at <= ?")
    .bind(now)
    .run();
  const row = await c.env.DB.prepare(
    `INSERT INTO auth_rate_limits (key, attempts, reset_at)
     VALUES (?, 1, ?)
     ON CONFLICT(key) DO UPDATE SET
       attempts = CASE
         WHEN auth_rate_limits.reset_at <= ? THEN 1
         ELSE auth_rate_limits.attempts + 1
       END,
       reset_at = CASE
         WHEN auth_rate_limits.reset_at <= ? THEN ?
         ELSE auth_rate_limits.reset_at
       END
     RETURNING attempts, reset_at`,
  )
    .bind(key, nextReset, now, now, nextReset)
    .first<{ attempts: number; reset_at: number }>();

  const resetAt = row?.reset_at ?? nextReset;
  return {
    allowed: (row?.attempts ?? limit + 1) <= limit,
    retryAfter: Math.max(1, Math.ceil((resetAt - now) / 1000)),
  };
}

async function clearAuthAttempts(c: Context<AppEnv>, scope: string) {
  await c.env.DB.prepare("DELETE FROM auth_rate_limits WHERE key = ?")
    .bind(await rateLimitKey(c, scope))
    .run();
}

function rateLimitError(c: Context<AppEnv>, retryAfter: number) {
  c.header("Retry-After", String(retryAfter));
  return c.json({ error: "尝试次数过多，请稍后再试。" }, 429);
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

app.get("/api/auth/registration", async (c) => {
  const owner = await c.env.DB.prepare("SELECT id FROM users LIMIT 1").first();
  return c.json({
    data: {
      open: !owner,
      configured: Boolean(c.env.OWNER_SETUP_TOKEN),
    },
  });
});

app.post("/api/auth/register", async (c) => {
  const owner = await c.env.DB.prepare("SELECT id FROM users LIMIT 1").first();
  if (owner) return c.json({ error: "站点已完成初始化，请直接登录。" }, 403);
  if (!c.env.OWNER_SETUP_TOKEN) {
    return c.json({ error: "站长初始化密钥尚未配置。" }, 503);
  }

  const rateLimit = await consumeAuthAttempt(c, "register", REGISTER_LIMIT, REGISTER_WINDOW_MS);
  if (!rateLimit.allowed) return rateLimitError(c, rateLimit.retryAfter);

  const body = await readJson(c);
  const input = validateCredentials(body, true);
  if ("error" in input) return jsonError(c, input.error);
  const setupToken = typeof body?.setupToken === "string" ? body.setupToken : "";
  if (!(await verifySecret(setupToken, c.env.OWNER_SETUP_TOKEN))) {
    return c.json({ error: "初始化密钥不正确。" }, 403);
  }

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(input.password);
  try {
    await c.env.DB.prepare(
      "INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)",
    )
      .bind(id, input.name, input.email, passwordHash)
      .run();
  } catch (error) {
    const initialized = await c.env.DB.prepare("SELECT id FROM users LIMIT 1").first();
    if (initialized) return c.json({ error: "站点已完成初始化，请直接登录。" }, 403);
    throw error;
  }

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
  await clearAuthAttempts(c, "register");

  const user = await c.env.DB.prepare(
    "SELECT id, name, email, created_at FROM users WHERE id = ?",
  )
    .bind(id)
    .first<UserRow>();
  return c.json({ data: toUser(user!) }, 201);
});

app.post("/api/auth/login", async (c) => {
  const rateLimit = await consumeAuthAttempt(c, "login", LOGIN_LIMIT, LOGIN_WINDOW_MS);
  if (!rateLimit.allowed) return rateLimitError(c, rateLimit.retryAfter);

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
  await clearAuthAttempts(c, "login");
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

app.get("/api/categories", async (c) => {
  await ensureCategories(c.env.DB);
  const result = await c.env.DB.prepare(
    `SELECT categories.*, COUNT(posts.id) AS post_count
     FROM categories
     LEFT JOIN posts
       ON posts.category = categories.name
         AND posts.status = 'published'
         AND posts.visibility = 'public'
     GROUP BY categories.id
     ORDER BY categories.sort_order, categories.created_at`,
  ).all<CategoryRow>();
  return c.json({ data: result.results.map(toCategory) });
});

app.get("/api/posts", async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT posts.*, users.name AS author_name
     FROM posts
     JOIN users ON users.id = posts.author_id
     WHERE posts.status = 'published' AND posts.visibility = 'public'
     ORDER BY posts.published_at DESC
     LIMIT 50`,
  ).all<PostRow>();
  return c.json({ data: result.results.map((row) => toPost(row)) });
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
  if (row.visibility === "private") {
    const user = await currentUser(c);
    if (user?.id !== row.author_id) {
      return c.json({ error: "文章不存在或不可见。" }, 404);
    }
  }
  const visitorId = getCookie(c, VISITOR_COOKIE);
  const likedByVisitor = visitorId
    ? Boolean(
      await c.env.DB.prepare(
        "SELECT 1 FROM post_likes WHERE post_id = ? AND visitor_id = ?",
      )
        .bind(row.id, visitorId)
        .first(),
    )
    : false;
  return c.json({ data: toPost(row, likedByVisitor) });
});

app.post("/api/posts/:slug/likes", async (c) => {
  const post = await c.env.DB.prepare(
    `SELECT id, like_count
     FROM posts
     WHERE slug = ? AND status = 'published' AND visibility <> 'private'`,
  )
    .bind(c.req.param("slug"))
    .first<{ id: string; like_count: number }>();
  if (!post) return c.json({ error: "文章不存在或不可见。" }, 404);

  let visitorId = getCookie(c, VISITOR_COOKIE);
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    setCookie(c, VISITOR_COOKIE, visitorId, {
      httpOnly: true,
      sameSite: "Lax",
      secure: new URL(c.req.url).protocol === "https:",
      path: "/",
      maxAge: 365 * 24 * 60 * 60,
    });
  }

  const inserted = await c.env.DB.prepare(
    `INSERT OR IGNORE INTO post_likes (post_id, visitor_id)
     VALUES (?, ?)
     RETURNING post_id`,
  )
    .bind(post.id, visitorId)
    .first<{ post_id: string }>();
  let likeCount = Number(post.like_count);
  if (inserted) {
    const updated = await c.env.DB.prepare(
      "UPDATE posts SET like_count = like_count + 1 WHERE id = ? RETURNING like_count",
    )
      .bind(post.id)
      .first<{ like_count: number }>();
    likeCount = Number(updated?.like_count ?? likeCount + 1);
  }

  return c.json({ data: { likeCount, liked: true } });
});

app.delete("/api/posts/:slug/likes", async (c) => {
  const post = await c.env.DB.prepare(
    `SELECT id, like_count
     FROM posts
     WHERE slug = ? AND status = 'published' AND visibility <> 'private'`,
  )
    .bind(c.req.param("slug"))
    .first<{ id: string; like_count: number }>();
  if (!post) return c.json({ error: "文章不存在或不可见。" }, 404);

  const visitorId = getCookie(c, VISITOR_COOKIE);
  if (!visitorId) {
    return c.json({ data: { likeCount: Number(post.like_count), liked: false } });
  }

  const removed = await c.env.DB.prepare(
    `DELETE FROM post_likes
     WHERE post_id = ? AND visitor_id = ?
     RETURNING post_id`,
  )
    .bind(post.id, visitorId)
    .first<{ post_id: string }>();
  let likeCount = Number(post.like_count);
  if (removed) {
    const updated = await c.env.DB.prepare(
      `UPDATE posts
       SET like_count = CASE WHEN like_count > 0 THEN like_count - 1 ELSE 0 END
       WHERE id = ?
       RETURNING like_count`,
    )
      .bind(post.id)
      .first<{ like_count: number }>();
    likeCount = Number(updated?.like_count ?? Math.max(0, likeCount - 1));
  }

  return c.json({ data: { likeCount, liked: false } });
});

app.use("/api/me/*", requireUser);

app.get("/api/me/categories", async (c) => {
  await ensureCategories(c.env.DB);
  const result = await c.env.DB.prepare(
    `SELECT categories.*, COUNT(posts.id) AS post_count
     FROM categories
     LEFT JOIN posts ON posts.category = categories.name
     GROUP BY categories.id
     ORDER BY categories.sort_order, categories.created_at`,
  ).all<CategoryRow>();
  return c.json({ data: result.results.map(toCategory) });
});

app.post("/api/me/categories", async (c) => {
  const input = validateCategory(await readJson(c));
  if ("error" in input) return jsonError(c, input.error);
  if (await categoryExists(c.env.DB, input.name)) {
    return c.json({ error: "这个分类已经存在。" }, 409);
  }

  const order = await c.env.DB.prepare(
    "SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_order FROM categories",
  ).first<{ next_order: number }>();
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO categories (id, name, sort_order) VALUES (?, ?, ?)",
  )
    .bind(id, input.name, order?.next_order ?? 10)
    .run();

  const row = await c.env.DB.prepare(
    "SELECT *, 0 AS post_count FROM categories WHERE id = ?",
  )
    .bind(id)
    .first<CategoryRow>();
  return c.json({ data: toCategory(row!) }, 201);
});

app.put("/api/me/categories/:id", async (c) => {
  await ensureCategories(c.env.DB);
  const input = validateCategory(await readJson(c));
  if ("error" in input) return jsonError(c, input.error);

  const existing = await c.env.DB.prepare("SELECT * FROM categories WHERE id = ?")
    .bind(c.req.param("id"))
    .first<Omit<CategoryRow, "post_count">>();
  if (!existing) return c.json({ error: "没有找到这个分类。" }, 404);

  const duplicate = await c.env.DB.prepare(
    "SELECT id FROM categories WHERE name = ? COLLATE NOCASE AND id <> ?",
  )
    .bind(input.name, existing.id)
    .first();
  if (duplicate) return c.json({ error: "这个分类已经存在。" }, 409);

  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE posts SET category = ? WHERE category = ?")
      .bind(input.name, existing.name),
    c.env.DB.prepare("UPDATE categories SET name = ? WHERE id = ?")
      .bind(input.name, existing.id),
  ]);

  const row = await c.env.DB.prepare(
    `SELECT categories.*, COUNT(posts.id) AS post_count
     FROM categories
     LEFT JOIN posts ON posts.category = categories.name
     WHERE categories.id = ?
     GROUP BY categories.id`,
  )
    .bind(existing.id)
    .first<CategoryRow>();
  return c.json({ data: toCategory(row!) });
});

app.delete("/api/me/categories/:id", async (c) => {
  await ensureCategories(c.env.DB);
  const category = await c.env.DB.prepare(
    `SELECT categories.*, COUNT(posts.id) AS post_count
     FROM categories
     LEFT JOIN posts ON posts.category = categories.name
     WHERE categories.id = ?
     GROUP BY categories.id`,
  )
    .bind(c.req.param("id"))
    .first<CategoryRow>();
  if (!category) return c.json({ error: "没有找到这个分类。" }, 404);
  if (Number(category.post_count) > 0) {
    return c.json({ error: "该分类仍有文章，请先调整文章分类。" }, 409);
  }

  const total = await c.env.DB.prepare("SELECT COUNT(*) AS count FROM categories")
    .first<{ count: number }>();
  if (Number(total?.count ?? 0) <= 1) {
    return c.json({ error: "至少需要保留一个分类。" }, 409);
  }

  await c.env.DB.prepare("DELETE FROM categories WHERE id = ?")
    .bind(category.id)
    .run();
  return c.json({ data: true });
});

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
  return c.json({ data: result.results.map((row) => toPost(row)) });
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
  if (!(await categoryExists(c.env.DB, input.category))) {
    return jsonError(c, "请选择已创建的分类。");
  }

  let slug = slugify(input.title);
  const duplicate = await c.env.DB.prepare("SELECT id FROM posts WHERE slug = ?")
    .bind(slug)
    .first();
  if (duplicate) slug = `${slug}-${crypto.randomUUID().slice(0, 6)}`;

  const id = crypto.randomUUID();
  const publishedAt = input.status === "published" ? new Date().toISOString() : null;
  await c.env.DB.prepare(
    `INSERT INTO posts (
       id, author_id, title, slug, category, excerpt, content, status, visibility,
       published_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      c.get("user").id,
      input.title,
      slug,
      input.category,
      makeExcerpt(input.content),
      input.content,
      input.status,
      input.visibility,
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
  if (!(await categoryExists(c.env.DB, input.category))) {
    return jsonError(c, "请选择已创建的分类。");
  }

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
     SET title = ?, category = ?, excerpt = ?, content = ?, status = ?, visibility = ?,
         published_at = ?, updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(
      input.title,
      input.category,
      makeExcerpt(input.content),
      input.content,
      input.status,
      input.visibility,
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

app.patch("/api/me/posts/:id/visibility", async (c) => {
  const input = validateVisibility(await readJson(c));
  if ("error" in input) return jsonError(c, input.error);

  const result = await c.env.DB.prepare(
    `UPDATE posts
     SET visibility = ?, updated_at = datetime('now')
     WHERE id = ? AND author_id = ?`,
  )
    .bind(input.visibility, c.req.param("id"), c.get("user").id)
    .run();
  if (!result.meta.changes) return c.json({ error: "没有找到这篇文章。" }, 404);

  const row = await c.env.DB.prepare(
    `SELECT posts.*, users.name AS author_name
     FROM posts JOIN users ON users.id = posts.author_id
     WHERE posts.id = ?`,
  )
    .bind(c.req.param("id"))
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
