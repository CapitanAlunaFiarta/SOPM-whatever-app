-- 005: favoruri între prieteni („pasă ca la tenis”). Se poate rula de mai multe ori.
--
-- Cine cere un favor îi rămâne dator celui care l-a făcut (după ce aprobă poza). Cât timp datorezi, nu poți
-- cere; când ți se cere și datorezi, poți refuza doar ca „nerezonabil” (REFUSED, datoria rămâne).
-- Stări: REQUESTED → ACCEPTED → SUBMITTED (poza) → COMPLETED, sau DECLINED / REFUSED / CANCELED / EXPIRED.
CREATE TABLE IF NOT EXISTS favors (
    id BIGSERIAL PRIMARY KEY,
    requester_email VARCHAR(150) NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    doer_email VARCHAR(150) NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    details VARCHAR(1000) NOT NULL DEFAULT '',
    category VARCHAR(40) NOT NULL DEFAULT 'CHORES',
    due_date DATE NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    allowed_radius_meters INT NOT NULL DEFAULT 150,
    status VARCHAR(12) NOT NULL DEFAULT 'REQUESTED',
    -- La cerere, cel rugat datora deja un favor (deci nu putea refuza liber).
    obligated BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    responded_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    -- Poza (JPEG, făcută cu camera din aplicație la locul favorului) și unde/când a fost făcută.
    photo BYTEA,
    photo_taken_at TIMESTAMPTZ,
    photo_latitude DOUBLE PRECISION,
    photo_longitude DOUBLE PRECISION,
    review_note VARCHAR(300),
    CONSTRAINT chk_favor_status CHECK (status IN
        ('REQUESTED', 'ACCEPTED', 'DECLINED', 'REFUSED', 'SUBMITTED', 'COMPLETED', 'EXPIRED', 'CANCELED')),
    CONSTRAINT chk_favor_people CHECK (requester_email <> doer_email)
);
CREATE INDEX IF NOT EXISTS idx_favors_requester ON favors(requester_email);
CREATE INDEX IF NOT EXISTS idx_favors_doer ON favors(doer_email);
-- Cel mult un favor în desfășurare între doi prieteni (în oricare direcție).
CREATE UNIQUE INDEX IF NOT EXISTS uq_favors_open_pair
    ON favors (LEAST(requester_email, doer_email), GREATEST(requester_email, doer_email))
    WHERE status IN ('REQUESTED', 'ACCEPTED', 'SUBMITTED');

-- Supabase: tabela nu e expusă prin Data API (ca în 002/004). Pe un Postgres obișnuit nu face nimic.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
       AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'ALTER TABLE favors ENABLE ROW LEVEL SECURITY';
        EXECUTE 'REVOKE ALL ON favors FROM anon, authenticated';
        EXECUTE 'REVOKE ALL ON SEQUENCE favors_id_seq FROM anon, authenticated';
    END IF;
END $$;
