ALTER TABLE posts ADD COLUMN category TEXT NOT NULL DEFAULT '随笔';

CREATE INDEX posts_category_published_at_idx
ON posts(category, published_at DESC);
