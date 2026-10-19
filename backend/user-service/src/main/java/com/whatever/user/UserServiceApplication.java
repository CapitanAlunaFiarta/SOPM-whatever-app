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
import java.nio.charset.StandardCharsets;
import java.time.Instant;
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

    public UserServiceApplication(JdbcTemplate db, PasswordEncoder encoder,
                                  @Value("${app.jwt.secret}") String secret,
                                  @Value("${app.jwt.expiration-ms}") long expiration,
                                  @Value("${app.admin-email}") String adminEmail,
                                  @Value("${app.admin-password}") String adminPassword) {
        this.db = db; this.encoder = encoder; this.jwtSecret = secret.getBytes(StandardCharsets.UTF_8);
        this.jwtExpiration = expiration; this.adminEmail = normalizeEmail(adminEmail); this.adminPassword = adminPassword;
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
    private record Token(String email, String role) {}
    private static String normalizeEmail(String value) { return value == null ? "" : value.trim().toLowerCase(Locale.ROOT); }

    @org.springframework.context.annotation.Bean WebMvcConfigurer cors(@Value("${app.cors-origin}") String origin) {
        return new WebMvcConfigurer() { public void addCorsMappings(CorsRegistry registry) {
            registry.addMapping("/**").allowedOrigins(origin).allowedMethods("GET","POST","DELETE","OPTIONS").allowedHeaders("*");
        }};
    }

    public record LoginRequest(@NotBlank @Email String email, @NotBlank String password) {}
    public record RegisterRequest(@NotBlank @Size(min=2,max=120) String fullName, @NotBlank @Size(min=3,max=100) String username,
                                  @NotBlank @Email String email, @NotBlank @Size(min=12,max=128) String password) {}
    public record ChatRequest(@NotBlank @Size(max=2000) String text) {}
    static class ApiException extends RuntimeException {
        private final int status; ApiException(int status, String message) { super(message); this.status = status; }
        public int status() { return status; }
    }
    @ExceptionHandler(ApiException.class) ResponseEntity<Map<String,String>> error(ApiException e) {
        return ResponseEntity.status(e.status()).body(Map.of("error", e.getMessage()));
    }
}
