package com.whatever.task;

import com.whatever.task.security.JwtService;
import com.whatever.task.tasks.TaskRules;
import com.whatever.task.web.ApiException;
import io.jsonwebtoken.Jwts;
import org.junit.jupiter.api.Test;

import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.Date;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TaskRulesTest {
    private static final String SECRET = "test-secret-test-secret-test-secret-0123456789";
    private static final LocalDate TODAY = LocalDate.of(2026, 11, 27);

    @Test
    void streakCountsConsecutiveDays() {
        assertEquals(1, TaskRules.nextStreak(0, null, TODAY));
        assertEquals(5, TaskRules.nextStreak(5, TODAY, TODAY));
        assertEquals(6, TaskRules.nextStreak(5, TODAY.minusDays(1), TODAY));
        assertEquals(1, TaskRules.nextStreak(5, TODAY.minusDays(2), TODAY));
    }

    @Test
    void freezesResetEveryMonth() {
        assertEquals(1, TaskRules.availableFreezes(1, TODAY.withDayOfMonth(1), TODAY));
        assertEquals(3, TaskRules.availableFreezes(0, TODAY.minusMonths(1).withDayOfMonth(1), TODAY));
        assertEquals(3, TaskRules.availableFreezes(0, null, TODAY));
    }

    @Test
    void freezeCoversOneMissedDay() {
        assertEquals(TODAY.minusDays(1), TaskRules.lastActiveAfterFreeze(TODAY.minusDays(2), TODAY));
        assertEquals(TODAY, TaskRules.lastActiveAfterFreeze(TODAY, TODAY));
        assertNull(TaskRules.lastActiveAfterFreeze(null, TODAY));
    }

    @Test
    void legacyValuesAreNormalized() {
        assertEquals("Personal", TaskRules.category("General"));
        assertEquals("Sănătate", TaskRules.category("sănătate"));
        assertEquals("Medium", TaskRules.priority("Normal"));
        assertThrows(ApiException.class, () -> TaskRules.category("Altceva"));
        assertThrows(ApiException.class, () -> TaskRules.priority("Urgent"));
    }

    @Test
    void distanceIsRoughlyCorrect() {
        double meters = TaskRules.distanceMeters(45.6525, 25.5888, 45.6534, 25.5888);
        assertTrue(meters > 95 && meters < 105, "~100m, a fost " + meters);
    }

    @Test
    void biometricTokenIsBoundToUserAndTask() {
        JwtService jwt = new JwtService(SECRET);
        var key = new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
        String token = Jwts.builder().subject("ana@example.com").claim("typ", "biometric").claim("taskId", 12L)
                .expiration(new Date(System.currentTimeMillis() + 60_000)).signWith(key, Jwts.SIG.HS256).compact();
        assertTrue(jwt.isValidBiometric(token, "ana@example.com", 12));
        assertTrue(jwt.isValidBiometric("Bearer " + token, "ana@example.com", 12));
        assertFalse(jwt.isValidBiometric(token, "ana@example.com", 13));
        assertFalse(jwt.isValidBiometric(token, "bob@example.com", 12));
        assertTrue(jwt.parseAccess(token).isEmpty());
        assertFalse(jwt.isValidBiometric(null, "ana@example.com", 12));
    }
}
