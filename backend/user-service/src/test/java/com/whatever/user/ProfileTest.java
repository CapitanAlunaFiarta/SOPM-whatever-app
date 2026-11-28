package com.whatever.user;

import com.whatever.user.profile.AvatarImages;
import com.whatever.user.profile.Badges;
import com.whatever.user.web.ApiException;
import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.zip.CRC32;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProfileTest {

    @Test
    void avatarBecomesASquareJpegFromTheCenter() throws IOException {
        // 400×200: stânga roșie, mijlocul verde, dreapta albastră → pătratul din centru e verde.
        BufferedImage wide = new BufferedImage(400, 200, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = wide.createGraphics();
        graphics.setColor(Color.RED);
        graphics.fillRect(0, 0, 100, 200);
        graphics.setColor(Color.GREEN);
        graphics.fillRect(100, 0, 200, 200);
        graphics.setColor(Color.BLUE);
        graphics.fillRect(300, 0, 100, 200);
        graphics.dispose();

        byte[] jpeg = AvatarImages.normalize("data:image/png;base64," + Base64.getEncoder().encodeToString(png(wide)));
        BufferedImage result = ImageIO.read(new ByteArrayInputStream(jpeg));
        assertEquals(AvatarImages.SIZE, result.getWidth());
        assertEquals(AvatarImages.SIZE, result.getHeight());
        assertEquals((byte) 0xFF, jpeg[0]);
        assertEquals((byte) 0xD8, jpeg[1]);
        Color center = new Color(result.getRGB(128, 128));
        assertTrue(center.getGreen() > 200 && center.getRed() < 60 && center.getBlue() < 60, center.toString());
        Color edge = new Color(result.getRGB(3, 128));
        assertTrue(edge.getGreen() > 200, "marginea pătratului e tot din centru: " + edge);
        // Fără metadate EXIF (locația telefonului) în poza salvată.
        assertFalse(new String(jpeg, StandardCharsets.ISO_8859_1).contains("Exif"));
    }

    @Test
    void invalidOrHugeAvatarsAreRefused() {
        assertThrows(ApiException.class, () -> AvatarImages.normalize(""));
        assertThrows(ApiException.class, () -> AvatarImages.normalize("nu e base64 %%%"));
        assertThrows(ApiException.class, () -> AvatarImages.normalize(Base64.getEncoder().encodeToString("text".getBytes())));
        // Un PNG care declară 5000×5000 e refuzat înainte să fie decodat (fără să umple memoria).
        ApiException huge = assertThrows(ApiException.class,
                () -> AvatarImages.normalize(Base64.getEncoder().encodeToString(pngHeader(5000, 5000))));
        assertTrue(huge.getMessage().contains("4096"), huge.getMessage());
        ApiException tiny = assertThrows(ApiException.class,
                () -> AvatarImages.normalize(Base64.getEncoder().encodeToString(png(new BufferedImage(8, 8, BufferedImage.TYPE_INT_RGB)))));
        assertTrue(tiny.getMessage().contains("32"), tiny.getMessage());
    }

    @Test
    void badgesFollowTheStatistics() {
        Badges.Stats stats = new Badges.Stats(12, 7, Map.of("SPORT", 10, "STUDY", 2), 5, 1, 0, 3, 5, 0, 9);
        List<Map<String, Object>> badges = Badges.evaluate(stats);
        assertEquals(Badges.ids().size(), badges.size());
        assertTrue(earned(badges, "FIRST_STEP"));
        assertTrue(earned(badges, "DONE_10"));
        assertFalse(earned(badges, "DONE_50"));
        assertTrue(earned(badges, "STREAK_7"));
        assertFalse(earned(badges, "STREAK_30"));
        assertTrue(earned(badges, "SPORT_10"));
        assertFalse(earned(badges, "STUDY_10"));
        assertTrue(earned(badges, "FRIENDS_5"));
        assertTrue(earned(badges, "EARLY_BIRD"));
        assertFalse(earned(badges, "REGULAR"));
        Map<String, Object> done50 = badges.stream().filter(badge -> "DONE_50".equals(badge.get("id"))).findFirst().orElseThrow();
        assertEquals(12, done50.get("progress"));
        assertEquals(50, done50.get("goal"));
        Map<String, Object> first = badges.stream().filter(badge -> "FIRST_STEP".equals(badge.get("id"))).findFirst().orElseThrow();
        assertEquals(1, first.get("progress"), "progresul se oprește la prag");
    }

    private static boolean earned(List<Map<String, Object>> badges, String id) {
        return badges.stream().anyMatch(badge -> id.equals(badge.get("id")) && Boolean.TRUE.equals(badge.get("earned")));
    }

    private static byte[] png(BufferedImage image) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        ImageIO.write(image, "png", bytes);
        return bytes.toByteArray();
    }

    /** Doar semnătura PNG și antetul IHDR (fără pixeli): suficient ca cititorul să afle dimensiunile. */
    private static byte[] pngHeader(int width, int height) {
        ByteBuffer ihdr = ByteBuffer.allocate(17);
        ihdr.put("IHDR".getBytes(StandardCharsets.US_ASCII)).putInt(width).putInt(height)
                .put((byte) 8).put((byte) 2).put((byte) 0).put((byte) 0).put((byte) 0);
        CRC32 crc = new CRC32();
        crc.update(ihdr.array());
        ByteBuffer png = ByteBuffer.allocate(8 + 4 + 17 + 4);
        png.put(new byte[] {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'});
        png.putInt(13).put(ihdr.array()).putInt((int) crc.getValue());
        return png.array();
    }
}
