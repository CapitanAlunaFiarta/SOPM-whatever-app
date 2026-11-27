package com.whatever.task.web;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.Map;

/** Toate erorile ajung la client ca {"error": "..."}, traduse în limba cererii (vezi I18n). */
@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    ResponseEntity<Map<String, String>> api(ApiException e) {
        return body(e.status(), e.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<Map<String, String>> validation(MethodArgumentNotValidException e) {
        FieldError field = e.getBindingResult().getFieldError();
        String message = field == null || field.getDefaultMessage() == null
                ? "Date invalide."
                : field.getDefaultMessage();
        return body(400, message);
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    ResponseEntity<Map<String, String>> unreadable(Exception e) {
        return body(400, "Cerere invalidă.");
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    ResponseEntity<Map<String, String>> method(HttpRequestMethodNotSupportedException e) {
        return body(405, "Metodă HTTP nepermisă.");
    }

    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<Map<String, String>> notFound(NoResourceFoundException e) {
        return body(404, "Resursa nu există.");
    }

    @ExceptionHandler(DuplicateKeyException.class)
    ResponseEntity<Map<String, String>> duplicate(DuplicateKeyException e) {
        return body(409, "Înregistrarea există deja.");
    }

    @ExceptionHandler(DataAccessException.class)
    ResponseEntity<Map<String, String>> database(DataAccessException e) {
        log.error("Eroare de bază de date", e);
        return body(503, "Baza de date nu răspunde momentan. Încearcă din nou.");
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<Map<String, String>> unexpected(Exception e) {
        log.error("Eroare neașteptată", e);
        return body(500, "A apărut o eroare internă.");
    }

    private static ResponseEntity<Map<String, String>> body(int status, String message) {
        return ResponseEntity.status(status).body(Map.of("error", I18n.translate(message, I18n.current())));
    }
}
