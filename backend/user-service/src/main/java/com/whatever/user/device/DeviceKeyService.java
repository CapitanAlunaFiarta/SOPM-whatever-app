package com.whatever.user.device;

import com.whatever.user.auth.Tokens;
import com.whatever.user.security.JwtService;
import com.whatever.user.users.UserRepository;
import com.whatever.user.web.ApiException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Biometrie în aplicația nativă, verificată pe server:
 * telefonul generează o pereche de chei Ed25519, păstrează cheia privată în Keychain/Keystore
 * (deblocată doar cu amprentă/Face ID) și trimite serverului doar cheia publică.
 * La finalizarea unui task, serverul dă un challenge unic, telefonul îl semnează după
 * confirmarea biometrică, iar serverul verifică semnătura și emite token-ul biometric.
 */
@Service
public class DeviceKeyService {
    private static final byte[] ED25519_X509_PREFIX = HexFormat.of().parseHex("302a300506032b6570032100");
    private static final int MAX_DEVICES = 5;

    private final JdbcTemplate db;
    private final JwtService jwt;

    public DeviceKeyService(JdbcTemplate db, JwtService jwt) {
        this.db = db;
        this.jwt = jwt;
    }

    /** Mesajul semnat de telefon. Trebuie să fie identic cu cel construit în aplicație. */
    public static byte[] message(long taskId, String challenge) {
        return ("whatever:complete:" + taskId + ":" + challenge).getBytes(StandardCharsets.UTF_8);
    }

    @Transactional
    public String register(String email, String publicKeyBase64Url, String name) {
        byte[] raw = decode(publicKeyBase64Url, "Cheie publică invalidă.");
        if (raw.length != 32) throw new ApiException(400, "Cheie publică invalidă.");
        toPublicKey(raw); // validează că este o cheie Ed25519 corectă
        Integer count = db.queryForObject("SELECT count(*) FROM device_keys WHERE user_email = ?", Integer.class, email);
        if (count != null && count >= MAX_DEVICES) {
            db.update("DELETE FROM device_keys WHERE id = (SELECT id FROM device_keys WHERE user_email = ? "
                    + "ORDER BY coalesce(last_used_at, created_at) ASC LIMIT 1)", email);
        }
        String safeName = name == null || name.isBlank() ? "Telefon" : name.trim();
        if (safeName.length() > 100) safeName = safeName.substring(0, 100);
        UUID deviceId = db.queryForObject(
                "INSERT INTO device_keys(user_email, name, public_key) VALUES (?, ?, ?) RETURNING device_id",
                UUID.class, email, safeName, raw);
        db.update("UPDATE users SET biometric_enabled = TRUE WHERE email = ?", email);
        return String.valueOf(deviceId);
    }

    public List<Map<String, Object>> list(String email) {
        return db.queryForList("SELECT device_id, name, created_at, last_used_at FROM device_keys "
                + "WHERE user_email = ? ORDER BY created_at DESC", email).stream().map(row -> {
            Map<String, Object> device = new LinkedHashMap<>();
            device.put("deviceId", String.valueOf(row.get("device_id")));
            device.put("name", row.get("name"));
            device.put("createdAt", UserRepository.isoInstant(row.get("created_at")));
            device.put("lastUsedAt", UserRepository.isoInstant(row.get("last_used_at")));
            return device;
        }).toList();
    }

    @Transactional
    public void delete(String email, String deviceId) {
        db.update("DELETE FROM device_keys WHERE device_id = ? AND user_email = ?", parseId(deviceId), email);
        Integer webauthn = db.queryForObject("SELECT count(*) FROM webauthn_credentials WHERE user_email = ?", Integer.class, email);
        Integer devices = db.queryForObject("SELECT count(*) FROM device_keys WHERE user_email = ?", Integer.class, email);
        if ((webauthn == null || webauthn == 0) && (devices == null || devices == 0)) {
            db.update("UPDATE users SET biometric_enabled = FALSE WHERE email = ?", email);
        }
    }

