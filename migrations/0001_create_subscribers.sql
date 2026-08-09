CREATE TABLE IF NOT EXISTS subscribers (
  email TEXT PRIMARY KEY,
  locale TEXT NOT NULL DEFAULT 'zh',
  status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL DEFAULT 'website',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
