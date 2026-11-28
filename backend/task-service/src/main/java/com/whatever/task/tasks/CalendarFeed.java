package com.whatever.task.tasks;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

/**
 * Fișierul .ics (RFC 5545) cu activitățile cuiva, pentru abonarea din Google Calendar (și alte calendare).
 * Activitățile au doar o zi, nu și o oră, deci fiecare e un eveniment de o zi întreagă; cele recurente
 * au o regulă de repetare (la N zile sau N săptămâni). Clasă fără bază de date, ca să se poată testa.
 */
public final class CalendarFeed {
    /** Un eveniment din calendar: o activitate, cu ziua de început (scadența curentă). */
    public record Event(long id, String title, String description, LocalDate start, boolean recurring, int every,
                        String unit, Double latitude, Double longitude, Instant updated, String url) {
    }

    private static final DateTimeFormatter DAY = DateTimeFormatter.BASIC_ISO_DATE;
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC);

    private CalendarFeed() {
    }

    /** @param openLabel textul dinaintea linkului spre activitate (ex. „Deschide în Whatever”), deja tradus. */
    public static String render(String calendarName, String openLabel, List<Event> events, Instant now) {
        StringBuilder out = new StringBuilder();
        line(out, "BEGIN:VCALENDAR");
        line(out, "VERSION:2.0");
        line(out, "PRODID:-//Whatever//Activitati//RO");
        line(out, "CALSCALE:GREGORIAN");
        line(out, "METHOD:PUBLISH");
        line(out, "X-WR-CALNAME:" + text(calendarName));
        // Doar o sugestie: Google își alege singur cât de des citește din nou calendarul.
        line(out, "REFRESH-INTERVAL;VALUE=DURATION:PT6H");
        line(out, "X-PUBLISHED-TTL:PT6H");
        for (Event event : events) {
            line(out, "BEGIN:VEVENT");
            line(out, "UID:whatever-task-" + event.id() + "@whatever-app-unitbv.me");
            line(out, "DTSTAMP:" + STAMP.format(event.updated() == null ? now : event.updated()));
            line(out, "DTSTART;VALUE=DATE:" + DAY.format(event.start()));
            line(out, "DTEND;VALUE=DATE:" + DAY.format(event.start().plusDays(1)));
            if (event.recurring()) line(out, "RRULE:" + rule(event.every(), event.unit()));
            line(out, "SUMMARY:" + text(event.title()));
            String details = event.description() == null ? "" : event.description().strip();
            if (event.url() != null) details = details.isEmpty() ? openLabel + ": " + event.url()
                    : details + "\n\n" + openLabel + ": " + event.url();
            if (!details.isEmpty()) line(out, "DESCRIPTION:" + text(details));
            if (event.latitude() != null && event.longitude() != null) {
                line(out, "LOCATION:" + text(String.format(Locale.ROOT, "%.6f, %.6f", event.latitude(), event.longitude())));
                line(out, "GEO:" + String.format(Locale.ROOT, "%.6f;%.6f", event.latitude(), event.longitude()));
            }
            if (event.url() != null) line(out, "URL:" + event.url());
            // Evenimentele de o zi nu ocupă calendarul (nu apar ca „ocupat”).
            line(out, "TRANSP:TRANSPARENT");
            line(out, "END:VEVENT");
        }
        line(out, "END:VCALENDAR");
        return out.toString();
    }

    /** Regula de repetare: la fiecare N zile (DAILY) sau N săptămâni (WEEKLY). */
    public static String rule(int every, String unit) {
        return "FREQ=" + ("WEEK".equals(unit) ? "WEEKLY" : "DAILY") + ";INTERVAL=" + Math.max(1, every);
    }

    /** Text RFC 5545: \ ; , se scapă, iar rândurile noi devin \n. */
    static String text(String value) {
        if (value == null) return "";
        return value.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,")
                .replace("\r\n", "\n").replace("\r", "\n").replace("\n", "\\n");
    }

    /**
     * Un rând de cel mult 75 de octeți (UTF-8); continuarea începe cu un spațiu. Nu tăiem niciodată un caracter
     * (diacriticele au 2 octeți, emoji 4).
     */
    static void line(StringBuilder out, String content) {
        int used = 0;
        for (int i = 0; i < content.length(); ) {
            int codePoint = content.codePointAt(i);
            int bytes = codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;
            if (used + bytes > 75) {
                out.append("\r\n ");
                used = 1;
            }
            out.appendCodePoint(codePoint);
            used += bytes;
            i += Character.charCount(codePoint);
        }
        out.append("\r\n");
    }
}
