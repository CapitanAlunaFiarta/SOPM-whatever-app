package com.whatever.task;

import com.whatever.task.tasks.CalendarFeed;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CalendarFeedTest {
    private static final Instant NOW = Instant.parse("2026-11-28T10:00:00Z");

    @Test
    void recurringActivityBecomesAnAllDayEventWithARule() {
        CalendarFeed.Event event = new CalendarFeed.Event(7, "Alergare, parc; seara", "Adu apă\nși prosop", LocalDate.of(2026, 12, 5),
                true, 2, "WEEK", 45.6525, 25.5888, NOW, "https://whatever-app-unitbv.me/activity/7");
        String ics = CalendarFeed.render("Whatever — activitățile mele", "Deschide în Whatever", List.of(event), NOW);

        assertTrue(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
        assertTrue(ics.endsWith("END:VCALENDAR\r\n"));
        assertTrue(ics.contains("UID:whatever-task-7@whatever-app-unitbv.me\r\n"));
        assertTrue(ics.contains("DTSTART;VALUE=DATE:20261205\r\n"));
        assertTrue(ics.contains("DTEND;VALUE=DATE:20261206\r\n"));
        assertTrue(ics.contains("RRULE:FREQ=WEEKLY;INTERVAL=2\r\n"));
        // Virgula, punctul și virgula și rândul nou se scapă.
        assertTrue(ics.contains("SUMMARY:Alergare\\, parc\\; seara\r\n"));
        assertTrue(unfold(ics).contains("DESCRIPTION:Adu apă\\nși prosop\\n\\nDeschide în Whatever: https://whatever-app-unitbv.me/activity/7"));
        assertTrue(ics.contains("GEO:45.652500;25.588800\r\n"));
        assertTrue(ics.contains("DTSTAMP:20261128T100000Z\r\n"));
    }

    @Test
    void oneOffActivityHasNoRuleAndNoLocationWhenNotNeeded() {
        CalendarFeed.Event event = new CalendarFeed.Event(9, "Proiect", "", LocalDate.of(2026, 12, 1),
                false, 1, "DAY", null, null, null, null);
        String ics = CalendarFeed.render("Whatever", "Deschide", List.of(event), NOW);
        assertFalse(ics.contains("RRULE"));
        assertFalse(ics.contains("GEO:"));
        assertFalse(ics.contains("DESCRIPTION"));
        assertEquals("FREQ=DAILY;INTERVAL=1", CalendarFeed.rule(1, "DAY"));
    }

    @Test
    void longLinesAreFoldedWithoutBreakingCharacters() {
        String title = "Ședință de învățat împreună pentru examenul de rețele — capitolele șapte, opt și nouă 🔥🔥";
        CalendarFeed.Event event = new CalendarFeed.Event(1, title, "", LocalDate.of(2026, 12, 1),
                false, 1, "DAY", null, null, NOW, null);
        String ics = CalendarFeed.render("Whatever", "Deschide", List.of(event), NOW);
        for (String line : ics.split("\r\n")) {
            assertTrue(line.getBytes(StandardCharsets.UTF_8).length <= 75, line);
        }
        assertTrue(unfold(ics).contains("SUMMARY:" + title.replace(",", "\\,") + "\r\n"));
    }

    private static String unfold(String ics) {
        return ics.replace("\r\n ", "");
    }
}
