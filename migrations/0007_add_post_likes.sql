ALTER TABLE posts ADD COLUMN like_count INTEGER NOT NULL DEFAULT 0 CHECK (like_count >= 0);

CREATE TABLE post_likes (
  post_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (post_id, visitor_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

CREATE INDEX post_likes_visitor_id_idx ON post_likes(visitor_id);
