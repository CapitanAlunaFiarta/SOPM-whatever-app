-- 007: versiunile aplicației publicate pe GitHub Releases. user-service le verifică periodic și anunță
-- în chatul comunității fiecare versiune nouă, o singură dată (tag-ul e cheia). Se poate rula de mai multe ori.
CREATE TABLE IF NOT EXISTS app_releases (
    tag VARCHAR(80) PRIMARY KEY,
    version VARCHAR(40) NOT NULL,
    build INT NOT NULL,
    apk_url VARCHAR(500) NOT NULL,
    seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Supabase: tabela nu e expusă prin Data API. Pe un Postgres obișnuit nu face nimic.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
       AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'ALTER TABLE app_releases ENABLE ROW LEVEL SECURITY';
        EXECUTE 'REVOKE ALL ON app_releases FROM anon, authenticated';
    END IF;
END $$;
