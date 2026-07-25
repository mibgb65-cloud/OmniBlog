CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO categories (id, name, sort_order) VALUES
  ('category-essay', '随笔', 10),
  ('category-tech', '技术', 20),
  ('category-life', '生活', 30),
  ('category-reading', '读书', 40),
  ('category-project', '项目', 50);

INSERT OR IGNORE INTO categories (id, name, sort_order)
SELECT 'category-' || lower(hex(randomblob(8))), category, 1000
FROM posts
WHERE trim(category) <> ''
GROUP BY category;
