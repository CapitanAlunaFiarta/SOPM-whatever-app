package com.whatever.user.push;

import com.whatever.user.security.AuthUser;
import com.whatever.user.web.ApiException;
import com.whatever.user.web.RateLimiter;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.Map;

/** Notificările pe web: cheia publică, abonarea browserului, preferințele și o notificare de test. */
@RestController
@RequestMapping("/api/push")
public class PushController {
    private final PushService push;
    private final RateLimiter rateLimiter;

    public PushController(PushService push, RateLimiter rateLimiter) {
        this.push = push;
        this.rateLimiter = rateLimiter;
    }

    @GetMapping("/key")
    public Map<String, Object> key() {
        return Map.of("publicKey", push.publicKey());
    }

    @PostMapping("/subscriptions")
    public Map<String, Object> subscribe(@AuthenticationPrincipal AuthUser auth, @Valid @RequestBody SubscriptionRequest request) {
        rateLimiter.check("push:" + auth.email(), 20, Duration.ofMinutes(10));
        int devices = push.subscribe(auth.email(), request.endpoint(), request.keys() == null ? null : request.keys().p256dh(),
                request.keys() == null ? null : request.keys().auth(), request.language());
        return Map.of("ok", true, "devices", devices);
    }

    /** Browserul nu mai vrea notificări (sau cineva se deconectează de pe el). */
    @PostMapping("/unsubscribe")
    public Map<String, Object> unsubscribe(@AuthenticationPrincipal AuthUser auth, @RequestBody EndpointRequest request) {
        push.unsubscribe(auth.email(), request.endpoint());
        return Map.of("ok", true, "devices", push.devices(auth.email()));
    }

    @GetMapping("/settings")
    public Map<String, Object> settings(@AuthenticationPrincipal AuthUser auth) {
        return push.settings(auth.email());
    }

    @PutMapping("/settings")
    public Map<String, Object> updateSettings(@AuthenticationPrincipal AuthUser auth, @RequestBody Map<String, Boolean> changes) {
        return push.updateSettings(auth.email(), changes);
    }

    /** Trimite o notificare de probă pe toate dispozitivele mele. */
    @PostMapping("/test")
    public Map<String, Object> test(@AuthenticationPrincipal AuthUser auth) {
        rateLimiter.check("push-test:" + auth.email(), 5, Duration.ofMinutes(10));
        int devices = push.devices(auth.email());
        if (devices == 0) throw new ApiException(409, "Nu ai niciun dispozitiv abonat la notificări.");
        push.notify(auth.email(), null, Notes.test());
        return Map.of("ok", true, "devices", devices);
    }

    public record SubscriptionRequest(
            @NotBlank(message = "Abonamentul la notificări nu este valid.")
            @Size(max = 1000, message = "Abonamentul la notificări nu este valid.") String endpoint,
            Keys keys,
            String language) {
    }

    public record Keys(String p256dh, String auth) {
    }

    public record EndpointRequest(String endpoint) {
    }
}
