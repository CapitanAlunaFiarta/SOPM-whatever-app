package com.whatever.user.social;

import com.whatever.user.security.AuthUser;
import com.whatever.user.users.UserRepository;
import com.whatever.user.web.ApiException;
import com.whatever.user.web.RateLimiter;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.SqlParameterValue;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.sql.Types;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Mesajele private: doar între prieteni (cererea de prietenie acceptată). Conversațiile rămân vizibile și după ce
 * prietenia se încheie, dar nu se mai poate scrie. Deschiderea conversației marchează mesajele primite ca citite.
 */
@RestController
@RequestMapping("/api/dm")
public class DirectMessageController {
    private static final String MESSAGE_SELECT = "SELECT m.id, m.body, m.created_at, m.sender_email, m.read_at, "
            + "s.username, s.full_name, s.avatar_updated_at, r.id AS reply_id, rs.username AS reply_username, "
            + "rs.full_name AS reply_name, r.body AS reply_text FROM direct_messages m "
            + "JOIN users s ON s.email = m.sender_email "
            + "LEFT JOIN direct_messages r ON r.id = m.reply_to LEFT JOIN users rs ON rs.email = r.sender_email ";

    private final JdbcTemplate db;
    private final UserRepository users;
    private final RateLimiter rateLimiter;

    public DirectMessageController(JdbcTemplate db, UserRepository users, RateLimiter rateLimiter) {
        this.db = db;
        this.users = users;
        this.rateLimiter = rateLimiter;
    }

    /** Conversațiile mele, cu ultimul mesaj și câte mesaje necitite am de la fiecare (cele mai recente primele). */
    @GetMapping
    public List<Map<String, Object>> conversations(@AuthenticationPrincipal AuthUser auth) {
        String me = auth.email();
        Map<String, Integer> unread = new HashMap<>();
        db.queryForList("SELECT sender_email, count(*) AS total FROM direct_messages WHERE recipient_email = ? AND read_at IS NULL "
                + "GROUP BY sender_email", me).forEach(row -> unread.put(String.valueOf(row.get("sender_email")),
                UserRepository.intValue(row.get("total"))));
        return db.queryForList("SELECT lm.*, u.username, u.full_name, u.avatar_updated_at, "
                        + "EXISTS (SELECT 1 FROM friends f WHERE f.status = 'ACCEPTED' AND ((f.user_email = ? AND f.friend_email = lm.other) "
                        + "  OR (f.friend_email = ? AND f.user_email = lm.other))) AS friends "
                        + "FROM (SELECT DISTINCT ON (other) other, id, body, created_at, sender_email FROM ("
                        + "  SELECT m.*, CASE WHEN m.sender_email = ? THEN m.recipient_email ELSE m.sender_email END AS other "
                        + "  FROM direct_messages m WHERE m.sender_email = ? OR m.recipient_email = ?) mine "
                        + "  ORDER BY other, id DESC) lm JOIN users u ON u.email = lm.other "
                        + "ORDER BY lm.id DESC LIMIT 50", me, me, me, me, me).stream()
                .map(row -> {
                    Map<String, Object> last = new LinkedHashMap<>();
                    last.put("id", row.get("id"));
                    last.put("text", row.get("body"));
                    last.put("createdAt", UserRepository.isoInstant(row.get("created_at")));
                    last.put("mine", me.equals(row.get("sender_email")));
                    Map<String, Object> conversation = new LinkedHashMap<>();
                    conversation.put("username", row.get("username"));
                    conversation.put("fullName", row.get("full_name"));
                    conversation.put("avatarVersion", UserRepository.avatarVersion(row.get("avatar_updated_at")));
                    conversation.put("canWrite", Boolean.TRUE.equals(row.get("friends")));
                    conversation.put("unread", unread.getOrDefault(String.valueOf(row.get("other")), 0));
                    conversation.put("lastMessage", last);
                    return conversation;
                })
                .toList();
    }

    /** Conversația cu {username}: ultimele 200 de mesaje (cele mai vechi primele). Mesajele primite devin citite. */
    @GetMapping("/{username}")
    @Transactional
    public Map<String, Object> conversation(@AuthenticationPrincipal AuthUser auth, @PathVariable String username) {
        Map<String, Object> other = other(auth, username);
        String otherEmail = String.valueOf(other.get("email"));
        List<Map<String, Object>> rows = new ArrayList<>(db.queryForList(MESSAGE_SELECT
                + "WHERE (m.sender_email = ? AND m.recipient_email = ?) OR (m.sender_email = ? AND m.recipient_email = ?) "
                + "ORDER BY m.id DESC LIMIT 200", auth.email(), otherEmail, otherEmail, auth.email()));
        Collections.reverse(rows);
        db.update("UPDATE direct_messages SET read_at = now() WHERE sender_email = ? AND recipient_email = ? AND read_at IS NULL",
                otherEmail, auth.email());
        Map<Long, List<Map<String, Object>>> reactions = Reactions.load(db, Reactions.DIRECT,
                rows.stream().map(row -> ((Number) row.get("id")).longValue()).toList(), auth.email());

        Map<String, Object> person = new LinkedHashMap<>();
        person.put("username", other.get("username"));
        person.put("fullName", other.get("full_name"));
        person.put("avatarVersion", UserRepository.avatarVersion(other.get("avatar_updated_at")));
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("with", person);
        response.put("canWrite", friends(auth.email(), otherEmail));
        response.put("messages", rows.stream().map(row -> message(row, auth.email(), reactions)).toList());
        return response;
    }

