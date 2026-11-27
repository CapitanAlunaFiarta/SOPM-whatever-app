-- 002: finalizări unice, streak zilnic + puncte, refresh tokens, chei de dispozitiv,
-- timestamp real în chat și închiderea Data API-ului Supabase.
-- Migrarea este compatibilă cu backend-ul vechi (doar tabele/coloane noi cu valori implicite)
-- și poate fi rulată de mai multe ori fără efecte duble.

-- 1) Istoricul finalizărilor: o singură finalizare pe task pe zi (garantat de baza de date).
CREATE TABLE IF NOT EXISTS task_completions (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_email VARCHAR(150) NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    completed_on DATE NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    verified_location BOOLEAN NOT NULL DEFAULT FALSE,
    verified_biometric BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_task_completion_per_day UNIQUE (task_id, completed_on)
);
CREATE INDEX IF NOT EXISTS idx_task_completions_user_day ON task_completions(user_email, completed_on);

-- 2) Refresh tokens: în baza de date ajunge doar hash-ul SHA-256.
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_email VARCHAR(150) NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_email);

-- 3) Biometrie nativă: cheie Ed25519 generată pe telefon; cheia privată nu părăsește telefonul.
CREATE TABLE IF NOT EXISTS device_keys (
    id BIGSERIAL PRIMARY KEY,
    device_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    user_email VARCHAR(150) NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL DEFAULT 'Telefon',
    public_key BYTEA NOT NULL CHECK (octet_length(public_key) = 32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_device_keys_user ON device_keys(user_email);

CREATE TABLE IF NOT EXISTS device_challenges (
    id BIGSERIAL PRIMARY KEY,
    device_id UUID NOT NULL REFERENCES device_keys(device_id) ON DELETE CASCADE,
    user_email VARCHAR(150) NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    task_id BIGINT NOT NULL,
    challenge BYTEA NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_device_challenges_user ON device_challenges(user_email);

-- 4) Puncte + streak zilnic. Vechiul „streak” număra task-uri finalizate, deci devine „points”;
--    streak-ul pornește corect de acum (zile consecutive cu cel puțin un task finalizat).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'points') THEN
        ALTER TABLE users ADD COLUMN points INT NOT NULL DEFAULT 0;
        UPDATE users
           SET points = streak,
               streak = CASE
                            WHEN last_streak_date >= (now() AT TIME ZONE 'Europe/Bucharest')::date - 1 THEN 1
                            ELSE 0
                        END;
    END IF;
END $$;

-- 5) Chat: timestamp real în loc de text.
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
UPDATE chat_messages
   SET created_at = CASE WHEN sent_at ~ '^\d{4}-\d{2}-\d{2}T' THEN sent_at::timestamptz ELSE now() END
 WHERE created_at IS NULL;
ALTER TABLE chat_messages ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE chat_messages ALTER COLUMN created_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at DESC);

-- 6) Valori trimise de vechiul client mobil („General”, „Normal”) aduse la cele din aplicație.
UPDATE tasks SET category = 'Personal'
 WHERE category NOT IN ('Personal', 'Facultate', 'Sport', 'Proiect Echipă', 'Sănătate');
UPDATE tasks SET priority = 'Medium'
 WHERE priority NOT IN ('Low', 'Medium', 'High');

-- 7) Indexuri și curățenie.
CREATE INDEX IF NOT EXISTS idx_tasks_shared_with ON tasks(shared_with_friend) WHERE shared_with_friend <> '';
DELETE FROM webauthn_challenges WHERE expires_at < now() - INTERVAL '1 day';

-- 8) Supabase: aplicația nu folosește Data API (PostgREST), deci rolurile publice nu primesc drepturi.
--    RLS rămâne activ ca a doua barieră. Pe un Postgres obișnuit (docker local) blocul nu face nimic.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
       AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
        EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated';
        BEGIN
            EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated';
            EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated';
        EXCEPTION WHEN insufficient_privilege THEN
            RAISE NOTICE 'Default privileges nu au putut fi modificate de rolul curent.';
        END;
    END IF;
    IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
        BEGIN
            EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC';
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated';
            END IF;
        EXCEPTION WHEN insufficient_privilege THEN
            RAISE NOTICE 'Drepturile pe rls_auto_enable() nu au putut fi modificate de rolul curent.';
        END;
    END IF;
END $$;
