package com.whatever.user;

import com.whatever.user.releases.ReleaseService;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ReleaseServiceTest {
    private static final String LATEST = "https://github.com/owner/repo/releases/latest";

    @Test
    void tagsFromTheAndroidWorkflowAreParsed() {
        ReleaseService.Release release = ReleaseService.parse("android-v2.4.0-18", LATEST).orElseThrow();
        assertEquals("2.4.0", release.version());
        assertEquals(18, release.build());
        assertEquals("https://github.com/owner/repo/releases/download/android-v2.4.0-18/whatever.apk", release.url());
    }

    @Test
    void otherTagsAreIgnored() {
        assertTrue(ReleaseService.parse("v2.4.0", LATEST).isEmpty());
        assertTrue(ReleaseService.parse("android-v2.4-18", LATEST).isEmpty());
        assertTrue(ReleaseService.parse(null, LATEST).isEmpty());
    }

    @Test
    void versionsCompareByComponentsThenBuild() {
        assertTrue(ReleaseService.compare("2.10.0", 1, "2.9.9", 50) > 0);
        assertTrue(ReleaseService.compare("2.4.0", 18, "2.4.0", 17) > 0);
        assertTrue(ReleaseService.compare("2.3.0", 30, "2.4.0", 18) < 0);
        assertEquals(0, ReleaseService.compare("2.4.0", 18, "2.4.0", 18));
    }
}
