package com.whatever.user.device;

import com.whatever.user.security.AuthUser;
import com.whatever.user.web.RateLimiter;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/users/devices")
public class DeviceKeyController {
    private final DeviceKeyService devices;
    private final RateLimiter rateLimiter;

    public DeviceKeyController(DeviceKeyService devices, RateLimiter rateLimiter) {
        this.devices = devices;
        this.rateLimiter = rateLimiter;
    }

    @PostMapping
    public Map<String, String> register(@AuthenticationPrincipal AuthUser auth, @Valid @RequestBody RegisterDevice request) {
        rateLimiter.check("device-register:" + auth.email(), 10, Duration.ofHours(1));
        return Map.of("deviceId", devices.register(auth.email(), request.publicKey(), request.name()));
    }

    @GetMapping
    public List<Map<String, Object>> list(@AuthenticationPrincipal AuthUser auth) {
        return devices.list(auth.email());
    }

    @DeleteMapping("/{deviceId}")
    public Map<String, Object> delete(@AuthenticationPrincipal AuthUser auth, @PathVariable String deviceId) {
        devices.delete(auth.email(), deviceId);
        return Map.of("ok", true);
    }

    @PostMapping("/challenge")
    public Map<String, Object> challenge(@AuthenticationPrincipal AuthUser auth, @Valid @RequestBody ChallengeRequest request) {
        rateLimiter.check("device-challenge:" + auth.email(), 30, Duration.ofMinutes(5));
        return devices.challenge(auth.email(), request.deviceId(), request.taskId());
    }

    @PostMapping("/verify")
    public Map<String, String> verify(@AuthenticationPrincipal AuthUser auth, @Valid @RequestBody VerifyRequest request) {
        rateLimiter.check("device-verify:" + auth.email(), 30, Duration.ofMinutes(5));
        return Map.of("biometricToken", devices.verify(auth.email(), request.challengeId(), request.signature()));
    }

    public record RegisterDevice(@NotBlank(message = "Lipsește cheia publică.") String publicKey,
                                 @Size(max = 100) String name) {
    }

    public record ChallengeRequest(@NotBlank(message = "Lipsește telefonul.") String deviceId,
                                   @Positive long taskId) {
    }

    public record VerifyRequest(@Positive long challengeId,
                                @NotBlank(message = "Lipsește semnătura.") String signature) {
    }
}
