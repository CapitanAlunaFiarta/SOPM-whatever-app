package com.whatever.task.push;

import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.AlgorithmParameters;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPrivateKeySpec;
import java.security.spec.ECPublicKeySpec;
import java.util.Arrays;
import java.util.Base64;

/**
 * Web Push fără biblioteci externe (doar JDK), ca să nu depindem de Firebase:
 * - criptarea mesajului pentru browser: RFC 8291 („aes128gcm”, ECDH pe P-256 + HKDF-SHA256 + AES-128-GCM);
 * - semnătura VAPID cu care serviciul de push (Google, Mozilla, Apple, Microsoft) știe că mesajul vine de la noi: RFC 8292.
 * Același cod e și în user-service (fiecare serviciu își trimite singur notificările).
 */
public final class WebPushCrypto {
    /** Mărimea unei înregistrări; un mesaj de notificare încape mereu într-una singură. */
    private static final int RECORD_SIZE = 4096;
    private static final ECParameterSpec P256 = curve();
    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder B64D = Base64.getUrlDecoder();

    private WebPushCrypto() {
    }

    private static ECParameterSpec curve() {
        try {
            AlgorithmParameters parameters = AlgorithmParameters.getInstance("EC");
            parameters.init(new ECGenParameterSpec("secp256r1"));
            return parameters.getParameterSpec(ECParameterSpec.class);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("P-256 indisponibil", e);
        }
    }

    public static String base64(byte[] bytes) {
        return B64.encodeToString(bytes);
    }

    /** Base64url cu sau fără „=” la final (browserele trimit fără). */
    public static byte[] fromBase64(String value) {
        return B64D.decode(value.strip().replace('+', '-').replace('/', '_').replaceAll("=+$", ""));
    }

