package com.whatever.task.tasks;

import com.whatever.task.security.AuthUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.Map;

@RestController
@RequestMapping("/api/favors")
public class FavorController {
    private final FavorService favors;

    public FavorController(FavorService favors) {
        this.favors = favors;
    }

    /** {"favors": [...], "balances": [{username, fullName, balance: EVEN | I_OWE | THEY_OWE, openFavorId}]} */
    @GetMapping
    public Map<String, Object> list(@AuthenticationPrincipal AuthUser user) {
        return favors.list(user);
    }

    @PostMapping
    public Map<String, Object> request(@AuthenticationPrincipal AuthUser user, @Valid @RequestBody FavorRequest request) {
        return favors.request(user, request);
    }

    @PostMapping("/{id}/accept")
    public Map<String, Object> accept(@AuthenticationPrincipal AuthUser user, @PathVariable long id) {
        return favors.respond(user, id, "accept");
    }

    /** Refuz liber: doar când nu îi datorezi nimic celui care cere. */
    @PostMapping("/{id}/decline")
    public Map<String, Object> decline(@AuthenticationPrincipal AuthUser user, @PathVariable long id) {
        return favors.respond(user, id, "decline");
    }

    /** Refuz „nerezonabil”: când datorezi un favor; datoria rămâne, iar prietenul poate cere altceva. */
    @PostMapping("/{id}/refuse")
    public Map<String, Object> refuse(@AuthenticationPrincipal AuthUser user, @PathVariable long id) {
        return favors.respond(user, id, "refuse");
    }

    @PostMapping("/{id}/cancel")
    public Map<String, Object> cancel(@AuthenticationPrincipal AuthUser user, @PathVariable long id) {
        return favors.cancel(user, id);
    }

    @PostMapping("/{id}/photo")
    public Map<String, Object> submitPhoto(@AuthenticationPrincipal AuthUser user, @PathVariable long id,
                                           @Valid @RequestBody PhotoRequest request) {
        return favors.submitPhoto(user, id, request);
    }

    @GetMapping("/{id}/photo")
    public Map<String, Object> photo(@AuthenticationPrincipal AuthUser user, @PathVariable long id) {
        return favors.photo(user, id);
    }

    @PostMapping("/{id}/approve")
    public Map<String, Object> approve(@AuthenticationPrincipal AuthUser user, @PathVariable long id) {
        return favors.review(user, id, true, null);
    }

    @PostMapping("/{id}/reject")
    public Map<String, Object> reject(@AuthenticationPrincipal AuthUser user, @PathVariable long id,
                                      @Valid @RequestBody(required = false) ReviewRequest request) {
        return favors.review(user, id, false, request == null ? null : request.note());
    }

    public record FavorRequest(
            @NotBlank(message = "Alege prietenul.") @Size(max = 100) String friend,
            @NotBlank(message = "Scrie ce favor ceri.") @Size(max = 255, message = "Titlul e prea lung.") String title,
            @Size(max = 1000, message = "Detaliile sunt prea lungi.") String details,
            String category,
            @NotNull(message = "Scadența este obligatorie.") LocalDate dueDate,
            @DecimalMin(value = "-90", message = "Latitudine invalidă.") @DecimalMax(value = "90", message = "Latitudine invalidă.") double latitude,
            @DecimalMin(value = "-180", message = "Longitudine invalidă.") @DecimalMax(value = "180", message = "Longitudine invalidă.") double longitude,
            @Min(value = 10, message = "Raza trebuie să fie între 10 și 10000 m.") @Max(value = 10000, message = "Raza trebuie să fie între 10 și 10000 m.") int radius) {
    }

    /** Poza (JPEG în base64) făcută cu camera din aplicație, cu locația și momentul în care a fost făcută. */
    public record PhotoRequest(
            @NotBlank(message = "Poza lipsește.") @Size(max = 3_500_000, message = "Poza este prea mare.") String photo,
            @NotNull(message = "Locația ta este necesară pentru această activitate.")
            @DecimalMin(value = "-90", message = "Latitudine invalidă.") @DecimalMax(value = "90", message = "Latitudine invalidă.") Double latitude,
            @NotNull(message = "Locația ta este necesară pentru această activitate.")
            @DecimalMin(value = "-180", message = "Longitudine invalidă.") @DecimalMax(value = "180", message = "Longitudine invalidă.") Double longitude,
            Double accuracy,
            Boolean mocked,
            String takenAt) {
    }

    public record ReviewRequest(@Size(max = 300, message = "Motivul poate avea cel mult 300 de caractere.") String note) {
    }
}
