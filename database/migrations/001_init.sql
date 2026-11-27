CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    full_name VARCHAR(120) NOT NULL,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'USER',
    streak INT NOT NULL DEFAULT 0,
    streak_freezes_left INT NOT NULL DEFAULT 3,
    biometric_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    password_reset_token VARCHAR(128),
    password_reset_expires_at TIMESTAMP,
    last_streak_date DATE,
    freeze_month DATE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id BIGSERIAL PRIMARY KEY,
    sender_username VARCHAR(100) NOT NULL,
    sender_name VARCHAR(120) NOT NULL,
    sender_role VARCHAR(20) NOT NULL DEFAULT 'USER',
    message_text VARCHAR(2000) NOT NULL,
    sent_at VARCHAR(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(60) NOT NULL DEFAULT 'Personal',
    priority VARCHAR(30) NOT NULL DEFAULT 'Medium',
    status VARCHAR(50) NOT NULL DEFAULT 'Upcoming',
    is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
    streak_count INT NOT NULL DEFAULT 0,
    requires_location BOOLEAN NOT NULL DEFAULT TRUE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    allowed_radius_meters INT NOT NULL DEFAULT 150,
    requires_biometrics BOOLEAN NOT NULL DEFAULT FALSE,
    due_date DATE NOT NULL,
    owner_email VARCHAR(150) NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    shared_with_friend VARCHAR(100) DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_tasks_owner_email ON tasks(owner_email);

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(128);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_streak_date DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS freeze_month DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS friends (
    user_email VARCHAR(150) NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    friend_email VARCHAR(150) NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_email, friend_email),
    CHECK (user_email <> friend_email)
);

CREATE TABLE IF NOT EXISTS webauthn_credentials (
    id BIGSERIAL PRIMARY KEY,
    user_email VARCHAR(150) NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    credential_id VARCHAR(512) NOT NULL UNIQUE,
    public_key BYTEA NOT NULL,
    sign_count BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS webauthn_challenges (
    id BIGSERIAL PRIMARY KEY,
    user_email VARCHAR(150) NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    ceremony VARCHAR(20) NOT NULL,
    request_json TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_friends_friend_email ON friends(friend_email);
CREATE INDEX IF NOT EXISTS idx_webauthn_user_email ON webauthn_credentials(user_email);
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_user ON webauthn_challenges(user_email, ceremony, expires_at);