    @PostMapping("/{username}")
    @Transactional
    public Map<String, Object> send(@AuthenticationPrincipal AuthUser auth, @PathVariable String username,
                                    @Valid @RequestBody DirectMessageRequest request) {
        rateLimiter.check("dm:" + auth.email(), 30, Duration.ofMinutes(1));
        Map<String, Object> other = other(auth, username);
        String otherEmail = String.valueOf(other.get("email"));
        if (!friends(auth.email(), otherEmail)) {
            throw new ApiException(403, "Poți scrie mesaje private doar prietenilor.");
        }
        if (request.replyTo() != null) {
            Integer found = db.queryForObject("SELECT count(*) FROM direct_messages WHERE id = ? AND ((sender_email = ? "
                    + "AND recipient_email = ?) OR (sender_email = ? AND recipient_email = ?))", Integer.class,
                    request.replyTo(), auth.email(), otherEmail, otherEmail, auth.email());
            if (found == null || found == 0) throw new ApiException(404, "Mesajul la care răspunzi nu mai există.");
        }
        Long id = db.queryForObject("INSERT INTO direct_messages(sender_email, recipient_email, body, reply_to) VALUES (?, ?, ?, ?) "
                + "RETURNING id", Long.class, auth.email(), otherEmail, request.text().strip(),
                new SqlParameterValue(Types.BIGINT, request.replyTo()));
        Map<String, Object> row = db.queryForMap(MESSAGE_SELECT + "WHERE m.id = ?", id);
        return message(row, auth.email(), Map.of());
    }

    /** Reacția mea la un mesaj din conversațiile mele (aceeași a doua oară o scoate). */
    @PostMapping("/messages/{id}/reactions")
    public Map<String, Object> react(@AuthenticationPrincipal AuthUser auth, @PathVariable long id,
                                     @Valid @RequestBody SocialController.ReactionRequest request) {
        rateLimiter.check("react:" + auth.email(), 60, Duration.ofMinutes(1));
        String emoji = Reactions.emoji(request.emoji());
        requireMine(auth, id, false);
        Reactions.toggle(db, Reactions.DIRECT, id, auth.email(), emoji);
        return Map.of("id", id, "reactions", Reactions.load(db, Reactions.DIRECT, List.of(id), auth.email()).getOrDefault(id, List.of()));
    }

    /** Îmi șterg un mesaj trimis (dispare și pentru celălalt). */
    @DeleteMapping("/messages/{id}")
    public Map<String, Object> delete(@AuthenticationPrincipal AuthUser auth, @PathVariable long id) {
        requireMine(auth, id, true);
        db.update("DELETE FROM direct_messages WHERE id = ?", id);
        return Map.of("ok", true);
    }

    private void requireMine(AuthUser auth, long id, boolean sentByMe) {
        List<Map<String, Object>> rows = db.queryForList("SELECT sender_email, recipient_email FROM direct_messages WHERE id = ?", id);
        if (rows.isEmpty()) throw new ApiException(404, "Mesajul nu există.");
        boolean sender = auth.email().equals(rows.get(0).get("sender_email"));
        boolean recipient = auth.email().equals(rows.get(0).get("recipient_email"));
        if (!sender && !recipient) throw new ApiException(404, "Mesajul nu există.");
        if (sentByMe && !sender) throw new ApiException(403, "Poți șterge doar mesajele tale.");
    }

    private Map<String, Object> other(AuthUser auth, String username) {
        String name = username == null ? "" : username.strip().replaceFirst("^@", "");
        Map<String, Object> other = users.findByUsername(name).orElseThrow(() -> new ApiException(404, "Utilizatorul nu există."));
        if (auth.email().equals(other.get("email"))) throw new ApiException(400, "Nu îți poți scrie singur.");
        return other;
    }

    private boolean friends(String me, String other) {
        Boolean accepted = db.queryForObject("SELECT EXISTS (SELECT 1 FROM friends WHERE status = 'ACCEPTED' AND ("
                + "(user_email = ? AND friend_email = ?) OR (user_email = ? AND friend_email = ?)))", Boolean.class, me, other, other, me);
        return Boolean.TRUE.equals(accepted);
    }

    private static Map<String, Object> message(Map<String, Object> row, String me, Map<Long, List<Map<String, Object>>> reactions) {
        Map<String, Object> message = new LinkedHashMap<>();
        message.put("id", row.get("id"));
        message.put("text", row.get("body"));
        message.put("createdAt", UserRepository.isoInstant(row.get("created_at")));
        message.put("username", row.get("username"));
        message.put("fullName", row.get("full_name"));
        message.put("avatarVersion", UserRepository.avatarVersion(row.get("avatar_updated_at")));
        message.put("mine", me.equals(row.get("sender_email")));
        // Pentru mesajele mele: dacă le-a văzut celălalt.
        message.put("read", row.get("read_at") != null);
        message.put("replyTo", Reactions.reply(row.get("reply_id"), row.get("reply_username"), row.get("reply_name"), row.get("reply_text")));
        message.put("reactions", reactions.getOrDefault(((Number) row.get("id")).longValue(), List.of()));
        return message;
    }

    public record DirectMessageRequest(
            @NotBlank(message = "Mesajul este gol.") @Size(max = 2000, message = "Mesajul e prea lung.") String text,
            Long replyTo) {
    }
}
