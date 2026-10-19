package com.whatever.user;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.*;

@RestController
@RequestMapping("/api")
@SpringBootApplication
public class UserServiceApplication {
    private final JdbcTemplate db;
    private final PasswordEncoder encoder;
    private final byte[] jwtSecret;
    private final long jwtExpiration;
    private final String adminEmail;
    private final String adminPassword;
    private final JavaMailSender mailSender;
    private final String mailFrom;
    private final String publicUrl;
    private final WebAuthnService webAuthn;

    public UserServiceApplication(JdbcTemplate db, PasswordEncoder encoder,
                                  @Value("${app.jwt.secret}") String secret,
                                  @Value("${app.jwt.expiration-ms}") long expiration,
                                  @Value("${app.admin-email}") String adminEmail,
                                  @Value("${app.admin-password}") String adminPassword,
                                  JavaMailSender mailSender,
                                  @Value("${app.mail.from}") String mailFrom,
                                  @Value("${app.public-url}") String publicUrl,
                                  WebAuthnService webAuthn) {
        this.db = db; this.encoder = encoder; this.jwtSecret = secret.getBytes(StandardCharsets.UTF_8);
        this.jwtExpiration = expiration; this.adminEmail = normalizeEmail(adminEmail); this.adminPassword = adminPassword;
        this.mailSender = mailSender; this.mailFrom = mailFrom; this.publicUrl = publicUrl; this.webAuthn = webAuthn;
    }
    public static void main(String[] args) { SpringApplication.run(UserServiceApplication.class, args); }

    @PostConstruct
    void seedAdmin() {
        if (adminPassword == null || adminPassword.length() < 12) throw new IllegalStateException("ADMIN_PASSWORD must be at least 12 characters");
        Number existingAdminCount = db.queryForObject("SELECT COUNT(*) FROM users WHERE email=?", Number.class, adminEmail);
        if (existingAdminCount == null || existingAdminCount.longValue() == 0) {
            db.update("INSERT INTO users(full_name,username,email,password_hash,role,streak,streak_freezes_left,biometric_enabled) VALUES(?,?,?,?,?,?,?,?)",
                    "Administrator", "sebi_admin", adminEmail, encoder.encode(adminPassword), "ADMIN", 0, 3, false);
        } else {
            db.update("UPDATE users SET password_hash=?,role='ADMIN' WHERE email=?", encoder.encode(adminPassword), adminEmail);
        }
    }

    @PostMapping("/users/login")
    public Map<String, Object> login(@Valid @RequestBody LoginRequest request) {
        String email = normalizeEmail(request.email());
        List<Map<String, Object>> rows = db.queryForList("SELECT * FROM users WHERE email=?", email);
        if (rows.isEmpty() || !encoder.matches(request.password(), (String) rows.get(0).get("password_hash")))
            throw new ApiException(401, "Email sau parola incorecta.");
        return authResponse(rows.get(0));
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        db.queryForObject("SELECT 1", Integer.class);
        return Map.of("status", "ok");
    }

    @PostMapping("/users/register")
    public Map<String, Object> register(@Valid @RequestBody RegisterRequest request) {
        String email = normalizeEmail(request.email());
        if (!db.queryForList("SELECT id FROM users WHERE email=? OR username=?", email, request.username().trim()).isEmpty())
            throw new ApiException(409, "Emailul sau username-ul exista deja.");
        db.update("INSERT INTO users(full_name,username,email,password_hash,role) VALUES(?,?,?,?,?)",
                request.fullName().trim(), request.username().trim(), email, encoder.encode(request.password()), "USER");
        return authResponse(db.queryForList("SELECT * FROM users WHERE email=?", email).get(0));
    }

