package com.whatever.user.social;

import com.whatever.user.web.ApiException;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Reacțiile la mesaje: un emoji per persoană per mesaj, dintr-o listă fixă. A doua apăsare pe aceeași reacție o
 * scoate, alt emoji o înlocuiește. Aceeași tabelă (message_reactions) servește chatul comunității, chatul
 * activităților și mesajele private; coloana mesajului e una dintre constantele de mai jos (nu vine de la client).
 */
public final class Reactions {
    public static final String CHAT = "chat_message_id";
    public static final String DIRECT = "direct_message_id";
    /** Emoji permise, în ordinea din meniu. ❤️ se compară fără selectorul de variantă (U+FE0F). */
    public static final List<String> EMOJI = List.of("👍", "❤️", "😂", "😮", "😢", "🔥");

    private Reactions() {
    }

    /** Emoji-ul trimis de client, în forma de afișare; altceva → 400. */
    public static String emoji(String value) {
        String key = value == null ? "" : value.strip().replace("\uFE0F", "");
        return EMOJI.stream().filter(emoji -> emoji.replace("\uFE0F", "").equals(key)).findFirst()
                .orElseThrow(() -> new ApiException(400, "Reacție necunoscută."));
    }

    /** Pune, schimbă sau (dacă e aceeași) scoate reacția mea la mesaj. */
    public static void toggle(JdbcTemplate db, String column, long messageId, String email, String emoji) {
        List<String> existing = db.queryForList("SELECT emoji FROM message_reactions WHERE " + column + " = ? AND user_email = ?",
                String.class, messageId, email);
        if (existing.isEmpty()) {
            db.update("INSERT INTO message_reactions(" + column + ", user_email, emoji) VALUES (?, ?, ?) ON CONFLICT DO NOTHING",
                    messageId, email, emoji);
        } else if (existing.get(0).equals(emoji)) {
            db.update("DELETE FROM message_reactions WHERE " + column + " = ? AND user_email = ?", messageId, email);
        } else {
            db.update("UPDATE message_reactions SET emoji = ?, created_at = now() WHERE " + column + " = ? AND user_email = ?",
                    emoji, messageId, email);
        }
    }

    /** Reacțiile mesajelor date, grupate pe mesaj: [{emoji, count, mine}], în ordinea în care au apărut. */
    public static Map<Long, List<Map<String, Object>>> load(JdbcTemplate db, String column, Collection<Long> ids, String email) {
        if (ids.isEmpty()) return Collections.emptyMap();
        List<Object> args = new ArrayList<>();
        args.add(email);
        args.addAll(ids);
        Map<Long, List<Map<String, Object>>> result = new HashMap<>();
        db.queryForList("SELECT " + column + " AS message_id, emoji, count(*) AS total, bool_or(user_email = ?) AS mine "
                        + "FROM message_reactions WHERE " + column + " IN (" + String.join(",", Collections.nCopies(ids.size(), "?"))
                        + ") GROUP BY 1, 2 ORDER BY min(created_at)", args.toArray())
                .forEach(row -> {
                    Map<String, Object> reaction = new LinkedHashMap<>();
                    reaction.put("emoji", row.get("emoji"));
                    reaction.put("count", row.get("total") instanceof Number number ? number.intValue() : 0);
                    reaction.put("mine", Boolean.TRUE.equals(row.get("mine")));
                    long id = row.get("message_id") instanceof Number number ? number.longValue() : 0;
                    result.computeIfAbsent(id, key -> new ArrayList<>()).add(reaction);
                });
        return result;
    }

    /** Citatul unui răspuns: cine a scris mesajul citat și începutul lui (null dacă nu e răspuns sau s-a șters). */
    public static Map<String, Object> reply(Object id, Object username, Object fullName, Object text) {
        if (id == null) return null;
        String body = text == null ? "" : text.toString();
        Map<String, Object> reply = new LinkedHashMap<>();
        reply.put("id", id);
        reply.put("username", username);
        reply.put("fullName", fullName);
        // Tăiem după caractere întregi (un emoji are două unități UTF-16).
        if (body.codePointCount(0, body.length()) > 140) body = body.substring(0, body.offsetByCodePoints(0, 139)) + "…";
        reply.put("text", body);
        return reply;
    }
}
