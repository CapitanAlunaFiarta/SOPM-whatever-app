package com.whatever.task;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.*;

@RestController
@RequestMapping("/api/tasks")
@SpringBootApplication
public class TaskServiceApplication {
    private final JdbcTemplate db;
    private final byte[] jwtSecret;
    public TaskServiceApplication(JdbcTemplate db, @Value("${app.jwt.secret}") String secret) {
        this.db = db; this.jwtSecret = secret.getBytes(StandardCharsets.UTF_8);
    }
    public static void main(String[] args) { SpringApplication.run(TaskServiceApplication.class, args); }

    @GetMapping
    public List<Map<String, Object>> list(@RequestHeader("Authorization") String authorization) {
        Token token = requireToken(authorization);
        return db.queryForList("SELECT id,title,category,priority,"
                + "CASE WHEN status='Upcoming' AND due_date<CURRENT_DATE THEN 'Overdue' ELSE status END AS status,"
                + "is_recurring AS \"isRecurring\","
                + "streak_count AS \"streakCount\",requires_location AS \"requiresLocation\",latitude,longitude,"
                + "allowed_radius_meters AS radius,requires_biometrics AS \"requiresBiometrics\","
                + "due_date AS \"dueDate\",owner_email AS \"ownerEmail\",shared_with_friend AS friend FROM tasks "
                + "WHERE owner_email=? OR shared_with_friend IN (SELECT username FROM users WHERE email=?) "
                + "ORDER BY id DESC", token.email(), token.email());
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        db.queryForObject("SELECT 1", Integer.class);
        return Map.of("status", "ok");
    }

    @PostMapping
    public Map<String, Object> create(@RequestHeader("Authorization") String authorization, @Valid @RequestBody TaskRequest request) {
        Token token = requireToken(authorization);
        db.update("INSERT INTO tasks(title,category,priority,status,is_recurring,requires_location,latitude,longitude,"
                        + "allowed_radius_meters,requires_biometrics,due_date,owner_email,shared_with_friend)"
                        + " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", request.title().trim(), request.category(), request.priority(), "Upcoming",
                request.isRecurring(), request.requiresLocation(), request.latitude(), request.longitude(), request.radius(),
                request.requiresBiometrics(), request.dueDate(), token.email(), request.friend() == null ? "" : request.friend().trim());
        return db.queryForMap("SELECT id,title,category,priority,status,owner_email AS \"ownerEmail\" FROM tasks WHERE owner_email=? ORDER BY id DESC LIMIT 1", token.email());
    }

    @PutMapping("/{id}")
    public Map<String, Object> update(@RequestHeader("Authorization") String authorization, @PathVariable long id,
                                      @Valid @RequestBody TaskUpdateRequest request) {
        Token token = requireToken(authorization);
        if (db.update("UPDATE tasks SET title=?,category=?,priority=?,due_date=?,shared_with_friend=?,"
                        + "requires_location=?,latitude=?,longitude=?,allowed_radius_meters=?,requires_biometrics=?,"
                        + "updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_email=?",
                request.title().trim(), request.category(), request.priority(), request.dueDate(),
                request.friend() == null ? "" : request.friend().trim(), request.requiresLocation(), request.latitude(),
                request.longitude(), request.radius(), request.requiresBiometrics(), id, token.email()) == 0)
            throw new ApiException(404, "Task negasit.");
        return db.queryForMap("SELECT id,title,category,priority,status,due_date AS \"dueDate\" FROM tasks WHERE id=?", id);
    }

    @PostMapping("/{id}/cancel")
    public void cancel(@RequestHeader("Authorization") String authorization, @PathVariable long id) {
        Token token = requireToken(authorization);
        if (db.update("UPDATE tasks SET status='Canceled',canceled_at=CURRENT_TIMESTAMP WHERE id=? AND owner_email=?",
                id, token.email()) == 0) throw new ApiException(404, "Task negasit.");
    }

    @PostMapping("/{id}/freeze")
    public Map<String, Object> freeze(@RequestHeader("Authorization") String authorization, @PathVariable long id) {
        Token token = requireToken(authorization);
        int changed = db.update("UPDATE users SET streak_freezes_left=streak_freezes_left-1,freeze_month=? "
                        + "WHERE email=? AND (freeze_month IS NULL OR freeze_month<>? OR streak_freezes_left>0)",
                LocalDate.now().withDayOfMonth(1), token.email(), LocalDate.now().withDayOfMonth(1));
        if (changed == 0) throw new ApiException(400, "Nu mai ai streak freezes disponibile.");
        if (db.update("UPDATE tasks SET due_date=CURRENT_DATE,status='Upcoming' WHERE id=? AND owner_email=? AND status='Overdue'",
                id, token.email()) == 0)
            db.update("UPDATE tasks SET due_date=CURRENT_DATE,status='Upcoming' WHERE id=? AND owner_email=? AND due_date<CURRENT_DATE",
                    id, token.email());
        return db.queryForMap("SELECT streak_freezes_left AS \"freezesLeft\" FROM users WHERE email=?", token.email());
    }