    @PostMapping("/users/password-reset/request")
    public Map<String, String> requestPasswordReset(@Valid @RequestBody PasswordResetRequest request) {
        List<Map<String, Object>> rows = db.queryForList("SELECT id FROM users WHERE email=? AND username=?",
                normalizeEmail(request.email()), request.username().trim());
        if (!rows.isEmpty()) {
            String resetToken = UUID.randomUUID().toString().replace("-", "");
            db.update("UPDATE users SET password_reset_token=?,password_reset_expires_at=? WHERE email=?",
                    resetToken, java.sql.Timestamp.from(Instant.now().plusSeconds(900)), normalizeEmail(request.email()));
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(mailFrom);
            message.setTo(normalizeEmail(request.email()));
            message.setSubject("Whatever - resetare parolă");
            message.setText("Ai solicitat resetarea parolei. Codul temporar este:\n\n" + resetToken
                    + "\n\nCodul expiră în 15 minute. Dacă nu ai solicitat resetarea, ignoră acest mesaj.\n" + publicUrl);
            try {
                mailSender.send(message);
            } catch (RuntimeException e) {
                db.update("UPDATE users SET password_reset_token=NULL,password_reset_expires_at=NULL WHERE email=?",
                        normalizeEmail(request.email()));
                throw new ApiException(503, "Emailul de resetare nu a putut fi trimis.");
            }
        }
        return Map.of("message", "Dacă datele sunt corecte, resetarea este disponibilă.");
    }

    @PostMapping("/users/webauthn/register/options")
    public Object webAuthnRegistrationOptions(@RequestHeader("Authorization") String authorization) {
        return webAuthn.beginRegistration(requireToken(authorization).email());
    }

    @PostMapping("/users/webauthn/register/finish")
    public Map<String, String> webAuthnRegistrationFinish(@RequestHeader("Authorization") String authorization,
                                                           @Valid @RequestBody WebAuthnResponseRequest request) {
        webAuthn.finishRegistration(requireToken(authorization).email(), request.credentialJson());
        return Map.of("message", "Biometria a fost activata.");
    }

    @PostMapping("/users/webauthn/assertion/options")
    public Object webAuthnAssertionOptions(@RequestHeader("Authorization") String authorization) {
        return webAuthn.beginAssertion(requireToken(authorization).email());
    }

    @PostMapping("/users/webauthn/assertion/finish")
    public Map<String, String> webAuthnAssertionFinish(@RequestHeader("Authorization") String authorization,
                                                        @Valid @RequestBody WebAuthnAssertionRequest request) {
        String token = requireToken(authorization).email();
        return Map.of("biometricToken", webAuthn.finishAssertion(token, request.credentialJson(), request.taskId()));
    }

    @PostMapping("/users/password-reset/confirm")
    public Map<String, String> confirmPasswordReset(@Valid @RequestBody PasswordResetConfirm request) {
        int updated = db.update("UPDATE users SET password_hash=?,password_reset_token=NULL,password_reset_expires_at=NULL "
                        + "WHERE password_reset_token=? AND password_reset_expires_at>CURRENT_TIMESTAMP",
                encoder.encode(request.newPassword()), request.resetToken());
        if (updated == 0) throw new ApiException(400, "Token de resetare invalid sau expirat.");
        return Map.of("message", "Parola a fost schimbata.");
    }

    @PostMapping("/users/password")
    public Map<String, String> changePassword(@RequestHeader("Authorization") String authorization,
                                               @Valid @RequestBody ChangePasswordRequest request) {
        Token token = requireToken(authorization);
        Map<String, Object> user = findUser(token);
        if (!encoder.matches(request.currentPassword(), String.valueOf(user.get("password_hash"))))
            throw new ApiException(400, "Parola actuala este incorecta.");
        db.update("UPDATE users SET password_hash=? WHERE email=?", encoder.encode(request.newPassword()), token.email());
        return Map.of("message", "Parola a fost schimbata.");
    }

    @GetMapping("/leaderboard")
    public List<Map<String, Object>> leaderboard(@RequestHeader("Authorization") String authorization) {
        requireToken(authorization);
        return db.queryForList("SELECT username,full_name AS \"fullName\",streak FROM users ORDER BY streak DESC,username ASC LIMIT 100");
    }

    @PostMapping("/friends")
    public Map<String, String> addFriend(@RequestHeader("Authorization") String authorization,
                                         @Valid @RequestBody FriendRequest request) {
        Token token = requireToken(authorization);
        String friendUsername = request.username().trim().replaceFirst("^@", "");
        List<Map<String, Object>> friend = db.queryForList("SELECT email FROM users WHERE username=?", friendUsername);
        if (friend.isEmpty()) throw new ApiException(404, "Utilizatorul nu exista.");
        db.update("INSERT INTO friends(user_email,friend_email) VALUES(?,?) ON CONFLICT DO NOTHING",
                token.email(), friend.get(0).get("email"));
        return Map.of("message", "Prieten adaugat.");
    }

