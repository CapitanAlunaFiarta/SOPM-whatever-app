package com.whatever.task.tasks;

import com.whatever.task.security.AuthUser;
import com.whatever.task.security.JwtService;
import com.whatever.task.web.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.SqlParameterValue;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Date;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Logica task-urilor. Operațiile care modifică streak-ul rulează în tranzacții cu rândurile
 * blocate (SELECT ... FOR UPDATE), iar tabela task_completions garantează o singură
 * finalizare pe task pe zi chiar și la cereri simultane.
 */
@Service
public class TaskService {
    private static final String TASK_SELECT = "SELECT t.*, o.username AS owner_username, o.full_name AS owner_name, "
            + "(SELECT max(c.completed_on) FROM task_completions c WHERE c.task_id = t.id) AS last_completed_on "
            + "FROM tasks t JOIN users o ON o.email = t.owner_email ";

    private final JdbcTemplate db;
    private final JwtService jwt;
    private final ZoneId zone;

    public TaskService(JdbcTemplate db, JwtService jwt, @Value("${app.timezone}") String timezone) {
        this.db = db;
        this.jwt = jwt;
        this.zone = ZoneId.of(timezone);
    }

    public LocalDate today() {
        return LocalDate.now(zone);
    }

    public List<Map<String, Object>> list(AuthUser user) {
        LocalDate today = today();
        return db.queryForList(TASK_SELECT
                        + "WHERE t.owner_email = ? OR (t.shared_with_friend <> '' AND t.shared_with_friend = "
                        + "(SELECT username FROM users WHERE email = ?)) ORDER BY t.id DESC",
                user.email(), user.email()).stream().map(row -> view(row, user, today)).toList();
    }

    @Transactional
    public Map<String, Object> create(AuthUser user, TaskController.TaskRequest request) {
        validateLocation(request);
        String friend = sharedWith(user, request.friend());
        Long id = db.queryForObject("INSERT INTO tasks(title, category, priority, status, is_recurring, requires_location, "
                        + "latitude, longitude, allowed_radius_meters, requires_biometrics, due_date, owner_email, shared_with_friend) "
                        + "VALUES (?, ?, ?, 'Upcoming', ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
                Long.class,
                request.title().trim(), TaskRules.category(request.category()), TaskRules.priority(request.priority()),
                request.isRecurring(), request.requiresLocation(), request.latitude(), request.longitude(), request.radius(),
                request.requiresBiometrics(), Date.valueOf(request.dueDate()), user.email(), friend);
        return find(id, user);
    }

    @Transactional
    public Map<String, Object> update(AuthUser user, long id, TaskController.TaskRequest request) {
        Map<String, Object> task = lockOwned(id, user);
        if (!"Upcoming".equals(task.get("status"))) {
            throw new ApiException(409, "Doar activitățile active pot fi editate.");
        }
        validateLocation(request);
        String friend = sharedWith(user, request.friend());
        db.update("UPDATE tasks SET title = ?, category = ?, priority = ?, is_recurring = ?, due_date = ?, shared_with_friend = ?, "
                        + "requires_location = ?, latitude = ?, longitude = ?, allowed_radius_meters = ?, requires_biometrics = ?, "
                        + "updated_at = now() WHERE id = ?",
                request.title().trim(), TaskRules.category(request.category()), TaskRules.priority(request.priority()),
                request.isRecurring(), Date.valueOf(request.dueDate()), friend, request.requiresLocation(),
                request.latitude(), request.longitude(), request.radius(), request.requiresBiometrics(), id);
        return find(id, user);
    }

    @Transactional
    public Map<String, Object> cancel(AuthUser user, long id) {
        Map<String, Object> task = lockOwned(id, user);
        if (!"Upcoming".equals(task.get("status"))) {
            throw new ApiException(409, "Doar activitățile active pot fi anulate.");
        }
        db.update("UPDATE tasks SET status = 'Canceled', canceled_at = now(), updated_at = now() WHERE id = ?", id);
        return find(id, user);
    }

    @Transactional
    public void delete(AuthUser user, long id) {
        if (db.update("DELETE FROM tasks WHERE id = ? AND owner_email = ?", id, user.email()) == 0) {
            throw new ApiException(404, "Activitatea nu există.");
        }
    }

