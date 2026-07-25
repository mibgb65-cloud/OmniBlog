CREATE TABLE auth_rate_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);

CREATE INDEX auth_rate_limits_reset_at_idx ON auth_rate_limits(reset_at);

CREATE TRIGGER users_single_owner_before_insert
BEFORE INSERT ON users
WHEN EXISTS (SELECT 1 FROM users)
BEGIN
  SELECT RAISE(ABORT, 'owner already initialized');
END;
