package com.whatever.task.tasks;

import com.whatever.task.security.AuthUser;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/tasks/calendar")
public class CalendarController {
    private static final MediaType ICS = MediaType.parseMediaType("text/calendar;charset=UTF-8");

    private final CalendarService calendar;

    public CalendarController(CalendarService calendar) {
        this.calendar = calendar;
    }

    /** Ce am finalizat în fiecare zi a lunii; month = "2026-12" (implicit luna curentă). */
    @GetMapping
    public Map<String, Object> month(@AuthenticationPrincipal AuthUser user, @RequestParam(required = false) String month) {
        return calendar.month(user, month);
    }

    /** Harta zilelor active (recap): câte finalizări în fiecare zi din ultimele `weeks` săptămâni. */
    @GetMapping("/activity")
    public Map<String, Object> activity(@AuthenticationPrincipal AuthUser user, @RequestParam(required = false) Integer weeks) {
        return calendar.activity(user, weeks);
    }

    /** Tokenul pentru linkul de abonare (Google Calendar și altele). */
    @GetMapping("/link")
    public Map<String, Object> link(@AuthenticationPrincipal AuthUser user) {
        return calendar.link(user, false);
    }

    /** Un link nou; abonările făcute cu cel vechi nu se mai actualizează. */
    @PostMapping("/link/reset")
    public Map<String, Object> resetLink(@AuthenticationPrincipal AuthUser user) {
        return calendar.link(user, true);
    }

    /** Fișierul .ics citit de Google Calendar (fără autentificare: tokenul e secretul). lang = ro / en / es. */
    @GetMapping("/feed/{token}.ics")
    public ResponseEntity<String> feed(@PathVariable String token, @RequestParam(required = false) String lang) {
        return ResponseEntity.ok()
                .contentType(ICS)
                .header("Cache-Control", "no-cache")
                .header("Content-Disposition", "inline; filename=\"whatever.ics\"")
                .body(calendar.feed(token, lang));
    }
}
