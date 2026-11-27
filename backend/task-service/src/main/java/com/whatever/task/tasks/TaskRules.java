package com.whatever.task.tasks;

import com.whatever.task.web.ApiException;

import java.time.LocalDate;
import java.util.List;

/** Reguli pure (fără bază de date): valori permise, distanță, streak zilnic, freeze-uri lunare. */
public final class TaskRules {
    public static final List<String> CATEGORIES = List.of("Personal", "Facultate", "Sport", "Proiect Echipă", "Sănătate");
    public static final List<String> PRIORITIES = List.of("Low", "Medium", "High");
    public static final int MONTHLY_FREEZES = 3;
    /** Toleranța maximă acceptată pentru precizia GPS raportată de telefon. */
    public static final double MAX_ACCURACY_TOLERANCE_METERS = 50;

    private TaskRules() {
    }

    public static String category(String value) {
        String category = value == null ? "" : value.trim();
        if ("General".equalsIgnoreCase(category) || category.isEmpty()) return "Personal";
        return CATEGORIES.stream().filter(item -> item.equalsIgnoreCase(category)).findFirst()
                .orElseThrow(() -> new ApiException(400, "Categorie invalidă. Alege: " + String.join(", ", CATEGORIES) + "."));
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
}
