package com.whatever.task;

import com.whatever.task.web.I18n;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class I18nTest {
    @Test
    void languageComesFromAcceptLanguage() {
        assertEquals("ro", I18n.language(null));
        assertEquals("ro", I18n.language(""));
        assertEquals("en", I18n.language("en-US,en;q=0.9"));
        assertEquals("es", I18n.language("es"));
        assertEquals("ro", I18n.language("de-DE"));
        assertEquals("ro", I18n.language("ro-RO,ro;q=0.9,en;q=0.8"));
    }

    @Test
    void translatesExactMessages() {
        assertEquals("This activity doesn't exist.", I18n.translate("Activitatea nu există.", "en"));
        assertEquals("La actividad no existe.", I18n.translate("Activitatea nu există.", "es"));
        assertEquals("Activitatea nu există.", I18n.translate("Activitatea nu există.", "ro"));
    }

    @Test
    void translatesTemplatesWithValues() {
        String message = "Ești la 523 m de locația activității (raza permisă: 150 m).";
        assertEquals("You are 523 m from the activity's location (allowed radius: 150 m).", I18n.translate(message, "en"));
        assertEquals("Estás a 523 m de la ubicación de la actividad (radio permitido: 150 m).", I18n.translate(message, "es"));
    }

    @Test
    void unknownMessagesStayInRomanian() {
        assertEquals("Mesaj nou fără traducere.", I18n.translate("Mesaj nou fără traducere.", "en"));
    }
}
