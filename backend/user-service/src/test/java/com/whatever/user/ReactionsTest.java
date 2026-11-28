package com.whatever.user;

import com.whatever.user.social.Reactions;
import com.whatever.user.web.ApiException;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ReactionsTest {

    @Test
    void onlyTheSixReactionsAreAcceptedInTheirDisplayForm() {
        assertEquals("👍", Reactions.emoji("👍"));
        assertEquals("🔥", Reactions.emoji(" 🔥 "));
        // Inima vine de la unele tastaturi fără selectorul de variantă: e aceeași reacție.
        assertEquals("❤️", Reactions.emoji("❤"));
        assertEquals("❤️", Reactions.emoji("❤️"));
        assertEquals(400, assertThrows(ApiException.class, () -> Reactions.emoji("🍕")).status());
        assertEquals(400, assertThrows(ApiException.class, () -> Reactions.emoji("")).status());
        assertEquals(400, assertThrows(ApiException.class, () -> Reactions.emoji(null)).status());
    }

    @Test
    void aReplyQuotesTheStartOfTheMessageWithoutSplittingEmoji() {
        assertNull(Reactions.reply(null, "ana", "Ana", "text"));
        Map<String, Object> shortReply = Reactions.reply(7L, "ana", "Ana Pop", "Ne vedem la 7?");
        assertEquals(7L, shortReply.get("id"));
        assertEquals("Ana Pop", shortReply.get("fullName"));
        assertEquals("Ne vedem la 7?", shortReply.get("text"));

        String longText = "🔥".repeat(150);
        String quoted = (String) Reactions.reply(8L, "ana", "Ana Pop", longText).get("text");
        assertEquals(140, quoted.codePointCount(0, quoted.length()));
        assertEquals("🔥".repeat(139) + "…", quoted);
    }
}
