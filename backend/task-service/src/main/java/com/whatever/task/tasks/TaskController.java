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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/tasks")
public class TaskController {
    private final TaskService tasks;
    private final JdbcTemplate db;

    public TaskController(TaskService tasks, JdbcTemplate db) {
        this.tasks = tasks;
        this.db = db;
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok");
    }

    @GetMapping("/health/db")
    public Map<String, String> healthDb() {
        db.queryForObject("SELECT 1", Integer.class);
        return Map.of("status", "ok");
    }

    @GetMapping
    public List<Map<String, Object>> list(@AuthenticationPrincipal AuthUser user) {
        return tasks.list(user);
    }

    /** Recap lunar pe categorii; month = "2026-11" (implicit luna curentă). */
    @GetMapping("/recap")
    public Map<String, Object> recap(@AuthenticationPrincipal AuthUser user, @RequestParam(required = false) String month) {
        return tasks.recap(user, month);
    }

    @PostMapping
    public Map<String, Object> create(@AuthenticationPrincipal AuthUser user, @Valid @RequestBody TaskRequest request) {
        return tasks.create(user, request);
    }

    @PutMapping("/{id}")
    public Map<String, Object> update(@AuthenticationPrincipal AuthUser user, @PathVariable long id,
                                      @Valid @RequestBody TaskRequest request) {
        return tasks.update(user, id, request);
    }

    @PostMapping("/{id}/cancel")
    public Map<String, Object> cancel(@AuthenticationPrincipal AuthUser user, @PathVariable long id) {
        return tasks.cancel(user, id);
    }

    @PostMapping("/{id}/freeze")
    public Map<String, Object> freeze(@AuthenticationPrincipal AuthUser user, @PathVariable long id) {
        return tasks.freeze(user, id);
    }

    @PostMapping("/{id}/verify-complete")
    public Map<String, Object> complete(@AuthenticationPrincipal AuthUser user, @PathVariable long id,
                                        @Valid @RequestBody CompletionRequest request) {
        return tasks.complete(user, id, request);
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@AuthenticationPrincipal AuthUser user, @PathVariable long id) {
        tasks.delete(user, id);
        return Map.of("ok", true);
    }

    public record TaskRequest(
            @NotBlank(message = "Titlul este obligatoriu.") @Size(max = 255, message = "Titlul e prea lung.") String title,
            String category,
            String priority,
            boolean isRecurring,
            boolean requiresLocation,
            @DecimalMin(value = "-90", message = "Latitudine invalidă.") @DecimalMax(value = "90", message = "Latitudine invalidă.") double latitude,
            @DecimalMin(value = "-180", message = "Longitudine invalidă.") @DecimalMax(value = "180", message = "Longitudine invalidă.") double longitude,
            @Min(value = 10, message = "Raza trebuie să fie între 10 și 10000 m.") @Max(value = 10000, message = "Raza trebuie să fie între 10 și 10000 m.") int radius,
            boolean requiresBiometrics,
            @NotNull(message = "Scadența este obligatorie.") LocalDate dueDate,
            @Size(max = 100) String friend) {
    }

    /** Câmpul vechi "mobileBiometricConfirmed" este ignorat: biometria se dovedește doar prin biometricToken. */
    public record CompletionRequest(
            @DecimalMin(value = "-90", message = "Latitudine invalidă.") @DecimalMax(value = "90", message = "Latitudine invalidă.") Double latitude,
            @DecimalMin(value = "-180", message = "Longitudine invalidă.") @DecimalMax(value = "180", message = "Longitudine invalidă.") Double longitude,
            Double accuracy,
            Boolean mocked,
            String biometricToken) {
    }
}
