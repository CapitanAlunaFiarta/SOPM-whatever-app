package com.whatever.user.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * Refresh tokens cu rotație: fiecare folosire îl revocă pe cel vechi și emite unul nou.
 * Permite aplicației mobile să rămână autentificată fără a păstra parola.
 */
@Service
public class RefreshTokenService {
    private final JdbcTemplate db;
    private final Duration ttl;

    public RefreshTokenService(JdbcTemplate db, @Value("${app.jwt.refresh-ttl-days}") long ttlDays) {
        this.db = db;
        this.ttl = Duration.ofDays(ttlDays);
    }

    public String issue(String email) {
        String raw = Tokens.randomUrlToken(32);
        db.update("INSERT INTO refresh_tokens(user_email, token_hash, expires_at) VALUES (?, ?, ?)",
                email, Tokens.sha256Hex(raw), Timestamp.from(Instant.now().plus(ttl)));
        return raw;
    }

    /** Consumă token-ul (o singură dată) și întoarce emailul proprietarului. */
    public Optional<String> consume(String raw) {
        if (raw == null || raw.isBlank()) return Optional.empty();
        List<String> owner = db.queryForList(
                "UPDATE refresh_tokens SET revoked_at = now() "
                        + "WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > now() RETURNING user_email",
                String.class, Tokens.sha256Hex(raw.trim()));
        return owner.isEmpty() ? Optional.empty() : Optional.of(owner.get(0));
    }

    public void revoke(String raw) {
        if (raw == null || raw.isBlank()) return;
        db.update("UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = ? AND revoked_at IS NULL",
                Tokens.sha256Hex(raw.trim()));
    }

    public void revokeAll(String email) {
        db.update("UPDATE refresh_tokens SET revoked_at = now() WHERE user_email = ? AND revoked_at IS NULL", email);
    }

    @Scheduled(fixedDelay = 21_600_000, initialDelay = 600_000)
    void cleanup() {
        try {
            db.update("DELETE FROM refresh_tokens WHERE expires_at < now() - INTERVAL '7 days' "
                    + "OR revoked_at < now() - INTERVAL '7 days'");
            db.update("DELETE FROM device_challenges WHERE expires_at < now() - INTERVAL '1 day'");
            db.update("DELETE FROM webauthn_challenges WHERE expires_at < (now() AT TIME ZONE 'UTC') - INTERVAL '1 day'");
        } catch (RuntimeException ignored) {
            // curățenia nu e critică; încercăm din nou la următoarea rulare
        }
    }
}