    @Transactional
    public Map<String, Object> freeze(AuthUser user, long id) {
        LocalDate today = today();
        Map<String, Object> task = lockOwned(id, user);
        LocalDate due = localDate(task.get("due_date"));
        if (!"Upcoming".equals(task.get("status")) || due == null || !due.isBefore(today)) {
            throw new ApiException(409, "Doar activitățile restante pot fi înghețate.");
        }
        Map<String, Object> account = lockUser(user.email());
        int available = TaskRules.availableFreezes(intValue(account.get("streak_freezes_left")),
                localDate(account.get("freeze_month")), today);
        if (available <= 0) throw new ApiException(400, "Nu mai ai freeze-uri luna aceasta.");
        LocalDate lastActive = TaskRules.lastActiveAfterFreeze(localDate(account.get("last_streak_date")), today);
        db.update("UPDATE users SET streak_freezes_left = ?, freeze_month = ?, last_streak_date = ? WHERE email = ?",
                available - 1, Date.valueOf(today.withDayOfMonth(1)), dateParam(lastActive), user.email());
        db.update("UPDATE tasks SET due_date = ?, updated_at = now() WHERE id = ?", Date.valueOf(today), id);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("freezesLeft", available - 1);
        response.put("task", find(id, user));
        return response;
    }

    @Transactional
    public Map<String, Object> complete(AuthUser user, long id, TaskController.CompletionRequest request) {
        LocalDate today = today();
        Map<String, Object> task = lockOwned(id, user);
        String status = String.valueOf(task.get("status"));
        if ("Canceled".equals(status)) throw new ApiException(409, "Activitatea a fost anulată.");
        if ("Completed".equals(status)) throw new ApiException(409, "Activitatea este deja finalizată.");
        Integer doneToday = db.queryForObject("SELECT count(*) FROM task_completions WHERE task_id = ? AND completed_on = ?",
                Integer.class, id, Date.valueOf(today));
        if (doneToday != null && doneToday > 0) throw new ApiException(409, "Ai finalizat deja activitatea azi.");

        boolean locationVerified = false;
        if (Boolean.TRUE.equals(task.get("requires_location"))) {
            if (request.latitude() == null || request.longitude() == null) {
                throw new ApiException(400, "Locația ta este necesară pentru această activitate.");
            }
            if (Boolean.TRUE.equals(request.mocked())) {
                throw new ApiException(400, "Locația pare simulată. Oprește aplicațiile de locație falsă și încearcă din nou.");
            }
            double distance = TaskRules.distanceMeters(doubleValue(task.get("latitude")), doubleValue(task.get("longitude")),
                    request.latitude(), request.longitude());
            double accuracy = request.accuracy() == null ? 0 : Math.max(0, request.accuracy());
            double tolerance = Math.min(accuracy, TaskRules.MAX_ACCURACY_TOLERANCE_METERS);
            int radius = intValue(task.get("allowed_radius_meters"));
            if (distance - tolerance > radius) {
                throw new ApiException(400, "Ești la " + Math.round(distance) + " m de locația activității (raza permisă: "
                        + radius + " m).");
            }
            locationVerified = true;
        }

        boolean biometricVerified = false;
        if (Boolean.TRUE.equals(task.get("requires_biometrics"))) {
            if (!jwt.isValidBiometric(request.biometricToken(), user.email(), id)) {
                throw new ApiException(401, "Verificarea biometrică este necesară.");
            }
            biometricVerified = true;
        }

        db.update("INSERT INTO task_completions(task_id, user_email, completed_on, latitude, longitude, "
                        + "verified_location, verified_biometric) VALUES (?, ?, ?, ?, ?, ?, ?)",
                id, user.email(), Date.valueOf(today), new SqlParameterValue(Types.DOUBLE, request.latitude()),
                new SqlParameterValue(Types.DOUBLE, request.longitude()), locationVerified, biometricVerified);
        if (Boolean.TRUE.equals(task.get("is_recurring"))) {
            db.update("UPDATE tasks SET streak_count = streak_count + 1, status = 'Upcoming', due_date = ?, updated_at = now() "
                    + "WHERE id = ?", Date.valueOf(today.plusDays(1)), id);
        } else {
            db.update("UPDATE tasks SET streak_count = streak_count + 1, status = 'Completed', updated_at = now() WHERE id = ?", id);
        }

        Map<String, Object> account = lockUser(user.email());
        int streak = TaskRules.nextStreak(intValue(account.get("streak")), localDate(account.get("last_streak_date")), today);
        int freezes = TaskRules.availableFreezes(intValue(account.get("streak_freezes_left")),
                localDate(account.get("freeze_month")), today);
        int points = intValue(account.get("points")) + 1;
        db.update("UPDATE users SET streak = ?, last_streak_date = ?, points = ?, streak_freezes_left = ?, freeze_month = ? "
                        + "WHERE email = ?",
                streak, Date.valueOf(today), points, freezes, Date.valueOf(today.withDayOfMonth(1)), user.email());

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("task", find(id, user));
        response.put("streak", streak);
        response.put("points", points);
        response.put("freezesLeft", freezes);
        return response;
    }

