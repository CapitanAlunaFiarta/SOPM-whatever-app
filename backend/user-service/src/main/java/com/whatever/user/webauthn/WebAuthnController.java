package com.whatever.user.webauthn;

import com.whatever.user.security.AuthUser;
import com.whatever.user.web.RateLimiter;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.Map;

/** Passkey pe web. Ambele rute de "options" întorc {"publicKey": {...}}. */
@RestController
@RequestMapping("/api/users/webauthn")
public class WebAuthnController {
    private final WebAuthnService webAuthn;
    private final RateLimiter rateLimiter;

    public WebAuthnController(WebAuthnService webAuthn, RateLimiter rateLimiter) {
        this.webAuthn = webAuthn;
        this.rateLimiter = rateLimiter;
    }

    @PostMapping("/register/options")
    public ResponseEntity<String> registrationOptions(@AuthenticationPrincipal AuthUser auth) {
        return json(webAuthn.beginRegistration(auth.email()));
    }

    @PostMapping("/register/finish")
    public Map<String, String> registrationFinish(@AuthenticationPrincipal AuthUser auth,
                                                  @Valid @RequestBody CredentialRequest request) {
        webAuthn.finishRegistration(auth.email(), request.credentialJson());
        return Map.of("message", "Passkey-ul a fost activat.");
    }

    @PostMapping("/assertion/options")
    public ResponseEntity<String> assertionOptions(@AuthenticationPrincipal AuthUser auth) {
        return json(webAuthn.beginAssertion(auth.email()));
    }

    @PostMapping("/assertion/finish")
    public Map<String, String> assertionFinish(@AuthenticationPrincipal AuthUser auth,
                                               @Valid @RequestBody AssertionRequestBody request) {
        rateLimiter.check("webauthn:" + auth.email(), 20, Duration.ofMinutes(5));
        return Map.of("biometricToken", webAuthn.finishAssertion(auth.email(), request.credentialJson(), request.taskId()));
    }

    private static ResponseEntity<String> json(String body) {
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(body);
    }

    public record CredentialRequest(@NotBlank String credentialJson) {
    }

    public record AssertionRequestBody(@NotBlank String credentialJson, @Positive long taskId) {
    }
}
