package com.whatever.user.profile;

import com.whatever.user.security.AuthUser;
import com.whatever.user.users.UserRepository;
import com.whatever.user.web.ApiException;
import com.whatever.user.web.RateLimiter;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * Profilul meu: descrierea scurtă și poza. Poza se vede de oricine o cere (GET /api/avatars/{username}, fără
 * autentificare, ca imaginile să se poată încărca direct în aplicație și pe web); linkul are versiunea pozei
 * (?v=...), deci browserul o poate ține în cache, iar o poză nouă are alt link.
 */
@RestController
@RequestMapping("/api")
public class ProfileController {
    private final JdbcTemplate db;
    private final UserRepository users;
    private final RateLimiter rateLimiter;

    public ProfileController(JdbcTemplate db, UserRepository users, RateLimiter rateLimiter) {
        this.db = db;
        this.users = users;
        this.rateLimiter = rateLimiter;
    }

    /** Descrierea de pe profil (cel mult 160 de caractere; goală = fără descriere). */
    @PutMapping("/users/me/profile")
    public Map<String, Object> updateProfile(@AuthenticationPrincipal AuthUser auth, @Valid @RequestBody ProfileRequest request) {
        rateLimiter.check("profile:" + auth.email(), 30, Duration.ofMinutes(10));
        String bio = request.bio() == null ? "" : request.bio().strip().replaceAll("\\s*\\R\\s*", " ");
        db.update("UPDATE users SET bio = ? WHERE email = ?", bio, auth.email());
        return users.publicUser(users.require(auth.email()));
    }

    /** Poza nouă: JPEG sau PNG în base64, recodată de server la 256×256. */
    @PutMapping("/users/me/avatar")
    @Transactional
    public Map<String, Object> uploadAvatar(@AuthenticationPrincipal AuthUser auth, @Valid @RequestBody AvatarRequest request) {
        rateLimiter.check("avatar:" + auth.email(), 12, Duration.ofHours(1));
        byte[] image = AvatarImages.normalize(request.image());
        db.update("INSERT INTO user_avatars(user_email, image, updated_at) VALUES (?, ?, now()) "
                + "ON CONFLICT (user_email) DO UPDATE SET image = EXCLUDED.image, updated_at = now()", auth.email(), image);
        db.update("UPDATE users SET avatar_updated_at = (SELECT updated_at FROM user_avatars WHERE user_email = ?) "
                + "WHERE email = ?", auth.email(), auth.email());
        return users.publicUser(users.require(auth.email()));
    }

    @DeleteMapping("/users/me/avatar")
    @Transactional
    public Map<String, Object> deleteAvatar(@AuthenticationPrincipal AuthUser auth) {
        db.update("DELETE FROM user_avatars WHERE user_email = ?", auth.email());
        db.update("UPDATE users SET avatar_updated_at = NULL WHERE email = ?", auth.email());
        return users.publicUser(users.require(auth.email()));
    }

    /** Poza cuiva (public). 404 dacă nu are. */
    @GetMapping("/avatars/{username}")
    public ResponseEntity<byte[]> avatar(@PathVariable String username) {
        List<Map<String, Object>> rows = db.queryForList("SELECT a.image, a.updated_at FROM user_avatars a "
                + "JOIN users u ON u.email = a.user_email WHERE u.username = ?", username.replaceFirst("^@", ""));
        if (rows.isEmpty()) throw new ApiException(404, "Utilizatorul nu are poză de profil.");
        Long version = UserRepository.avatarVersion(rows.get(0).get("updated_at"));
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_JPEG)
                .cacheControl(CacheControl.maxAge(Duration.ofDays(7)).cachePublic())
                .eTag("\"" + (version == null ? 0 : version) + "\"")
                .header("X-Content-Type-Options", "nosniff")
                .body((byte[]) rows.get(0).get("image"));
    }

    public record ProfileRequest(@Size(max = 160, message = "Descrierea poate avea cel mult 160 de caractere.") String bio) {
    }

    /** ~2 MB de imagine înseamnă ~2,7 milioane de caractere base64. */
    public record AvatarRequest(@Size(max = 2_800_000, message = "Poza e prea mare (cel mult 2 MB).") String image) {
    }
}
