package com.whatever.task.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Optional;

/** Verifică token-urile emise de user-service (același JWT_SECRET). */
@Component
public class JwtService {
    public static final String TYPE_ACCESS = "access";
    public static final String TYPE_BIOMETRIC = "biometric";

    private final SecretKey key;

    public JwtService(@Value("${app.jwt.secret}") String secret) {
        byte[] bytes = secret.getBytes(StandardCharsets.UTF_8);
        if (bytes.length < 32) {
            throw new IllegalStateException("JWT_SECRET trebuie să aibă cel puțin 32 de caractere.");
        }
        this.key = new SecretKeySpec(bytes, "HmacSHA256");
    }

    public Optional<AuthUser> parseAccess(String token) {
        return claims(token)
                .filter(claims -> TYPE_ACCESS.equals(claims.get("typ", String.class)) && claims.getSubject() != null)
                .map(claims -> {
                    Object uid = claims.get("uid");
                    Object role = claims.get("role");
                    return new AuthUser(uid instanceof Number number ? number.longValue() : 0L,
                            claims.getSubject(), role == null ? "USER" : role.toString());
                });
    }

    /** Token-ul biometric e valid doar pentru utilizatorul și task-ul pentru care a fost emis. */
    public boolean isValidBiometric(String token, String email, long taskId) {
        if (token == null || token.isBlank()) return false;
        String raw = token.startsWith("Bearer ") ? token.substring(7).trim() : token.trim();
        return claims(raw)
                .filter(claims -> TYPE_BIOMETRIC.equals(claims.get("typ", String.class)))
                .filter(claims -> email.equals(claims.getSubject()))
                .filter(claims -> claims.get("taskId") instanceof Number number && number.longValue() == taskId)
                .isPresent();
    }

    private Optional<Claims> claims(String token) {
        try {
            return Optional.of(Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload());
        } catch (JwtException | IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
