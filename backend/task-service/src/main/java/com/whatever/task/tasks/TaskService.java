package com.whatever.task.tasks;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.whatever.task.push.Notes;
import com.whatever.task.push.PushService;
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
 *
 * <p>Organizatorul poate trimite activitatea în chatul comunității. Oricine o vede acolo poate cere să participe
 * (task_join_requests), iar organizatorul aprobă sau refuză. O activitate are cel mult 30 de membri.
 */
@Service
public class TaskService {
    private static final String TASK_SELECT = "SELECT t.*, o.username AS owner_username, o.full_name AS owner_name, "
            + "o.avatar_updated_at AS owner_avatar FROM tasks t JOIN users o ON o.email = t.owner_email ";
    /** Membrii unei activități: proprietarul și cei care au acceptat invitația. */
    private static final String MEMBERS = "SELECT owner_email AS email FROM tasks WHERE id = ? "
            + "UNION SELECT user_email FROM task_participants WHERE task_id = ? AND status = 'ACCEPTED'";

    private final JdbcTemplate db;
    private final JwtService jwt;
    private final ObjectMapper json;
    private final ZoneId zone;
    private final PushService push;

    public TaskService(JdbcTemplate db, JwtService jwt, ObjectMapper json, @Value("${app.timezone}") String timezone,
                       PushService push) {
        this.db = db;
        this.jwt = jwt;
        this.json = json;
        this.zone = ZoneId.of(timezone);
        this.push = push;
    }

    /** Numele complet al cuiva (pentru textul notificărilor). */
    String nameOf(String email) {
        List<String> names = db.queryForList("SELECT full_name FROM users WHERE email = ?", String.class, email);
        return names.isEmpty() ? "" : names.get(0);
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
        String unit = TaskRules.repeatUnit(request.repeatUnit());
        int every = TaskRules.repeatEvery(request.repeatEvery(), unit);
        List<String> invited = inviteeEmails(user, TaskRules.invitedUsernames(request.participants(), request.friend()), null);
        Long id = db.queryForObject("INSERT INTO tasks(title, category, priority, status, is_recurring, requires_location, "
                        + "latitude, longitude, allowed_radius_meters, requires_biometrics, due_date, owner_email, shared_with_friend, "
                        + "description, repeat_every, repeat_unit) "
                        + "VALUES (?, ?, ?, 'Upcoming', ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?) RETURNING id",
                Long.class,
                request.title().trim(), TaskRules.category(request.category()), TaskRules.priority(request.priority()),
                request.isRecurring(), request.requiresLocation(), request.latitude(), request.longitude(), request.radius(),
                request.requiresBiometrics(), Date.valueOf(request.dueDate()), user.email(),
                TaskRules.description(request.description()), every, unit);
        for (String email : invited) {
            db.update("INSERT INTO task_participants(task_id, user_email) VALUES (?, ?)", id, email);
        }
        push.notify(invited, PushService.Kind.INVITATIONS, Notes.invite(nameOf(user.email()), request.title().trim(), id));
        return find(id, user);
    }

