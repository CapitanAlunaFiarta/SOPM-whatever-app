package com.whatever.user.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.Optional;

/**
 * Emite și verifică token-urile JWT (HS256, secret comun cu task-service).
 * "typ" separă token-ul de sesiune ("access") de cel biometric ("biometric"),
 * astfel încât un token biometric să nu poată fi folosit ca sesiune.
 */
@Component
public class JwtService {
    public static final String TYPE_ACCESS = "access";
    public static final String TYPE_BIOMETRIC = "biometric";
    private static final long BIOMETRIC_TTL_MS = 120_000;

    private final SecretKey key;
    private final long accessTtlMs;

    public JwtService(@Value("${app.jwt.secret}") String secret,
                      @Value("${app.jwt.access-ttl-ms}") long accessTtlMs) {
        byte[] bytes = secret.getBytes(StandardCharsets.UTF_8);
        if (bytes.length < 32) {
            throw new IllegalStateException("JWT_SECRET trebuie să aibă cel puțin 32 de caractere.");
        }
        this.key = new SecretKeySpec(bytes, "HmacSHA256");
        this.accessTtlMs = accessTtlMs;
    }

    public String accessToken(long userId, String email, String role) {
        Date now = new Date();
        return Jwts.builder()
                .subject(email)
                .claim("uid", userId)
                .claim("role", role)
                .claim("typ", TYPE_ACCESS)
                .issuedAt(now)
                .expiration(new Date(now.getTime() + accessTtlMs))
                .signWith(key, Jwts.SIG.HS256)
                .compact();
    }

    public long accessTtlSeconds() {
        return accessTtlMs / 1000;
    }

    /** Token scurt (2 minute), legat de un singur task, emis după o verificare biometrică validă. */
    public String biometricToken(String email, long taskId) {
        Date now = new Date();
        return Jwts.builder()
                .subject(email)
                .claim("typ", TYPE_BIOMETRIC)
                .claim("taskId", taskId)
                .issuedAt(now)
                .expiration(new Date(now.getTime() + BIOMETRIC_TTL_MS))
                .signWith(key, Jwts.SIG.HS256)
                .compact();
    }

    public Optional<AuthUser> parseAccess(String token) {
        try {
            Claims claims = Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
            if (!TYPE_ACCESS.equals(claims.get("typ", String.class)) || claims.getSubject() == null) {
                return Optional.empty();
            }
            Object uid = claims.get("uid");
            long id = uid instanceof Number number ? number.longValue() : 0L;
            Object role = claims.get("role");
            return Optional.of(new AuthUser(id, claims.getSubject(), role == null ? "USER" : role.toString()));
        } catch (JwtException | IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
