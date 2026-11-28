package com.whatever.task.tasks;

import com.whatever.task.security.AuthUser;
import com.whatever.task.web.ApiException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Date;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Favoruri între prieteni. Un favor e o activitate pe care o ceri unui prieten: el o acceptă, merge la locul
 * stabilit, face o poză cu camera din aplicație, iar tu aprobi poza. După aprobare tu îi datorezi un favor
 * (și el primește streak, punct și intrare în recap). Între doi prieteni poate exista un singur favor în
 * desfășurare; cine datorează nu poate cere, iar când i se cere poate refuza doar ca „nerezonabil”
 * (datoria rămâne). Un favor neterminat până la scadență se anulează singur.
 */
@Service
public class FavorService {
    private static final String FAVOR_SELECT = "SELECT f.id, f.requester_email, f.doer_email, f.title, f.details, f.category, "
            + "f.due_date, f.latitude, f.longitude, f.allowed_radius_meters, f.status, f.obligated, f.created_at, "
            + "f.responded_at, f.submitted_at, f.completed_at, f.photo_taken_at, f.review_note, (f.photo IS NOT NULL) AS has_photo, "
            + "r.username AS requester_username, r.full_name AS requester_name, d.username AS doer_username, d.full_name AS doer_name "
            + "FROM favors f JOIN users r ON r.email = f.requester_email JOIN users d ON d.email = f.doer_email ";

    private final JdbcTemplate db;
    private final TaskService tasks;

    public FavorService(JdbcTemplate db, TaskService tasks) {
        this.db = db;
        this.tasks = tasks;
    }

    /** Favorurile mele (ultimele 100) și balanța cu fiecare prieten. */
    @Transactional
    public Map<String, Object> list(AuthUser user) {
        expireOverdue();
        List<Map<String, Object>> favors = db.queryForList(FAVOR_SELECT
                        + "WHERE f.requester_email = ? OR f.doer_email = ? ORDER BY f.id DESC LIMIT 100", user.email(), user.email())
                .stream().map(row -> view(row, user)).toList();
        List<Map<String, Object>> balances = new ArrayList<>();
        for (Map<String, Object> friend : db.queryForList("SELECT DISTINCT u.email, u.username, u.full_name FROM users u JOIN friends f "
                + "ON f.status = 'ACCEPTED' AND ((f.user_email = ? AND f.friend_email = u.email) "
                + "OR (f.friend_email = ? AND f.user_email = u.email)) "
                + "WHERE u.email <> ? ORDER BY u.username", user.email(), user.email(), user.email())) {
            String email = String.valueOf(friend.get("email"));
            Map<String, Object> balance = new LinkedHashMap<>();
            balance.put("username", friend.get("username"));
            balance.put("fullName", friend.get("full_name"));
            balance.put("balance", balance(user.email(), email).name());
            balance.put("openFavorId", openFavorId(user.email(), email));
            balances.add(balance);
        }
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("favors", favors);
        response.put("balances", balances);
        return response;
    }

