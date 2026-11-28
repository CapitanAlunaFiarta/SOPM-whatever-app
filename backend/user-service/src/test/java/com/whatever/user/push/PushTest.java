package com.whatever.user.push;

import com.whatever.user.web.I18n;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.Signature;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PushTest {

    /** Exemplul din RFC 8291, secțiunea 5 / anexa A: aceleași chei și același salt dau exact același mesaj criptat. */
    @Test
    void encryptionMatchesTheRfc8291Example() {
        byte[] plaintext = WebPushCrypto.fromBase64("V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24");
        KeyPair server = new KeyPair(
                WebPushCrypto.publicKey(WebPushCrypto.fromBase64(
                        "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8")),
                WebPushCrypto.privateKey(WebPushCrypto.fromBase64("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw")));
        byte[] browser = WebPushCrypto.fromBase64(
                "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4");
        byte[] body = WebPushCrypto.encrypt(plaintext, browser, WebPushCrypto.fromBase64("BTBZMqHH6r4Tts7J_aSIgg"), server,
                WebPushCrypto.fromBase64("DGv6ra1nlYgDCS1FRnbzlw"));
        assertEquals("DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6"
                + "PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN", WebPushCrypto.base64(body));
    }

    @Test
    void vapidTokenIsSignedWithTheServerKey() throws Exception {
        KeyPair keys = WebPushCrypto.generateKeyPair();
        byte[] publicKey = WebPushCrypto.publicKeyBytes((ECPublicKey) keys.getPublic());
        ECPrivateKey stored = WebPushCrypto.privateKey(WebPushCrypto.privateKeyBytes((ECPrivateKey) keys.getPrivate()));
        String token = WebPushCrypto.vapidToken("https://fcm.googleapis.com", "https://whatever-app-unitbv.me", 1_900_000_000L, stored);
        String[] parts = token.split("\\.");
        assertEquals("{\"aud\":\"https://fcm.googleapis.com\",\"exp\":1900000000,\"sub\":\"https://whatever-app-unitbv.me\"}",
                new String(WebPushCrypto.fromBase64(parts[1]), StandardCharsets.UTF_8));
        Signature verify = Signature.getInstance("SHA256withECDSAinP1363Format");
        verify.initVerify(WebPushCrypto.publicKey(publicKey));
        verify.update((parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII));
        assertTrue(verify.verify(WebPushCrypto.fromBase64(parts[2])));
    }

    @Test
    void browserKeysMustBeValidCurvePoints() {
        assertThrows(IllegalArgumentException.class, () -> WebPushCrypto.publicKey(new byte[65]));
        byte[] key = WebPushCrypto.publicKeyBytes((ECPublicKey) WebPushCrypto.generateKeyPair().getPublic());
        key[64] ^= 1;
        assertThrows(IllegalArgumentException.class, () -> WebPushCrypto.publicKey(key));
    }

    @Test
    void onlyKnownPushServicesAreAccepted() {
        PushService push = new PushService(null, null, "https://whatever-app-unitbv.me", "localhost");
        assertTrue(push.allowedEndpoint(URI.create("https://fcm.googleapis.com/fcm/send/abc")));
        assertTrue(push.allowedEndpoint(URI.create("https://updates.push.services.mozilla.com/wpush/v2/abc")));
        assertTrue(push.allowedEndpoint(URI.create("https://web.push.apple.com/abc")));
        assertTrue(push.allowedEndpoint(URI.create("https://wns2-par02p.notify.windows.com/w/?token=abc")));
        assertTrue(push.allowedEndpoint(URI.create("http://localhost:8098/push/1")));
        assertFalse(push.allowedEndpoint(URI.create("http://fcm.googleapis.com/fcm/send/abc")));
        assertFalse(push.allowedEndpoint(URI.create("https://fcm.googleapis.com:8443/fcm/send/abc")));
        assertFalse(push.allowedEndpoint(URI.create("https://fcm.googleapis.com.evil.example/abc")));
        assertFalse(push.allowedEndpoint(URI.create("https://user@fcm.googleapis.com/abc")));
        assertFalse(push.allowedEndpoint(URI.create("https://169.254.169.254/latest")));
        assertFalse(new PushService(null, null, "https://x", "").allowedEndpoint(URI.create("http://localhost:8098/push/1")));
    }

    @Test
    void notificationsAreTranslatedForTheSubscriptionLanguage() {
        for (String template : Notes.TRANSLATED) {
            assertNotEquals(template, I18n.format(template, "en", "Ana", "x"), template);
            assertNotEquals(template, I18n.format(template, "es", "Ana", "x"), template);
        }
        PushService.Note request = Notes.friendRequest("Ana Pop");
        assertEquals("Cerere de prietenie", request.title("ro"));
        assertEquals("Ana Pop wants to be your friend.", request.body("en"));
        assertEquals("Ana Pop quiere ser tu amigo.", request.body("es"));
        // Valorile se pun o singură dată: un nume care conține „{0}” nu e înlocuit din nou.
        assertEquals("{0} accepted your friend request.", Notes.friendAccepted("{0}", "ana").body("en"));
        // Mesajele lungi se scurtează (fără să taie un emoji în două).
        String body = Notes.directMessage("Ana", "ana", "🔥".repeat(300)).body("ro");
        assertEquals(240, body.codePointCount(0, body.length()));
        assertTrue(body.endsWith("…"));
        assertEquals("/chat/dm/ana", Notes.directMessage("Ana", "ana", "salut").url());
    }
}
