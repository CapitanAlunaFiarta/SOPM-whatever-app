package com.whatever.user.admin;

import com.whatever.user.auth.RefreshTokenService;
import com.whatever.user.security.AuthUser;
import com.whatever.user.users.UserRepository;
import com.whatever.user.web.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.sql.Date;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Rutele /api/admin/** sunt accesibile doar rolului ADMIN (vezi SecurityConfig). */
@RestController
@RequestMapping("/api/admin")
public class AdminController {
    private final JdbcTemplate db;
    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final RefreshTokenService refreshTokens;

    public AdminController(JdbcTemplate db, UserRepository users, PasswordEncoder encoder,
                           RefreshTokenService refreshTokens) {
        this.db = db;
        this.users = users;
        this.encoder = encoder;
        this.refreshTokens = refreshTokens;
    }

    @GetMapping("/users")
    public List<Map<String, Object>> list() {
        return db.queryForList("SELECT * FROM users ORDER BY id").stream().map(row -> {
            Map<String, Object> user = new LinkedHashMap<>(users.publicUser(row));
            user.put("createdAt", UserRepository.isoInstant(row.get("created_at")));
            return user;
        }).toList();
    }

    @PostMapping("/users/{email}/reset-freezes")
    public Map<String, Object> resetFreezes(@PathVariable String email) {
        int updated = db.update("UPDATE users SET streak_freezes_left = ?, freeze_month = ? WHERE email = ?",
                UserRepository.MONTHLY_FREEZES, Date.valueOf(users.today().withDayOfMonth(1)),
                UserRepository.normalizeEmail(email));
        return result(updated);
    }

    @PostMapping("/users/{email}/bonus-streak")
    public Map<String, Object> bonusStreak(@PathVariable String email) {
        Map<String, Object> user = users.findByEmail(email).orElseThrow(() -> new ApiException(404, "Utilizator negăsit."));
        LocalDate yesterday = users.today().minusDays(1);
        LocalDate last = UserRepository.localDate(user.get("last_streak_date"));
        LocalDate keepAlive = last != null && !last.isBefore(yesterday) ? last : yesterday;
        db.update("UPDATE users SET streak = ?, last_streak_date = ? WHERE email = ?",
                users.effectiveStreak(user) + 5, Date.valueOf(keepAlive), user.get("email"));
        return Map.of("ok", true);
    }

    @PostMapping("/users/{email}/password")
    public Map<String, Object> resetPassword(@PathVariable String email, @Valid @RequestBody AdminPasswordRequest request) {
        String target = UserRepository.normalizeEmail(email);
        int updated = db.update("UPDATE users SET password_hash = ? WHERE email = ?",
                encoder.encode(request.newPassword()), target);
        refreshTokens.revokeAll(target);
        return result(updated);
    }

    @DeleteMapping("/users/{email}")
    public Map<String, Object> delete(@AuthenticationPrincipal AuthUser auth, @PathVariable String email) {
        String target = UserRepository.normalizeEmail(email);
        if (target.equals(auth.email())) throw new ApiException(400, "Administratorul nu se poate șterge.");
        return result(db.update("DELETE FROM users WHERE email = ?", target));
    }

    private static Map<String, Object> result(int updated) {
        if (updated == 0) throw new ApiException(404, "Utilizator negăsit.");
        return Map.of("ok", true);
    }

    public record AdminPasswordRequest(
            @NotBlank(message = "Parola nouă este obligatorie.")
            @Size(min = 12, max = 128, message = "Parola nouă trebuie să aibă cel puțin 12 caractere.") String newPassword) {
    }
}