    @Transactional
    public Map<String, Object> request(AuthUser user, FavorController.FavorRequest request) {
        expireOverdue();
        String username = request.friend() == null ? "" : request.friend().trim().replaceFirst("^@", "");
        List<String> friend = db.queryForList("SELECT u.email FROM users u JOIN friends f "
                        + "ON f.status = 'ACCEPTED' AND ((f.user_email = ? AND f.friend_email = u.email) "
                        + "OR (f.friend_email = ? AND f.user_email = u.email)) "
                        + "WHERE u.username = ? AND u.email <> ? LIMIT 1",
                String.class, user.email(), user.email(), username, user.email());
        if (friend.isEmpty()) throw new ApiException(400, "Poți cere favoruri doar prietenilor tăi.");
        String doer = friend.get(0);
        // Blocăm perechea (în ordine fixă, ca două cereri simultane să nu treacă amândouă).
        lockUsers(user.email(), doer);
        if (openFavorId(user.email(), doer) != null) {
            throw new ApiException(409, "Aveți deja un favor în desfășurare. Terminați-l întâi.");
        }
        FavorRules.Balance balance = balance(user.email(), doer);
        if (balance == FavorRules.Balance.I_OWE) {
            throw new ApiException(409, "Îi datorezi deja un favor acestui prieten: fă-i-l întâi tu, apoi poți cere altul.");
        }
        if (request.dueDate().isBefore(tasks.today())) throw new ApiException(400, "Scadența nu poate fi în trecut.");
        if (request.latitude() == 0 && request.longitude() == 0) throw new ApiException(400, "Alege locul favorului pe hartă.");
        Long id = db.queryForObject("INSERT INTO favors(requester_email, doer_email, title, details, category, due_date, "
                        + "latitude, longitude, allowed_radius_meters, obligated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
                Long.class, user.email(), doer, request.title().trim(), request.details() == null ? "" : request.details().trim(),
                TaskRules.category(request.category()), Date.valueOf(request.dueDate()), request.latitude(), request.longitude(),
                request.radius(), balance == FavorRules.Balance.THEY_OWE);
        return find(id, user);
    }

    /** Răspunsul celui rugat: accept, decline (doar dacă nu datorează) sau refuse („nerezonabil”, doar dacă datorează). */
    @Transactional
    public Map<String, Object> respond(AuthUser user, long id, String action) {
        expireOverdue();
        Map<String, Object> favor = lock(id, user);
        if (!user.email().equals(favor.get("doer_email"))) throw new ApiException(403, "Doar prietenul rugat poate răspunde.");
        if (!"REQUESTED".equals(favor.get("status"))) throw new ApiException(409, "Favorul nu mai așteaptă un răspuns.");
        boolean obligated = Boolean.TRUE.equals(favor.get("obligated"));
        String status = switch (action) {
            case "accept" -> "ACCEPTED";
            case "decline" -> {
                if (obligated) throw new ApiException(409, "Îi datorezi un favor: poți refuza doar dacă cererea nu e rezonabilă.");
                yield "DECLINED";
            }
            case "refuse" -> {
                if (!obligated) throw new ApiException(409, "Nu îi datorezi nimic: poți refuza simplu.");
                yield "REFUSED";
            }
            default -> throw new ApiException(400, "Cerere invalidă.");
        };
        db.update("UPDATE favors SET status = ?, responded_at = now() WHERE id = ?", status, id);
        return find(id, user);
    }

    /** Cel care a cerut renunță cât timp favorul n-a fost încă trimis spre aprobare. */
    @Transactional
    public Map<String, Object> cancel(AuthUser user, long id) {
        Map<String, Object> favor = lock(id, user);
        if (!user.email().equals(favor.get("requester_email"))) throw new ApiException(403, "Doar cine a cerut favorul îl poate anula.");
        if (!List.of("REQUESTED", "ACCEPTED").contains(String.valueOf(favor.get("status")))) {
            throw new ApiException(409, "Favorul nu mai poate fi anulat.");
        }
        db.update("UPDATE favors SET status = 'CANCELED', responded_at = COALESCE(responded_at, now()) WHERE id = ?", id);
        return find(id, user);
    }

