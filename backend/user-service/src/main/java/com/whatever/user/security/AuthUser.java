package com.whatever.user.security;

/** Utilizatorul autentificat, extras din access token. */
public record AuthUser(long id, String email, String role) {
    public boolean isAdmin() {
        return "ADMIN".equals(role);
    }
}
