package com.whatever.user.webauthn;

import com.whatever.user.security.JwtService;
import com.whatever.user.web.ApiException;
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
import com.yubico.webauthn.data.AuthenticatorAssertionResponse;
import com.yubico.webauthn.data.AuthenticatorAttestationResponse;
import com.yubico.webauthn.data.AuthenticatorSelectionCriteria;
import com.yubico.webauthn.data.ByteArray;
import com.yubico.webauthn.data.ClientAssertionExtensionOutputs;
import com.yubico.webauthn.data.ClientRegistrationExtensionOutputs;
import com.yubico.webauthn.data.PublicKeyCredential;
import com.yubico.webauthn.data.PublicKeyCredentialCreationOptions;
import com.yubico.webauthn.data.PublicKeyCredentialDescriptor;
import com.yubico.webauthn.data.RelyingPartyIdentity;
import com.yubico.webauthn.data.ResidentKeyRequirement;
import com.yubico.webauthn.data.UserIdentity;
import com.yubico.webauthn.data.UserVerificationRequirement;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Passkey (WebAuthn) pentru web. Opțiunile și cererile sunt serializate cu metodele oficiale
 * ale bibliotecii Yubico (toJson/fromJson), iar challenge-urile sunt de unică folosință.
 */
@Service
public class WebAuthnService {
    private static final Logger log = LoggerFactory.getLogger(WebAuthnService.class);

    private final JdbcTemplate db;
    private final RelyingParty relyingParty;
    private final JwtService jwt;

    public WebAuthnService(JdbcTemplate db, JwtService jwt,
                           @Value("${app.webauthn.rp-id}") String rpId,
                           @Value("${app.webauthn.origin}") String origins) {
        this.db = db;
        this.jwt = jwt;
        Set<String> allowedOrigins = Arrays.stream(origins.split(","))
                .map(String::trim).filter(value -> !value.isEmpty()).collect(Collectors.toSet());
        this.relyingParty = RelyingParty.builder()
                .identity(RelyingPartyIdentity.builder().id(rpId).name("Whatever").build())
                .credentialRepository(new DatabaseCredentialRepository(db))
                .origins(allowedOrigins)
                .build();
    }

    /** Întoarce JSON-ul gata de pasat lui navigator.credentials.create: {"publicKey": {...}}. */
    public String beginRegistration(String email) {
        List<Map<String, Object>> rows = db.queryForList("SELECT username, full_name FROM users WHERE email = ?", email);
        if (rows.isEmpty()) throw new ApiException(404, "Utilizator negăsit.");
        UserIdentity identity = UserIdentity.builder()
                .name(String.valueOf(rows.get(0).get("username")))
                .displayName(String.valueOf(rows.get(0).get("full_name")))
                .id(userHandle(email))
                .build();
        PublicKeyCredentialCreationOptions options = relyingParty.startRegistration(StartRegistrationOptions.builder()
                .user(identity)
                .authenticatorSelection(AuthenticatorSelectionCriteria.builder()
                        .residentKey(ResidentKeyRequirement.PREFERRED)
                        .userVerification(UserVerificationRequirement.REQUIRED)
                        .build())
                .timeout(120_000L)
                .build());
        String stored;
        String forBrowser;
        try {
            stored = options.toJson();
            forBrowser = options.toCredentialsCreateJson();
        } catch (Exception e) {
            throw new ApiException(500, "Nu s-au putut genera opțiunile passkey.");
        }
        saveChallenge(email, "registration", stored);
        return forBrowser;
    }

    public void finishRegistration(String email, String credentialJson) {
        String requestJson = consumeChallenge(email, "registration");
        try {
            PublicKeyCredentialCreationOptions request = PublicKeyCredentialCreationOptions.fromJson(requestJson);
            PublicKeyCredential<AuthenticatorAttestationResponse, ClientRegistrationExtensionOutputs> response =
                    PublicKeyCredential.parseRegistrationResponseJson(credentialJson);
            RegistrationResult result = relyingParty.finishRegistration(FinishRegistrationOptions.builder()
                    .request(request)
                    .response(response)
                    .build());
            String credentialId = result.getKeyId().getId().getBase64Url();
            Integer usedByOther = db.queryForObject(
                    "SELECT count(*) FROM webauthn_credentials WHERE credential_id = ? AND user_email <> ?",
                    Integer.class, credentialId, email);
            if (usedByOther != null && usedByOther > 0) throw new ApiException(409, "Acest passkey aparține altui cont.");
            db.update("INSERT INTO webauthn_credentials(user_email, credential_id, public_key, sign_count) VALUES (?, ?, ?, ?) "
                            + "ON CONFLICT (credential_id) DO UPDATE SET public_key = EXCLUDED.public_key, sign_count = EXCLUDED.sign_count",
                    email, credentialId, result.getPublicKeyCose().getBytes(), result.getSignatureCount());
            db.update("UPDATE users SET biometric_enabled = TRUE WHERE email = ?", email);
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Înregistrare passkey eșuată pentru {}: {}", email, e.getMessage());
            throw new ApiException(400, "Înregistrarea passkey a eșuat.");
        }
    }