    /** Poza făcută la locație de cel rugat; o vede apoi cel care a cerut, ca s-o aprobe. */
    @Transactional
    public Map<String, Object> submitPhoto(AuthUser user, long id, FavorController.PhotoRequest request) {
        expireOverdue();
        Map<String, Object> favor = lock(id, user);
        if (!user.email().equals(favor.get("doer_email"))) throw new ApiException(403, "Doar prietenul rugat trimite poza.");
        if (!"ACCEPTED".equals(favor.get("status"))) throw new ApiException(409, "Poza se trimite după ce accepți favorul.");
        if (Boolean.TRUE.equals(request.mocked())) {
            throw new ApiException(400, "Locația pare simulată. Oprește aplicațiile de locație falsă și încearcă din nou.");
        }
        Instant takenAt;
        try {
            takenAt = request.takenAt() == null ? null : Instant.parse(request.takenAt());
        } catch (DateTimeParseException e) {
            takenAt = null;
        }
        FavorRules.requireFreshPhoto(takenAt, Instant.now());
        double distance = TaskRules.distanceMeters(TaskService.doubleValue(favor.get("latitude")),
                TaskService.doubleValue(favor.get("longitude")), request.latitude(), request.longitude());
        double tolerance = Math.min(request.accuracy() == null ? 0 : Math.max(0, request.accuracy()), TaskRules.MAX_ACCURACY_TOLERANCE_METERS);
        int radius = TaskService.intValue(favor.get("allowed_radius_meters"));
        if (distance - tolerance > radius) {
            throw new ApiException(400, "Ești la " + Math.round(distance) + " m de locația activității (raza permisă: " + radius + " m).");
        }
        byte[] photo = FavorRules.decodePhoto(request.photo());
        db.update("UPDATE favors SET status = 'SUBMITTED', photo = ?, photo_taken_at = ?, photo_latitude = ?, photo_longitude = ?, "
                        + "submitted_at = now(), review_note = NULL WHERE id = ?",
                photo, java.sql.Timestamp.from(takenAt), request.latitude(), request.longitude(), id);
        return find(id, user);
    }

    /** Doar cei doi prieteni văd poza. */
    public Map<String, Object> photo(AuthUser user, long id) {
        List<Map<String, Object>> rows = db.queryForList("SELECT requester_email, doer_email, photo FROM favors WHERE id = ?", id);
        if (rows.isEmpty() || !involved(rows.get(0), user)) throw new ApiException(404, "Favorul nu există.");
        Object photo = rows.get(0).get("photo");
        if (!(photo instanceof byte[] bytes)) throw new ApiException(404, "Favorul nu are încă o poză.");
        return Map.of("dataUrl", "data:image/jpeg;base64," + Base64.getEncoder().encodeToString(bytes));
    }

    /** Cel care a cerut aprobă poza (favorul e gata, acum el datorează) sau o respinge (se poate face alta). */
    @Transactional
    public Map<String, Object> review(AuthUser user, long id, boolean approve, String note) {
        Map<String, Object> favor = lock(id, user);
        if (!user.email().equals(favor.get("requester_email"))) throw new ApiException(403, "Doar cine a cerut favorul aprobă poza.");
        if (!"SUBMITTED".equals(favor.get("status"))) throw new ApiException(409, "Nu e nicio poză de aprobat.");
        if (!approve) {
            String reason = note == null ? "" : note.trim();
            db.update("UPDATE favors SET status = 'ACCEPTED', photo = NULL, photo_taken_at = NULL, review_note = ? WHERE id = ?",
                    reason.isEmpty() ? null : reason, id);
            return find(id, user);
        }
        LocalDate today = tasks.today();
        String doer = String.valueOf(favor.get("doer_email"));
        db.update("UPDATE favors SET status = 'COMPLETED', completed_at = now() WHERE id = ?", id);
        // Favorul contează ca o activitate finalizată de cel care l-a făcut (streak, punct, recap).
        db.update("INSERT INTO task_completions(task_id, user_email, completed_on, latitude, longitude, verified_location, "
                        + "verified_biometric, category) VALUES (NULL, ?, ?, ?, ?, TRUE, FALSE, ?)",
                doer, Date.valueOf(today), favor.get("photo_latitude"), favor.get("photo_longitude"),
                TaskRules.storedCategory(favor.get("category")));
        tasks.credit(doer, today);
        return find(id, user);
    }

    /** Favorurile nerezolvate până la scadență (încă necerute sau neterminate) se anulează singure. */
    private void expireOverdue() {
        db.update("UPDATE favors SET status = 'EXPIRED' WHERE status IN ('REQUESTED', 'ACCEPTED') AND due_date < ?",
                Date.valueOf(tasks.today()));
    }

