package com.whatever.user.web;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Limitare simplă în memorie (o singură instanță pe Render), cu fereastră glisantă.
 * Protejează login-ul, înregistrarea, resetarea parolei și verificările biometrice.
 */
@Component
public class RateLimiter {
    private static final long MAX_WINDOW_MS = Duration.ofHours(1).toMillis();
    private final Map<String, Deque<Long>> hits = new ConcurrentHashMap<>();

    public void check(String key, int max, Duration window) {
        long now = System.currentTimeMillis();
        long from = now - window.toMillis();
        Deque<Long> queue = hits.computeIfAbsent(key, ignored -> new ArrayDeque<>());
        synchronized (queue) {
            while (!queue.isEmpty() && queue.peekFirst() < from) {
                queue.pollFirst();
            }
            if (queue.size() >= max) {
                throw new ApiException(429, "Prea multe încercări. Încearcă din nou peste câteva minute.");
            }
            queue.addLast(now);
        }
    }

    public static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    @Scheduled(fixedDelay = 600_000)
    void cleanup() {
        long from = System.currentTimeMillis() - MAX_WINDOW_MS;
        hits.entrySet().removeIf(entry -> {
            Deque<Long> queue = entry.getValue();
            synchronized (queue) {
                return queue.isEmpty() || queue.peekLast() < from;
            }
        });
    }
}
