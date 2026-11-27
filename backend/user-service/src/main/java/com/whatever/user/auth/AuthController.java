package com.whatever.user.auth;

import com.whatever.user.security.AuthUser;
import com.whatever.user.security.JwtService;
import com.whatever.user.users.UserRepository;
import com.whatever.user.web.ApiException;
import com.whatever.user.web.RateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class AuthController {
    private final JdbcTemplate db;
    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final JwtService jwt;
    private final RefreshTokenService refreshTokens;
    private final PasswordResetService passwordReset;
    private final RateLimiter rateLimiter;

    public AuthController(JdbcTemplate db, UserRepository users, PasswordEncoder encoder, JwtService jwt,
                          RefreshTokenService refreshTokens, PasswordResetService passwordReset,
                          RateLimiter rateLimiter) {
        this.db = db;
        this.users = users;
        this.encoder = encoder;
        this.jwt = jwt;
        this.refreshTokens = refreshTokens;
        this.passwordReset = passwordReset;
        this.rateLimiter = rateLimiter;
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok");
    }

    @GetMapping("/health/db")
    public Map<String, String> healthDb() {
        db.queryForObject("SELECT 1", Integer.class);
        return Map.of("status", "ok");
    }

    @PostMapping("/users/login")
    public Map<String, Object> login(@Valid @RequestBody LoginRequest request, HttpServletRequest http) {
        String email = UserRepository.normalizeEmail(request.email());
        rateLimiter.check("login-ip:" + RateLimiter.clientIp(http), 30, Duration.ofMinutes(10));
        rateLimiter.check("login-email:" + email, 8, Duration.ofMinutes(10));
        Map<String, Object> user = users.findByEmail(email)
                .filter(row -> encoder.matches(request.password(), String.valueOf(row.get("password_hash"))))
                .orElseThrow(() -> new ApiException(401, "Email sau parola incorecta."));
        return session(user);
    }

    @PostMapping("/users/register")
    public Map<String, Object> register(@Valid @RequestBody RegisterRequest request, HttpServletRequest http) {
        rateLimiter.check("register-ip:" + RateLimiter.clientIp(http), 10, Duration.ofHours(1));
        String email = UserRepository.normalizeEmail(request.email());
        String username = request.username().trim().replaceFirst("^@", "");
        Integer taken = db.queryForObject("SELECT count(*) FROM users WHERE email = ? OR lower(username) = lower(?)",
                Integer.class, email, username);
        if (taken != null && taken > 0) throw new ApiException(409, "Emailul sau username-ul există deja.");
        db.update("INSERT INTO users(full_name, username, email, password_hash, role) VALUES (?, ?, ?, ?, 'USER')",
                request.fullName().trim(), username, email, encoder.encode(request.password()));
        return session(users.require(email));
    }

    @PostMapping("/users/refresh")
    public Map<String, Object> refresh(@Valid @RequestBody RefreshRequest request) {
        String email = refreshTokens.consume(request.refreshToken())
                .orElseThrow(() -> new ApiException(401, "Autentificare necesara."));
        return session(users.findByEmail(email).orElseThrow(() -> new ApiException(401, "Autentificare necesara.")));
    }

    @PostMapping("/users/logout")
    public Map<String, Object> logout(@RequestBody(required = false) RefreshRequest request) {
        if (request != null) refreshTokens.revoke(request.refreshToken());
        return Map.of("ok", true);
    }

    @GetMapping("/users/me")
    public Map<String, Object> me(@AuthenticationPrincipal AuthUser auth) {
        return users.publicUser(users.require(auth.email()));
    }

    @PostMapping("/users/password")
    public Map<String, Object> changePassword(@AuthenticationPrincipal AuthUser auth,
                                              @Valid @RequestBody ChangePasswordRequest request) {
        Map<String, Object> user = users.require(auth.email());
        if (!encoder.matches(request.currentPassword(), String.valueOf(user.get("password_hash")))) {
            throw new ApiException(400, "Parola actuală este incorectă.");
        }
        db.update("UPDATE users SET password_hash = ? WHERE email = ?", encoder.encode(request.newPassword()), auth.email());
        refreshTokens.revokeAll(auth.email());
        Map<String, Object> response = session(user);
        response.put("message", "Parola a fost schimbată.");
        return response;
    }

    @PostMapping("/users/password-reset/request")
    public Map<String, String> requestReset(@Valid @RequestBody PasswordResetRequest request, HttpServletRequest http) {
        passwordReset.request(request.email(), request.username(), RateLimiter.clientIp(http));
        return Map.of("message", "Dacă datele sunt corecte, ți-am trimis un cod pe email.");
    }

    @PostMapping("/users/password-reset/confirm")
    public Map<String, String> confirmReset(@Valid @RequestBody PasswordResetConfirm request, HttpServletRequest http) {
        passwordReset.confirm(request.resetToken(), request.newPassword(), RateLimiter.clientIp(http));
        return Map.of("message", "Parola a fost schimbată. Te poți autentifica.");
    }

    private Map<String, Object> session(Map<String, Object> user) {
        String email = String.valueOf(user.get("email"));
        long id = ((Number) user.get("id")).longValue();
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("token", jwt.accessToken(id, email, String.valueOf(user.get("role"))));
        response.put("refreshToken", refreshTokens.issue(email));
        response.put("expiresIn", jwt.accessTtlSeconds());
        response.put("user", users.publicUser(user));
        return response;
    }

    public record LoginRequest(@NotBlank(message = "Emailul este obligatoriu.") @Email(message = "Email invalid.") String email,
                               @NotBlank(message = "Parola este obligatorie.") String password) {
    }

    public record RegisterRequest(
            @NotBlank(message = "Numele este obligatoriu.") @Size(min = 2, max = 120, message = "Numele trebuie să aibă 2-120 caractere.") String fullName,
            @NotBlank(message = "Username-ul este obligatoriu.")
            @Pattern(regexp = "@?[A-Za-z0-9._-]{3,30}", message = "Username-ul poate avea 3-30 caractere: litere, cifre, punct, _ sau -.") String username,
            @NotBlank(message = "Emailul este obligatoriu.") @Email(message = "Email invalid.") @Size(max = 150) String email,
            @NotBlank(message = "Parola este obligatorie.") @Size(min = 12, max = 128, message = "Parola trebuie să aibă cel puțin 12 caractere.") String password) {
    }

    public record RefreshRequest(@NotBlank(message = "Lipsește refresh token-ul.") String refreshToken) {
    }

    public record ChangePasswordRequest(@NotBlank(message = "Parola actuală este obligatorie.") String currentPassword,
                                        @NotBlank @Size(min = 12, max = 128, message = "Parola nouă trebuie să aibă cel puțin 12 caractere.") String newPassword) {
    }

    public record PasswordResetRequest(@NotBlank(message = "Emailul este obligatoriu.") @Email(message = "Email invalid.") String email,
                                       @NotBlank(message = "Username-ul este obligatoriu.") String username) {
    }

    public record PasswordResetConfirm(@NotBlank(message = "Codul este obligatoriu.") String resetToken,
                                       @NotBlank @Size(min = 12, max = 128, message = "Parola nouă trebuie să aibă cel puțin 12 caractere.") String newPassword) {
    }
}
