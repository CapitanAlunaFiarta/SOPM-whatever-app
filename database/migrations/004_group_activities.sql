-- 004: activități cu prieteni (invitații, fiecare membru își confirmă partea) și chat pe activitate.
-- Se poate rula de mai multe ori.

-- 1) Participanții unei activități, în afară de proprietar.
--    INVITED = încă n-a răspuns, ACCEPTED = membru, DECLINED = a refuzat (nu mai vede activitatea).
CREATE TABLE IF NOT EXISTS task_participants (
    task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_email VARCHAR(150) NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    status VARCHAR(12) NOT NULL DEFAULT 'INVITED',
    invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    responded_at TIMESTAMPTZ,
    PRIMARY KEY (task_id, user_email),
    CONSTRAINT chk_task_participant_status CHECK (status IN ('INVITED', 'ACCEPTED', 'DECLINED'))
);
CREATE INDEX IF NOT EXISTS idx_task_participants_user ON task_participants(user_email);

-- Partajarea veche (un singur prieten, doar vizualizare) devine participare acceptată.
INSERT INTO task_participants(task_id, user_email, status, responded_at)
SELECT t.id, u.email, 'ACCEPTED', now()
FROM tasks t
JOIN users u ON u.username = t.shared_with_friend
WHERE t.shared_with_friend <> '' AND u.email <> t.owner_email
ON CONFLICT DO NOTHING;
UPDATE tasks SET shared_with_friend = '' WHERE shared_with_friend <> '';
DROP INDEX IF EXISTS idx_tasks_shared_with;

-- 2) Fiecare membru își confirmă singur partea: o finalizare pe zi pentru fiecare utilizator.
ALTER TABLE task_completions DROP CONSTRAINT IF EXISTS uq_task_completion_per_day;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_task_completion_per_user_day') THEN
        ALTER TABLE task_completions
            ADD CONSTRAINT uq_task_completion_per_user_day UNIQUE (task_id, user_email, completed_on);
    END IF;
END $$;

-- 3) Momentul în care activitatea s-a încheiat (confirmată de toți); chatul se închide la 5 zile după.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;
UPDATE tasks SET finished_at = updated_at WHERE status = 'Completed' AND finished_at IS NULL;

-- 4) Chatul fiecărei activități de grup (separat de chatul general).
CREATE TABLE IF NOT EXISTS task_messages (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    sender_email VARCHAR(150) NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    body VARCHAR(2000) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_messages_task ON task_messages(task_id, id);

-- 5) Supabase: tabelele noi nu sunt expuse prin Data API (ca în 002). Pe un Postgres obișnuit nu face nimic.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
       AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'ALTER TABLE task_participants ENABLE ROW LEVEL SECURITY';
        EXECUTE 'ALTER TABLE task_messages ENABLE ROW LEVEL SECURITY';
        EXECUTE 'REVOKE ALL ON task_participants, task_messages FROM anon, authenticated';
        EXECUTE 'REVOKE ALL ON SEQUENCE task_messages_id_seq FROM anon, authenticated';
    END IF;
END $$;
