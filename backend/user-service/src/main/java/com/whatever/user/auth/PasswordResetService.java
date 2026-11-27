package com.whatever.user.auth;

import com.whatever.user.mail.MailService;
import com.whatever.user.users.UserRepository;
import com.whatever.user.web.ApiException;
import com.whatever.user.web.RateLimiter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.List;

/**
 * Resetarea parolei: un cod de 10 caractere trimis pe email, valabil 15 minute.
 * În baza de date ajunge doar hash-ul codului.
 */
@Service
public class PasswordResetService {
    private static final Logger log = LoggerFactory.getLogger(PasswordResetService.class);

    private final JdbcTemplate db;
    private final MailService mail;
    private final PasswordEncoder encoder;
    private final RefreshTokenService refreshTokens;
    private final RateLimiter rateLimiter;
    private final String publicUrl;

    public PasswordResetService(JdbcTemplate db, MailService mail, PasswordEncoder encoder,
                                RefreshTokenService refreshTokens, RateLimiter rateLimiter,
                                @Value("${app.public-url}") String publicUrl) {
        this.db = db;
        this.mail = mail;
        this.encoder = encoder;
        this.refreshTokens = refreshTokens;
        this.rateLimiter = rateLimiter;
        this.publicUrl = publicUrl.endsWith("/") ? publicUrl.substring(0, publicUrl.length() - 1) : publicUrl;
    }

    public void request(String rawEmail, String rawUsername, String ip) {
        request(rawEmail, rawUsername, ip, "ro");
    }

    /** language: limba aplicației la momentul cererii (ro, en, es) — emailul se trimite în aceeași limbă. */
    public void request(String rawEmail, String rawUsername, String ip, String language) {
        String email = UserRepository.normalizeEmail(rawEmail);
        String username = rawUsername == null ? "" : rawUsername.trim().replaceFirst("^@", "");
        rateLimiter.check("reset-ip:" + ip, 10, Duration.ofHours(1));
        rateLimiter.check("reset-email:" + email, 3, Duration.ofHours(1));

        List<Long> ids = db.queryForList("SELECT id FROM users WHERE email = ? AND username = ?",
                Long.class, email, username);
        if (ids.isEmpty()) return; // același răspuns, ca să nu dezvăluim ce conturi există

        String code = Tokens.readableCode();
        db.update("UPDATE users SET password_reset_token = ?, "
                        + "password_reset_expires_at = (now() AT TIME ZONE 'UTC') + INTERVAL '15 minutes' WHERE id = ?",
                Tokens.sha256Hex(code), ids.get(0));
        String display = code.substring(0, 5) + "-" + code.substring(5);
        String link = publicUrl + "/reset?code=" + display;
        String[] message = resetEmail(language, display, link);
        try {
            mail.send(email, message[0], message[1]);
        } catch (MailService.MailDeliveryException e) {
            log.error("Emailul de resetare nu a putut fi trimis: {}", e.getMessage());
            db.update("UPDATE users SET password_reset_token = NULL, password_reset_expires_at = NULL WHERE id = ?",
                    ids.get(0));
            throw new ApiException(503, "Emailul de resetare nu a putut fi trimis. Încearcă mai târziu sau "
                    + "cere administratorului să-ți reseteze parola.");
        }
    }

    public void confirm(String rawCode, String newPassword, String ip) {
        rateLimiter.check("reset-confirm:" + ip, 10, Duration.ofMinutes(15));
        String code = Tokens.normalizeCode(rawCode);
        if (code.length() != 10) throw new ApiException(400, "Cod de resetare invalid sau expirat.");
        List<String> emails = db.queryForList(
                "UPDATE users SET password_hash = ?, password_reset_token = NULL, password_reset_expires_at = NULL "
                        + "WHERE password_reset_token = ? AND password_reset_expires_at > (now() AT TIME ZONE 'UTC') "
                        + "RETURNING email",
                String.class, encoder.encode(newPassword), Tokens.sha256Hex(code));
        if (emails.isEmpty()) throw new ApiException(400, "Cod de resetare invalid sau expirat.");
        refreshTokens.revokeAll(emails.get(0));
    }

    /** {subiect, text} pentru emailul de resetare, în limba cerută. */
    static String[] resetEmail(String language, String code, String link) {
        return switch (language == null ? "ro" : language) {
            case "en" -> new String[]{"Whatever - password reset",
                    "You asked to reset the password of your Whatever account.\n\n"
                            + "Your code: " + code + "\n\n"
                            + "Enter it in the app or open this link:\n" + link + "\n\n"
                            + "The code expires in 15 minutes. If you didn't ask for a reset, ignore this message."};
            case "es" -> new String[]{"Whatever - restablecer contraseña",
                    "Has pedido restablecer la contraseña de tu cuenta de Whatever.\n\n"
                            + "Tu código: " + code + "\n\n"
                            + "Introdúcelo en la aplicación o abre este enlace:\n" + link + "\n\n"
                            + "El código caduca en 15 minutos. Si no lo pediste tú, ignora este mensaje."};
            default -> new String[]{"Whatever - resetare parolă",
                    "Ai cerut resetarea parolei pentru contul Whatever.\n\n"
                            + "Codul tău: " + code + "\n\n"
                            + "Îl poți introduce în aplicație sau poți deschide direct:\n" + link + "\n\n"
                            + "Codul expiră în 15 minute. Dacă nu ai cerut tu resetarea, ignoră acest mesaj."};
        };
    }
}
