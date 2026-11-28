package com.whatever.task.push;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.whatever.task.web.I18n;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.SecureRandom;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.time.Duration;
import java.time.Instant;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Trimiterea notificărilor pe web (Web Push, fără Firebase) pentru evenimentele din task-service: invitații, cereri de
 * participare, mesaje din chatul activităților și favoruri. Abonamentele și preferințele le gestionează user-service
 * (aceeași bază de date, aceleași chei VAPID). Trimiterea se face în fundal, după ce tranzacția cererii s-a încheiat cu
 * succes, deci o notificare nu întârzie răspunsul și nu pleacă pentru ceva anulat.
 */
@Service
public class PushService {
    private static final Logger log = LoggerFactory.getLogger(PushService.class);
    /** Serviciile de push ale browserelor (Chrome/Edge/Opera, Firefox, Safari, Windows). Doar spre ele trimitem. */
    private static final List<String> PUSH_HOSTS = List.of(
            "fcm.googleapis.com", "android.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com");
    private static final int MAX_BODY = 240;

    /** Tipurile de notificări, fiecare cu coloana ei din notification_settings. */
    public enum Kind {
        REQUESTS("requests"), MESSAGES("messages"), FAVORS("favors"), INVITATIONS("invitations"), UPDATES("updates");

        public final String column;

        Kind(String column) {
            this.column = column;
        }
    }

    /**
     * O notificare: titlul și textul sunt șabloane românești (traduse după limba fiecărui abonament), `url` e ruta din
     * aplicație deschisă la apăsare, iar `tag` grupează notificările (una nouă o înlocuiește pe cea cu același tag).
     */
    public record Note(String title, List<Object> titleValues, String body, List<Object> bodyValues, String url, String tag,
                       boolean urgent) {
        public String title(String language) {
            return I18n.format(title, language, titleValues.toArray());
        }

        public String body(String language) {
            String text = I18n.format(body, language, bodyValues.toArray());
            return text.codePointCount(0, text.length()) > MAX_BODY
                    ? text.substring(0, text.offsetByCodePoints(0, MAX_BODY - 1)) + "…" : text;
        }
    }

    private record Vapid(ECPrivateKey privateKey, String publicKey) {
    }

    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final String subject;
    private final Set<String> extraHosts;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final SecureRandom random = new SecureRandom();
    private final ExecutorService executor = Executors.newFixedThreadPool(2, runnable -> {
        Thread thread = new Thread(runnable, "web-push");
        thread.setDaemon(true);
        return thread;
    });
    private volatile Vapid vapid;

    public PushService(JdbcTemplate db, ObjectMapper json, @Value("${app.push.subject}") String subject,
                       @Value("${app.push.extra-hosts:}") String extraHosts) {
        this.db = db;
        this.json = json;
        this.subject = subject;
        this.extraHosts = new LinkedHashSet<>();
        for (String host : extraHosts.split(",")) {
            if (!host.isBlank()) this.extraHosts.add(host.strip().toLowerCase(Locale.ROOT));
        }
    }

    @PreDestroy
    void stop() {
        executor.shutdown();
    }

    private Vapid keys() {
        Vapid current = vapid;
        if (current != null) return current;
        synchronized (this) {
            if (vapid != null) return vapid;
            List<Map<String, Object>> rows = db.queryForList("SELECT public_key, private_key FROM push_keys WHERE id = 1");
            if (rows.isEmpty()) {
                KeyPair pair = WebPushCrypto.generateKeyPair();
                // Dacă celălalt serviciu le-a generat între timp, rămân ale lui (ON CONFLICT) și le citim pe acelea.
                db.update("INSERT INTO push_keys(id, public_key, private_key) VALUES (1, ?, ?) ON CONFLICT (id) DO NOTHING",
                        WebPushCrypto.base64(WebPushCrypto.publicKeyBytes((ECPublicKey) pair.getPublic())),
                        WebPushCrypto.base64(WebPushCrypto.privateKeyBytes((ECPrivateKey) pair.getPrivate())));
                rows = db.queryForList("SELECT public_key, private_key FROM push_keys WHERE id = 1");
            }
            Map<String, Object> row = rows.get(0);
            vapid = new Vapid(WebPushCrypto.privateKey(WebPushCrypto.fromBase64(String.valueOf(row.get("private_key")))),
                    String.valueOf(row.get("public_key")));
            return vapid;
        }
    }