    @Transactional
    public Map<String, Object> update(AuthUser user, long id, TaskController.TaskRequest request) {
        Map<String, Object> task = lockOwned(id, user);
        if (!"Upcoming".equals(task.get("status"))) {
            throw new ApiException(409, "Doar activitățile active pot fi editate.");
        }
        validateLocation(request);
        // Clienții vechi nu știu de descriere și de interval: atunci rămân cele salvate.
        String unit = request.repeatUnit() == null ? String.valueOf(task.get("repeat_unit")) : TaskRules.repeatUnit(request.repeatUnit());
        int every = TaskRules.repeatEvery(request.repeatEvery() == null ? intValue(task.get("repeat_every")) : request.repeatEvery(), unit);
        String description = request.description() == null
                ? String.valueOf(task.get("description") == null ? "" : task.get("description"))
                : TaskRules.description(request.description());
        List<String> invited = inviteeEmails(user, TaskRules.invitedUsernames(request.participants(), request.friend()), id);
        db.update("UPDATE tasks SET title = ?, category = ?, priority = ?, is_recurring = ?, due_date = ?, "
                        + "requires_location = ?, latitude = ?, longitude = ?, allowed_radius_meters = ?, requires_biometrics = ?, "
                        + "description = ?, repeat_every = ?, repeat_unit = ?, updated_at = now() WHERE id = ?",
                request.title().trim(), TaskRules.category(request.category()), TaskRules.priority(request.priority()),
                request.isRecurring(), Date.valueOf(request.dueDate()), request.requiresLocation(),
                request.latitude(), request.longitude(), request.radius(), request.requiresBiometrics(),
                description, every, unit, id);
        // Clienții vechi trimit doar „friend” (un singur prieten): atunci doar adăugăm, nu scoatem pe nimeni.
        List<String> newlyInvited = syncParticipants(id, invited, request.participants() != null);
        push.notify(newlyInvited, PushService.Kind.INVITATIONS, Notes.invite(nameOf(user.email()), request.title().trim(), id));
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
        push.notify(String.valueOf(task.get("owner_email")), PushService.Kind.INVITATIONS,
                Notes.inviteAccepted(nameOf(user.email()), String.valueOf(task.get("title")), id));
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
        // O activitate recurentă se confirmă din ziua în care revine (ex. una săptămânală, o dată pe săptămână).
        LocalDate due = localDate(task.get("due_date"));
        if (recurring && due != null && due.isAfter(today)) {
            throw new ApiException(409, "Activitatea poate fi confirmată din " + due + ".");
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

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("task", find(id, user));
        response.putAll(credit(user.email(), today));
        return response;
    }

    /**
     * După o finalizare (activitate sau favor): streak-ul crește dacă ieri a fost o zi activă, se adaugă un
     * punct, iar freeze-urile se reîncarcă la începutul lunii. Întoarce streak, points și freezesLeft.
     */
    Map<String, Integer> credit(String email, LocalDate today) {
        Map<String, Object> account = lockUser(email);
        int streak = TaskRules.nextStreak(intValue(account.get("streak")), localDate(account.get("last_streak_date")), today);
        int freezes = TaskRules.availableFreezes(intValue(account.get("streak_freezes_left")),
                localDate(account.get("freeze_month")), today);
        int points = intValue(account.get("points")) + 1;
        db.update("UPDATE users SET streak = ?, best_streak = GREATEST(best_streak, ?), last_streak_date = ?, points = ?, "
                        + "streak_freezes_left = ?, freeze_month = ? WHERE email = ?",
                streak, streak, Date.valueOf(today), points, freezes, Date.valueOf(today.withDayOfMonth(1)), email);
        Map<String, Integer> result = new LinkedHashMap<>();
        result.put("streak", streak);
        result.put("points", points);
        result.put("freezesLeft", freezes);
        return result;
    }

    private static final String MESSAGE_SELECT = "SELECT m.id, m.body, m.created_at, m.sender_email, u.username, u.full_name, "
            + "u.avatar_updated_at, r.id AS reply_id, ru.username AS reply_username, ru.full_name AS reply_name, r.body AS reply_text "
            + "FROM task_messages m JOIN users u ON u.email = m.sender_email "
            + "LEFT JOIN task_messages r ON r.id = m.reply_to LEFT JOIN users ru ON ru.email = r.sender_email ";

    /** Mesajele din chatul activității (ultimele 200, cele mai vechi primele), cu citatul răspunsului și reacțiile. */
    public List<Map<String, Object>> messages(AuthUser user, long id) {
        requireMember(findRow(id), user);
        List<Map<String, Object>> rows = new ArrayList<>(db.queryForList(MESSAGE_SELECT
                + "WHERE m.task_id = ? ORDER BY m.id DESC LIMIT 200", id));
        Collections.reverse(rows);
        Map<Long, List<Map<String, Object>>> reactions = Reactions.load(db, Reactions.TASK,
                rows.stream().map(row -> longValue(row.get("id"))).toList(), user.email());
        return rows.stream().map(row -> message(row, user, reactions)).toList();
    }

    @Transactional
    public Map<String, Object> sendMessage(AuthUser user, long id, String text, Long replyTo) {
        Map<String, Object> task = findRow(id);
        requireMember(task, user);
        Integer accepted = db.queryForObject("SELECT count(*) FROM task_participants WHERE task_id = ? AND status = 'ACCEPTED'",
                Integer.class, id);
        if (accepted == null || accepted == 0) {
            throw new ApiException(409, "Chatul se deschide după ce un prieten acceptă invitația.");
        }
        requireOpenChat(task);
        String body = text == null ? "" : text.trim();
        if (body.isEmpty()) throw new ApiException(400, "Mesajul nu poate fi gol.");
        if (replyTo != null) {
            Integer found = db.queryForObject("SELECT count(*) FROM task_messages WHERE id = ? AND task_id = ?", Integer.class, replyTo, id);
            if (found == null || found == 0) throw new ApiException(404, "Mesajul la care răspunzi nu mai există.");
        }
        Long messageId = db.queryForObject("INSERT INTO task_messages(task_id, sender_email, body, reply_to) VALUES (?, ?, ?, ?) RETURNING id",
                Long.class, id, user.email(), body, new SqlParameterValue(Types.BIGINT, replyTo));
        List<String> others = new ArrayList<>(db.queryForList("SELECT user_email FROM task_participants WHERE task_id = ? "
                + "AND status = 'ACCEPTED' AND user_email <> ?", String.class, id, user.email()));
        if (!user.email().equals(task.get("owner_email"))) others.add(String.valueOf(task.get("owner_email")));
        push.notify(others, PushService.Kind.MESSAGES, Notes.taskMessage(nameOf(user.email()), String.valueOf(task.get("title")), body, id));
        return message(db.queryForMap(MESSAGE_SELECT + "WHERE m.id = ?", messageId), user, Map.of());
    }

    /**
     * Reacția mea la un mesaj din chatul activității (aceeași a doua oară o scoate), cât timp chatul e deschis.
     * Întoarce reacțiile mesajului.
     */
    @Transactional
    public Map<String, Object> react(AuthUser user, long id, long messageId, String emoji) {
        String value = Reactions.emoji(emoji);
        Map<String, Object> task = findRow(id);
        requireMember(task, user);
        requireOpenChat(task);
        Integer found = db.queryForObject("SELECT count(*) FROM task_messages WHERE id = ? AND task_id = ?", Integer.class, messageId, id);
        if (found == null || found == 0) throw new ApiException(404, "Mesajul nu există.");
        Reactions.toggle(db, Reactions.TASK, messageId, user.email(), value);
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("id", messageId);
        response.put("reactions", Reactions.load(db, Reactions.TASK, List.of(messageId), user.email()).getOrDefault(messageId, List.of()));
        return response;
    }

    /** Îmi șterg un mesaj din chatul activității (cât timp chatul e deschis). */
    @Transactional
    public void deleteMessage(AuthUser user, long id, long messageId) {
        Map<String, Object> task = findRow(id);
        requireMember(task, user);
        List<String> sender = db.queryForList("SELECT sender_email FROM task_messages WHERE id = ? AND task_id = ?", String.class, messageId, id);
        if (sender.isEmpty()) throw new ApiException(404, "Mesajul nu există.");
        if (!user.email().equals(sender.get(0))) throw new ApiException(403, "Poți șterge doar mesajele tale.");
        requireOpenChat(task);
        db.update("DELETE FROM task_messages WHERE id = ?", messageId);
    }

    private static void requireOpenChat(Map<String, Object> task) {
        Instant closesAt = TaskRules.chatClosesAt(instant(task.get("finished_at")));
        if (closesAt != null && Instant.now().isAfter(closesAt)) {
            throw new ApiException(409, "Chatul acestei activități s-a închis.");
        }
    }

    /**
     * Chaturile activităților în care sunt membru, cu ultimul mesaj (cele mai recente primele). Un chat există
     * după ce măcar un invitat a acceptat; cele închise (doar de citit) rămân în listă.
     */
    public List<Map<String, Object>> chats(AuthUser user) {
        List<Map<String, Object>> rows = db.queryForList("SELECT t.id, t.title, t.category, t.status, t.due_date, t.finished_at, "
                + "(SELECT count(*) FROM task_participants p WHERE p.task_id = t.id AND p.status = 'ACCEPTED') AS accepted, "
                + "(SELECT count(*) FROM task_messages m WHERE m.task_id = t.id) AS message_count, "
                + "lm.id AS last_id, lm.body AS last_body, lm.created_at AS last_at, lm.sender_email AS last_sender, "
                + "lu.username AS last_username, lu.full_name AS last_name "
                + "FROM tasks t "
                + "LEFT JOIN LATERAL (SELECT m.id, m.body, m.created_at, m.sender_email FROM task_messages m "
                + "  WHERE m.task_id = t.id ORDER BY m.id DESC LIMIT 1) lm ON true "
                + "LEFT JOIN users lu ON lu.email = lm.sender_email "
                + "WHERE (t.owner_email = ? OR EXISTS (SELECT 1 FROM task_participants p WHERE p.task_id = t.id "
                + "  AND p.user_email = ? AND p.status = 'ACCEPTED')) "
                + "AND EXISTS (SELECT 1 FROM task_participants p WHERE p.task_id = t.id AND p.status = 'ACCEPTED') "
                + "ORDER BY COALESCE(lm.created_at, t.updated_at) DESC LIMIT 50", user.email(), user.email());
        LocalDate today = today();
        return rows.stream().map(row -> {
            Instant closesAt = TaskRules.chatClosesAt(instant(row.get("finished_at")));
            LocalDate due = localDate(row.get("due_date"));
            String status = String.valueOf(row.get("status"));
            if ("Upcoming".equals(status) && due != null && due.isBefore(today)) status = "Overdue";
            Map<String, Object> chat = new LinkedHashMap<>();
            chat.put("taskId", row.get("id"));
            chat.put("title", row.get("title"));
            chat.put("category", TaskRules.storedCategory(row.get("category")));
            chat.put("status", status);
            chat.put("memberCount", 1 + intValue(row.get("accepted")));
            chat.put("messageCount", intValue(row.get("message_count")));
            chat.put("readOnly", closesAt != null && Instant.now().isAfter(closesAt));
            chat.put("closesAt", closesAt == null ? null : closesAt.toString());
            if (row.get("last_id") == null) {
                chat.put("lastMessage", null);
            } else {
                Map<String, Object> last = new LinkedHashMap<>();
                last.put("id", row.get("last_id"));
                last.put("text", row.get("last_body"));
                last.put("username", row.get("last_username"));
                last.put("fullName", row.get("last_name"));
                last.put("createdAt", String.valueOf(instant(row.get("last_at"))));
                last.put("mine", user.email().equals(row.get("last_sender")));
                chat.put("lastMessage", last);
            }
            return chat;
        }).toList();
    }

    /**
     * Organizatorul trimite activitatea în chatul comunității, ca invitație. Oricine o vede acolo poate cere
     * să participe. Cel mult o dată la 6 ore pentru aceeași activitate.
     */
    @Transactional
    public Map<String, Object> share(AuthUser user, long id) {
        Map<String, Object> task = lockOwned(id, user);
        LocalDate due = localDate(task.get("due_date"));
        if (!"Upcoming".equals(task.get("status")) || due == null || due.isBefore(today())) {
            throw new ApiException(409, "Doar activitățile active, nerestante, pot fi trimise în comunitate.");
        }
        Integer recent = db.queryForObject("SELECT count(*) FROM chat_messages WHERE kind = 'ACTIVITY' AND ref_id = ? "
                + "AND created_at > now() - interval '6 hours'", Integer.class, id);
        if (recent != null && recent > 0) {
            throw new ApiException(409, "Ai trimis-o de curând în comunitate. Mai încearcă peste câteva ore.");
        }
        Map<String, Object> owner = db.queryForMap("SELECT username, full_name, role FROM users WHERE email = ?", user.email());
        db.update("UPDATE tasks SET shared_at = COALESCE(shared_at, now()) WHERE id = ?", id);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("taskId", id);
        details.put("title", task.get("title"));
        details.put("category", TaskRules.storedCategory(task.get("category")));
        details.put("dueDate", due.toString());
        details.put("isRecurring", Boolean.TRUE.equals(task.get("is_recurring")));
        details.put("repeatEvery", Math.max(1, intValue(task.get("repeat_every"))));
        details.put("repeatUnit", task.get("repeat_unit") == null ? "DAY" : task.get("repeat_unit"));
        details.put("requiresLocation", Boolean.TRUE.equals(task.get("requires_location")));
        // Textul e pentru aplicațiile vechi; cele noi afișează un card tradus din payload.
        String text = "📣 Vă invit la „" + task.get("title") + "” (" + due + "). Cereți să participați din Whatever.";
        db.update("INSERT INTO chat_messages(sender_username, sender_name, sender_role, message_text, sent_at, kind, payload, ref_id) "
                        + "VALUES (?, ?, ?, ?, ?, 'ACTIVITY', ?, ?)",
                owner.get("username"), owner.get("full_name"), owner.get("role"), text, Instant.now().toString(), write(details), id);
        return find(id, user);
    }

    /**
     * Ce vede cineva din comunitate despre activitățile trimise acolo: titlu, dată, organizator, câți membri
     * are și unde se află el (fără locație și fără lista membrilor). Cel mult 50 deodată.
     */
    public List<Map<String, Object>> previews(AuthUser user, List<Long> ids) {
        List<Long> unique = ids == null ? List.of() : ids.stream().distinct().limit(50).toList();
        if (unique.isEmpty()) return List.of();
        Object[] args = unique.toArray();
        String in = String.join(",", Collections.nCopies(args.length, "?"));
        Map<Long, Integer> taken = new HashMap<>();
        Map<Long, Integer> accepted = new HashMap<>();
        db.queryForList("SELECT task_id, status, count(*) AS total FROM task_participants WHERE task_id IN (" + in + ") "
                + "AND status IN ('ACCEPTED', 'INVITED') GROUP BY task_id, status", args).forEach(row -> {
                    long taskId = longValue(row.get("task_id"));
                    taken.merge(taskId, intValue(row.get("total")), Integer::sum);
                    if ("ACCEPTED".equals(row.get("status"))) accepted.put(taskId, intValue(row.get("total")));
                });
        Object[] mine = new Object[args.length + 1];
        mine[0] = user.email();
        System.arraycopy(args, 0, mine, 1, args.length);
        Map<Long, String> participant = new HashMap<>();
        db.queryForList("SELECT task_id, status FROM task_participants WHERE user_email = ? AND task_id IN (" + in + ")", mine)
                .forEach(row -> participant.put(longValue(row.get("task_id")), String.valueOf(row.get("status"))));
        Map<Long, String> request = new HashMap<>();
        db.queryForList("SELECT task_id, status FROM task_join_requests WHERE user_email = ? AND task_id IN (" + in + ")", mine)
                .forEach(row -> request.put(longValue(row.get("task_id")), String.valueOf(row.get("status"))));

        LocalDate today = today();
        return db.queryForList(TASK_SELECT + "WHERE t.id IN (" + in + ") AND t.shared_at IS NOT NULL", args).stream().map(row -> {
            long id = longValue(row.get("id"));
            LocalDate due = localDate(row.get("due_date"));
            String status = String.valueOf(row.get("status"));
            boolean open = "Upcoming".equals(status) && due != null && !due.isBefore(today);
            if ("Upcoming".equals(status) && !open) status = "Overdue";
            String myStatus;
            if (user.email().equals(row.get("owner_email"))) myStatus = "OWNER";
            else if ("ACCEPTED".equals(participant.get(id))) myStatus = "MEMBER";
            else if ("INVITED".equals(participant.get(id))) myStatus = "INVITED";
            else if ("PENDING".equals(request.get(id))) myStatus = "REQUESTED";
            else if ("DECLINED".equals(request.get(id))) myStatus = "DECLINED";
            else myStatus = "NONE";
            boolean full = TaskRules.isFull(taken.getOrDefault(id, 0));

            Map<String, Object> preview = new LinkedHashMap<>();
            preview.put("id", id);
            preview.put("title", row.get("title"));
            preview.put("category", TaskRules.storedCategory(row.get("category")));
            preview.put("dueDate", due == null ? null : due.toString());
            preview.put("isRecurring", Boolean.TRUE.equals(row.get("is_recurring")));
            preview.put("repeatEvery", Math.max(1, intValue(row.get("repeat_every"))));
            preview.put("repeatUnit", row.get("repeat_unit") == null ? "DAY" : row.get("repeat_unit"));
            // Descrierea face parte din invitație; locația exactă o văd doar membrii.
            preview.put("description", row.get("description") == null ? "" : row.get("description"));
            preview.put("priority", row.get("priority"));
            preview.put("requiresLocation", Boolean.TRUE.equals(row.get("requires_location")));
            preview.put("status", status);
            preview.put("ownerUsername", row.get("owner_username"));
            preview.put("ownerName", row.get("owner_name"));
            preview.put("ownerAvatarVersion", avatarVersion(row.get("owner_avatar")));
            preview.put("memberCount", 1 + accepted.getOrDefault(id, 0));
            preview.put("maxMembers", TaskRules.MAX_MEMBERS);
            preview.put("full", full);
            preview.put("myStatus", myStatus);
            preview.put("canJoin", open && !full && ("NONE".equals(myStatus) || "INVITED".equals(myStatus)));
            return preview;
        }).toList();
    }

    /**
     * Cerere de participare la o activitate trimisă în comunitate. Dacă organizatorul te invitase deja,
     * cererea înseamnă că accepți invitația.
     */
    @Transactional
    public Map<String, Object> join(AuthUser user, long id) {
        Map<String, Object> task = lockTask(id);
        if (task.get("shared_at") == null) throw new ApiException(404, "Activitatea nu există.");
        if (user.email().equals(task.get("owner_email"))) throw new ApiException(409, "Ești organizatorul acestei activități.");
        LocalDate due = localDate(task.get("due_date"));
        if (!"Upcoming".equals(task.get("status")) || due == null || due.isBefore(today())) {
            throw new ApiException(409, "Activitatea nu mai primește participanți.");
        }
        List<String> participant = db.queryForList("SELECT status FROM task_participants WHERE task_id = ? AND user_email = ?",
                String.class, id, user.email());
        if (!participant.isEmpty() && "ACCEPTED".equals(participant.get(0))) {
            throw new ApiException(409, "Ești deja membru al acestei activități.");
        }
        if (!participant.isEmpty() && "INVITED".equals(participant.get(0))) {
            respond(user, id, true);
            return preview(user, id);
        }
        List<String> request = db.queryForList("SELECT status FROM task_join_requests WHERE task_id = ? AND user_email = ?",
                String.class, id, user.email());
        if (!request.isEmpty() && "DECLINED".equals(request.get(0))) {
            throw new ApiException(409, "Organizatorul a refuzat deja cererea ta pentru această activitate.");
        }
        if (request.isEmpty()) {
            if (isFull(id)) throw new ApiException(409, "Activitatea are deja 30 de membri.");
            db.update("INSERT INTO task_join_requests(task_id, user_email) VALUES (?, ?)", id, user.email());
            push.notify(String.valueOf(task.get("owner_email")), PushService.Kind.REQUESTS,
                    Notes.joinRequest(nameOf(user.email()), String.valueOf(task.get("title")), id));
        }
        return preview(user, id);
    }

    /** Îți retragi cererea de participare (cât timp organizatorul nu a răspuns). */
    @Transactional
    public Map<String, Object> cancelJoin(AuthUser user, long id) {
        if (db.update("DELETE FROM task_join_requests WHERE task_id = ? AND user_email = ? AND status = 'PENDING'", id, user.email()) == 0) {
            throw new ApiException(404, "Nu ai o cerere de participare la această activitate.");
        }
        return preview(user, id);
    }

    /** Organizatorul aprobă (devine membru, cu chatul activității) sau refuză o cerere de participare. */
    @Transactional
    public Map<String, Object> reviewRequest(AuthUser user, long id, String username, boolean approve) {
        Map<String, Object> task = lockOwned(id, user);
        List<String> email = db.queryForList("SELECT email FROM users WHERE username = ?", String.class,
                username == null ? "" : username.trim().replaceFirst("^@", ""));
        if (email.isEmpty()) throw new ApiException(404, "Utilizatorul nu există.");
        List<String> request = db.queryForList("SELECT status FROM task_join_requests WHERE task_id = ? AND user_email = ? "
                + "FOR UPDATE", String.class, id, email.get(0));
        if (request.isEmpty() || !"PENDING".equals(request.get(0))) {
            throw new ApiException(404, "Cererea de participare nu mai există.");
        }
        if (!approve) {
            db.update("UPDATE task_join_requests SET status = 'DECLINED', responded_at = now() WHERE task_id = ? AND user_email = ?",
                    id, email.get(0));
            return find(id, user);
        }
        if (!"Upcoming".equals(task.get("status"))) throw new ApiException(409, "Doar activitățile active primesc membri noi.");
        if (isFull(id)) throw new ApiException(409, "Activitatea are deja 30 de membri.");
        db.update("INSERT INTO task_participants(task_id, user_email, status, responded_at) VALUES (?, ?, 'ACCEPTED', now()) "
                + "ON CONFLICT (task_id, user_email) DO UPDATE SET status = 'ACCEPTED', responded_at = now()", id, email.get(0));
        db.update("DELETE FROM task_join_requests WHERE task_id = ? AND user_email = ?", id, email.get(0));
        push.notify(email.get(0), PushService.Kind.INVITATIONS,
                Notes.joinApproved(nameOf(user.email()), String.valueOf(task.get("title")), id));
        return find(id, user);
    }

    private Map<String, Object> preview(AuthUser user, long id) {
        List<Map<String, Object>> found = previews(user, List.of(id));
        if (found.isEmpty()) throw new ApiException(404, "Activitatea nu există.");
        return found.get(0);
    }

    /** Locurile se ocupă de membri și de invitațiile fără răspuns (organizatorul are locul lui). */
    private boolean isFull(long id) {
        Integer taken = db.queryForObject("SELECT count(*) FROM task_participants WHERE task_id = ? "
                + "AND status IN ('ACCEPTED', 'INVITED')", Integer.class, id);
        return TaskRules.isFull(taken == null ? 0 : taken);
    }

    private String write(Map<String, Object> value) {
        try {
            return json.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
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
        Map<String, Object> task = db.queryForMap("SELECT status, is_recurring, due_date, repeat_every, repeat_unit FROM tasks WHERE id = ?", id);
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
        // Revine la N zile/săptămâni după ziua în care au confirmat toți (zilnic = mâine).
        LocalDate due = localDate(task.get("due_date"));
        if (due == null || !due.isAfter(today)) {
            LocalDate next = TaskRules.nextDue(today, intValue(task.get("repeat_every")), String.valueOf(task.get("repeat_unit")));
            db.update("UPDATE tasks SET streak_count = streak_count + 1, due_date = ?, updated_at = now() WHERE id = ?",
                    Date.valueOf(next), id);
        }
    }

    /**
     * Aduce invitațiile la lista dorită. Cine a refuzat și nu mai e în listă rămâne „refuzat”; cine a refuzat
     * și e din nou în listă primește o invitație nouă. Cu replace = false (clienți vechi) doar adăugăm.
     */
    /** Pune invitații la zi și întoarce cine a primit acum o invitație (nou sau invitat din nou după un refuz). */
    private List<String> syncParticipants(long id, List<String> emails, boolean replace) {
        Set<String> wanted = new LinkedHashSet<>(emails);
        List<String> invitedNow = new ArrayList<>();
        for (Map<String, Object> row : db.queryForList("SELECT user_email, status FROM task_participants WHERE task_id = ?", id)) {
            String email = String.valueOf(row.get("user_email"));
            boolean keep = wanted.remove(email);
            if (keep && "DECLINED".equals(row.get("status"))) {
                db.update("UPDATE task_participants SET status = 'INVITED', invited_at = now(), responded_at = NULL "
                        + "WHERE task_id = ? AND user_email = ?", id, email);
                invitedNow.add(email);
            } else if (!keep && replace && !"DECLINED".equals(row.get("status"))) {
                db.update("DELETE FROM task_participants WHERE task_id = ? AND user_email = ?", id, email);
            }
        }
        for (String email : wanted) {
            db.update("INSERT INTO task_participants(task_id, user_email) VALUES (?, ?)", id, email);
            invitedNow.add(email);
        }
        return invitedNow;
    }

    /**
     * Emailurile celor invitați: prieteni (prietenie acceptată, în oricare direcție) sau, la editare, oameni care
     * sunt deja în activitate (ex. intrați printr-o cerere din comunitate). Altfel 400.
     */
    private List<String> inviteeEmails(AuthUser user, List<String> usernames, Long taskId) {
        List<String> emails = new ArrayList<>();
        for (String username : usernames) {
            List<String> found = db.queryForList("SELECT u.email FROM users u JOIN friends f "
                            + "ON f.status = 'ACCEPTED' AND ((f.user_email = ? AND f.friend_email = u.email) "
                            + "OR (f.friend_email = ? AND f.user_email = u.email)) "
                            + "WHERE u.username = ? AND u.email <> ? LIMIT 1",
                    String.class, user.email(), user.email(), username, user.email());
            if (found.isEmpty() && taskId != null) {
                found = db.queryForList("SELECT u.email FROM users u JOIN task_participants p ON p.user_email = u.email "
                        + "WHERE p.task_id = ? AND u.username = ? AND p.status IN ('ACCEPTED', 'INVITED')", String.class, taskId, username);
            }
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
        db.queryForList("SELECT p.task_id, p.user_email, p.status, u.username, u.full_name, u.avatar_updated_at FROM task_participants p "
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
        // Cererile de participare din comunitate (le vede doar organizatorul).
        Map<Long, List<Map<String, Object>>> requests = new HashMap<>();
        db.queryForList("SELECT r.task_id, r.requested_at, u.username, u.full_name FROM task_join_requests r "
                        + "JOIN users u ON u.email = r.user_email WHERE r.task_id IN (" + in + ") AND r.status = 'PENDING' "
                        + "ORDER BY r.requested_at", ids)
                .forEach(row -> {
                    Map<String, Object> request = new LinkedHashMap<>();
                    request.put("username", row.get("username"));
                    request.put("fullName", row.get("full_name"));
                    request.put("requestedAt", String.valueOf(instant(row.get("requested_at"))));
                    requests.computeIfAbsent(longValue(row.get("task_id")), key -> new ArrayList<>()).add(request);
                });

        return rows.stream().map(row -> {
            long id = longValue(row.get("id"));
            boolean owner = user.email().equals(row.get("owner_email"));
            return view(row, user, today, participants.getOrDefault(id, List.of()), lastDone.getOrDefault(id, Map.of()),
                    messageCounts.getOrDefault(id, 0), owner ? requests.getOrDefault(id, List.of()) : List.of());
        }).toList();
    }

    private Map<String, Object> view(Map<String, Object> row, AuthUser user, LocalDate today,
                                     List<Map<String, Object>> participants, Map<String, LocalDate> lastDone, int messageCount,
                                     List<Map<String, Object>> joinRequests) {
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
            person.put("avatarVersion", avatarVersion(participant.get("avatar_updated_at")));
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
        task.put("repeatEvery", Math.max(1, intValue(row.get("repeat_every"))));
        task.put("repeatUnit", row.get("repeat_unit") == null ? "DAY" : row.get("repeat_unit"));
        // O activitate recurentă care revine mai târziu (ex. săptămâna viitoare) nu se poate confirma până atunci.
        task.put("nextOn", recurring && due != null && due.isAfter(today) ? due.toString() : null);
        task.put("description", row.get("description") == null ? "" : row.get("description"));
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
        task.put("ownerAvatarVersion", avatarVersion(row.get("owner_avatar")));
        task.put("lastCompletedOn", myLast == null ? null : myLast.toString());
        task.put("completedToday", today.equals(myLast));
        task.put("myStatus", myStatus);
        task.put("confirmedByMe", TaskRules.confirmed(myLast, recurring, today));
        task.put("participants", people);
        task.put("memberCount", members);
        task.put("maxMembers", TaskRules.MAX_MEMBERS);
        task.put("confirmedCount", confirmed);
        task.put("chat", chat);
        task.put("shared", row.get("shared_at") != null);
        task.put("joinRequests", joinRequests);
        return task;
    }

    private static Map<String, Object> message(Map<String, Object> row, AuthUser user, Map<Long, List<Map<String, Object>>> reactions) {
        Map<String, Object> message = new LinkedHashMap<>();
        message.put("id", row.get("id"));
        message.put("text", row.get("body"));
        message.put("createdAt", String.valueOf(instant(row.get("created_at"))));
        message.put("username", row.get("username"));
        message.put("fullName", row.get("full_name"));
        message.put("mine", user.email().equals(row.get("sender_email")));
        message.put("avatarVersion", avatarVersion(row.get("avatar_updated_at")));
        message.put("replyTo", Reactions.reply(row.get("reply_id"), row.get("reply_username"), row.get("reply_name"), row.get("reply_text")));
        message.put("reactions", reactions.getOrDefault(longValue(row.get("id")), List.of()));
        return message;
    }

    /** Versiunea pozei de profil (milisecunde); null = fără poză. Aplicația încarcă poza de la user-service. */
    static Long avatarVersion(Object value) {
        Instant at = instant(value);
        return at == null ? null : at.toEpochMilli();
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