    @Transactional
    public Map<String, Object> challenge(String email, String deviceId, long taskId) {
        UUID id = parseId(deviceId);
        Integer owned = db.queryForObject("SELECT count(*) FROM device_keys WHERE device_id = ? AND user_email = ?",
                Integer.class, id, email);
        if (owned == null || owned == 0) {
            throw new ApiException(404, "Telefonul nu mai este înregistrat. Activează din nou biometria din Profil.");
        }
        db.update("DELETE FROM device_challenges WHERE user_email = ? AND device_id = ?", email, id);
        byte[] challenge = Tokens.randomBytes(32);
        Long challengeId = db.queryForObject(
                "INSERT INTO device_challenges(device_id, user_email, task_id, challenge, expires_at) "
                        + "VALUES (?, ?, ?, ?, now() + INTERVAL '2 minutes') RETURNING id",
                Long.class, id, email, taskId, challenge);
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("challengeId", challengeId);
        response.put("challenge", Tokens.base64Url(challenge));
        response.put("taskId", taskId);
        response.put("expiresIn", 120);
        return response;
    }

    @Transactional
    public String verify(String email, long challengeId, String signatureBase64Url) {
        List<Map<String, Object>> rows = db.queryForList(
                "DELETE FROM device_challenges WHERE id = ? AND user_email = ? AND expires_at > now() "
                        + "RETURNING device_id, task_id, challenge", challengeId, email);
        if (rows.isEmpty()) throw new ApiException(400, "Confirmarea a expirat. Încearcă din nou.");
        Map<String, Object> challenge = rows.get(0);
        UUID deviceId = (UUID) challenge.get("device_id");
        long taskId = ((Number) challenge.get("task_id")).longValue();
        List<byte[]> keys = db.query("SELECT public_key FROM device_keys WHERE device_id = ? AND user_email = ?",
                (rs, row) -> rs.getBytes(1), deviceId, email);
        if (keys.isEmpty()) throw new ApiException(404, "Telefonul nu mai este înregistrat.");
        byte[] signature = decode(signatureBase64Url, "Semnătură invalidă.");
        String challengeText = Tokens.base64Url((byte[]) challenge.get("challenge"));
        if (!verifySignature(keys.get(0), message(taskId, challengeText), signature)) {
            throw new ApiException(401, "Verificarea biometrică a eșuat.");
        }
        db.update("UPDATE device_keys SET last_used_at = now() WHERE device_id = ?", deviceId);
        return jwt.biometricToken(email, taskId);
    }

    public static boolean verifySignature(byte[] rawPublicKey, byte[] message, byte[] signature) {
        if (signature.length != 64) return false;
        try {
            Signature verifier = Signature.getInstance("Ed25519");
            verifier.initVerify(toPublicKey(rawPublicKey));
            verifier.update(message);
            return verifier.verify(signature);
        } catch (GeneralSecurityException e) {
            return false;
        }
    }

    static PublicKey toPublicKey(byte[] raw) {
        try {
            byte[] encoded = new byte[ED25519_X509_PREFIX.length + raw.length];
            System.arraycopy(ED25519_X509_PREFIX, 0, encoded, 0, ED25519_X509_PREFIX.length);
            System.arraycopy(raw, 0, encoded, ED25519_X509_PREFIX.length, raw.length);
            return KeyFactory.getInstance("Ed25519").generatePublic(new X509EncodedKeySpec(encoded));
        } catch (GeneralSecurityException e) {
            throw new ApiException(400, "Cheie publică invalidă.");
        }
    }

    private static UUID parseId(String value) {
        try {
            return UUID.fromString(value.trim());
        } catch (RuntimeException e) {
            throw new ApiException(400, "Identificator de telefon invalid.");
        }
    }

    private static byte[] decode(String value, String error) {
        try {
            return Tokens.fromBase64Url(value);
        } catch (RuntimeException e) {
            throw new ApiException(400, error);
        }
    }
}
