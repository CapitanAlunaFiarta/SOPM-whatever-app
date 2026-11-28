package com.whatever.task.push;

import com.whatever.task.web.I18n;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.security.KeyPair;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PushTest {

    /** Exemplul din RFC 8291 (aceeași implementare ca în user-service). */
    @Test
    void encryptionMatchesTheRfc8291Example() {
        KeyPair server = new KeyPair(
                WebPushCrypto.publicKey(WebPushCrypto.fromBase64(
                        "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8")),
                WebPushCrypto.privateKey(WebPushCrypto.fromBase64("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw")));
        byte[] body = WebPushCrypto.encrypt(WebPushCrypto.fromBase64("V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24"),
                WebPushCrypto.fromBase64("BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4"),
                WebPushCrypto.fromBase64("BTBZMqHH6r4Tts7J_aSIgg"), server, WebPushCrypto.fromBase64("DGv6ra1nlYgDCS1FRnbzlw"));
        assertEquals("DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6"
                + "PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN", WebPushCrypto.base64(body));
    }

    @Test
    void onlyKnownPushServicesAreAccepted() {
        PushService push = new PushService(null, null, "https://whatever-app-unitbv.me", "");
        assertTrue(push.allowedEndpoint(URI.create("https://fcm.googleapis.com/fcm/send/abc")));
        assertFalse(push.allowedEndpoint(URI.create("http://localhost:8098/push/1")));
        assertFalse(push.allowedEndpoint(URI.create("https://evil.example/fcm.googleapis.com")));
    }

    @Test
    void notificationsAreTranslated() {
        for (String template : Notes.TRANSLATED) {
            assertNotEquals(template, I18n.format(template, "en", "Ana", "x"), template);
            assertNotEquals(template, I18n.format(template, "es", "Ana", "x"), template);
        }
        PushService.Note invite = Notes.invite("Ana Pop", "Alergare", 7);
        assertEquals("Ana Pop invited you to “Alergare”.", invite.body("en"));
        assertEquals("Ana Pop te-a invitat la „Alergare”.", invite.body("ro"));
        assertEquals("/activity/7", invite.url());
        PushService.Note message = Notes.taskMessage("Ana", "Alergare", "Ne vedem la 7?", 7);
        assertEquals("Alergare", message.title("en"));
        assertEquals("Ana: Ne vedem la 7?", message.body("es"));
        assertEquals("/chat/7", message.url());
    }
}
