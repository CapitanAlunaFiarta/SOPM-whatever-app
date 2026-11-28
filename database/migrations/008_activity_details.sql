-- 008: descrierea activităților, repetarea la fiecare N zile sau săptămâni și abonarea la calendar.
-- Se poate rula de mai multe ori. Nu șterge și nu modifică date existente: activitățile de dinainte au
-- descrierea goală, iar cele recurente se repetă în continuare zilnic (la fiecare 1 zi).

-- 1) Descrierea (textul mai lung de pe ecranul de detalii al activității).
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description VARCHAR(2000) NOT NULL DEFAULT '';

-- 2) Repetarea: o activitate recurentă revine la repeat_every zile (DAY) sau săptămâni (WEEK) după ce a fost
--    finalizată. Activitățile care nu sunt recurente păstrează valorile implicite și le ignoră.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS repeat_every SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS repeat_unit VARCHAR(5) NOT NULL DEFAULT 'DAY';
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tasks_repeat') THEN
        ALTER TABLE tasks ADD CONSTRAINT chk_tasks_repeat
            CHECK (repeat_unit IN ('DAY', 'WEEK') AND repeat_every BETWEEN 1 AND 365);
    END IF;
END $$;

-- 3) Abonarea la calendar (Google Calendar și altele): un link secret per utilizator, către un fișier .ics cu
--    activitățile lui. Linkul se poate reseta (tokenul vechi nu mai merge).
CREATE TABLE IF NOT EXISTS calendar_feeds (
    user_email VARCHAR(150) PRIMARY KEY REFERENCES users(email) ON DELETE CASCADE,
    token VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_fetched_at TIMESTAMPTZ
);

-- 4) Supabase: tabela nouă nu e expusă prin Data API (ca în 002/004/005/006/007). Pe un Postgres obișnuit nu face nimic.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
       AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'ALTER TABLE calendar_feeds ENABLE ROW LEVEL SECURITY';
        EXECUTE 'REVOKE ALL ON calendar_feeds FROM anon, authenticated';
    END IF;
END $$;
