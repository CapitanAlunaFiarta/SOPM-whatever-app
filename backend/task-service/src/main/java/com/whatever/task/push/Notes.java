package com.whatever.task.push;

import java.util.List;

/**
 * Textele notificărilor trimise de task-service, în română (traducerile sunt în i18n/messages.tsv). Numele, titlurile
 * activităților și mesajele oamenilor se pun ca valori, nu se traduc.
 */
public final class Notes {
    public static final String INVITE_TITLE = "Invitație la o activitate";
    public static final String INVITE = "{0} te-a invitat la „{1}”.";
    public static final String INVITE_ACCEPTED_TITLE = "Invitație acceptată";
    public static final String INVITE_ACCEPTED = "{0} vine la „{1}”.";
    public static final String JOIN_REQUEST_TITLE = "Cerere de participare";
    public static final String JOIN_REQUEST = "{0} vrea să participe la „{1}”.";
    public static final String JOIN_APPROVED_TITLE = "Ai fost primit";
    public static final String JOIN_APPROVED = "{0} te-a primit în „{1}”.";
    public static final String FAVOR_ASKED_TITLE = "Un favor pentru tine";
    public static final String FAVOR_ASKED = "{0} îți cere un favor: „{1}”.";
    public static final String FAVOR_ACCEPTED_TITLE = "Favor acceptat";
    public static final String FAVOR_ACCEPTED = "{0} a acceptat favorul „{1}”.";
    public static final String FAVOR_DECLINED_TITLE = "Favor refuzat";
    public static final String FAVOR_DECLINED = "{0} a refuzat favorul „{1}”.";
    public static final String FAVOR_PHOTO_TITLE = "Poza pentru favor";
    public static final String FAVOR_PHOTO = "{0} a trimis poza pentru „{1}”. Aprob-o sau respinge-o.";
    public static final String FAVOR_APPROVED_TITLE = "Favor aprobat";
    public static final String FAVOR_APPROVED = "{0} a aprobat poza pentru „{1}”.";
    public static final String FAVOR_REJECTED_TITLE = "Poza a fost respinsă";
    public static final String FAVOR_REJECTED = "{0} a respins poza pentru „{1}”.";
    /** Șabloanele care trebuie să aibă traducere (verificat în teste). */
    public static final List<String> TRANSLATED = List.of(INVITE_TITLE, INVITE, INVITE_ACCEPTED_TITLE, INVITE_ACCEPTED,
            JOIN_REQUEST_TITLE, JOIN_REQUEST, JOIN_APPROVED_TITLE, JOIN_APPROVED, FAVOR_ASKED_TITLE, FAVOR_ASKED,
            FAVOR_ACCEPTED_TITLE, FAVOR_ACCEPTED, FAVOR_DECLINED_TITLE, FAVOR_DECLINED, FAVOR_PHOTO_TITLE, FAVOR_PHOTO,
            FAVOR_APPROVED_TITLE, FAVOR_APPROVED, FAVOR_REJECTED_TITLE, FAVOR_REJECTED);

    private Notes() {
    }

    private static PushService.Note activity(String title, String body, String name, String task, long id) {
        return new PushService.Note(title, List.of(), body, List.of(name, task), "/activity/" + id, "task-" + id, false);
    }

    public static PushService.Note invite(String owner, String task, long id) {
        return activity(INVITE_TITLE, INVITE, owner, task, id);
    }

    public static PushService.Note inviteAccepted(String name, String task, long id) {
        return activity(INVITE_ACCEPTED_TITLE, INVITE_ACCEPTED, name, task, id);
    }

    public static PushService.Note joinRequest(String name, String task, long id) {
        return activity(JOIN_REQUEST_TITLE, JOIN_REQUEST, name, task, id);
    }

    public static PushService.Note joinApproved(String owner, String task, long id) {
        return activity(JOIN_APPROVED_TITLE, JOIN_APPROVED, owner, task, id);
    }

    /** Un mesaj în chatul activității: titlul e activitatea, textul „Nume: mesaj”. */
    public static PushService.Note taskMessage(String name, String task, String text, long id) {
        return new PushService.Note("{0}", List.of(task), "{0}: {1}", List.of(name, text), "/chat/" + id, "task-chat-" + id, true);
    }

    private static PushService.Note favor(String title, String body, String name, String favor) {
        return new PushService.Note(title, List.of(), body, List.of(name, favor), "/social?section=favors", "favor", false);
    }

    public static PushService.Note favorAsked(String name, String favor) {
        return favor(FAVOR_ASKED_TITLE, FAVOR_ASKED, name, favor);
    }

    public static PushService.Note favorAnswered(String name, String favor, boolean accepted) {
        return accepted ? favor(FAVOR_ACCEPTED_TITLE, FAVOR_ACCEPTED, name, favor) : favor(FAVOR_DECLINED_TITLE, FAVOR_DECLINED, name, favor);
    }

    public static PushService.Note favorPhoto(String name, String favor) {
        return favor(FAVOR_PHOTO_TITLE, FAVOR_PHOTO, name, favor);
    }

    public static PushService.Note favorReviewed(String name, String favor, boolean approved) {
        return approved ? favor(FAVOR_APPROVED_TITLE, FAVOR_APPROVED, name, favor) : favor(FAVOR_REJECTED_TITLE, FAVOR_REJECTED, name, favor);
    }
}