    @PostMapping("/{id}/verify-complete")
    public Map<String, Object> complete(@RequestHeader("Authorization") String authorization, @PathVariable long id,
                                        @Valid @RequestBody CompletionRequest request) {
        Token token = requireToken(authorization);
        Map<String, Object> task = ownedTask(id, token.email());
        double distance = distance(((Number) task.get("latitude")).doubleValue(), ((Number) task.get("longitude")).doubleValue(),
                request.latitude(), request.longitude());
        if (Boolean.parseBoolean(String.valueOf(task.get("requires_location")))
                && distance > ((Number) task.get("allowed_radius_meters")).doubleValue())
            throw new ApiException(400, "Locatie invalida: " + Math.round(distance) + "m distanta.");
        if (Boolean.parseBoolean(String.valueOf(task.get("requires_biometrics"))))
            requireBiometricToken(request.biometricToken(), token.email(), id);
        db.update("UPDATE tasks SET status='Completed',streak_count=streak_count+1 WHERE id=?", id);
        db.update("UPDATE users SET streak=streak+1,last_streak_date=CURRENT_DATE,"
                + "streak_freezes_left=CASE WHEN freeze_month IS NULL OR freeze_month<>DATE_TRUNC('month',CURRENT_DATE)::date "
                + "THEN 3 ELSE streak_freezes_left END,freeze_month=DATE_TRUNC('month',CURRENT_DATE)::date WHERE email=?", token.email());
        return db.queryForMap("SELECT id,title,status,streak_count AS \"streakCount\" FROM tasks WHERE id=?", id);
    }

    @DeleteMapping("/{id}")
    public void delete(@RequestHeader("Authorization") String authorization, @PathVariable long id) {
        Token token = requireToken(authorization);
        if (db.update("DELETE FROM tasks WHERE id=? AND owner_email=?", id, token.email()) == 0) throw new ApiException(404, "Task negasit.");
    }

    private Map<String, Object> ownedTask(long id, String email) {
        List<Map<String, Object>> rows = db.queryForList("SELECT * FROM tasks WHERE id=? AND owner_email=?", id, email);
        if (rows.isEmpty()) throw new ApiException(404, "Task negasit.");
        return rows.get(0);
    }
    private Token requireToken(String header) {
        try {
            if (header == null || !header.startsWith("Bearer ")) throw new Exception();
            var claims = Jwts.parser().verifyWith(Keys.hmacShaKeyFor(jwtSecret)).build().parseSignedClaims(header.substring(7)).getPayload();
            return new Token(claims.getSubject());
        } catch (Exception e) { throw new ApiException(401, "Autentificare necesara."); }
    }
    private void requireBiometricToken(String header, String email, long taskId) {
        try {
            if (header == null || !header.startsWith("Bearer ")) throw new Exception();
            var claims = Jwts.parser().verifyWith(Keys.hmacShaKeyFor(jwtSecret)).build()
                    .parseSignedClaims(header.substring(7)).getPayload();
            if (!email.equals(claims.getSubject())
                    || !Boolean.TRUE.equals(claims.get("webauthn", Boolean.class))
                    || !String.valueOf(taskId).equals(String.valueOf(claims.get("taskId"))))
                throw new Exception();
        } catch (Exception e) {
            throw new ApiException(401, "Verificarea biometrică este necesară.");
        }
    }
    private record Token(String email) {}
    private static double distance(double lat1,double lon1,double lat2,double lon2) {
        double r=6371000, dLat=Math.toRadians(lat2-lat1), dLon=Math.toRadians(lon2-lon1);
        double a=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(Math.toRadians(lat1))*Math.cos(Math.toRadians(lat2))*Math.sin(dLon/2)*Math.sin(dLon/2);
        return r*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
    }
    @Bean SecurityFilterChain security(HttpSecurity http) throws Exception {
        return http.csrf(csrf -> csrf.disable()).authorizeHttpRequests(auth -> auth.anyRequest().permitAll()).build();
    }
    @Bean WebMvcConfigurer cors(@Value("${app.cors-origin}") String origin) {
        return new WebMvcConfigurer() { public void addCorsMappings(CorsRegistry registry) {
            registry.addMapping("/**").allowedOrigins(Arrays.stream(origin.split(","))
                    .map(String::trim).filter(value -> !value.isEmpty()).toArray(String[]::new))
                    .allowedMethods("GET","POST","PUT","DELETE","OPTIONS").allowedHeaders("*");
        }};
    }
    public record TaskRequest(@NotBlank @Size(max=255) String title, @NotBlank String category, @NotBlank String priority,
                              boolean isRecurring, boolean requiresLocation, @DecimalMin("-90") @DecimalMax("90") double latitude,
                              @DecimalMin("-180") @DecimalMax("180") double longitude, @Min(10) @Max(10000) int radius,
                              boolean requiresBiometrics, @NotNull LocalDate dueDate, @Size(max=100) String friend) {}
    public record TaskUpdateRequest(@NotBlank @Size(max=255) String title, @NotBlank String category, @NotBlank String priority,
                                    boolean requiresLocation, @DecimalMin("-90") @DecimalMax("90") double latitude,
                                    @DecimalMin("-180") @DecimalMax("180") double longitude, @Min(10) @Max(10000) int radius,
                                    boolean requiresBiometrics, @NotNull LocalDate dueDate, @Size(max=100) String friend) {}
    public record CompletionRequest(@DecimalMin("-90") @DecimalMax("90") double latitude, @DecimalMin("-180") @DecimalMax("180") double longitude,
                                    String biometricToken) {}
    static class ApiException extends RuntimeException {
        private final int status; ApiException(int status,String message){super(message);this.status=status;} int status(){return status;}
    }
    @ExceptionHandler(ApiException.class) ResponseEntity<Map<String,String>> error(ApiException e) {
        return ResponseEntity.status(e.status()).body(Map.of("error", e.getMessage()));
    }
}
