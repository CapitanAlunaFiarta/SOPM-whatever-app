package com.whatever.user.social;

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

/** Clasament, prieteni și chat global. Nu expune niciodată emailul altor utilizatori. */
@RestController
@RequestMapping("/api")
public class SocialController {
    private final JdbcTemplate db;
    private final UserRepository users;
    private final RateLimiter rateLimiter;

    public SocialController(JdbcTemplate db, UserRepository users, RateLimiter rateLimiter) {
        this.db = db;
        this.users = users;
        this.rateLimiter = rateLimiter;
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

    @GetMapping("/friends")
    public List<Map<String, Object>> friends(@AuthenticationPrincipal AuthUser auth) {
        String me = auth.email();
        return db.queryForList(
                "SELECT u.username, u.full_name, u.streak, u.last_streak_date, u.points, "
                        + "EXISTS (SELECT 1 FROM friends f WHERE f.user_email = ? AND f.friend_email = u.email) AS outgoing, "
                        + "EXISTS (SELECT 1 FROM friends f WHERE f.friend_email = ? AND f.user_email = u.email) AS incoming "
                        + "FROM users u WHERE u.email IN ("
                        + "  SELECT friend_email FROM friends WHERE user_email = ? "
                        + "  UNION SELECT user_email FROM friends WHERE friend_email = ?) "
                        + "ORDER BY u.username", me, me, me, me).stream()
                .map(row -> {
                    boolean outgoing = Boolean.TRUE.equals(row.get("outgoing"));
                    boolean incoming = Boolean.TRUE.equals(row.get("incoming"));
                    Map<String, Object> friend = new LinkedHashMap<>();
                    friend.put("username", row.get("username"));
                    friend.put("fullName", row.get("full_name"));
                    friend.put("streak", users.effectiveStreak(row));
                    friend.put("points", UserRepository.intValue(row.get("points")));
                    friend.put("direction", outgoing && incoming ? "mutual" : outgoing ? "outgoing" : "incoming");
                    return friend;
                })
                .toList();
    }

    @PostMapping("/friends")
    public Map<String, String> addFriend(@AuthenticationPrincipal AuthUser auth, @Valid @RequestBody FriendRequest request) {
        rateLimiter.check("friends:" + auth.email(), 30, Duration.ofMinutes(10));
        String username = request.username().trim().replaceFirst("^@", "");
        Map<String, Object> friend = users.findByUsername(username)
                .orElseThrow(() -> new ApiException(404, "Utilizatorul nu există."));
        if (auth.email().equals(friend.get("email"))) throw new ApiException(400, "Nu te poți adăuga singur.");
        db.update("INSERT INTO friends(user_email, friend_email) VALUES (?, ?) ON CONFLICT DO NOTHING",
                auth.email(), friend.get("email"));
        return Map.of("message", "Prieten adăugat.");
    }

    @DeleteMapping("/friends/{username}")
    public Map<String, String> removeFriend(@AuthenticationPrincipal AuthUser auth, @PathVariable String username) {
        Map<String, Object> friend = users.findByUsername(username.replaceFirst("^@", ""))
                .orElseThrow(() -> new ApiException(404, "Utilizatorul nu există."));
        db.update("DELETE FROM friends WHERE (user_email = ? AND friend_email = ?) OR (user_email = ? AND friend_email = ?)",
                auth.email(), friend.get("email"), friend.get("email"), auth.email());
        return Map.of("message", "Prieten șters.");
    }

    @GetMapping("/chat")
    public List<Map<String, Object>> chat() {
        return db.queryForList("SELECT id, sender_username, sender_name, sender_role, message_text, created_at "
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

    @DeleteMapping("/chat/{id}")
    public Map<String, Object> deleteChat(@AuthenticationPrincipal AuthUser auth, @PathVariable long id) {
        if (!auth.isAdmin()) throw new ApiException(403, "Acces interzis.");
        db.update("DELETE FROM chat_messages WHERE id = ?", id);
        return Map.of("ok", true);
    }

    public record FriendRequest(@NotBlank(message = "Scrie username-ul.") @Size(min = 2, max = 100) String username) {
    }

    public record ChatRequest(@NotBlank(message = "Mesajul este gol.") @Size(max = 2000, message = "Mesajul e prea lung.") String text) {
    }
}
