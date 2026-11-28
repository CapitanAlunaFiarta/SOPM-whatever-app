-- 010: răspunsuri și reacții în chaturi, plus mesaje private între prieteni. Se poate rula de mai multe ori.
-- Nu șterge și nu modifică date existente.

-- 1) Mesajele private: doar între prieteni (verifică serverul). read_at = când le-a văzut destinatarul.
CREATE TABLE IF NOT EXISTS direct_messages (
    id BIGSERIAL PRIMARY KEY,
    sender_email VARCHAR(150) NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    recipient_email VARCHAR(150) NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    body VARCHAR(2000) NOT NULL,
    reply_to BIGINT REFERENCES direct_messages(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at TIMESTAMPTZ,
    CONSTRAINT chk_direct_messages_people CHECK (sender_email <> recipient_email)
);
-- Conversația dintre doi oameni, în oricare direcție (cel mai mic email primul).
CREATE INDEX IF NOT EXISTS idx_direct_messages_pair
    ON direct_messages (LEAST(sender_email, recipient_email), GREATEST(sender_email, recipient_email), id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_unread ON direct_messages (recipient_email) WHERE read_at IS NULL;

-- 2) Răspunsul la un mesaj (citatul de deasupra). Dacă mesajul citat se șterge, răspunsul rămâne fără citat.
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reply_to BIGINT;
ALTER TABLE task_messages ADD COLUMN IF NOT EXISTS reply_to BIGINT;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_chat_messages_reply') THEN
        ALTER TABLE chat_messages ADD CONSTRAINT fk_chat_messages_reply
            FOREIGN KEY (reply_to) REFERENCES chat_messages(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_task_messages_reply') THEN
        ALTER TABLE task_messages ADD CONSTRAINT fk_task_messages_reply
            FOREIGN KEY (reply_to) REFERENCES task_messages(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3) Reacțiile (un emoji per persoană per mesaj), pe oricare dintre cele trei feluri de mesaje. Se șterg odată cu mesajul.
CREATE TABLE IF NOT EXISTS message_reactions (
    id BIGSERIAL PRIMARY KEY,
    chat_message_id BIGINT REFERENCES chat_messages(id) ON DELETE CASCADE,
    task_message_id BIGINT REFERENCES task_messages(id) ON DELETE CASCADE,
    direct_message_id BIGINT REFERENCES direct_messages(id) ON DELETE CASCADE,
    user_email VARCHAR(150) NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    emoji VARCHAR(16) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_message_reactions_target CHECK (num_nonnulls(chat_message_id, task_message_id, direct_message_id) = 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_reactions_chat ON message_reactions (chat_message_id, user_email) WHERE chat_message_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reactions_task ON message_reactions (task_message_id, user_email) WHERE task_message_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reactions_direct ON message_reactions (direct_message_id, user_email) WHERE direct_message_id IS NOT NULL;

-- 4) Supabase: tabelele noi nu sunt expuse prin Data API. Pe un Postgres obișnuit nu face nimic.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
       AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY';
        EXECUTE 'ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY';
        EXECUTE 'REVOKE ALL ON direct_messages, message_reactions FROM anon, authenticated';
        EXECUTE 'REVOKE ALL ON SEQUENCE direct_messages_id_seq, message_reactions_id_seq FROM anon, authenticated';
    END IF;
END $$;