    private Map<String, Object> find(long id, AuthUser user) {
        List<Map<String, Object>> rows = db.queryForList(TASK_SELECT + "WHERE t.id = ?", id);
        if (rows.isEmpty()) throw new ApiException(404, "Activitatea nu există.");
        return view(rows.get(0), user, today());
    }

    private Map<String, Object> lockOwned(long id, AuthUser user) {
        List<Map<String, Object>> rows = db.queryForList("SELECT * FROM tasks WHERE id = ? AND owner_email = ? FOR UPDATE",
                id, user.email());
        if (rows.isEmpty()) throw new ApiException(404, "Activitatea nu există.");
        return rows.get(0);
    }

    private Map<String, Object> lockUser(String email) {
        List<Map<String, Object>> rows = db.queryForList("SELECT * FROM users WHERE email = ? FOR UPDATE", email);
        if (rows.isEmpty()) throw new ApiException(401, "Sesiune invalida.");
        return rows.get(0);
    }

    private static void validateLocation(TaskController.TaskRequest request) {
        if (request.requiresLocation() && request.latitude() == 0 && request.longitude() == 0) {
            throw new ApiException(400, "Alege locația activității pe hartă.");
        }
    }

    /** O activitate poate fi partajată doar cu un prieten (în oricare direcție a prieteniei). */
    private String sharedWith(AuthUser user, String rawFriend) {
        String friend = rawFriend == null ? "" : rawFriend.trim().replaceFirst("^@", "");
        if (friend.isEmpty()) return "";
        Integer isFriend = db.queryForObject("SELECT count(*) FROM users u JOIN friends f "
                        + "ON (f.user_email = ? AND f.friend_email = u.email) OR (f.friend_email = ? AND f.user_email = u.email) "
                        + "WHERE u.username = ? AND u.email <> ?",
                Integer.class, user.email(), user.email(), friend, user.email());
        if (isFriend == null || isFriend == 0) {
            throw new ApiException(400, "Poți partaja activități doar cu prietenii tăi (adaugă-i din Comunitate).");
        }
        return friend;
    }

    private Map<String, Object> view(Map<String, Object> row, AuthUser user, LocalDate today) {
        LocalDate due = localDate(row.get("due_date"));
        LocalDate lastDone = localDate(row.get("last_completed_on"));
        String status = String.valueOf(row.get("status"));
        if ("Upcoming".equals(status) && due != null && due.isBefore(today)) status = "Overdue";
        Map<String, Object> task = new LinkedHashMap<>();
        task.put("id", row.get("id"));
        task.put("title", row.get("title"));
        task.put("category", row.get("category"));
        task.put("priority", row.get("priority"));
        task.put("status", status);
        task.put("isRecurring", Boolean.TRUE.equals(row.get("is_recurring")));
        task.put("streakCount", intValue(row.get("streak_count")));
        task.put("requiresLocation", Boolean.TRUE.equals(row.get("requires_location")));
        task.put("latitude", doubleValue(row.get("latitude")));
        task.put("longitude", doubleValue(row.get("longitude")));
        task.put("radius", intValue(row.get("allowed_radius_meters")));
        task.put("requiresBiometrics", Boolean.TRUE.equals(row.get("requires_biometrics")));
        task.put("dueDate", due == null ? null : due.toString());
        task.put("friend", row.get("shared_with_friend") == null ? "" : row.get("shared_with_friend"));
        task.put("isOwner", user.email().equals(row.get("owner_email")));
        task.put("ownerUsername", row.get("owner_username"));
        task.put("ownerName", row.get("owner_name"));
        task.put("lastCompletedOn", lastDone == null ? null : lastDone.toString());
        task.put("completedToday", today.equals(lastDone));
        return task;
    }

    private static SqlParameterValue dateParam(LocalDate value) {
        return new SqlParameterValue(Types.DATE, value == null ? null : Date.valueOf(value));
    }

    static LocalDate localDate(Object value) {
        if (value instanceof Date date) return date.toLocalDate();
        if (value instanceof LocalDate date) return date;
        if (value instanceof Timestamp timestamp) return timestamp.toLocalDateTime().toLocalDate();
        return null;
    }

    static int intValue(Object value) {
        return value instanceof Number number ? number.intValue() : 0;
    }

    static double doubleValue(Object value) {
        return value instanceof Number number ? number.doubleValue() : 0;
    }
}
