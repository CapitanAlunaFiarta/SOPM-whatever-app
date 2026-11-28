package com.whatever.user.profile;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.ToIntFunction;

/**
 * Insignele de pe profil. Se calculează din ce s-a întâmplat deja (finalizări, cea mai lungă serie, prieteni,
 * favoruri, activități de grup), deci nu trebuie salvate și apar și pentru istoricul de dinainte de ele.
 * Fiecare are un prag; aplicația afișează numele și descrierea traduse după id.
 */
public final class Badges {
    /** Ce știm despre cineva, adunat de BadgeService din baza de date. */
    public record Stats(int done, int bestStreak, Map<String, Integer> categories, int friends, int favors,
                        int groupDone, int biggestGroup, int early, int late, int bestRecurring) {
        int category(String key) {
            return categories == null ? 0 : categories.getOrDefault(key, 0);
        }
    }

    private record Definition(String id, int goal, ToIntFunction<Stats> progress) {
    }

    /** Ordinea e cea de pe profil: întâi cele ușoare. */
    private static final List<Definition> DEFINITIONS = List.of(
            new Definition("FIRST_STEP", 1, Stats::done),
            new Definition("STREAK_3", 3, Stats::bestStreak),
            new Definition("DONE_10", 10, Stats::done),
            new Definition("STREAK_7", 7, Stats::bestStreak),
            new Definition("FRIENDS_5", 5, Stats::friends),
            new Definition("HELPER", 3, Stats::favors),
            new Definition("TEAM_PLAYER", 5, Stats::groupDone),
            new Definition("SPORT_10", 10, stats -> stats.category("SPORT")),
            new Definition("STUDY_10", 10, stats -> stats.category("STUDY")),
            new Definition("CHORES_10", 10, stats -> stats.category("CHORES")),
            new Definition("FUN_10", 10, stats -> stats.category("ENTERTAINMENT")),
            new Definition("EARLY_BIRD", 5, Stats::early),
            new Definition("NIGHT_OWL", 5, Stats::late),
            new Definition("REGULAR", 10, Stats::bestRecurring),
            new Definition("ORGANIZER", 5, Stats::biggestGroup),
            new Definition("DONE_50", 50, Stats::done),
            new Definition("STREAK_30", 30, Stats::bestStreak),
            new Definition("DONE_100", 100, Stats::done));

    private Badges() {
    }

    public static List<String> ids() {
        return DEFINITIONS.stream().map(Definition::id).toList();
    }

    /** Toate insignele, cu progresul (plafonat la prag) și dacă e câștigată. */
    public static List<Map<String, Object>> evaluate(Stats stats) {
        return DEFINITIONS.stream().map(definition -> {
            int progress = Math.max(0, definition.progress().applyAsInt(stats));
            Map<String, Object> badge = new LinkedHashMap<>();
            badge.put("id", definition.id());
            badge.put("earned", progress >= definition.goal());
            badge.put("progress", Math.min(progress, definition.goal()));
            badge.put("goal", definition.goal());
            return badge;
        }).toList();
    }
}
