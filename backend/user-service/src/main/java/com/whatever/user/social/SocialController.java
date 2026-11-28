package com.whatever.user.social;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.whatever.user.security.AuthUser;
import com.whatever.user.users.UserRepository;
import com.whatever.user.web.ApiException;
import com.whatever.user.web.RateLimiter;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Clasament și chatul comunității. Nu expune niciodată emailul altor utilizatori.
 *
 * <p>Pe lângă textul obișnuit, chatul are mesaje speciale (kind): STREAK (cineva își arată streak-ul, calculat
 * de server), ACTIVITY (invitație la o activitate de grup, trimisă din task-service) și UPDATE (versiune nouă a
 * aplicației). Detaliile lor sunt în payload (JSON); textul rămâne o variantă citibilă pentru aplicațiile vechi.
 */
@RestController
@RequestMapping("/api")
public class SocialController {
    private final JdbcTemplate db;
    private final UserRepository users;
    private final RateLimiter rateLimiter;
    private final ObjectMapper json;

    public SocialController(JdbcTemplate db, UserRepository users, RateLimiter rateLimiter, ObjectMapper json) {
        this.db = db;
        this.users = users;
        this.rateLimiter = rateLimiter;
        this.json = json;
    }

    @GetMapping("/leaderboard")
    public List<Map<String, Object>> leaderboard() {
        return db.queryForList("SELECT username, full_name, streak, last_streak_date, points FROM users").stream()
                .map(row -> {
                    Map<String, Object> entry = new LinkedHashMap<>();
                    entry.put("username", row.get("username"));
                    entry.put("fullName", row.get("full_name"));
                    entry.put("streak", users.effectiveStreak(row));
                    entry.put("points", UserRepository.intValue(row.get("points")));
                    return entry;
                })
                .sorted(Comparator.<Map<String, Object>>comparingInt(entry -> (Integer) entry.get("streak")).reversed()
                        .thenComparing(Comparator.<Map<String, Object>>comparingInt(entry -> (Integer) entry.get("points")).reversed())
                        .thenComparing(entry -> String.valueOf(entry.get("username"))))
                .limit(100)
                .toList();
    }

    @GetMapping("/chat")
    public List<Map<String, Object>> chat() {
        return db.queryForList("SELECT id, sender_username, sender_name, sender_role, message_text, created_at, kind, payload "
                        + "FROM chat_messages ORDER BY id DESC LIMIT 200").stream()
                .map(row -> {
                    String createdAt = UserRepository.isoInstant(row.get("created_at"));
                    Map<String, Object> message = new LinkedHashMap<>();
                    message.put("id", row.get("id"));
                    message.put("senderUsername", row.get("sender_username"));
                    message.put("senderName", row.get("sender_name"));
                    message.put("senderRole", row.get("sender_role"));
                    message.put("text", row.get("message_text"));
                    message.put("time", createdAt);
                    message.put("createdAt", createdAt);
                    message.put("kind", row.get("kind") == null ? "TEXT" : row.get("kind"));
                    message.put("payload", payload(row.get("payload")));
                    return message;
                })
                .toList();
    }

    @PostMapping("/chat")
    public Map<String, Object> postChat(@AuthenticationPrincipal AuthUser auth, @Valid @RequestBody ChatRequest request) {
        rateLimiter.check("chat:" + auth.email(), 20, Duration.ofMinutes(1));
        Map<String, Object> user = users.require(auth.email());
        db.update("INSERT INTO chat_messages(sender_username, sender_name, sender_role, message_text, sent_at) "
                        + "VALUES (?, ?, ?, ?, ?)",
                user.get("username"), user.get("full_name"), user.get("role"), request.text().trim(), Instant.now().toString());
        return Map.of("ok", true);
    }

    /** Își arată streak-ul în comunitate. Valoarea o pune serverul, deci nu poate fi umflată. */
    @PostMapping("/chat/streak")
    public Map<String, Object> shareStreak(@AuthenticationPrincipal AuthUser auth) {
        Map<String, Object> user = users.require(auth.email());
        int streak = users.effectiveStreak(user);
        if (streak <= 0) throw new ApiException(400, "Nu ai încă un streak de arătat. Finalizează o activitate azi.");
        rateLimiter.check("chat-streak:" + auth.email(), 3, Duration.ofHours(1));
        int points = UserRepository.intValue(user.get("points"));
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("streak", streak);
        details.put("points", points);
        String text = "🔥 Am un streak de " + streak + (streak == 1 ? " zi" : " zile") + " în Whatever!";
        db.update("INSERT INTO chat_messages(sender_username, sender_name, sender_role, message_text, sent_at, kind, payload) "
                        + "VALUES (?, ?, ?, ?, ?, 'STREAK', ?)",
                user.get("username"), user.get("full_name"), user.get("role"), text, Instant.now().toString(), write(details));
        return Map.of("ok", true, "streak", streak);
    }

    /** Administratorul șterge orice mesaj; ceilalți doar mesajele lor (nu și anunțurile botului). */
    @DeleteMapping("/chat/{id}")
    public Map<String, Object> deleteChat(@AuthenticationPrincipal AuthUser auth, @PathVariable long id) {
        if (!auth.isAdmin()) {
            List<Map<String, Object>> found = db.queryForList("SELECT sender_username, sender_role FROM chat_messages WHERE id = ?", id);
            if (found.isEmpty()) throw new ApiException(404, "Mesajul nu există.");
            String me = String.valueOf(users.require(auth.email()).get("username"));
            if ("SYSTEM".equals(found.get(0).get("sender_role")) || !me.equals(found.get(0).get("sender_username"))) {
                throw new ApiException(403, "Poți șterge doar mesajele tale.");
            }
        }
        db.update("DELETE FROM chat_messages WHERE id = ?", id);
        return Map.of("ok", true);
    }

    private Object payload(Object raw) {
        if (raw == null) return null;
        try {
            return json.readValue(raw.toString(), Map.class);
        } catch (JsonProcessingException e) {
            return null;
        }
    }

    private String write(Map<String, Object> value) {
        try {
            return json.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    public record ChatRequest(@NotBlank(message = "Mesajul este gol.") @Size(max = 2000, message = "Mesajul e prea lung.") String text) {
    }
}
