package com.whatever.task.tasks;

import com.whatever.task.security.AuthUser;
import com.whatever.task.web.ApiException;
import com.whatever.task.web.I18n;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.sql.Date;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Calendarul activităților: ce ai finalizat în fiecare zi a unei luni (activitățile programate le calculează
 * aplicația din lista ei) și abonarea dintr-un calendar extern (Google Calendar), printr-un link secret
 * către un fișier .ics. Linkul nu cere autentificare (Google îl citește de pe serverele lui), deci tokenul
 * e lung și aleator și se poate reseta oricând.
 */
@Service
public class CalendarService {
    private static final Pattern TOKEN = Pattern.compile("[A-Za-z0-9_-]{32}");

    private final JdbcTemplate db;
    private final ZoneId zone;
    private final String publicUrl;
    private final SecureRandom random = new SecureRandom();

    public CalendarService(JdbcTemplate db, @Value("${app.timezone}") String timezone,
                           @Value("${app.public-url:https://whatever-app-unitbv.me}") String publicUrl) {
        this.db = db;
        this.zone = ZoneId.of(timezone);
        this.publicUrl = publicUrl.replaceAll("/+$", "");
    }

    /** Ce am finalizat în luna aleasă: activitățile (cu titlul, dacă mai există) și favorurile făcute de mine. */
    public Map<String, Object> month(AuthUser user, String month) {
        YearMonth selected;
        try {
            selected = month == null || month.isBlank() ? YearMonth.now(zone) : YearMonth.parse(month.trim());
        } catch (DateTimeParseException e) {
            throw new ApiException(400, "Lună invalidă.");
        }
        Date from = Date.valueOf(selected.atDay(1));
        Date to = Date.valueOf(selected.plusMonths(1).atDay(1));
        List<Map<String, Object>> done = new ArrayList<>();
        db.queryForList("SELECT c.completed_on, c.task_id, COALESCE(t.category, c.category) AS category, t.title "
                        + "FROM task_completions c JOIN tasks t ON t.id = c.task_id "
                        + "WHERE c.user_email = ? AND c.completed_on >= ? AND c.completed_on < ? ORDER BY c.completed_on, c.id",
                user.email(), from, to).forEach(row -> done.add(item(row.get("completed_on"), "TASK", row.get("task_id"),
                row.get("title"), row.get("category"))));
        db.queryForList("SELECT id, title, category, completed_at FROM favors WHERE doer_email = ? AND status = 'COMPLETED' "
                        + "AND completed_at >= ? AND completed_at < ? ORDER BY completed_at",
                user.email(), selected.atDay(1).atStartOfDay(zone).toOffsetDateTime(),
                selected.plusMonths(1).atDay(1).atStartOfDay(zone).toOffsetDateTime())
                .forEach(row -> {
                    Instant at = TaskService.instant(row.get("completed_at"));
                    done.add(item(at == null ? null : at.atZone(zone).toLocalDate(), "FAVOR", row.get("id"), row.get("title"),
                            row.get("category")));
                });
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("month", selected.toString());
        response.put("completions", done);
        return response;
    }

    /**
     * Harta zilelor active (ca pe GitHub): câte finalizări am avut în fiecare zi din ultimele `weeks` săptămâni,
     * de luni (prima săptămână) până azi. Zilele fără nimic lipsesc din listă. Între 4 și 53 de săptămâni (implicit 26).
     */
    public Map<String, Object> activity(AuthUser user, Integer weeks) {
        int span = weeks == null ? 26 : Math.max(4, Math.min(53, weeks));
        LocalDate today = LocalDate.now(zone);
        LocalDate from = today.with(DayOfWeek.MONDAY).minusWeeks(span - 1L);
        List<Map<String, Object>> days = db.queryForList("SELECT completed_on, count(*) AS total FROM task_completions "
                        + "WHERE user_email = ? AND completed_on >= ? AND completed_on <= ? GROUP BY completed_on ORDER BY completed_on",
                user.email(), Date.valueOf(from), Date.valueOf(today)).stream().map(row -> {
                    Map<String, Object> day = new LinkedHashMap<>();
                    day.put("date", String.valueOf(TaskService.localDate(row.get("completed_on"))));
                    day.put("count", TaskService.intValue(row.get("total")));
                    return day;
                }).toList();
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("from", from.toString());
        response.put("to", today.toString());
        response.put("weeks", span);
        response.put("activeDays", days.size());
        response.put("total", days.stream().mapToInt(day -> (Integer) day.get("count")).sum());
        response.put("days", days);
        return response;
    }

