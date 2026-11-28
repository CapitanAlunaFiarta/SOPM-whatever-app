package com.whatever.task.tasks;

import com.whatever.task.web.ApiException;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** Reguli pure (fără bază de date): valori permise, distanță, streak zilnic, freeze-uri lunare. */
public final class TaskRules {
    /** Chei stabile; aplicația le afișează tradus. */
    public static final List<String> CATEGORIES = List.of("SPORT", "STUDY", "CHORES", "ENTERTAINMENT");
    public static final String DEFAULT_CATEGORY = "CHORES";
    /** Categoriile vechi (aplicații neactualizate, date dinainte de migrarea 003). */
    private static final Map<String, String> LEGACY_CATEGORIES = Map.of(
            "sport", "SPORT", "sănătate", "SPORT", "sanatate", "SPORT",
            "facultate", "STUDY", "proiect echipă", "STUDY", "proiect echipa", "STUDY",
            "personal", "CHORES", "general", "CHORES");
    public static final List<String> PRIORITIES = List.of("Low", "Medium", "High");
    public static final int MONTHLY_FREEZES = 3;
    /** Toleranța maximă acceptată pentru precizia GPS raportată de telefon. */
    public static final double MAX_ACCURACY_TOLERANCE_METERS = 50;
    /** Câți membri poate avea o activitate de grup, cu tot cu organizator. */
    public static final int MAX_MEMBERS = 30;
    /** Câți oameni pot fi invitați sau primiți, în afară de organizator. */
    public static final int MAX_PARTICIPANTS = MAX_MEMBERS - 1;
    /** Chatul unei activități de grup rămâne deschis încă 5 zile după ce activitatea s-a încheiat. */
    public static final Duration CHAT_OPEN_AFTER_FINISH = Duration.ofDays(5);

    private TaskRules() {
    }

    /** Categoria trimisă de client: cheie nouă, nume vechi sau gol (→ CHORES). Altceva → 400. */
    public static String category(String value) {
        String category = value == null ? "" : value.trim();
        if (category.isEmpty()) return DEFAULT_CATEGORY;
        String known = normalizeCategory(category);
        if (known == null) throw new ApiException(400, "Categorie invalidă.");
        return known;
    }

    /** Cheia categoriei pentru o valoare din baza de date; necunoscut → null. */
    public static String normalizeCategory(Object value) {
        if (value == null) return null;
        String category = value.toString().trim();
        for (String key : CATEGORIES) {
            if (key.equalsIgnoreCase(category)) return key;
        }
        return LEGACY_CATEGORIES.get(category.toLowerCase(Locale.ROOT));
    }

    /** Ca normalizeCategory, dar valorile necunoscute devin CHORES (pentru afișare). */
    public static String storedCategory(Object value) {
        String key = normalizeCategory(value);
        return key == null ? DEFAULT_CATEGORY : key;
    }

    public static String priority(String value) {
        String priority = value == null ? "" : value.trim();
        if ("Normal".equalsIgnoreCase(priority) || priority.isEmpty()) return "Medium";
        return PRIORITIES.stream().filter(item -> item.equalsIgnoreCase(priority)).findFirst()
                .orElseThrow(() -> new ApiException(400, "Prioritate invalidă. Alege: Low, Medium sau High."));
    }

    public static double distanceMeters(double lat1, double lon1, double lat2, double lon2) {
        double earthRadius = 6_371_000;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    /** Streak = zile consecutive cu cel puțin o activitate finalizată. */
    public static int nextStreak(int currentStreak, LocalDate lastActive, LocalDate today) {
        if (lastActive == null) return 1;
        if (lastActive.equals(today)) return Math.max(currentStreak, 1);
        if (lastActive.equals(today.minusDays(1))) return currentStreak + 1;
        return 1;
    }

    /** Freeze-urile se reîncarcă la 3 în fiecare lună calendaristică. */
    public static int availableFreezes(int storedFreezes, LocalDate freezeMonth, LocalDate today) {
        return today.withDayOfMonth(1).equals(freezeMonth) ? storedFreezes : MONTHLY_FREEZES;
    }

    /** Un freeze acoperă o zi ratată: dacă ultima zi activă e înainte de ieri, o mutăm cu o zi înainte. */
    public static LocalDate lastActiveAfterFreeze(LocalDate lastActive, LocalDate today) {
        if (lastActive == null) return null;
        return lastActive.isBefore(today.minusDays(1)) ? lastActive.plusDays(1) : lastActive;
    }

    /**
     * Usernamele invitate: lista nouă „participants” sau, de la clienții vechi, câmpul „friend”.
     * Fără „@”, fără goluri și fără dubluri (ordinea se păstrează).
     */
    public static List<String> invitedUsernames(List<String> participants, String friend) {
        List<String> raw = participants != null ? participants : friend == null ? List.of() : List.of(friend);
        Set<String> unique = new LinkedHashSet<>();
        for (String value : raw) {
            String username = value == null ? "" : value.trim().replaceFirst("^@", "");
            if (!username.isEmpty()) unique.add(username);
        }
        if (unique.size() > MAX_PARTICIPANTS) {
            throw new ApiException(400, "O activitate poate avea cel mult 30 de membri (cu tot cu tine).");
        }
        return new ArrayList<>(unique);
    }

    /** Nu mai e loc când membrii și invitațiile fără răspuns ocupă toate locurile (organizatorul are locul lui). */
    public static boolean isFull(int acceptedOrInvited) {
        return acceptedOrInvited >= MAX_PARTICIPANTS;
    }

    /** Și-a făcut membrul partea? La activitățile zilnice contează doar azi, la cele unice orice finalizare. */
    public static boolean confirmed(LocalDate lastCompletion, boolean recurring, LocalDate today) {
        if (lastCompletion == null) return false;
        return !recurring || lastCompletion.equals(today);
    }

    /** Momentul de la care chatul activității devine doar de citit (null cât timp activitatea continuă). */
    public static Instant chatClosesAt(Instant finishedAt) {
        return finishedAt == null ? null : finishedAt.plus(CHAT_OPEN_AFTER_FINISH);
    }
}
