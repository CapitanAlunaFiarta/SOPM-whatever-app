package com.whatever.user;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.yubico.webauthn.AssertionRequest;
import com.yubico.webauthn.AssertionResult;
import com.yubico.webauthn.CredentialRepository;
import com.yubico.webauthn.FinishAssertionOptions;
import com.yubico.webauthn.FinishRegistrationOptions;
import com.yubico.webauthn.RegisteredCredential;
import com.yubico.webauthn.RegistrationResult;
import com.yubico.webauthn.RelyingParty;
import com.yubico.webauthn.StartAssertionOptions;
import com.yubico.webauthn.StartRegistrationOptions;
import com.yubico.webauthn.data.ByteArray;
import com.yubico.webauthn.data.PublicKeyCredential;
import com.yubico.webauthn.data.PublicKeyCredentialCreationOptions;
import com.yubico.webauthn.data.UserIdentity;
import com.yubico.webauthn.data.RelyingPartyIdentity;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.jdbc.core.JdbcTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class WebAuthnService {
    private final JdbcTemplate db;
    private final ObjectMapper objectMapper;
    private final RelyingParty relyingParty;
    private final byte[] jwtSecret;
    private final long jwtExpiration;

    public WebAuthnService(JdbcTemplate db, ObjectMapper objectMapper,
                           @Value("${app.webauthn.rp-id}") String rpId,
                           @Value("${app.webauthn.origin}") String origin,
                           @Value("${app.jwt.secret}") String jwtSecret,
                           @Value("${app.jwt.expiration-ms}") long jwtExpiration) {
        this.db = db;
        this.objectMapper = objectMapper;
        this.jwtSecret = jwtSecret.getBytes(StandardCharsets.UTF_8);
        this.jwtExpiration = jwtExpiration;
        CredentialRepository credentials = new DatabaseCredentialRepository(db);
        this.relyingParty = RelyingParty.builder()
                .identity(RelyingPartyIdentity.builder().id(rpId).name("Whatever").build())
                .credentialRepository(credentials)
                .origins(Arrays.stream(origin.split(","))
                        .map(String::trim).filter(value -> !value.isEmpty()).collect(Collectors.toSet()))
                .build();
    }

    public PublicKeyCredentialCreationOptions beginRegistration(String email) {
        Map<String, Object> user = user(email);
        UserIdentity identity = UserIdentity.builder()
                .name(String.valueOf(user.get("username")))
                .displayName(String.valueOf(user.get("full_name")))
                .id(userHandle(email))
                .build();
        PublicKeyCredentialCreationOptions options = relyingParty.startRegistration(
                StartRegistrationOptions.builder().user(identity).timeout(120000L).build());
        saveChallenge(email, "registration", options);
        return options;
    }

    public void finishRegistration(String email, String credentialJson) {
        String requestJson = consumeChallenge(email, "registration");
        try {
            PublicKeyCredentialCreationOptions request =
                    objectMapper.readValue(requestJson, PublicKeyCredentialCreationOptions.class);
            PublicKeyCredential<?, ?> parsed = PublicKeyCredential.parseRegistrationResponseJson(credentialJson);
            RegistrationResult result = relyingParty.finishRegistration(FinishRegistrationOptions.builder()
                    .request(request)
                    .response((PublicKeyCredential) parsed)
                    .build());
            ByteArray credentialId = result.getKeyId().getId();
            db.update("INSERT INTO webauthn_credentials(user_email,credential_id,public_key,sign_count) "
                            + "VALUES(?,?,?,?) ON CONFLICT (credential_id) DO UPDATE SET public_key=EXCLUDED.public_key,"
                            + "sign_count=EXCLUDED.sign_count,user_email=EXCLUDED.user_email",
                    email, credentialId.getBase64Url(), result.getPublicKeyCose().getBytes(), result.getSignatureCount());
            db.update("UPDATE users SET biometric_enabled=TRUE WHERE email=?", email);
        } catch (Exception e) {
            throw new UserServiceApplication.ApiException(400, "Înregistrarea biometrică a eșuat.");
        }
    }

    public Map<String, Object> beginAssertion(String email) {
        AssertionRequest request = relyingParty.startAssertion(
                StartAssertionOptions.builder().username(email).timeout(120000L).build());
        saveChallenge(email, "assertion", request);
        return Map.of("publicKey", request.getPublicKeyCredentialRequestOptions());
    }

    public String finishAssertion(String email, String credentialJson, long taskId) {
        String requestJson = consumeChallenge(email, "assertion");
        try {
            AssertionRequest request = objectMapper.readValue(requestJson, AssertionRequest.class);
            PublicKeyCredential<?, ?> parsed = PublicKeyCredential.parseAssertionResponseJson(credentialJson);
            AssertionResult result = relyingParty.finishAssertion(FinishAssertionOptions.builder()
                    .request(request)
                    .response((PublicKeyCredential) parsed)
                    .build());
            if (!result.isSuccess() || !result.isUserVerified()) {
                throw new IllegalArgumentException("User verification was not performed.");
            }
            db.update("UPDATE webauthn_credentials SET sign_count=? WHERE credential_id=?",
                    result.getSignatureCount(), result.getCredential().getCredentialId().getBase64Url());
            return Jwts.builder().subject(email).claim("role", "USER")
                    .claim("webauthn", true).claim("taskId", taskId)
                    .issuedAt(new Date()).expiration(new Date(System.currentTimeMillis() + 120000))
                    .signWith(Keys.hmacShaKeyFor(jwtSecret)).compact();
        } catch (Exception e) {
            throw new UserServiceApplication.ApiException(401, "Verificarea biometrică a eșuat.");
        }
    }

    private Map<String, Object> user(String email) {
        List<Map<String, Object>> rows = db.queryForList("SELECT * FROM users WHERE email=?", email);
        if (rows.isEmpty()) throw new UserServiceApplication.ApiException(404, "Utilizator negasit.");
        return rows.get(0);
    }

    private void saveChallenge(String email, String ceremony, Object request) {
        try {
            db.update("DELETE FROM webauthn_challenges WHERE user_email=? AND ceremony=?", email, ceremony);
            db.update("INSERT INTO webauthn_challenges(user_email,ceremony,request_json,expires_at) VALUES(?,?,?,?)",
                    email, ceremony, objectMapper.writeValueAsString(request),
                    java.sql.Timestamp.from(Instant.now().plusSeconds(120)));
        } catch (Exception e) {
            throw new UserServiceApplication.ApiException(500, "Nu s-a putut salva challenge-ul WebAuthn.");
        }
    }

    private String consumeChallenge(String email, String ceremony) {
        List<Map<String, Object>> rows = db.queryForList("SELECT id,request_json FROM webauthn_challenges "
                + "WHERE user_email=? AND ceremony=? AND expires_at>CURRENT_TIMESTAMP ORDER BY id DESC LIMIT 1", email, ceremony);
        if (rows.isEmpty()) throw new UserServiceApplication.ApiException(400, "Challenge WebAuthn invalid sau expirat.");
        db.update("DELETE FROM webauthn_challenges WHERE id=?", rows.get(0).get("id"));
        return String.valueOf(rows.get(0).get("request_json"));
    }

    private static ByteArray userHandle(String email) {
        try {
            return new ByteArray(MessageDigest.getInstance("SHA-256").digest(email.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 is unavailable.", e);
        }
    }

    private static final class DatabaseCredentialRepository implements CredentialRepository {
        private final JdbcTemplate db;
        private DatabaseCredentialRepository(JdbcTemplate db) { this.db = db; }

        public Set<com.yubico.webauthn.data.PublicKeyCredentialDescriptor> getCredentialIdsForUsername(String username) {
            return new HashSet<>(db.query("SELECT credential_id FROM webauthn_credentials WHERE user_email=?",
                    (rs, row) -> com.yubico.webauthn.data.PublicKeyCredentialDescriptor.builder()
                            .id(decode(rs.getString("credential_id"))).build(), username));
        }

        public Optional<ByteArray> getUserHandleForUsername(String username) {
            return Optional.of(userHandle(username));
        }

        public Optional<String> getUsernameForUserHandle(ByteArray handle) {
            return db.query("SELECT email FROM users", (rs, row) -> rs.getString("email")).stream()
                    .filter(email -> userHandle(email).equals(handle)).findFirst();
        }

        public Optional<RegisteredCredential> lookup(ByteArray credentialId, ByteArray handle) {
            return db.query("SELECT credential_id,public_key,sign_count,user_email FROM webauthn_credentials WHERE credential_id=?",
                    (rs, row) -> RegisteredCredential.builder()
                            .credentialId(credentialId).userHandle(userHandle(rs.getString("user_email")))
                            .publicKeyCose(new ByteArray(rs.getBytes("public_key")))
                            .signatureCount(rs.getLong("sign_count")).build(), credentialId.getBase64Url()).stream()
                    .filter(c -> c.getUserHandle().equals(handle)).findFirst();
        }

        public Set<RegisteredCredential> lookupAll(ByteArray credentialId) {
            return new HashSet<>(db.query("SELECT credential_id,public_key,sign_count,user_email FROM webauthn_credentials WHERE credential_id=?",
                    (rs, row) -> RegisteredCredential.builder().credentialId(credentialId)
                            .userHandle(userHandle(rs.getString("user_email")))
                            .publicKeyCose(new ByteArray(rs.getBytes("public_key")))
                            .signatureCount(rs.getLong("sign_count")).build(), credentialId.getBase64Url()));
        }

        private static ByteArray decode(String value) {
            try {
                return ByteArray.fromBase64Url(value);
            } catch (Exception e) {
                throw new IllegalStateException("Stored WebAuthn credential ID is invalid.", e);
            }
        }
    }
}
