package com.whatever.user.releases;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** Ultima versiune a aplicației de Android (pentru butonul de update din Profil). */
@RestController
public class ReleaseController {
    private final ReleaseService releases;

    public ReleaseController(ReleaseService releases) {
        this.releases = releases;
    }

    /** { version, build, url, tag } ale celei mai noi versiuni publicate (null-uri dacă nu se știe încă). */
    @GetMapping("/api/app/version")
    public Map<String, Object> version() {
        return releases.current();
    }

    /** Administratorul (sau testele) cer o verificare imediată; /api/admin/** cere rolul ADMIN. */
    @PostMapping("/api/admin/releases/check")
    public Map<String, Object> check() {
        return releases.check();
    }
}