    @GetMapping("/friends")
    public List<Map<String, Object>> friends(@RequestHeader("Authorization") String authorization) {
        Token token = requireToken(authorization);
        return db.queryForList("SELECT u.username,u.full_name AS \"fullName\",u.email FROM friends f "
                + "JOIN users u ON u.email=f.friend_email WHERE f.user_email=?", token.email());
    }

    @GetMapping("/admin/users")
    public List<Map<String, Object>> adminUsers(@RequestHeader("Authorization") String authorization) {
        requireAdmin(authorization);
        return db.queryForList("SELECT id,full_name AS \"fullName\",username,email,role,streak,"
                + "streak_freezes_left AS \"freezesLeft\",created_at AS \"createdAt\" FROM users ORDER BY id");
    }

    @PostMapping("/admin/users/{email}/reset-freezes")
    public void resetFreezes(@RequestHeader("Authorization") String authorization, @PathVariable String email) {
        requireAdmin(authorization);
        db.update("UPDATE users SET streak_freezes_left=3,freeze_month=? WHERE email=?",
                LocalDate.now().withDayOfMonth(1), normalizeEmail(email));
    }

    @PostMapping("/admin/users/{email}/bonus-streak")
    public void bonusStreak(@RequestHeader("Authorization") String authorization, @PathVariable String email) {
        requireAdmin(authorization);
        db.update("UPDATE users SET streak=streak+5 WHERE email=?", normalizeEmail(email));
    }

    @PostMapping("/admin/users/{email}/password")
    public void adminPassword(@RequestHeader("Authorization") String authorization, @PathVariable String email,
                              @Valid @RequestBody AdminPasswordRequest request) {
        requireAdmin(authorization);
        db.update("UPDATE users SET password_hash=? WHERE email=?", encoder.encode(request.newPassword()), normalizeEmail(email));
    }

    @DeleteMapping("/admin/users/{email}")
    public void deleteUser(@RequestHeader("Authorization") String authorization, @PathVariable String email) {
        Token token = requireAdmin(authorization);
        String target = normalizeEmail(email);
        if (target.equals(token.email())) throw new ApiException(400, "Administratorul nu se poate sterge.");
        if (db.update("DELETE FROM users WHERE email=?", target) == 0) throw new ApiException(404, "Utilizator negasit.");
    }

    @GetMapping("/users/me")
    public Map<String, Object> me(@RequestHeader("Authorization") String authorization) {
        return publicUser(findUser(requireToken(authorization)));
    }

    @GetMapping("/users/all")
    public List<Map<String, Object>> all(@RequestHeader("Authorization") String authorization) {
        Token token = requireToken(authorization);
        if (!"ADMIN".equals(token.role())) throw new ApiException(403, "Acces interzis.");
        return db.queryForList("SELECT id,full_name,username,email,role,streak,streak_freezes_left,biometric_enabled,created_at FROM users");
    }

    @GetMapping("/chat")
    public List<Map<String, Object>> chat(@RequestHeader("Authorization") String authorization) {
        requireToken(authorization);
        return db.queryForList("SELECT id,sender_username AS \"senderUsername\",sender_name AS \"senderName\",sender_role AS \"senderRole\",message_text AS text,sent_at AS time FROM chat_messages ORDER BY id DESC LIMIT 200");
    }

    @PostMapping("/chat")
    public Map<String, Object> postChat(@RequestHeader("Authorization") String authorization,
                                        @Valid @RequestBody ChatRequest request) {
        Token token = requireToken(authorization);
        Map<String, Object> user = findUser(token);
        db.update("INSERT INTO chat_messages(sender_username,sender_name,sender_role,message_text,sent_at) VALUES(?,?,?,?,?)",
                user.get("username"), user.get("full_name"), user.get("role"), request.text().trim(), Instant.now().toString());
        return Map.of("ok", true);
    }