    public static KeyPair generateKeyPair() {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
            generator.initialize(new ECGenParameterSpec("secp256r1"));
            return generator.generateKeyPair();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Nu pot genera o cheie P-256", e);
        }
    }

    /** Cheia publică necomprimată: 0x04 || x || y (65 de octeți), cum o vrea browserul. */
    public static byte[] publicKeyBytes(ECPublicKey key) {
        byte[] result = new byte[65];
        result[0] = 4;
        System.arraycopy(unsigned(key.getW().getAffineX(), 32), 0, result, 1, 32);
        System.arraycopy(unsigned(key.getW().getAffineY(), 32), 0, result, 33, 32);
        return result;
    }

    /** Partea secretă a cheii (scalarul d, 32 de octeți). */
    public static byte[] privateKeyBytes(ECPrivateKey key) {
        return unsigned(key.getS(), 32);
    }

    /** Cheia publică a unui browser; refuză orice nu e un punct valid de pe P-256. */
    public static ECPublicKey publicKey(byte[] uncompressed) {
        if (uncompressed.length != 65 || uncompressed[0] != 4) throw new IllegalArgumentException("Cheie publică invalidă");
        BigInteger x = new BigInteger(1, Arrays.copyOfRange(uncompressed, 1, 33));
        BigInteger y = new BigInteger(1, Arrays.copyOfRange(uncompressed, 33, 65));
        if (!onCurve(x, y)) throw new IllegalArgumentException("Cheia publică nu e pe curba P-256");
        try {
            return (ECPublicKey) KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(new ECPoint(x, y), P256));
        } catch (GeneralSecurityException e) {
            throw new IllegalArgumentException("Cheie publică invalidă", e);
        }
    }

    public static ECPrivateKey privateKey(byte[] scalar) {
        try {
            return (ECPrivateKey) KeyFactory.getInstance("EC").generatePrivate(new ECPrivateKeySpec(new BigInteger(1, scalar), P256));
        } catch (GeneralSecurityException e) {
            throw new IllegalArgumentException("Cheie privată invalidă", e);
        }
    }

    /** y² = x³ + ax + b (mod p), cu x și y în câmpul curbei. */
    static boolean onCurve(BigInteger x, BigInteger y) {
        BigInteger p = ((java.security.spec.ECFieldFp) P256.getCurve().getField()).getP();
        if (x.signum() < 0 || y.signum() < 0 || x.compareTo(p) >= 0 || y.compareTo(p) >= 0) return false;
        BigInteger left = y.multiply(y).mod(p);
        BigInteger right = x.pow(3).add(P256.getCurve().getA().multiply(x)).add(P256.getCurve().getB()).mod(p);
        return left.equals(right);
    }

    /**
     * Corpul cererii către serviciul de push (RFC 8291): antetul aes128gcm (salt, mărimea înregistrării, cheia publică
     * efemeră a serverului) urmat de textul criptat. `ephemeral` și `salt` sunt noi la fiecare mesaj.
     */
    public static byte[] encrypt(byte[] plaintext, byte[] userAgentPublic, byte[] authSecret, KeyPair ephemeral, byte[] salt) {
        if (plaintext.length + 17 > RECORD_SIZE) throw new IllegalArgumentException("Mesaj prea lung pentru o notificare");
        if (authSecret.length != 16 || salt.length != 16) throw new IllegalArgumentException("auth sau salt invalid");
        try {
            byte[] serverPublic = publicKeyBytes((ECPublicKey) ephemeral.getPublic());
            KeyAgreement agreement = KeyAgreement.getInstance("ECDH");
            agreement.init(ephemeral.getPrivate());
            agreement.doPhase(publicKey(userAgentPublic), true);
            byte[] ecdhSecret = agreement.generateSecret();

            byte[] prkKey = hmac(authSecret, ecdhSecret);
            byte[] keyInfo = concat("WebPush: info".getBytes(StandardCharsets.US_ASCII), new byte[]{0}, userAgentPublic, serverPublic);
            byte[] ikm = hmac(prkKey, keyInfo, new byte[]{1});
            byte[] prk = hmac(salt, ikm);
            byte[] cek = Arrays.copyOf(hmac(prk, "Content-Encoding: aes128gcm".getBytes(StandardCharsets.US_ASCII), new byte[]{0, 1}), 16);
            byte[] nonce = Arrays.copyOf(hmac(prk, "Content-Encoding: nonce".getBytes(StandardCharsets.US_ASCII), new byte[]{0, 1}), 12);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(cek, "AES"), new GCMParameterSpec(128, nonce));
            // 0x02 = ultima înregistrare, fără octeți de umplutură.
            byte[] ciphertext = cipher.doFinal(concat(plaintext, new byte[]{2}));

            ByteBuffer header = ByteBuffer.allocate(16 + 4 + 1 + serverPublic.length);
            header.put(salt).putInt(RECORD_SIZE).put((byte) serverPublic.length).put(serverPublic);
            return concat(header.array(), ciphertext);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Criptarea notificării a eșuat", e);
        }
    }

    /** JWT-ul VAPID (ES256): `aud` = originea serviciului de push, `sub` = cine trimite (adresa site-ului). */
    public static String vapidToken(String audience, String subject, long expiresAtEpochSeconds, ECPrivateKey key) {
        String header = base64("{\"typ\":\"JWT\",\"alg\":\"ES256\"}".getBytes(StandardCharsets.UTF_8));
        String claims = base64(("{\"aud\":\"" + json(audience) + "\",\"exp\":" + expiresAtEpochSeconds
                + ",\"sub\":\"" + json(subject) + "\"}").getBytes(StandardCharsets.UTF_8));
        String unsigned = header + "." + claims;
        try {
            // Formatul P1363 dă direct R || S (64 de octeți), cum cere JWS (nu DER).
            Signature signature = Signature.getInstance("SHA256withECDSAinP1363Format");
            signature.initSign(key);
            signature.update(unsigned.getBytes(StandardCharsets.US_ASCII));
            return unsigned + "." + base64(signature.sign());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Semnătura VAPID a eșuat", e);
        }
    }

    private static String json(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    static byte[] hmac(byte[] key, byte[]... parts) throws GeneralSecurityException {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key, "HmacSHA256"));
        for (byte[] part : parts) mac.update(part);
        return mac.doFinal();
    }

    static byte[] concat(byte[]... parts) {
        int length = 0;
        for (byte[] part : parts) length += part.length;
        ByteBuffer buffer = ByteBuffer.allocate(length);
        for (byte[] part : parts) buffer.put(part);
        return buffer.array();
    }

    private static byte[] unsigned(BigInteger value, int length) {
        byte[] raw = value.toByteArray();
        if (raw.length == length) return raw;
        byte[] result = new byte[length];
        if (raw.length > length) {
            System.arraycopy(raw, raw.length - length, result, 0, length);
        } else {
            System.arraycopy(raw, 0, result, length - raw.length, raw.length);
        }
        return result;
    }
}
