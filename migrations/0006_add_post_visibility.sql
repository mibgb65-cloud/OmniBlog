ALTER TABLE posts
ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'
CHECK (visibility IN ('public', 'unlisted', 'private'));

CREATE INDEX posts_status_visibility_published_at_idx
ON posts(status, visibility, published_at DESC);
