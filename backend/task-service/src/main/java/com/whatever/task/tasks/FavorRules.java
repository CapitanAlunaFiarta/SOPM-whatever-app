package com.whatever.task.tasks;

import com.whatever.task.web.ApiException;

import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;

/**
 * Regulile favorurilor („pasă ca la tenis”): cine a primit ultimul favor finalizat îi datorează unul
 * celuilalt. Cât timp datorezi, nu poți cere; când ți se cere și datorezi, poți refuza doar ca „nerezonabil”.
 */
public final class FavorRules {
    /** Stările în care un favor încă se desfășoară (cel mult unul între doi prieteni). */
    public static final List<String> OPEN = List.of("REQUESTED", "ACCEPTED", "SUBMITTED");
    /** Poza trebuie făcută chiar atunci: acceptăm o diferență de ceas de cel mult 15 minute. */
    public static final Duration PHOTO_MAX_AGE = Duration.ofMinutes(15);
    public static final int PHOTO_MAX_BYTES = 2_500_000;
    public static final int PHOTO_MIN_BYTES = 100;

    private FavorRules() {
    }

    /** Balanța dintre mine și un prieten, după ultimul favor finalizat dintre noi. */
    public enum Balance { EVEN, I_OWE, THEY_OWE }

    public static Balance balance(String me, String lastCompletedRequester, String lastCompletedDoer) {
        if (lastCompletedRequester == null || lastCompletedDoer == null) return Balance.EVEN;
        if (me.equals(lastCompletedRequester)) return Balance.I_OWE;
        if (me.equals(lastCompletedDoer)) return Balance.THEY_OWE;
        return Balance.EVEN;
    }

    /** Poza vine ca base64 (cu sau fără prefixul data:image/jpeg;base64,) și trebuie să fie un JPEG rezonabil. */
    public static byte[] decodePhoto(String value) {
        if (value == null || value.isBlank()) throw new ApiException(400, "Poza lipsește.");
        String data = value.trim();
        int comma = data.indexOf(',');
        if (data.startsWith("data:") && comma > 0) data = data.substring(comma + 1);
        byte[] bytes;
        try {
            bytes = Base64.getMimeDecoder().decode(data);
        } catch (IllegalArgumentException e) {
            throw new ApiException(400, "Poza nu este validă.");
        }
        if (bytes.length > PHOTO_MAX_BYTES) throw new ApiException(400, "Poza este prea mare.");
        boolean jpeg = bytes.length >= PHOTO_MIN_BYTES && (bytes[0] & 0xFF) == 0xFF && (bytes[1] & 0xFF) == 0xD8
                && (bytes[2] & 0xFF) == 0xFF;
        if (!jpeg) throw new ApiException(400, "Poza nu este validă.");
        return bytes;
    }

    /** Poza trebuie făcută acum (ceasul telefonului poate diferi puțin), nu adusă de altundeva. */
    public static void requireFreshPhoto(Instant takenAt, Instant now) {
        if (takenAt == null || takenAt.isBefore(now.minus(PHOTO_MAX_AGE)) || takenAt.isAfter(now.plus(PHOTO_MAX_AGE))) {
            throw new ApiException(400, "Fă poza acum, cu camera din aplicație.");
        }
    }
}
