package com.whatever.user.social;

import com.whatever.user.profile.BadgeService;
import com.whatever.user.security.AuthUser;
import com.whatever.user.users.UserRepository;
import com.whatever.user.web.ApiException;
import com.whatever.user.web.RateLimiter;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Prieteni cu cerere și profiluri publice.
 *
 * <p>„Adaugă” trimite o cerere (rând PENDING de la cel care cere către celălalt), iar celălalt o acceptă sau o
 * refuză. Prietenia e un rând ACCEPTED în oricare direcție; prieteniile de dinainte de cereri rămân valabile.
 * Profilul public arată streak-ul, punctele și câte activități a finalizat cineva, niciodată emailul.
 */
@RestController
@RequestMapping("/api")
public class FriendController {
    /** Relația mea cu un alt utilizator. */
    static final String FRIEND = "FRIEND";
    static final String INCOMING = "INCOMING";
    static final String OUTGOING = "OUTGOING";
    static final String NONE = "NONE";
    static final String SELF = "SELF";

    private final JdbcTemplate db;
    private final UserRepository users;
    private final RateLimiter rateLimiter;
    private final BadgeService badges;

    public FriendController(JdbcTemplate db, UserRepository users, RateLimiter rateLimiter, BadgeService badges) {
        this.db = db;
        this.users = users;
        this.rateLimiter = rateLimiter;
        this.badges = badges;
    }

    /** Prietenii, cererile primite și cele trimise (status: FRIEND / INCOMING / OUTGOING). */
    @GetMapping("/friends")
    public List<Map<String, Object>> friends(@AuthenticationPrincipal AuthUser auth) {
        String me = auth.email();
        return db.queryForList(
                "SELECT u.username, u.full_name, u.streak, u.last_streak_date, u.points, u.avatar_updated_at, "
                        + "EXISTS (SELECT 1 FROM friends f WHERE f.status = 'ACCEPTED' AND ("
                        + "  (f.user_email = ? AND f.friend_email = u.email) OR (f.friend_email = ? AND f.user_email = u.email))) AS accepted, "
                        + "EXISTS (SELECT 1 FROM friends f WHERE f.status = 'PENDING' AND f.user_email = u.email "
                        + "  AND f.friend_email = ?) AS incoming "
                        + "FROM users u WHERE u.email IN ("
                        + "  SELECT friend_email FROM friends WHERE user_email = ? "
                        + "  UNION SELECT user_email FROM friends WHERE friend_email = ?) "
                        + "ORDER BY u.username", me, me, me, me, me).stream()
                .map(row -> {
                    String status = Boolean.TRUE.equals(row.get("accepted")) ? FRIEND
                            : Boolean.TRUE.equals(row.get("incoming")) ? INCOMING : OUTGOING;
                    Map<String, Object> friend = new LinkedHashMap<>();
                    friend.put("username", row.get("username"));
                    friend.put("fullName", row.get("full_name"));
                    friend.put("streak", users.effectiveStreak(row));
                    friend.put("points", UserRepository.intValue(row.get("points")));
                    friend.put("avatarVersion", UserRepository.avatarVersion(row.get("avatar_updated_at")));
                    friend.put("status", status);
                    // Pentru aplicațiile mai vechi, care știau doar de direcția adăugării.
                    friend.put("direction", FRIEND.equals(status) ? "mutual" : INCOMING.equals(status) ? "incoming" : "outgoing");
                    return friend;
                })
                .toList();
    }

    /**
     * Trimite o cerere de prietenie. Dacă celălalt ți-a trimis deja una, deveniți prieteni direct.
     * Întoarce relația rezultată: FRIEND sau OUTGOING (cerere în așteptare).
     */
    @PostMapping("/friends")
    @Transactional
    public Map<String, String> request(@AuthenticationPrincipal AuthUser auth, @Valid @RequestBody FriendRequest request) {
        rateLimiter.check("friends:" + auth.email(), 30, Duration.ofMinutes(10));
        String other = otherEmail(request.username());
        if (auth.email().equals(other)) throw new ApiException(400, "Nu te poți adăuga singur.");
        String relation = relation(auth.email(), other);
        if (INCOMING.equals(relation)) {
            accept(auth.email(), other);
            return Map.of("status", FRIEND, "message", "Ați devenit prieteni.");
        }
        if (NONE.equals(relation)) {
            db.update("INSERT INTO friends(user_email, friend_email, status) VALUES (?, ?, 'PENDING') ON CONFLICT DO NOTHING",
                    auth.email(), other);
            return Map.of("status", OUTGOING, "message", "Cererea de prietenie a fost trimisă.");
        }
        return Map.of("status", relation, "message", FRIEND.equals(relation)
                ? "Sunteți deja prieteni." : "Cererea de prietenie a fost trimisă.");
    }

    /** Accepți cererea primită de la {username}. */
    @PostMapping("/friends/{username}/accept")
    @Transactional
    public Map<String, String> acceptRequest(@AuthenticationPrincipal AuthUser auth, @PathVariable String username) {
        String other = otherEmail(username);
        if (!INCOMING.equals(relation(auth.email(), other))) {
            throw new ApiException(404, "Nu ai o cerere de prietenie de la acest utilizator.");
        }
        accept(auth.email(), other);
        return Map.of("status", FRIEND);
    }