    /** Întoarce JSON-ul gata de pasat lui navigator.credentials.get: {"publicKey": {...}}. */
    public String beginAssertion(String email) {
        Integer credentials = db.queryForObject("SELECT count(*) FROM webauthn_credentials WHERE user_email = ?",
                Integer.class, email);
        if (credentials == null || credentials == 0) {
            throw new ApiException(400, "Nu ai niciun passkey pe acest cont. Activează-l din Profil.");
        }
        AssertionRequest request = relyingParty.startAssertion(StartAssertionOptions.builder()
                .username(email)
                .userVerification(UserVerificationRequirement.REQUIRED)
                .timeout(120_000L)
                .build());
        String stored;
        String forBrowser;
        try {
            stored = request.toJson();
            forBrowser = request.toCredentialsGetJson();
        } catch (Exception e) {
            throw new ApiException(500, "Nu s-au putut genera opțiunile passkey.");
        }
        saveChallenge(email, "assertion", stored);
        return forBrowser;
    }

    public String finishAssertion(String email, String credentialJson, long taskId) {
        String requestJson = consumeChallenge(email, "assertion");
        try {
            AssertionRequest request = AssertionRequest.fromJson(requestJson);
            PublicKeyCredential<AuthenticatorAssertionResponse, ClientAssertionExtensionOutputs> response =
                    PublicKeyCredential.parseAssertionResponseJson(credentialJson);
            AssertionResult result = relyingParty.finishAssertion(FinishAssertionOptions.builder()
                    .request(request)
                    .response(response)
                    .build());
            if (!result.isSuccess() || !result.isUserVerified()) {
                throw new IllegalStateException("Verificarea utilizatorului nu a avut loc.");
            }
            db.update("UPDATE webauthn_credentials SET sign_count = ? WHERE credential_id = ?",
                    result.getSignatureCount(), result.getCredential().getCredentialId().getBase64Url());
            return jwt.biometricToken(email, taskId);
        } catch (Exception e) {
            log.warn("Verificare passkey eșuată pentru {}: {}", email, e.getMessage());
            throw new ApiException(401, "Verificarea biometrică a eșuat.");
        }
    }

    private void saveChallenge(String email, String ceremony, String requestJson) {
        db.update("DELETE FROM webauthn_challenges WHERE user_email = ? AND ceremony = ?", email, ceremony);
        db.update("INSERT INTO webauthn_challenges(user_email, ceremony, request_json, expires_at) "
                        + "VALUES (?, ?, ?, (now() AT TIME ZONE 'UTC') + INTERVAL '2 minutes')",
                email, ceremony, requestJson);
    }

    private String consumeChallenge(String email, String ceremony) {
        List<String> rows = db.queryForList(
                "DELETE FROM webauthn_challenges WHERE id = (SELECT id FROM webauthn_challenges "
                        + "WHERE user_email = ? AND ceremony = ? AND expires_at > (now() AT TIME ZONE 'UTC') "
                        + "ORDER BY id DESC LIMIT 1) RETURNING request_json",
                String.class, email, ceremony);
        if (rows.isEmpty()) throw new ApiException(400, "Cererea passkey a expirat. Încearcă din nou.");
        return rows.get(0);
    }

    static ByteArray userHandle(String email) {
        try {
            return new ByteArray(MessageDigest.getInstance("SHA-256").digest(email.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 indisponibil.", e);
        }
    }

    private static final class DatabaseCredentialRepository implements CredentialRepository {
        private final JdbcTemplate db;

        private DatabaseCredentialRepository(JdbcTemplate db) {
            this.db = db;
        }

        @Override
        public Set<PublicKeyCredentialDescriptor> getCredentialIdsForUsername(String username) {
            return new HashSet<>(db.query("SELECT credential_id FROM webauthn_credentials WHERE user_email = ?",
                    (rs, row) -> PublicKeyCredentialDescriptor.builder()
                            .id(decode(rs.getString("credential_id"))).build(), username));
        }

        @Override
        public Optional<ByteArray> getUserHandleForUsername(String username) {
            return Optional.of(userHandle(username));
        }

        @Override
        public Optional<String> getUsernameForUserHandle(ByteArray handle) {
            return db.query("SELECT DISTINCT user_email FROM webauthn_credentials", (rs, row) -> rs.getString(1))
                    .stream().filter(email -> userHandle(email).equals(handle)).findFirst();
        }

        @Override
        public Optional<RegisteredCredential> lookup(ByteArray credentialId, ByteArray handle) {
            return lookupAll(credentialId).stream().filter(c -> c.getUserHandle().equals(handle)).findFirst();
        }

        @Override
        public Set<RegisteredCredential> lookupAll(ByteArray credentialId) {
            return new HashSet<>(db.query(
                    "SELECT public_key, sign_count, user_email FROM webauthn_credentials WHERE credential_id = ?",
                    (rs, row) -> RegisteredCredential.builder()
                            .credentialId(credentialId)
                            .userHandle(userHandle(rs.getString("user_email")))
                            .publicKeyCose(new ByteArray(rs.getBytes("public_key")))
                            .signatureCount(rs.getLong("sign_count"))
                            .build(),
                    credentialId.getBase64Url()));
        }

        private static ByteArray decode(String value) {
            try {
                return ByteArray.fromBase64Url(value);
            } catch (Exception e) {
                throw new IllegalStateException("ID de credential invalid în baza de date.", e);
            }
        }
    }
}
