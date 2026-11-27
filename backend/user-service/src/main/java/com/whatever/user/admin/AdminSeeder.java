package com.whatever.user.admin;

import com.whatever.user.users.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Creează contul de administrator la prima pornire, în fundal: dacă baza de date nu răspunde imediat,
 * serviciul pornește oricum și încercarea se repetă. Parola existentă nu mai e suprascrisă.
 */
@Component
public class AdminSeeder {
    private static final Logger log = LoggerFactory.getLogger(AdminSeeder.class);

    private final JdbcTemplate db;
    private final PasswordEncoder encoder;
    private final String email;
    private final String password;
    private final String username;
    private final boolean resetPassword;

    public AdminSeeder(JdbcTemplate db, PasswordEncoder encoder,
                       @Value("${app.admin-email}") String email,
                       @Value("${app.admin-password}") String password,
                       @Value("${app.admin-username}") String username,
                       @Value("${app.admin-reset-password}") boolean resetPassword) {
        this.db = db;
        this.encoder = encoder;
        this.email = UserRepository.normalizeEmail(email);
        this.password = password == null ? "" : password;
        this.username = username == null || username.isBlank() ? "admin" : username.trim();
        this.resetPassword = resetPassword;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        Thread worker = new Thread(this::seedWithRetry, "admin-seeder");
        worker.setDaemon(true);
        worker.start();
    }

    void seedWithRetry() {
        for (int attempt = 1; attempt <= 8; attempt++) {
            try {
                seed();
                return;
            } catch (DataAccessException e) {
                log.warn("Seed admin: baza de date nu răspunde (încercarea {}): {}", attempt, e.getMessage());
                sleep(Math.min(60_000L, 2_000L << attempt));
            }
        }
        log.error("Seed admin: renunț după 8 încercări.");
    }

    void seed() {
        if (email.isEmpty()) {
            log.info("ADMIN_EMAIL nu este setat; nu creez cont de administrator.");
            return;
        }
        List<Map<String, Object>> rows = db.queryForList("SELECT id, role FROM users WHERE email = ?", email);
        boolean validPassword = password.length() >= 12;
        if (!rows.isEmpty()) {
            if (!"ADMIN".equals(rows.get(0).get("role"))) {
                db.update("UPDATE users SET role = 'ADMIN' WHERE email = ?", email);
            }
            if (resetPassword && validPassword) {
                db.update("UPDATE users SET password_hash = ? WHERE email = ?", encoder.encode(password), email);
                log.info("Parola administratorului a fost resetată din ADMIN_PASSWORD.");
            }
            return;
        }
        if (!validPassword) {
            log.warn("ADMIN_PASSWORD lipsește sau are sub 12 caractere; nu creez contul de administrator.");
            return;
        }
        String finalUsername = username;
        Integer taken = db.queryForObject("SELECT count(*) FROM users WHERE username = ?", Integer.class, finalUsername);
        if (taken != null && taken > 0) {
            finalUsername = username + "_" + ThreadLocalRandom.current().nextInt(1000, 9999);
        }
        db.update("INSERT INTO users(full_name, username, email, password_hash, role) VALUES (?, ?, ?, ?, 'ADMIN')",
                "Administrator", finalUsername, email, encoder.encode(password));
        log.info("Contul de administrator a fost creat ({}).", finalUsername);
    }

    private static void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