    /** Refuzi cererea primită de la {username}; poate trimite alta mai târziu. */
    @PostMapping("/friends/{username}/decline")
    public Map<String, String> declineRequest(@AuthenticationPrincipal AuthUser auth, @PathVariable String username) {
        String other = otherEmail(username);
        if (db.update("DELETE FROM friends WHERE user_email = ? AND friend_email = ? AND status = 'PENDING'", other, auth.email()) == 0) {
            throw new ApiException(404, "Nu ai o cerere de prietenie de la acest utilizator.");
        }
        return Map.of("status", NONE);
    }

    /** Șterge prietenia, retrage cererea trimisă sau refuză cererea primită. */
    @DeleteMapping("/friends/{username}")
    public Map<String, String> removeFriend(@AuthenticationPrincipal AuthUser auth, @PathVariable String username) {
        String other = otherEmail(username);
        db.update("DELETE FROM friends WHERE (user_email = ? AND friend_email = ?) OR (user_email = ? AND friend_email = ?)",
                auth.email(), other, other, auth.email());
        return Map.of("status", NONE, "message", "Prieten șters.");
    }

    /** Profilul public al unui utilizator: streak, puncte, activități finalizate și relația cu tine. */
    @GetMapping("/profiles/{username}")
    public Map<String, Object> profile(@AuthenticationPrincipal AuthUser auth, @PathVariable String username) {
        Map<String, Object> row = users.findByUsername(username.replaceFirst("^@", ""))
                .orElseThrow(() -> new ApiException(404, "Utilizatorul nu există."));
        String email = String.valueOf(row.get("email"));
        Integer completed = db.queryForObject("SELECT count(*) FROM task_completions WHERE user_email = ?", Integer.class, email);
        Integer friendCount = db.queryForObject("SELECT count(DISTINCT CASE WHEN user_email = ? THEN friend_email ELSE user_email END) "
                + "FROM friends WHERE status = 'ACCEPTED' AND (user_email = ? OR friend_email = ?)", Integer.class, email, email, email);
        LocalDate since = UserRepository.localDate(row.get("created_at"));
        LocalDate last = UserRepository.localDate(row.get("last_streak_date"));

        Map<String, Object> profile = new LinkedHashMap<>();
        profile.put("username", row.get("username"));
        profile.put("fullName", row.get("full_name"));
        profile.put("role", row.get("role"));
        profile.put("streak", users.effectiveStreak(row));
        profile.put("points", UserRepository.intValue(row.get("points")));
        profile.put("completed", completed == null ? 0 : completed);
        profile.put("friends", friendCount == null ? 0 : friendCount);
        profile.put("memberSince", since == null ? null : since.toString());
        profile.put("lastActiveOn", last == null ? null : last.toString());
        profile.put("relation", auth.email().equals(email) ? SELF : relation(auth.email(), email));
        profile.put("bio", row.get("bio") == null ? "" : row.get("bio"));
        profile.put("avatarVersion", UserRepository.avatarVersion(row.get("avatar_updated_at")));
        profile.put("bestStreak", Math.max(UserRepository.intValue(row.get("best_streak")), users.effectiveStreak(row)));
        // Insignele: toate (cu progresul), aplicația le arată pe cele câștigate și, pe profilul meu, și pe celelalte.
        profile.put("badges", badges.badges(row));
        return profile;
    }

    /** Relația mea cu celălalt: FRIEND, INCOMING (mi-a cerut), OUTGOING (i-am cerut) sau NONE. */
    String relation(String me, String other) {
        List<Map<String, Object>> rows = db.queryForList("SELECT user_email, status FROM friends "
                + "WHERE (user_email = ? AND friend_email = ?) OR (user_email = ? AND friend_email = ?)", me, other, other, me);
        if (rows.stream().anyMatch(row -> "ACCEPTED".equals(row.get("status")))) return FRIEND;
        if (rows.stream().anyMatch(row -> other.equals(row.get("user_email")))) return INCOMING;
        return rows.isEmpty() ? NONE : OUTGOING;
    }

    private void accept(String me, String other) {
        db.update("UPDATE friends SET status = 'ACCEPTED', responded_at = now() "
                + "WHERE user_email = ? AND friend_email = ? AND status = 'PENDING'", other, me);
        // O cerere trimisă de mine în același timp devine inutilă.
        db.update("DELETE FROM friends WHERE user_email = ? AND friend_email = ? AND status = 'PENDING'", me, other);
    }

    private String otherEmail(String username) {
        String name = username == null ? "" : username.trim().replaceFirst("^@", "");
        Map<String, Object> other = users.findByUsername(name)
                .orElseThrow(() -> new ApiException(404, "Utilizatorul nu există."));
        return String.valueOf(other.get("email"));
    }

    public record FriendRequest(@NotBlank(message = "Scrie username-ul.") @Size(min = 2, max = 100) String username) {
    }
}
