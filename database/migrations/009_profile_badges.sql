-- 009: profilul (poză și descriere) și cea mai lungă serie, pentru insigne. Se poate rula de mai multe ori.
-- Nu șterge și nu modifică date existente (doar completează best_streak din istoric).

-- 1) Descrierea scurtă de pe profil și momentul ultimei poze (null = fără poză). Poza stă separat, ca
--    SELECT * FROM users (la fiecare cerere autentificată) să nu care și imaginea.
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio VARCHAR(160) NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_updated_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS user_avatars (
    user_email VARCHAR(150) PRIMARY KEY REFERENCES users(email) ON DELETE CASCADE,
    -- JPEG 256×256 recodat de server (fără metadate EXIF).
    image BYTEA NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Cea mai lungă serie de zile la rând (streak-ul curent se poate rupe; insigna rămâne).
ALTER TABLE users ADD COLUMN IF NOT EXISTS best_streak INT NOT NULL DEFAULT 0;
-- Din istoricul finalizărilor: zilele consecutive formează „insule” (ziua − numărul de ordine e constant).
WITH days AS (
    SELECT DISTINCT user_email, completed_on FROM task_completions
), islands AS (
    SELECT user_email, completed_on - (row_number() OVER (PARTITION BY user_email ORDER BY completed_on))::int AS island
    FROM days
), runs AS (
    SELECT user_email, max(length) AS best FROM (
        SELECT user_email, island, count(*) AS length FROM islands GROUP BY user_email, island
    ) grouped GROUP BY user_email
)
UPDATE users u SET best_streak = GREATEST(u.best_streak, runs.best)
FROM runs WHERE runs.user_email = u.email AND runs.best > u.best_streak;
UPDATE users SET best_streak = streak WHERE streak > best_streak;

-- 3) Supabase: tabela nouă nu e expusă prin Data API (ca în migrările anterioare). Pe un Postgres obișnuit nu face nimic.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
       AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'ALTER TABLE user_avatars ENABLE ROW LEVEL SECURITY';
        EXECUTE 'REVOKE ALL ON user_avatars FROM anon, authenticated';
    END IF;
END $$;
