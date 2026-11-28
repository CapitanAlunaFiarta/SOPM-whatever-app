package com.whatever.user.push;

import java.util.List;

/**
 * Textele notificărilor trimise de user-service, în română (traducerile sunt în i18n/messages.tsv). Numele și
 * mesajele oamenilor se pun ca valori, nu se traduc.
 */
public final class Notes {
    public static final String FRIEND_REQUEST_TITLE = "Cerere de prietenie";
    public static final String FRIEND_REQUEST = "{0} vrea să fie prieten cu tine.";
    public static final String FRIEND_ACCEPTED_TITLE = "Cerere acceptată";
    public static final String FRIEND_ACCEPTED = "{0} a acceptat cererea ta de prietenie.";
    public static final String COMMUNITY_REPLY_TITLE = "{0} ți-a răspuns în comunitate";
    public static final String UPDATE_TITLE = "Versiune nouă: {0}";
    public static final String UPDATE = "Deschide Whatever ca să actualizezi aplicația.";
    public static final String TEST_TITLE = "Notificările merg!";
    public static final String TEST = "Așa vei afla de cereri, mesaje, favoruri, invitații și versiuni noi.";
    /** Șabloanele care trebuie să aibă traducere (verificat în teste). */
    public static final List<String> TRANSLATED = List.of(FRIEND_REQUEST_TITLE, FRIEND_REQUEST, FRIEND_ACCEPTED_TITLE,
            FRIEND_ACCEPTED, COMMUNITY_REPLY_TITLE, UPDATE_TITLE, UPDATE, TEST_TITLE, TEST);

    private Notes() {
    }

    public static PushService.Note friendRequest(String name) {
        return new PushService.Note(FRIEND_REQUEST_TITLE, List.of(), FRIEND_REQUEST, List.of(name), "/social?section=friends",
                "friends", false);
    }

    public static PushService.Note friendAccepted(String name, String username) {
        return new PushService.Note(FRIEND_ACCEPTED_TITLE, List.of(), FRIEND_ACCEPTED, List.of(name), "/user/" + username,
                "friends", false);
    }

    /** Un mesaj privat: titlul e numele celui care scrie, textul e mesajul (fără traducere). */
    public static PushService.Note directMessage(String name, String username, String text) {
        return new PushService.Note("{0}", List.of(name), "{0}", List.of(text), "/chat/dm/" + username, "dm-" + username, true);
    }

    public static PushService.Note communityReply(String name, String text) {
        return new PushService.Note(COMMUNITY_REPLY_TITLE, List.of(name), "{0}", List.of(text), "/chat/community",
                "community-reply", true);
    }

    public static PushService.Note update(String version) {
        return new PushService.Note(UPDATE_TITLE, List.of(version), UPDATE, List.of(), "/profile", "update", false);
    }

    public static PushService.Note test() {
        return new PushService.Note(TEST_TITLE, List.of(), TEST, List.of(), "/profile", "test", false);
    }
}