    private FavorRules.Balance balance(String me, String friend) {
        List<Map<String, Object>> last = db.queryForList("SELECT requester_email, doer_email FROM favors WHERE status = 'COMPLETED' "
                        + "AND ((requester_email = ? AND doer_email = ?) OR (requester_email = ? AND doer_email = ?)) "
                        + "ORDER BY completed_at DESC, id DESC LIMIT 1", me, friend, friend, me);
        if (last.isEmpty()) return FavorRules.Balance.EVEN;
        return FavorRules.balance(me, String.valueOf(last.get(0).get("requester_email")), String.valueOf(last.get(0).get("doer_email")));
    }

    private Long openFavorId(String me, String friend) {
        List<Long> open = db.queryForList("SELECT id FROM favors WHERE status IN ('REQUESTED', 'ACCEPTED', 'SUBMITTED') "
                        + "AND ((requester_email = ? AND doer_email = ?) OR (requester_email = ? AND doer_email = ?)) LIMIT 1",
                Long.class, me, friend, friend, me);
        return open.isEmpty() ? null : open.get(0);
    }

    private void lockUsers(String first, String second) {
        for (String email : first.compareTo(second) < 0 ? List.of(first, second) : List.of(second, first)) {
            db.queryForList("SELECT email FROM users WHERE email = ? FOR UPDATE", email);
        }
    }

    private Map<String, Object> lock(long id, AuthUser user) {
        List<Map<String, Object>> rows = db.queryForList("SELECT * FROM favors WHERE id = ? FOR UPDATE", id);
        if (rows.isEmpty() || !involved(rows.get(0), user)) throw new ApiException(404, "Favorul nu există.");
        return rows.get(0);
    }

    private static boolean involved(Map<String, Object> favor, AuthUser user) {
        return user.email().equals(favor.get("requester_email")) || user.email().equals(favor.get("doer_email"));
    }

    private Map<String, Object> find(long id, AuthUser user) {
        List<Map<String, Object>> rows = db.queryForList(FAVOR_SELECT + "WHERE f.id = ?", id);
        if (rows.isEmpty()) throw new ApiException(404, "Favorul nu există.");
        return view(rows.get(0), user);
    }

    private static Map<String, Object> view(Map<String, Object> row, AuthUser user) {
        boolean requester = user.email().equals(row.get("requester_email"));
        LocalDate due = TaskService.localDate(row.get("due_date"));
        Map<String, Object> friend = new LinkedHashMap<>();
        friend.put("username", requester ? row.get("doer_username") : row.get("requester_username"));
        friend.put("fullName", requester ? row.get("doer_name") : row.get("requester_name"));

        Map<String, Object> favor = new LinkedHashMap<>();
        favor.put("id", row.get("id"));
        favor.put("role", requester ? "REQUESTER" : "DOER");
        favor.put("friend", friend);
        favor.put("title", row.get("title"));
        favor.put("details", row.get("details"));
        favor.put("category", TaskRules.storedCategory(row.get("category")));
        favor.put("dueDate", due == null ? null : due.toString());
        favor.put("latitude", TaskService.doubleValue(row.get("latitude")));
        favor.put("longitude", TaskService.doubleValue(row.get("longitude")));
        favor.put("radius", TaskService.intValue(row.get("allowed_radius_meters")));
        favor.put("status", row.get("status"));
        favor.put("obligated", Boolean.TRUE.equals(row.get("obligated")));
        favor.put("hasPhoto", Boolean.TRUE.equals(row.get("has_photo")));
        favor.put("reviewNote", row.get("review_note"));
        favor.put("createdAt", iso(row.get("created_at")));
        favor.put("submittedAt", iso(row.get("submitted_at")));
        favor.put("completedAt", iso(row.get("completed_at")));
        favor.put("photoTakenAt", iso(row.get("photo_taken_at")));
        return favor;
    }

    private static String iso(Object value) {
        Instant instant = TaskService.instant(value);
        return instant == null ? null : instant.toString();
    }
}
