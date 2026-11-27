package com.whatever.user.mail;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Trimite emailuri prin:
 *  - brevo / resend: API HTTPS (merge pe Render free, unde porturile SMTP sunt blocate);
 *  - smtp: JavaMailSender (pentru rulare locală);
 *  - log: scrie emailul în log (doar pentru teste).
 */
@Service
public class MailService {
    private static final Logger log = LoggerFactory.getLogger(MailService.class);

    private final String provider;
    private final String apiKey;
    private final String from;
    private final String fromName;
    private final ObjectProvider<JavaMailSender> smtp;
    private final ObjectMapper json;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    public MailService(@Value("${app.mail.provider}") String provider,
                       @Value("${app.mail.api-key}") String apiKey,
                       @Value("${app.mail.from}") String from,
                       @Value("${app.mail.from-name}") String fromName,
                       ObjectProvider<JavaMailSender> smtp,
                       ObjectMapper json) {
        this.provider = provider == null ? "smtp" : provider.trim().toLowerCase(Locale.ROOT);
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.from = from == null ? "" : from.trim();
        this.fromName = fromName == null || fromName.isBlank() ? "Whatever" : fromName.trim();
        this.smtp = smtp;
        this.json = json;
    }

    public void send(String to, String subject, String text) {
        switch (provider) {
            case "brevo" -> sendBrevo(to, subject, text);
            case "resend" -> sendResend(to, subject, text);
            case "log" -> log.warn("[MAIL_PROVIDER=log] Către {} | {}\n{}", to, subject, text);
            default -> sendSmtp(to, subject, text);
        }
    }

    private void sendBrevo(String to, String subject, String text) {
        requireApiConfig();
        Map<String, Object> body = Map.of(
                "sender", Map.of("name", fromName, "email", from),
                "to", List.of(Map.of("email", to)),
                "subject", subject,
                "textContent", text);
        HttpRequest request = HttpRequest.newBuilder(URI.create("https://api.brevo.com/v3/smtp/email"))
                .timeout(Duration.ofSeconds(15))
                .header("api-key", apiKey)
                .header("accept", "application/json")
                .header("content-type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(toJson(body)))
                .build();
        execute(request, "Brevo");
    }

    private void sendResend(String to, String subject, String text) {
        requireApiConfig();
        Map<String, Object> body = Map.of(
                "from", fromName + " <" + from + ">",
                "to", List.of(to),
                "subject", subject,
                "text", text);
        HttpRequest request = HttpRequest.newBuilder(URI.create("https://api.resend.com/emails"))
                .timeout(Duration.ofSeconds(15))
                .header("Authorization", "Bearer " + apiKey)
                .header("content-type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(toJson(body)))
                .build();
        execute(request, "Resend");
    }

    private void sendSmtp(String to, String subject, String text) {
        JavaMailSender sender = smtp.getIfAvailable();
        if (sender == null) throw new MailDeliveryException("SMTP nu este configurat.");
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(to);
        message.setSubject(subject);
        message.setText(text);
        try {
            sender.send(message);
        } catch (RuntimeException e) {
            throw new MailDeliveryException("Trimiterea prin SMTP a eșuat: " + e.getMessage());
        }
    }

    private void execute(HttpRequest request, String name) {
        try {
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                String bodyText = response.body() == null ? "" : response.body();
                log.error("{} a răspuns {}: {}", name, response.statusCode(),
                        bodyText.length() > 500 ? bodyText.substring(0, 500) : bodyText);
                throw new MailDeliveryException(name + " a refuzat emailul (" + response.statusCode() + ").");
            }
        } catch (IOException e) {
            throw new MailDeliveryException(name + " nu poate fi contactat: " + e.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new MailDeliveryException("Trimiterea emailului a fost întreruptă.");
        }
    }

    private void requireApiConfig() {
        if (apiKey.isEmpty() || from.isEmpty()) {
            throw new MailDeliveryException("MAIL_API_KEY și MAIL_FROM trebuie setate pentru " + provider + ".");
        }
    }

    private String toJson(Object body) {
        try {
            return json.writeValueAsString(body);
        } catch (JsonProcessingException e) {
            throw new MailDeliveryException("Emailul nu a putut fi construit.");
        }
    }

    public static class MailDeliveryException extends RuntimeException {
        public MailDeliveryException(String message) {
            super(message);
        }
    }
}
