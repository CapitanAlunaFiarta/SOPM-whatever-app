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
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Logica activităților. Operațiile care modifică streak-ul rulează în tranzacții cu rândurile
 * blocate (SELECT ... FOR UPDATE), iar task_completions garantează o singură finalizare pe zi
 * pentru fiecare utilizator chiar și la cereri simultane.
 *
 * <p>Activitate de grup: proprietarul invită prieteni (task_participants). Cei care acceptă devin membri,
 * fiecare își confirmă singur partea (cu aceleași verificări de locație/biometrie) și primește streak
 * și puncte. O activitate unică se încheie când au confirmat toți membrii și nu mai e nicio invitație
 * fără răspuns; una zilnică trece la ziua următoare când au confirmat toți. Chatul activității se
 * deschide după prima acceptare și devine doar de citit la 5 zile după încheiere (sau anulare).
 */
@Service
public class TaskService {
    private static final String TASK_SELECT = "SELECT t.*, o.username AS owner_username, o.full_name AS owner_name "
            + "FROM tasks t JOIN users o ON o.email = t.owner_email ";
    /** Membrii unei activități: proprietarul și cei care au acceptat invitația. */
    private static final String MEMBERS = "SELECT owner_email AS email FROM tasks WHERE id = ? "
            + "UNION SELECT user_email FROM task_participants WHERE task_id = ? AND status = 'ACCEPTED'";

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

    /** Activitățile mele, cele la care sunt membru și invitațiile încă valabile. */
    public List<Map<String, Object>> list(AuthUser user) {
        return views(db.queryForList(TASK_SELECT
                + "WHERE t.owner_email = ? OR EXISTS (SELECT 1 FROM task_participants p WHERE p.task_id = t.id "
                + "AND p.user_email = ? AND (p.status = 'ACCEPTED' OR (p.status = 'INVITED' AND t.status = 'Upcoming'))) "
                + "ORDER BY t.id DESC", user.email(), user.email()), user);
    }

    @Transactional
    public Map<String, Object> create(AuthUser user, TaskController.TaskRequest request) {
        validateLocation(request);
        List<String> invited = friendEmails(user, TaskRules.invitedUsernames(request.participants(), request.friend()));
        Long id = db.queryForObject("INSERT INTO tasks(title, category, priority, status, is_recurring, requires_location, "
                        + "latitude, longitude, allowed_radius_meters, requires_biometrics, due_date, owner_email, shared_with_friend) "
                        + "VALUES (?, ?, ?, 'Upcoming', ?, ?, ?, ?, ?, ?, ?, ?, '') RETURNING id",
                Long.class,
                request.title().trim(), TaskRules.category(request.category()), TaskRules.priority(request.priority()),
                request.isRecurring(), request.requiresLocation(), request.latitude(), request.longitude(), request.radius(),
                request.requiresBiometrics(), Date.valueOf(request.dueDate()), user.email());
        for (String email : invited) {
            db.update("INSERT INTO task_participants(task_id, user_email) VALUES (?, ?)", id, email);
        }
        return find(id, user);
    }

    @Transactional
    public Map<String, Object> update(AuthUser user, long id, TaskController.TaskRequest request) {
        Map<String, Object> task = lockOwned(id, user);
        if (!"Upcoming".equals(task.get("status"))) {
            throw new ApiException(409, "Doar activitățile active pot fi editate.");
        }
        validateLocation(request);
        List<String> invited = friendEmails(user, TaskRules.invitedUsernames(request.participants(), request.friend()));
        db.update("UPDATE tasks SET title = ?, category = ?, priority = ?, is_recurring = ?, due_date = ?, "
                        + "requires_location = ?, latitude = ?, longitude = ?, allowed_radius_meters = ?, requires_biometrics = ?, "
                        + "updated_at = now() WHERE id = ?",
                request.title().trim(), TaskRules.category(request.category()), TaskRules.priority(request.priority()),
                request.isRecurring(), Date.valueOf(request.dueDate()), request.requiresLocation(),
                request.latitude(), request.longitude(), request.radius(), request.requiresBiometrics(), id);
        // Clienții vechi trimit doar „friend” (un singur prieten): atunci doar adăugăm, nu scoatem pe nimeni.
        syncParticipants(id, invited, request.participants() != null);
        settle(id);
        return find(id, user);
    }

