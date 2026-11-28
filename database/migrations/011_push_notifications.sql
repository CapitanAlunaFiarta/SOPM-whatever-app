-- 011: notificări pe web (Web Push, fără Firebase): cheile VAPID ale serverului, abonamentele browserelor și ce
-- notificări vrea fiecare utilizator. Se poate rula de mai multe ori; nu șterge și nu modifică date existente.

-- 1) Cheile VAPID (P-256), generate o singură dată de primul serviciu care trimite o notificare. Cheia privată
--    rămâne în baza de date (tabela nu e expusă prin Data API, vezi mai jos); dacă se schimbă, abonamentele vechi
--    nu mai primesc nimic și browserele trebuie să se aboneze din nou.
CREATE TABLE IF NOT EXISTS push_keys (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    public_key VARCHAR(100) NOT NULL,
    private_key VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Un browser abonat (endpoint-ul serviciului de push + cheile lui de criptare). Un endpoint aparține unui singur
--    cont (dacă pe același browser intră altcineva, abonamentul trece la el). `language` = limba aplicației, pentru textul
--    notificării.
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    user_email VARCHAR(150) NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    endpoint VARCHAR(1000) NOT NULL UNIQUE,
    p256dh VARCHAR(200) NOT NULL,
    auth VARCHAR(100) NOT NULL,
    language VARCHAR(5) NOT NULL DEFAULT 'ro',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_success_at TIMESTAMPTZ,
    failures INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_email);

-- 3) Ce notificări vrea utilizatorul (lipsa rândului = toate).
CREATE TABLE IF NOT EXISTS notification_settings (
    user_email VARCHAR(150) PRIMARY KEY REFERENCES users(email) ON DELETE CASCADE,
    requests BOOLEAN NOT NULL DEFAULT TRUE,
    messages BOOLEAN NOT NULL DEFAULT TRUE,
    favors BOOLEAN NOT NULL DEFAULT TRUE,
    invitations BOOLEAN NOT NULL DEFAULT TRUE,
    updates BOOLEAN NOT NULL DEFAULT TRUE
);

-- 4) Supabase: tabelele noi nu sunt expuse prin Data API (ca în migrările anterioare). Pe un Postgres obișnuit nu face nimic.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
       AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'ALTER TABLE push_keys ENABLE ROW LEVEL SECURITY';
        EXECUTE 'REVOKE ALL ON push_keys FROM anon, authenticated';
        EXECUTE 'ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY';
        EXECUTE 'REVOKE ALL ON push_subscriptions FROM anon, authenticated';
        EXECUTE 'ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY';
        EXECUTE 'REVOKE ALL ON notification_settings FROM anon, authenticated';
    END IF;
END $$;