    private static Map<String, Object> item(Object date, String kind, Object id, Object title, Object category) {
        LocalDate day = date instanceof LocalDate local ? local : TaskService.localDate(date);
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("date", day == null ? null : day.toString());
        item.put("kind", kind);
        item.put("id", id);
        item.put("title", title);
        item.put("category", TaskRules.storedCategory(category));
        return item;
    }

    /** Tokenul linkului de abonare (îl creează la prima cerere); reset = unul nou, iar cel vechi nu mai merge. */
    @Transactional
    public Map<String, Object> link(AuthUser user, boolean reset) {
        List<String> existing = db.queryForList("SELECT token FROM calendar_feeds WHERE user_email = ?", String.class, user.email());
        String token = existing.isEmpty() || reset ? newToken() : existing.get(0);
        if (existing.isEmpty() || reset) {
            db.update("INSERT INTO calendar_feeds(user_email, token) VALUES (?, ?) ON CONFLICT (user_email) "
                    + "DO UPDATE SET token = EXCLUDED.token, created_at = now(), last_fetched_at = NULL", user.email(), token);
        }
        List<Instant> fetched = db.queryForList("SELECT last_fetched_at FROM calendar_feeds WHERE user_email = ?", user.email())
                .stream().map(row -> TaskService.instant(row.get("last_fetched_at"))).toList();
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("token", token);
        response.put("lastFetchedAt", fetched.isEmpty() || fetched.get(0) == null ? null : fetched.get(0).toString());
        return response;
    }

    /**
     * Fișierul .ics pentru tokenul dat: activitățile active (cele recurente cu regula de repetare) și cele unice
     * încheiate în ultimele 90 de zile. Fără anulate. Tokenul greșit → 404, ca să nu se poată ghici.
     */
    @Transactional
    public String feed(String token, String language) {
        if (token == null || !TOKEN.matcher(token).matches()) throw new ApiException(404, "Calendarul nu există.");
        List<String> owner = db.queryForList("SELECT user_email FROM calendar_feeds WHERE token = ?", String.class, token);
        if (owner.isEmpty()) throw new ApiException(404, "Calendarul nu există.");
        String email = owner.get(0);
        db.update("UPDATE calendar_feeds SET last_fetched_at = now() WHERE token = ?", token);
        // List.of(...).contains(null) aruncă NullPointerException, deci verificăm întâi că limba există.
        String lang = language != null && I18n.SUPPORTED.contains(language) ? language : "ro";

        List<CalendarFeed.Event> events = db.queryForList("SELECT t.* FROM tasks t WHERE (t.owner_email = ? OR EXISTS ("
                        + "SELECT 1 FROM task_participants p WHERE p.task_id = t.id AND p.user_email = ? AND p.status = 'ACCEPTED')) "
                        + "AND (t.status = 'Upcoming' OR (t.status = 'Completed' AND t.finished_at > now() - interval '90 days')) "
                        + "ORDER BY t.due_date, t.id LIMIT 500", email, email).stream()
                .map(row -> {
                    boolean recurring = Boolean.TRUE.equals(row.get("is_recurring")) && "Upcoming".equals(row.get("status"));
                    boolean located = Boolean.TRUE.equals(row.get("requires_location"));
                    Instant updated = TaskService.instant(row.get("updated_at"));
                    return new CalendarFeed.Event(TaskService.longValue(row.get("id")), String.valueOf(row.get("title")),
                            row.get("description") == null ? "" : String.valueOf(row.get("description")),
                            TaskService.localDate(row.get("due_date")), recurring,
                            TaskService.intValue(row.get("repeat_every")), String.valueOf(row.get("repeat_unit")),
                            located ? TaskService.doubleValue(row.get("latitude")) : null,
                            located ? TaskService.doubleValue(row.get("longitude")) : null,
                            updated, publicUrl + "/activity/" + row.get("id"));
                })
                .filter(event -> event.start() != null)
                .toList();
        return CalendarFeed.render(I18n.translate("Whatever — activitățile mele", lang),
                I18n.translate("Deschide în Whatever", lang), events, Instant.now());
    }

    private String newToken() {
        byte[] bytes = new byte[24];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
