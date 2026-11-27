package com.whatever.user;

import com.whatever.user.auth.Tokens;
import com.whatever.user.device.DeviceKeyService;
import com.whatever.user.security.AuthUser;
import com.whatever.user.security.JwtService;
import org.junit.jupiter.api.Test;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.util.Arrays;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SecurityPrimitivesTest {
    private final JwtService jwt = new JwtService("test-secret-test-secret-test-secret-0123456789", 60_000);

    @Test
    void accessTokenRoundTrip() {
        String token = jwt.accessToken(7, "ana@example.com", "ADMIN");
        Optional<AuthUser> user = jwt.parseAccess(token);
        assertTrue(user.isPresent());
        assertEquals("ana@example.com", user.get().email());
        assertEquals(7, user.get().id());
        assertTrue(user.get().isAdmin());
    }

    @Test
    void biometricTokenIsNotASession() {
        String biometric = jwt.biometricToken("ana@example.com", 12);
        assertTrue(jwt.parseAccess(biometric).isEmpty());
    }

    @Test
    void tokenSignedWithOtherSecretIsRejected() {
        JwtService other = new JwtService("another-secret-another-secret-another-secret-01", 60_000);
        assertTrue(jwt.parseAccess(other.accessToken(1, "x@example.com", "USER")).isEmpty());
        assertTrue(jwt.parseAccess("not-a-token").isEmpty());
    }

    @Test
    void ed25519SignatureFromRawKeyVerifies() throws Exception {
        KeyPair pair = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
        byte[] encoded = pair.getPublic().getEncoded();
        byte[] raw = Arrays.copyOfRange(encoded, encoded.length - 32, encoded.length);
        String challenge = Tokens.base64Url(Tokens.randomBytes(32));
        byte[] message = DeviceKeyService.message(42, challenge);

        Signature signer = Signature.getInstance("Ed25519");
        signer.initSign(pair.getPrivate());
        signer.update(message);
        byte[] signature = signer.sign();

        assertTrue(DeviceKeyService.verifySignature(raw, message, signature));
        assertFalse(DeviceKeyService.verifySignature(raw, DeviceKeyService.message(43, challenge), signature));
    }

    @Test
    void resetCodesAreNormalized() {
        String code = Tokens.readableCode();
        assertEquals(10, code.length());
        String display = code.substring(0, 5) + "-" + code.substring(5).toLowerCase();
        assertEquals(code, Tokens.normalizeCode(" " + display + " "));
    }
}