    @Transactional
    public Map<String, Object> cancel(AuthUser user, long id) {
        Map<String, Object> task = lockOwned(id, user);
        if (!"Upcoming".equals(task.get("status"))) {
            throw new ApiException(409, "Doar activitățile active pot fi anulate.");
        }
        db.update("UPDATE tasks SET status = 'Canceled', canceled_at = now(), finished_at = now(), updated_at = now() "
                + "WHERE id = ?", id);
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

    /** Răspunsul unui prieten la invitație. După acceptare devine membru (vede chatul, poate confirma). */
    @Transactional
    public Map<String, Object> respond(AuthUser user, long id, boolean accept) {
        Map<String, Object> task = lockTask(id);
        List<String> status = db.queryForList("SELECT status FROM task_participants WHERE task_id = ? AND user_email = ? "
                + "FOR UPDATE", String.class, id, user.email());
        if (status.isEmpty()) throw new ApiException(404, "Activitatea nu există.");
        if (!"INVITED".equals(status.get(0)) || !"Upcoming".equals(task.get("status"))) {
            throw new ApiException(409, "Invitația nu mai este valabilă.");
        }
        db.update("UPDATE task_participants SET status = ?, responded_at = now() WHERE task_id = ? AND user_email = ?",
                accept ? "ACCEPTED" : "DECLINED", id, user.email());
        // Un refuz poate fi ultimul răspuns așteptat: dacă ceilalți au confirmat deja, activitatea se încheie.
        settle(id);
        if (!accept) return Map.of("ok", true);
        return find(id, user);
    }

    @Transactional
    public Map<String, Object> complete(AuthUser user, long id, TaskController.CompletionRequest request) {
        LocalDate today = today();
        Map<String, Object> task = lockTask(id);
        requireMember(task, user);
        String status = String.valueOf(task.get("status"));
        if ("Canceled".equals(status)) throw new ApiException(409, "Activitatea a fost anulată.");
        if ("Completed".equals(status)) throw new ApiException(409, "Activitatea este deja finalizată.");
        boolean recurring = Boolean.TRUE.equals(task.get("is_recurring"));
        Integer done = recurring
                ? db.queryForObject("SELECT count(*) FROM task_completions WHERE task_id = ? AND user_email = ? "
                + "AND completed_on = ?", Integer.class, id, user.email(), Date.valueOf(today))
                : db.queryForObject("SELECT count(*) FROM task_completions WHERE task_id = ? AND user_email = ?",
                Integer.class, id, user.email());
        if (done != null && done > 0) {
            throw new ApiException(409, recurring ? "Ai finalizat deja activitatea azi." : "Ai confirmat deja această activitate.");
        }

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
                        + "verified_location, verified_biometric, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                id, user.email(), Date.valueOf(today), new SqlParameterValue(Types.DOUBLE, request.latitude()),
                new SqlParameterValue(Types.DOUBLE, request.longitude()), locationVerified, biometricVerified,
                TaskRules.storedCategory(task.get("category")));
        settle(id);

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

    /** Mesajele din chatul activității (ultimele 200), pentru membri. */
    public List<Map<String, Object>> messages(AuthUser user, long id) {
        requireMember(findRow(id), user);
        List<Map<String, Object>> rows = new ArrayList<>(db.queryForList("SELECT m.id, m.body, m.created_at, m.sender_email, "
                + "u.username, u.full_name FROM task_messages m JOIN users u ON u.email = m.sender_email "
                + "WHERE m.task_id = ? ORDER BY m.id DESC LIMIT 200", id));
        Collections.reverse(rows);
        return rows.stream().map(row -> message(row, user)).toList();
    }

    @Transactional
    public Map<String, Object> sendMessage(AuthUser user, long id, String text) {
        Map<String, Object> task = findRow(id);
        requireMember(task, user);
        Integer accepted = db.queryForObject("SELECT count(*) FROM task_participants WHERE task_id = ? AND status = 'ACCEPTED'",
                Integer.class, id);
        if (accepted == null || accepted == 0) {
            throw new ApiException(409, "Chatul se deschide după ce un prieten acceptă invitația.");
        }
        Instant closesAt = TaskRules.chatClosesAt(instant(task.get("finished_at")));
        if (closesAt != null && Instant.now().isAfter(closesAt)) {
            throw new ApiException(409, "Chatul acestei activități s-a închis.");
        }
        String body = text == null ? "" : text.trim();
        if (body.isEmpty()) throw new ApiException(400, "Mesajul nu poate fi gol.");
        Long messageId = db.queryForObject("INSERT INTO task_messages(task_id, sender_email, body) VALUES (?, ?, ?) RETURNING id",
                Long.class, id, user.email(), body);
        return message(db.queryForMap("SELECT m.id, m.body, m.created_at, m.sender_email, u.username, u.full_name "
                + "FROM task_messages m JOIN users u ON u.email = m.sender_email WHERE m.id = ?", messageId), user);
    }

    /**
     * Recap lunar: câte activități ai finalizat în fiecare categorie. Se bazează pe task_completions,
     * deci include și activitățile șterse între timp (categoria e salvată la finalizare).
     */
    public Map<String, Object> recap(AuthUser user, String month) {
        YearMonth selected;
        try {
            selected = month == null || month.isBlank() ? YearMonth.from(today()) : YearMonth.parse(month.trim());
        } catch (DateTimeParseException e) {
            throw new ApiException(400, "Lună invalidă.");
        }
        Map<String, Integer> counts = new LinkedHashMap<>();
        TaskRules.CATEGORIES.forEach(key -> counts.put(key, 0));
        db.queryForList("SELECT COALESCE(c.category, t.category) AS category, count(*) AS total FROM task_completions c "
                        + "LEFT JOIN tasks t ON t.id = c.task_id WHERE c.user_email = ? AND c.completed_on >= ? "
                        + "AND c.completed_on < ? GROUP BY 1",
                user.email(), Date.valueOf(selected.atDay(1)), Date.valueOf(selected.plusMonths(1).atDay(1)))
                .forEach(row -> counts.merge(TaskRules.storedCategory(row.get("category")), intValue(row.get("total")),
                        Integer::sum));
        Integer previous = db.queryForObject("SELECT count(*) FROM task_completions WHERE user_email = ? "
                        + "AND completed_on >= ? AND completed_on < ?", Integer.class, user.email(),
                Date.valueOf(selected.minusMonths(1).atDay(1)), Date.valueOf(selected.atDay(1)));

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("month", selected.toString());
        response.put("total", counts.values().stream().mapToInt(Integer::intValue).sum());
        response.put("previousTotal", previous == null ? 0 : previous);
        response.put("categories", counts.entrySet().stream()
                .map(entry -> Map.<String, Object>of("category", entry.getKey(), "count", entry.getValue())).toList());
        return response;
    }

    /**
     * După o confirmare, un refuz sau o schimbare de participanți: dacă toți membrii și-au făcut partea și
     * nu mai așteptăm răspuns la nicio invitație, activitatea unică se încheie, iar cea zilnică trece pe mâine.
     * Rândul activității trebuie să fie deja blocat în tranzacția curentă.
     */
    private void settle(long id) {
        Map<String, Object> task = db.queryForMap("SELECT status, is_recurring, due_date FROM tasks WHERE id = ?", id);
        if (!"Upcoming".equals(task.get("status"))) return;
        Integer pending = db.queryForObject("SELECT count(*) FROM task_participants WHERE task_id = ? AND status = 'INVITED'",
                Integer.class, id);
        if (pending != null && pending > 0) return;
        LocalDate today = today();
        boolean recurring = Boolean.TRUE.equals(task.get("is_recurring"));
        Integer missing = db.queryForObject("SELECT count(*) FROM (" + MEMBERS + ") m WHERE NOT EXISTS ("
                        + "SELECT 1 FROM task_completions c WHERE c.task_id = ? AND c.user_email = m.email "
                        + "AND (? OR c.completed_on = ?))",
                Integer.class, id, id, id, !recurring, Date.valueOf(today));
        if (missing == null || missing > 0) return;
        if (!recurring) {
            db.update("UPDATE tasks SET streak_count = streak_count + 1, status = 'Completed', finished_at = now(), "
                    + "updated_at = now() WHERE id = ?", id);
            return;
        }
        LocalDate due = localDate(task.get("due_date"));
        if (due == null || !due.isAfter(today)) {
            db.update("UPDATE tasks SET streak_count = streak_count + 1, due_date = ?, updated_at = now() WHERE id = ?",
                    Date.valueOf(today.plusDays(1)), id);
        }
    }

    /**
     * Aduce invitațiile la lista dorită. Cine a refuzat și nu mai e în listă rămâne „refuzat”; cine a refuzat
     * și e din nou în listă primește o invitație nouă. Cu replace = false (clienți vechi) doar adăugăm.
     */
    private void syncParticipants(long id, List<String> emails, boolean replace) {
        Set<String> wanted = new LinkedHashSet<>(emails);
        for (Map<String, Object> row : db.queryForList("SELECT user_email, status FROM task_participants WHERE task_id = ?", id)) {
            String email = String.valueOf(row.get("user_email"));
            boolean keep = wanted.remove(email);
            if (keep && "DECLINED".equals(row.get("status"))) {
                db.update("UPDATE task_participants SET status = 'INVITED', invited_at = now(), responded_at = NULL "
                        + "WHERE task_id = ? AND user_email = ?", id, email);
            } else if (!keep && replace && !"DECLINED".equals(row.get("status"))) {
                db.update("DELETE FROM task_participants WHERE task_id = ? AND user_email = ?", id, email);
            }
        }
        for (String email : wanted) {
            db.update("INSERT INTO task_participants(task_id, user_email) VALUES (?, ?)", id, email);
        }
    }

    /** Emailurile prietenilor invitați (prietenia poate fi în oricare direcție); altfel 400. */
    private List<String> friendEmails(AuthUser user, List<String> usernames) {
        List<String> emails = new ArrayList<>();
        for (String username : usernames) {
            List<String> found = db.queryForList("SELECT u.email FROM users u JOIN friends f "
                            + "ON (f.user_email = ? AND f.friend_email = u.email) OR (f.friend_email = ? AND f.user_email = u.email) "
                            + "WHERE u.username = ? AND u.email <> ? LIMIT 1",
                    String.class, user.email(), user.email(), username, user.email());
            if (found.isEmpty()) {
                throw new ApiException(400, "Poți partaja activități doar cu prietenii tăi (adaugă-i din Comunitate).");
            }
            if (!emails.contains(found.get(0))) emails.add(found.get(0));
        }
        return emails;
    }

    private void requireMember(Map<String, Object> task, AuthUser user) {
        if (user.email().equals(task.get("owner_email"))) return;
        List<String> status = db.queryForList("SELECT status FROM task_participants WHERE task_id = ? AND user_email = ?",
                String.class, task.get("id"), user.email());
        if (status.isEmpty() || "DECLINED".equals(status.get(0))) throw new ApiException(404, "Activitatea nu există.");
        if (!"ACCEPTED".equals(status.get(0))) throw new ApiException(409, "Acceptă mai întâi invitația.");
    }

    private Map<String, Object> find(long id, AuthUser user) {
        List<Map<String, Object>> rows = db.queryForList(TASK_SELECT + "WHERE t.id = ?", id);
        if (rows.isEmpty()) throw new ApiException(404, "Activitatea nu există.");
        return views(rows, user).get(0);
    }

    private Map<String, Object> findRow(long id) {
        List<Map<String, Object>> rows = db.queryForList("SELECT * FROM tasks WHERE id = ?", id);
        if (rows.isEmpty()) throw new ApiException(404, "Activitatea nu există.");
        return rows.get(0);
    }

    private Map<String, Object> lockTask(long id) {
        List<Map<String, Object>> rows = db.queryForList("SELECT * FROM tasks WHERE id = ? FOR UPDATE", id);
        if (rows.isEmpty()) throw new ApiException(404, "Activitatea nu există.");
        return rows.get(0);
    }

    private Map<String, Object> lockOwned(long id, AuthUser user) {
        List<Map<String, Object>> rows = db.queryForList("SELECT * FROM tasks WHERE id = ? AND owner_email = ? FOR UPDATE",
                id, user.email());
        if (rows.isEmpty()) throw new ApiException(404, "Activitatea nu există.");
        return rows.get(0);
    }

    private Map<String, Object> lockUser(String email) {
        List<Map<String, Object>> rows = db.queryForList("SELECT * FROM users WHERE email = ? FOR UPDATE", email);
        if (rows.isEmpty()) throw new ApiException(401, "Sesiune invalidă.");
        return rows.get(0);
    }

    private static void validateLocation(TaskController.TaskRequest request) {
        if (request.requiresLocation() && request.latitude() == 0 && request.longitude() == 0) {
            throw new ApiException(400, "Alege locația activității pe hartă.");
        }
    }

    /** Vederile pentru mai multe activități, cu participanții, finalizările și mesajele citite o singură dată. */
    private List<Map<String, Object>> views(List<Map<String, Object>> rows, AuthUser user) {
        if (rows.isEmpty()) return List.of();
        LocalDate today = today();
        Object[] ids = rows.stream().map(row -> row.get("id")).toArray();
        String in = String.join(",", Collections.nCopies(ids.length, "?"));

        Map<Long, List<Map<String, Object>>> participants = new HashMap<>();
        db.queryForList("SELECT p.task_id, p.user_email, p.status, u.username, u.full_name FROM task_participants p "
                        + "JOIN users u ON u.email = p.user_email WHERE p.task_id IN (" + in + ") ORDER BY p.invited_at, u.username",
                ids).forEach(row -> participants.computeIfAbsent(longValue(row.get("task_id")), key -> new ArrayList<>()).add(row));
        Map<Long, Map<String, LocalDate>> lastDone = new HashMap<>();
        db.queryForList("SELECT task_id, user_email, max(completed_on) AS last_done FROM task_completions "
                        + "WHERE task_id IN (" + in + ") GROUP BY task_id, user_email", ids)
                .forEach(row -> lastDone.computeIfAbsent(longValue(row.get("task_id")), key -> new HashMap<>())
                        .put(String.valueOf(row.get("user_email")), localDate(row.get("last_done"))));
        Map<Long, Integer> messageCounts = new HashMap<>();
        db.queryForList("SELECT task_id, count(*) AS total FROM task_messages WHERE task_id IN (" + in + ") GROUP BY task_id", ids)
                .forEach(row -> messageCounts.put(longValue(row.get("task_id")), intValue(row.get("total"))));

        return rows.stream().map(row -> {
            long id = longValue(row.get("id"));
            return view(row, user, today, participants.getOrDefault(id, List.of()), lastDone.getOrDefault(id, Map.of()),
                    messageCounts.getOrDefault(id, 0));
        }).toList();
    }

    private Map<String, Object> view(Map<String, Object> row, AuthUser user, LocalDate today,
                                     List<Map<String, Object>> participants, Map<String, LocalDate> lastDone, int messageCount) {
        boolean recurring = Boolean.TRUE.equals(row.get("is_recurring"));
        String ownerEmail = String.valueOf(row.get("owner_email"));
        boolean isOwner = user.email().equals(ownerEmail);
        LocalDate due = localDate(row.get("due_date"));
        LocalDate myLast = lastDone.get(user.email());
        String status = String.valueOf(row.get("status"));
        if ("Upcoming".equals(status) && due != null && due.isBefore(today)) status = "Overdue";

        String myStatus = isOwner ? "OWNER" : "NONE";
        String legacyFriend = "";
        int members = 1;
        int confirmed = TaskRules.confirmed(lastDone.get(ownerEmail), recurring, today) ? 1 : 0;
        boolean anyAccepted = false;
        List<Map<String, Object>> people = new ArrayList<>();
        for (Map<String, Object> participant : participants) {
            String email = String.valueOf(participant.get("user_email"));
            String participantStatus = String.valueOf(participant.get("status"));
            boolean accepted = "ACCEPTED".equals(participantStatus);
            boolean done = accepted && TaskRules.confirmed(lastDone.get(email), recurring, today);
            if (email.equals(user.email())) myStatus = participantStatus;
            if (legacyFriend.isEmpty() && !"DECLINED".equals(participantStatus)) legacyFriend = String.valueOf(participant.get("username"));
            if (accepted) {
                anyAccepted = true;
                members++;
                if (done) confirmed++;
            }
            Map<String, Object> person = new LinkedHashMap<>();
            person.put("username", participant.get("username"));
            person.put("fullName", participant.get("full_name"));
            person.put("status", participantStatus);
            person.put("confirmed", done);
            people.add(person);
        }
        boolean member = isOwner || "ACCEPTED".equals(myStatus);
        Instant closesAt = TaskRules.chatClosesAt(instant(row.get("finished_at")));

        Map<String, Object> chat = new LinkedHashMap<>();
        chat.put("available", anyAccepted && member);
        chat.put("readOnly", closesAt != null && Instant.now().isAfter(closesAt));
        chat.put("closesAt", closesAt == null ? null : closesAt.toString());
        chat.put("messageCount", member ? messageCount : 0);

        Map<String, Object> task = new LinkedHashMap<>();
        task.put("id", row.get("id"));
        task.put("title", row.get("title"));
        task.put("category", TaskRules.storedCategory(row.get("category")));
        task.put("priority", row.get("priority"));
        task.put("status", status);
        task.put("isRecurring", recurring);
        task.put("streakCount", intValue(row.get("streak_count")));
        task.put("requiresLocation", Boolean.TRUE.equals(row.get("requires_location")));
        task.put("latitude", doubleValue(row.get("latitude")));
        task.put("longitude", doubleValue(row.get("longitude")));
        task.put("radius", intValue(row.get("allowed_radius_meters")));
        task.put("requiresBiometrics", Boolean.TRUE.equals(row.get("requires_biometrics")));
        task.put("dueDate", due == null ? null : due.toString());
        // „friend” rămâne pentru aplicațiile vechi (un singur prieten): primul invitat.
        task.put("friend", legacyFriend);
        task.put("isOwner", isOwner);
        task.put("ownerUsername", row.get("owner_username"));
        task.put("ownerName", row.get("owner_name"));
        task.put("lastCompletedOn", myLast == null ? null : myLast.toString());
        task.put("completedToday", today.equals(myLast));
        task.put("myStatus", myStatus);
        task.put("confirmedByMe", TaskRules.confirmed(myLast, recurring, today));
        task.put("participants", people);
        task.put("memberCount", members);
        task.put("confirmedCount", confirmed);
        task.put("chat", chat);
        return task;
    }

    private static Map<String, Object> message(Map<String, Object> row, AuthUser user) {
        Map<String, Object> message = new LinkedHashMap<>();
        message.put("id", row.get("id"));
        message.put("text", row.get("body"));
        message.put("createdAt", String.valueOf(instant(row.get("created_at"))));
        message.put("username", row.get("username"));
        message.put("fullName", row.get("full_name"));
        message.put("mine", user.email().equals(row.get("sender_email")));
        return message;
    }

    private static SqlParameterValue dateParam(LocalDate value) {
        return new SqlParameterValue(Types.DATE, value == null ? null : Date.valueOf(value));
    }

    static Instant instant(Object value) {
        if (value instanceof Timestamp timestamp) return timestamp.toInstant();
        if (value instanceof OffsetDateTime time) return time.toInstant();
        if (value instanceof Instant time) return time;
        return null;
    }

    static LocalDate localDate(Object value) {
        if (value instanceof Date date) return date.toLocalDate();
        if (value instanceof LocalDate date) return date;
        if (value instanceof Timestamp timestamp) return timestamp.toLocalDateTime().toLocalDate();
        return null;
    }

    static long longValue(Object value) {
        return value instanceof Number number ? number.longValue() : 0;
    }

    static int intValue(Object value) {
        return value instanceof Number number ? number.intValue() : 0;
    }

    static double doubleValue(Object value) {
        return value instanceof Number number ? number.doubleValue() : 0;
    }
}
