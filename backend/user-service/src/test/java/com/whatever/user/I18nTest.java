package com.whatever.user;

import com.whatever.user.web.I18n;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;

class I18nTest {
    @Test
    void translatesUserServiceMessages() {
        assertEquals("Incorrect email or password.", I18n.translate("Email sau parolă incorectă.", "en"));
        assertEquals("Correo o contraseña incorrectos.", I18n.translate("Email sau parolă incorectă.", "es"));
        assertEquals("The password must have at least 12 characters.",
                I18n.translate("Parola trebuie să aibă cel puțin 12 caractere.", "en"));
    }

    /** Orice mesaj de eroare nou din cod trebuie să aibă rând în i18n/messages.tsv (altfel rămâne în română). */
    @Test
    void everyServerMessageHasATranslation() throws IOException {
        Pattern literal = Pattern.compile(
                "new ApiException\\(\\d+,\\s*\"((?:[^\"\\\\]|\\\\.)*)\"\\s*\\)|message\\s*=\\s*\"((?:[^\"\\\\]|\\\\.)*)\"");
        List<String> missing = new ArrayList<>();
        try (Stream<Path> files = Files.walk(Path.of("src/main/java"))) {
            for (Path file : files.filter(path -> path.toString().endsWith(".java")).toList()) {
                Matcher matcher = literal.matcher(Files.readString(file));
                while (matcher.find()) {
                    String message = matcher.group(1) != null ? matcher.group(1) : matcher.group(2);
                    for (String language : List.of("en", "es")) {
                        if (I18n.translate(message, language).equals(message)) {
                            missing.add(file.getFileName() + " [" + language + "]: " + message);
                        }
                    }
                }
            }
        }
        assertEquals(List.of(), missing);
    }
}
