package com.whatever.user.web;

import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Traducerea mesajelor pentru utilizator. Mesajele sunt scrise în română în cod, iar
 * i18n/messages.tsv conține traducerile în engleză și spaniolă (cu {0}, {1} pentru valori).
 * Limba vine din Accept-Language (aplicația trimite limba aleasă); implicit română.
 */
public final class I18n {
    public static final List<String> SUPPORTED = List.of("ro", "en", "es");
    private static final Map<String, String[]> EXACT = new HashMap<>();
    private static final List<Template> TEMPLATES = new ArrayList<>();
    /** Traducerile după textul-șablon românesc (cu {0}), pentru texte formate de server (ex. notificări). */
    private static final Map<String, String[]> BY_TEMPLATE = new HashMap<>();
    private static final Pattern PLACEHOLDER = Pattern.compile("\\{(\\d+)}");

    private record Template(Pattern pattern, String[] targets) {
    }

    static {
        load("/i18n/messages.tsv");
    }

    private I18n() {
    }

    private static void load(String resource) {
        try (InputStream in = I18n.class.getResourceAsStream(resource)) {
            if (in == null) return;
            BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank() || line.startsWith("#")) continue;
                String[] parts = line.split("\t");
                if (parts.length != 3) throw new IllegalStateException("Linie invalidă în " + resource + ": " + line);
                String[] targets = {parts[1], parts[2]};
                if (parts[0].contains("{0}")) {
                    TEMPLATES.add(new Template(templatePattern(parts[0]), targets));
                    BY_TEMPLATE.put(parts[0], targets);
                } else {
                    EXACT.put(parts[0], targets);
                }
            }
        } catch (IOException e) {
            throw new IllegalStateException("Nu pot citi " + resource, e);
        }
    }

    private static Pattern templatePattern(String template) {
        StringBuilder regex = new StringBuilder();
        Matcher placeholders = Pattern.compile("\\{\\d+}").matcher(template);
        int last = 0;
        while (placeholders.find()) {
            regex.append(Pattern.quote(template.substring(last, placeholders.start()))).append("(.+?)");
            last = placeholders.end();
        }
        regex.append(Pattern.quote(template.substring(last)));
        return Pattern.compile(regex.toString(), Pattern.DOTALL);
    }

    /** Prima limbă suportată din Accept-Language ("en-US,en;q=0.9" → "en"); altfel "ro". */
    public static String language(String acceptLanguage) {
        if (acceptLanguage == null || acceptLanguage.isBlank()) return "ro";
        try {
            String match = Locale.lookupTag(Locale.LanguageRange.parse(acceptLanguage), SUPPORTED);
            return match == null ? "ro" : match;
        } catch (IllegalArgumentException e) {
            return "ro";
        }
    }

    /** Limba cererii HTTP curente. */
    public static String current() {
        RequestAttributes attributes = RequestContextHolder.getRequestAttributes();
        if (attributes instanceof ServletRequestAttributes servlet) {
            return language(servlet.getRequest().getHeader("Accept-Language"));
        }
        return "ro";
    }

    /**
     * Textul unui șablon românesc în limba dată, cu valorile puse în locul lui {0}, {1}... (o singură trecere, deci
     * o valoare care conține „{1}” rămâne neatinsă). Fără traducere, rămâne textul românesc.
     */
    public static String format(String template, String language, Object... values) {
        String text = template;
        int index = "en".equals(language) ? 0 : "es".equals(language) ? 1 : -1;
        if (index >= 0) {
            String[] targets = template.contains("{0}") ? BY_TEMPLATE.get(template) : EXACT.get(template);
            if (targets != null) text = targets[index];
        }
        Matcher matcher = PLACEHOLDER.matcher(text);
        StringBuilder result = new StringBuilder();
        while (matcher.find()) {
            int position = Integer.parseInt(matcher.group(1));
            String value = position < values.length ? String.valueOf(values[position]) : matcher.group();
            matcher.appendReplacement(result, Matcher.quoteReplacement(value));
        }
        matcher.appendTail(result);
        return result.toString();
    }

    public static String translate(String message, String language) {
        if (message == null || "ro".equals(language)) return message;
        int index = "en".equals(language) ? 0 : "es".equals(language) ? 1 : -1;
        if (index < 0) return message;
        String[] exact = EXACT.get(message);
        if (exact != null) return exact[index];
        for (Template template : TEMPLATES) {
            Matcher matcher = template.pattern().matcher(message);
            if (matcher.matches()) {
                String result = template.targets()[index];
                for (int group = 1; group <= matcher.groupCount(); group++) {
                    result = result.replace("{" + (group - 1) + "}", matcher.group(group));
                }
                return result;
            }
        }
        return message;
    }
}