    boolean allowedEndpoint(URI uri) {
        String host = uri.getHost();
        if (host == null || uri.getRawUserInfo() != null) return false;
        String name = host.toLowerCase(Locale.ROOT);
        if (PUSH_HOSTS.stream().anyMatch(known -> name.equals(known) || name.endsWith("." + known))) {
            return "https".equals(uri.getScheme()) && (uri.getPort() == -1 || uri.getPort() == 443);
        }
        // Doar pentru teste (CI): un serviciu de push simulat, ex. PUSH_EXTRA_HOSTS=localhost.
        return extraHosts.contains(name) && ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()));
    }

    /** Trimite notificarea tuturor dispozitivelor acestor utilizatori care vor acest tip de notificări. */
    public void notify(Collection<String> emails, Kind kind, Note note) {
        List<String> targets = emails == null ? List.of() : emails.stream().filter(email -> email != null && !email.isBlank())
                .distinct().toList();
        if (targets.isEmpty()) return;
        Runnable task = () -> deliver(targets, kind, note);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    executor.execute(task);
                }
            });
        } else {
            executor.execute(task);
        }
    }

    public void notify(String email, Kind kind, Note note) {
        notify(Collections.singletonList(email), kind, note);
    }

    private void deliver(List<String> emails, Kind kind, Note note) {
        try {
            String placeholders = String.join(",", Collections.nCopies(emails.size(), "?"));
            String wanted = "COALESCE(n." + kind.column + ", TRUE)";
            List<Map<String, Object>> subscriptions = db.queryForList("SELECT s.id, s.endpoint, s.p256dh, s.auth, s.language "
                    + "FROM push_subscriptions s LEFT JOIN notification_settings n ON n.user_email = s.user_email "
                    + "WHERE s.user_email IN (" + placeholders + ") AND " + wanted, emails.toArray());
            for (Map<String, Object> subscription : subscriptions) send(subscription, note);
        } catch (RuntimeException e) {
            // Fără tabele (migrarea 011 încă neaplicată) sau baza indisponibilă: aplicația merge mai departe fără notificări.
            log.warn("Notificările nu au putut fi trimise: {}", e.getMessage());
        }
    }

    private void send(Map<String, Object> subscription, Note note) {
        long id = ((Number) subscription.get("id")).longValue();
        try {
            String language = String.valueOf(subscription.get("language"));
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("title", note.title(language));
            payload.put("body", note.body(language));
            payload.put("url", note.url());
            payload.put("tag", note.tag());
            byte[] salt = new byte[16];
            random.nextBytes(salt);
            byte[] body = WebPushCrypto.encrypt(json.writeValueAsString(payload).getBytes(StandardCharsets.UTF_8),
                    WebPushCrypto.fromBase64(String.valueOf(subscription.get("p256dh"))),
                    WebPushCrypto.fromBase64(String.valueOf(subscription.get("auth"))), WebPushCrypto.generateKeyPair(), salt);
            URI uri = URI.create(String.valueOf(subscription.get("endpoint")));
            if (!allowedEndpoint(uri)) {
                db.update("DELETE FROM push_subscriptions WHERE id = ?", id);
                return;
            }
            Vapid keys = keys();
            String audience = uri.getScheme() + "://" + uri.getRawAuthority();
            String token = WebPushCrypto.vapidToken(audience, subject, Instant.now().plus(Duration.ofHours(12)).getEpochSecond(),
                    keys.privateKey());
            HttpRequest request = HttpRequest.newBuilder(uri)
                    .timeout(Duration.ofSeconds(15))
                    .header("TTL", "86400")
                    .header("Urgency", note.urgent() ? "high" : "normal")
                    .header("Content-Type", "application/octet-stream")
                    .header("Content-Encoding", "aes128gcm")
                    .header("Authorization", "vapid t=" + token + ", k=" + keys.publicKey())
                    .POST(HttpRequest.BodyPublishers.ofByteArray(body))
                    .build();
            int status = http.send(request, HttpResponse.BodyHandlers.discarding()).statusCode();
            if (status == 404 || status == 410) {
                // Browserul s-a dezabonat sau abonamentul a expirat.
                db.update("DELETE FROM push_subscriptions WHERE id = ?", id);
            } else if (status >= 400) {
                failed(id, "HTTP " + status);
            } else {
                db.update("UPDATE push_subscriptions SET last_success_at = now(), failures = 0 WHERE id = ?", id);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            failed(id, e.getClass().getSimpleName());
        }
    }

    /** După 5 eșecuri la rând abonamentul e considerat mort și se șterge. */
    private void failed(long id, String reason) {
        try {
            db.update("UPDATE push_subscriptions SET failures = failures + 1 WHERE id = ?", id);
            db.update("DELETE FROM push_subscriptions WHERE id = ? AND failures >= 5", id);
        } catch (RuntimeException ignored) {
            // nimic de făcut
        }
        log.info("Notificarea către abonamentul {} nu a ajuns ({})", id, reason);
    }
}
