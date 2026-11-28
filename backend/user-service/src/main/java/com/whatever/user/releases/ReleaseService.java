package com.whatever.user.releases;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.whatever.user.push.Notes;
import com.whatever.user.push.PushService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.URLDecoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Versiunile aplicației de Android, așa cum le publică workflow-ul android.yml în GitHub Releases
 * (tag „android-v2.4.0-18” = versiunea 2.4.0, build-ul 18).
 *
 * <p>Serverul nu folosește API-ul GitHub (limitat la 60 de cereri pe oră pe IP, iar IP-urile Render sunt
 * comune): citește redirecționarea paginii „releases/latest” către „releases/tag/&lt;tag&gt;”. La fiecare tag nou
 * pune în chatul comunității un mesaj de la „Whatever” (kind UPDATE), o singură dată. Prima verificare, cu
 * tabelul gol, doar notează versiunea curentă, ca să nu anunțe o versiune veche.
 */
@Service
public class ReleaseService {
    private static final Logger log = LoggerFactory.getLogger(ReleaseService.class);
    private static final Pattern TAG = Pattern.compile("^android-v(\\d+\\.\\d+\\.\\d+)-(\\d+)$");
    private static final Pattern TAG_IN_URL = Pattern.compile("/releases/tag/([^/?#]+)");
    /** Cât de vechi poate fi răspunsul pentru GET /api/app/version înainte de o verificare nouă. */
    private static final Duration FRESH_FOR = Duration.ofMinutes(10);

    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final boolean enabled;
    private final String latestUrl;
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(8))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();
    private volatile Instant lastCheck = Instant.EPOCH;

    private final PushService push;

    public ReleaseService(JdbcTemplate db, ObjectMapper json,
                          @Value("${app.releases.enabled:true}") boolean enabled,
                          @Value("${app.releases.latest-url}") String latestUrl, PushService push) {
        this.db = db;
        this.json = json;
        this.enabled = enabled;
        this.latestUrl = latestUrl;
        this.push = push;
    }

    public record Release(String tag, String version, int build, String url) {
    }

    /** „android-v2.4.0-18” → versiunea, build-ul și linkul APK-ului; alte tag-uri sunt ignorate. */
    public static Optional<Release> parse(String tag, String latestUrl) {
        Matcher matcher = TAG.matcher(tag == null ? "" : tag);
        if (!matcher.matches()) return Optional.empty();
        String repository = latestUrl.replaceFirst("/releases/latest/?$", "");
        return Optional.of(new Release(tag, matcher.group(1), Integer.parseInt(matcher.group(2)),
                repository + "/releases/download/" + tag + "/whatever.apk"));
    }

    /** Compară „2.10.0” cu „2.9.1” pe componente, apoi build-urile. Negativ, zero sau pozitiv. */
    public static int compare(String version, int build, String otherVersion, int otherBuild) {
        String[] a = version.split("\\.");
        String[] b = otherVersion.split("\\.");
        for (int i = 0; i < Math.max(a.length, b.length); i++) {
            int left = i < a.length ? Integer.parseInt(a[i]) : 0;
            int right = i < b.length ? Integer.parseInt(b[i]) : 0;
            if (left != right) return Integer.compare(left, right);
        }
        return Integer.compare(build, otherBuild);
    }

    @Scheduled(initialDelayString = "${app.releases.initial-delay-ms:30000}", fixedDelayString = "${app.releases.poll-ms:900000}")
    public void scheduledCheck() {
        if (enabled) check();
    }

    /** Verifică acum ultimul release și întoarce cea mai nouă versiune cunoscută. */
    public synchronized Map<String, Object> check() {
        lastCheck = Instant.now();
        try {
            HttpResponse<Void> response = http.send(HttpRequest.newBuilder(URI.create(latestUrl))
                    .timeout(Duration.ofSeconds(10))
                    .header("User-Agent", "whatever-app")
                    .GET().build(), HttpResponse.BodyHandlers.discarding());
            Matcher matcher = TAG_IN_URL.matcher(response.headers().firstValue("location").orElse(""));
            if (matcher.find()) {
                parse(URLDecoder.decode(matcher.group(1), StandardCharsets.UTF_8), latestUrl).ifPresent(this::record);
            } else {
                log.warn("Release-uri: răspuns fără tag ({}) de la {}", response.statusCode(), latestUrl);
            }
        } catch (IOException e) {
            log.warn("Release-uri: nu pot verifica {}: {}", latestUrl, e.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        return latest();
    }

    /** Cea mai nouă versiune cunoscută; dacă ultima verificare e mai veche de 10 minute, verifică din nou. */
    public Map<String, Object> current() {
        if (enabled && Duration.between(lastCheck, Instant.now()).compareTo(FRESH_FOR) >= 0) return check();
        return latest();
    }

    private void record(Release release) {
        Integer known = db.queryForObject("SELECT count(*) FROM app_releases", Integer.class);
        int inserted = db.update("INSERT INTO app_releases(tag, version, build, apk_url) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING",
                release.tag(), release.version(), release.build(), release.url());
        if (inserted == 1 && known != null && known > 0) announce(release);
    }

    private void announce(Release release) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("version", release.version());
        payload.put("build", release.build());
        payload.put("url", release.url());
        payload.put("tag", release.tag());
        String text = "🔴 Există un nou update: versiunea " + release.version() + " (build " + release.build() + "). "
                + "Descarcă: " + release.url();
        try {
            db.update("INSERT INTO chat_messages(sender_username, sender_name, sender_role, message_text, sent_at, kind, payload) "
                    + "VALUES ('whatever', 'Whatever', 'SYSTEM', ?, ?, 'UPDATE', ?)", text, Instant.now().toString(),
                    json.writeValueAsString(payload));
            log.info("Release-uri: versiunea {} anunțată în chat", release.tag());
            push.notifyEveryone(PushService.Kind.UPDATES, Notes.update(release.version()));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private Map<String, Object> latest() {
        List<Map<String, Object>> rows = db.queryForList("SELECT tag, version, build, apk_url FROM app_releases");
        Map<String, Object> best = null;
        for (Map<String, Object> row : rows) {
            if (best == null || compare(String.valueOf(row.get("version")), ((Number) row.get("build")).intValue(),
                    String.valueOf(best.get("version")), ((Number) best.get("build")).intValue()) > 0) {
                best = row;
            }
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("version", best == null ? null : best.get("version"));
        result.put("build", best == null ? null : ((Number) best.get("build")).intValue());
        result.put("url", best == null ? null : best.get("apk_url"));
        result.put("tag", best == null ? null : best.get("tag"));
        return result;
    }
}
