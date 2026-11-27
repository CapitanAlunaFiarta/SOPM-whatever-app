package com.whatever.task;

import com.whatever.task.tasks.FavorRules;
import com.whatever.task.web.ApiException;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Base64;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class FavorRulesTest {
    private static final byte[] JPEG = jpeg(400);

    private static byte[] jpeg(int size) {
        byte[] bytes = new byte[size];
        bytes[0] = (byte) 0xFF;
        bytes[1] = (byte) 0xD8;
        bytes[2] = (byte) 0xFF;
        return bytes;
    }

    @Test
    void whoeverReceivedTheLastFavorOwesTheNextOne() {
        assertEquals(FavorRules.Balance.EVEN, FavorRules.balance("ana", null, null));
        // Ana a cerut, Bob a făcut → Ana îi datorează lui Bob.
        assertEquals(FavorRules.Balance.I_OWE, FavorRules.balance("ana", "ana", "bob"));
        assertEquals(FavorRules.Balance.THEY_OWE, FavorRules.balance("bob", "ana", "bob"));
    }

    @Test
    void acceptsJpegWithOrWithoutDataUrlPrefix() {
        String base64 = Base64.getEncoder().encodeToString(JPEG);
        assertEquals(400, FavorRules.decodePhoto(base64).length);
        assertEquals(400, FavorRules.decodePhoto("data:image/jpeg;base64," + base64).length);
    }

    @Test
    void rejectsMissingTinyOrNonJpegPhotos() {
        assertEquals(400, assertThrows(ApiException.class, () -> FavorRules.decodePhoto(" ")).status());
        assertThrows(ApiException.class, () -> FavorRules.decodePhoto(Base64.getEncoder().encodeToString(jpeg(20))));
        byte[] png = jpeg(400);
        png[0] = (byte) 0x89;
        assertThrows(ApiException.class, () -> FavorRules.decodePhoto(Base64.getEncoder().encodeToString(png)));
        assertThrows(ApiException.class,
                () -> FavorRules.decodePhoto(Base64.getEncoder().encodeToString(jpeg(FavorRules.PHOTO_MAX_BYTES + 1))));
    }

    @Test
    void photoMustBeTakenNow() {
        Instant now = Instant.parse("2026-11-28T10:00:00Z");
        assertDoesNotThrow(() -> FavorRules.requireFreshPhoto(now.minusSeconds(40), now));
        assertThrows(ApiException.class, () -> FavorRules.requireFreshPhoto(null, now));
        assertThrows(ApiException.class, () -> FavorRules.requireFreshPhoto(now.minusSeconds(3600), now));
        assertThrows(ApiException.class, () -> FavorRules.requireFreshPhoto(now.plusSeconds(3600), now));
    }
}
