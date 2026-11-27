package com.whatever.user;

import com.whatever.user.web.I18n;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class I18nTest {
    @Test
    void translatesUserServiceMessages() {
        assertEquals("Incorrect email or password.", I18n.translate("Email sau parolă incorectă.", "en"));
        assertEquals("Correo o contraseña incorrectos.", I18n.translate("Email sau parolă incorectă.", "es"));
        assertEquals("The password must have at least 12 characters.",
                I18n.translate("Parola trebuie să aibă cel puțin 12 caractere.", "en"));
    }
}
