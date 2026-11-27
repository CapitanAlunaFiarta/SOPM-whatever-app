package com.whatever.user.users;

import com.whatever.user.web.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/** Acces la tabela users + forma publică a unui utilizator (fără hash-uri sau token-uri). */
@Repository
public class UserRepository {
    public static final int MONTHLY_FREEZES = 3;

    private final JdbcTemplate db;
    private final ZoneId zone;

    public UserRepository(JdbcTemplate db, @Value("${app.timezone}") String timezone) {
        this.db = db;
        this.zone = ZoneId.of(timezone);
    }

    public static String normalizeEmail(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    public LocalDate today() {
        return LocalDate.now(zone);
    }

    public Optional<Map<String, Object>> findByEmail(String email) {
        List<Map<String, Object>> rows = db.queryForList("SELECT * FROM users WHERE email = ?", normalizeEmail(email));
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public Optional<Map<String, Object>> findByUsername(String username) {
        List<Map<String, Object>> rows = db.queryForList("SELECT * FROM users WHERE username = ?", username.trim());
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public Map<String, Object> require(String email) {
        return findByEmail(email).orElseThrow(() -> new ApiException(401, "Sesiune invalidă."));
    }

    /** Streak-ul afișat: dacă ultima zi cu activitate e mai veche decât ieri, streak-ul s-a rupt. */
    public int effectiveStreak(Map<String, Object> row) {
        LocalDate last = localDate(row.get("last_streak_date"));
        int streak = intValue(row.get("streak"));
        return last != null && !last.isBefore(today().minusDays(1)) ? streak : 0;
    }

    public int effectiveFreezes(Map<String, Object> row) {
        LocalDate month = localDate(row.get("freeze_month"));
        return today().withDayOfMonth(1).equals(month) ? intValue(row.get("streak_freezes_left")) : MONTHLY_FREEZES;
    }

    public Map<String, Object> publicUser(Map<String, Object> row) {
        Map<String, Object> user = new LinkedHashMap<>();
        user.put("id", row.get("id"));
        user.put("fullName", row.get("full_name"));
        user.put("username", row.get("username"));
        user.put("email", row.get("email"));
        user.put("role", row.get("role"));
        user.put("streak", effectiveStreak(row));
        user.put("points", intValue(row.get("points")));
        user.put("freezesLeft", effectiveFreezes(row));
        user.put("biometricEnabled", Boolean.TRUE.equals(row.get("biometric_enabled")));
        LocalDate last = localDate(row.get("last_streak_date"));
        user.put("lastActiveOn", last == null ? null : last.toString());
        return user;
    }

    public static LocalDate localDate(Object value) {
        if (value instanceof Date date) return date.toLocalDate();
        if (value instanceof LocalDate date) return date;
        if (value instanceof Timestamp timestamp) return timestamp.toLocalDateTime().toLocalDate();
        return null;
    }

    public static int intValue(Object value) {
        return value instanceof Number number ? number.intValue() : 0;
    }

    public static String isoInstant(Object value) {
        if (value instanceof Timestamp timestamp) return timestamp.toInstant().toString();
        return value == null ? null : value.toString();
    }
}
