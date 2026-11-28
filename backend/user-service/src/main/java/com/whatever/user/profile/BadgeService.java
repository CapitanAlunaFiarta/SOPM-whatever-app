package com.whatever.user.profile;

import com.whatever.user.users.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Adună din baza de date ce trebuie pentru insigne (o singură interogare plus categoriile). */
@Service
public class BadgeService {
    /** Categoriile vechi (de dinainte de migrarea 003), ca în task-service. */
    private static final Map<String, String> LEGACY = Map.of(
            "sport", "SPORT", "sănătate", "SPORT", "sanatate", "SPORT",
            "facultate", "STUDY", "proiect echipă", "STUDY", "proiect echipa", "STUDY");
    private static final List<String> KEYS = List.of("SPORT", "STUDY", "CHORES", "ENTERTAINMENT");

    private final JdbcTemplate db;
    private final UserRepository users;
    private final String timezone;

    public BadgeService(JdbcTemplate db, UserRepository users, @Value("${app.timezone}") String timezone) {
        this.db = db;
        this.users = users;
        this.timezone = timezone;
    }

    public List<Map<String, Object>> badges(Map<String, Object> user) {
        String email = String.valueOf(user.get("email"));
        Map<String, Object> row = db.queryForMap("SELECT "
                        + "(SELECT count(*) FROM task_completions WHERE user_email = ?) AS done, "
                        + "(SELECT count(*) FROM task_completions WHERE user_email = ? "
                        + "  AND extract(hour FROM completed_at AT TIME ZONE ?) < 8) AS early, "
                        + "(SELECT count(*) FROM task_completions WHERE user_email = ? "
                        + "  AND extract(hour FROM completed_at AT TIME ZONE ?) >= 22) AS late, "
                        + "(SELECT count(*) FROM favors WHERE doer_email = ? AND status = 'COMPLETED') AS favors, "
                        + "(SELECT count(*) FROM task_completions c WHERE c.user_email = ? AND c.task_id IS NOT NULL "
                        + "  AND EXISTS (SELECT 1 FROM task_participants p WHERE p.task_id = c.task_id AND p.status = 'ACCEPTED')) AS group_done, "
                        + "(SELECT COALESCE(max(members), 0) FROM (SELECT 1 + count(p.user_email) AS members FROM tasks t "
                        + "  LEFT JOIN task_participants p ON p.task_id = t.id AND p.status = 'ACCEPTED' "
                        + "  WHERE t.owner_email = ? GROUP BY t.id) grouped) AS biggest_group, "
                        + "(SELECT COALESCE(max(t.streak_count), 0) FROM tasks t WHERE t.is_recurring AND (t.owner_email = ? "
                        + "  OR EXISTS (SELECT 1 FROM task_participants p WHERE p.task_id = t.id AND p.user_email = ? "
                        + "  AND p.status = 'ACCEPTED'))) AS best_recurring, "
                        + "(SELECT count(DISTINCT CASE WHEN user_email = ? THEN friend_email ELSE user_email END) FROM friends "
                        + "  WHERE status = 'ACCEPTED' AND (user_email = ? OR friend_email = ?)) AS friends",
                email, email, timezone, email, timezone, email, email, email, email, email, email, email, email);
        Map<String, Integer> categories = new HashMap<>();
        db.queryForList("SELECT COALESCE(c.category, t.category) AS category, count(*) AS total FROM task_completions c "
                        + "LEFT JOIN tasks t ON t.id = c.task_id WHERE c.user_email = ? GROUP BY 1", email)
                .forEach(item -> categories.merge(categoryKey(item.get("category")), UserRepository.intValue(item.get("total")),
                        Integer::sum));
        int best = Math.max(UserRepository.intValue(user.get("best_streak")), users.effectiveStreak(user));
        return Badges.evaluate(new Badges.Stats(
                UserRepository.intValue(row.get("done")), best, categories, UserRepository.intValue(row.get("friends")),
                UserRepository.intValue(row.get("favors")), UserRepository.intValue(row.get("group_done")),
                UserRepository.intValue(row.get("biggest_group")), UserRepository.intValue(row.get("early")),
                UserRepository.intValue(row.get("late")), UserRepository.intValue(row.get("best_recurring"))));
    }

    static String categoryKey(Object value) {
        String category = value == null ? "" : value.toString().trim();
        for (String key : KEYS) {
            if (key.equalsIgnoreCase(category)) return key;
        }
        return LEGACY.getOrDefault(category.toLowerCase(Locale.ROOT), "CHORES");
    }
}
