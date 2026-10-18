CREATE DATABASE IF NOT EXISTS whatever_db;
USE whatever_db;

CREATE TABLE IF NOT EXISTS users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(120) NOT NULL,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'USER',
    streak INT NOT NULL DEFAULT 0,
    streak_freezes_left INT NOT NULL DEFAULT 3,
    biometric_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    sender_username VARCHAR(100) NOT NULL,
    sender_name VARCHAR(120) NOT NULL,
    sender_role VARCHAR(20) NOT NULL DEFAULT 'USER',
    message_text VARCHAR(2000) NOT NULL,
    sent_at VARCHAR(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(60) NOT NULL DEFAULT 'Personal',
    priority VARCHAR(30) NOT NULL DEFAULT 'Medium',
    status VARCHAR(50) NOT NULL DEFAULT 'Upcoming',
    is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
    streak_count INT NOT NULL DEFAULT 0,
    requires_location BOOLEAN NOT NULL DEFAULT TRUE,
    latitude DOUBLE NOT NULL,
    longitude DOUBLE NOT NULL,
    allowed_radius_meters INT NOT NULL DEFAULT 150,
    requires_biometrics BOOLEAN NOT NULL DEFAULT FALSE,
    due_date DATE NOT NULL,
    owner_email VARCHAR(150) NOT NULL,
    shared_with_friend VARCHAR(100) DEFAULT '',
    INDEX idx_tasks_owner (owner_email),
    CONSTRAINT fk_tasks_owner FOREIGN KEY (owner_email) REFERENCES users(email) ON DELETE CASCADE
);