    @DeleteMapping("/chat/{id}")
    public void deleteChat(@RequestHeader("Authorization") String authorization, @PathVariable long id) {
        Token token = requireToken(authorization);
        if (!"ADMIN".equals(token.role())) throw new ApiException(403, "Acces interzis.");
        db.update("DELETE FROM chat_messages WHERE id=?", id);
    }

    private Map<String, Object> authResponse(Map<String, Object> user) {
        String token = Jwts.builder().subject(String.valueOf(user.get("email"))).claim("role", user.get("role"))
                .issuedAt(new Date()).expiration(new Date(System.currentTimeMillis() + jwtExpiration))
                .signWith(Keys.hmacShaKeyFor(jwtSecret)).compact();
        return Map.of("token", token, "user", publicUser(user));
    }

    private Map<String, Object> findUser(Token token) {
        List<Map<String, Object>> rows = db.queryForList("SELECT * FROM users WHERE email=?", token.email());
        if (rows.isEmpty()) throw new ApiException(401, "Sesiune invalida.");
        return rows.get(0);
    }

    private Map<String, Object> publicUser(Map<String, Object> row) {
        Map<String, Object> user = new LinkedHashMap<>();
        user.put("id", row.get("id")); user.put("fullName", row.get("full_name")); user.put("username", row.get("username"));
        user.put("email", row.get("email")); user.put("role", row.get("role")); user.put("streak", row.get("streak"));
        user.put("freezesLeft", row.get("streak_freezes_left")); user.put("biometricEnabled", row.get("biometric_enabled"));
        return user;
    }

    private Token requireToken(String header) {
        try {
            if (header == null || !header.startsWith("Bearer ")) throw new Exception();
            var claims = Jwts.parser().verifyWith(Keys.hmacShaKeyFor(jwtSecret)).build().parseSignedClaims(header.substring(7)).getPayload();
            return new Token(claims.getSubject(), String.valueOf(claims.get("role")));
        } catch (Exception e) { throw new ApiException(401, "Autentificare necesara."); }
    }
    private Token requireAdmin(String header) {
        Token token = requireToken(header);
        if (!"ADMIN".equals(token.role())) throw new ApiException(403, "Acces interzis.");
        return token;
    }
    private record Token(String email, String role) {}
    private static String normalizeEmail(String value) { return value == null ? "" : value.trim().toLowerCase(Locale.ROOT); }

    @org.springframework.context.annotation.Bean WebMvcConfigurer cors(@Value("${app.cors-origin}") String origin) {
        return new WebMvcConfigurer() { public void addCorsMappings(CorsRegistry registry) {
            registry.addMapping("/**").allowedOrigins(origin).allowedMethods("GET","POST","PUT","DELETE","OPTIONS").allowedHeaders("*");
        }};
    }

    public record LoginRequest(@NotBlank @Email String email, @NotBlank String password) {}
    public record RegisterRequest(@NotBlank @Size(min=2,max=120) String fullName, @NotBlank @Size(min=3,max=100) String username,
                                  @NotBlank @Email String email, @NotBlank @Size(min=12,max=128) String password) {}
    public record ChatRequest(@NotBlank @Size(max=2000) String text) {}
    public record PasswordResetRequest(@NotBlank @Email String email, @NotBlank String username) {}
    public record PasswordResetConfirm(@NotBlank String resetToken, @NotBlank @Size(min=12,max=128) String newPassword) {}
    public record ChangePasswordRequest(@NotBlank String currentPassword, @NotBlank @Size(min=12,max=128) String newPassword) {}
    public record FriendRequest(@NotBlank @Size(min=2,max=100) String username) {}
    public record AdminPasswordRequest(@NotBlank @Size(min=12,max=128) String newPassword) {}
    public record WebAuthnResponseRequest(@NotBlank String credentialJson) {}
    public record WebAuthnAssertionRequest(@NotBlank String credentialJson, @jakarta.validation.constraints.Positive long taskId) {}
    static class ApiException extends RuntimeException {
        private final int status; ApiException(int status, String message) { super(message); this.status = status; }
        public int status() { return status; }
    }
    @ExceptionHandler(ApiException.class) ResponseEntity<Map<String,String>> error(ApiException e) {
        return ResponseEntity.status(e.status()).body(Map.of("error", e.getMessage()));
    }
}
