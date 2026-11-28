-- 006: cereri de prietenie, mesaje speciale în chatul comunității și invitații publice la activități.
-- Se poate rula de mai multe ori. Nu șterge și nu modifică date existente.

-- 1) Prietenii cu cerere. Un rând PENDING e o cerere de la user_email către friend_email; prietenia e un
--    rând ACCEPTED (în oricare direcție). Prieteniile de dinainte rămân acceptate (valoarea implicită).
ALTER TABLE friends ADD COLUMN IF NOT EXISTS status VARCHAR(10) NOT NULL DEFAULT 'ACCEPTED';
ALTER TABLE friends ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_friends_status') THEN
        ALTER TABLE friends ADD CONSTRAINT chk_friends_status CHECK (status IN ('PENDING', 'ACCEPTED'));
    END IF;
END $$;

-- 2) Chatul comunității: pe lângă text, mesaje speciale. STREAK = cineva își arată streak-ul,
--    ACTIVITY = invitație la o activitate de grup, UPDATE = anunțul unei versiuni noi a aplicației.
--    payload = detaliile mesajului (JSON), ref_id = activitatea, unde e cazul.
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS kind VARCHAR(12) NOT NULL DEFAULT 'TEXT';
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS payload TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS ref_id BIGINT;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_chat_messages_kind') THEN
        ALTER TABLE chat_messages
            ADD CONSTRAINT chk_chat_messages_kind CHECK (kind IN ('TEXT', 'STREAK', 'ACTIVITY', 'UPDATE'));
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_chat_messages_kind_ref ON chat_messages(kind, ref_id);

-- 3) Activitățile trimise în comunitate: oricine le vede poate cere să participe, iar organizatorul
--    aprobă (devine membru) sau refuză. shared_at = prima dată când a fost trimisă.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS shared_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS task_join_requests (
    task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_email VARCHAR(150) NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    status VARCHAR(10) NOT NULL DEFAULT 'PENDING',
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    responded_at TIMESTAMPTZ,
    PRIMARY KEY (task_id, user_email),
    CONSTRAINT chk_task_join_request_status CHECK (status IN ('PENDING', 'DECLINED'))
);
CREATE INDEX IF NOT EXISTS idx_task_join_requests_user ON task_join_requests(user_email);

-- 4) Supabase: tabela nouă nu e expusă prin Data API (ca în 002/004/005). Pe un Postgres obișnuit nu face nimic.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
       AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'ALTER TABLE task_join_requests ENABLE ROW LEVEL SECURITY';
        EXECUTE 'REVOKE ALL ON task_join_requests FROM anon, authenticated';
    END IF;
END $$;
