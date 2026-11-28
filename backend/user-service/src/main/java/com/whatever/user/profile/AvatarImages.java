package com.whatever.user.profile;

import com.whatever.user.web.ApiException;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.ImageOutputStream;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Base64;
import java.util.Iterator;
import java.util.Locale;

/**
 * Poza de profil: orice JPEG sau PNG rezonabil devine un JPEG pătrat de 256×256 (decupat din centru), recodat de
 * server. Recodarea scoate metadatele (EXIF, inclusiv locația) și garantează că în baza de date ajunge o imagine mică
 * și validă, orice ar trimite clientul. Dimensiunile se citesc înainte de decodare, ca o „bombă” (imagine mică pe
 * disc, uriașă în memorie) să fie refuzată fără să umple memoria.
 */
public final class AvatarImages {
    public static final int SIZE = 256;
    static final int MAX_BYTES = 2_000_000;
    static final int MIN_SIDE = 32;
    static final int MAX_SIDE = 4096;
    /** Fundalul pentru zonele transparente ale unui PNG (culoarea cardurilor din aplicație). */
    private static final Color BACKGROUND = new Color(0x0f172a);

    private AvatarImages() {
    }

    /** base64 (cu sau fără prefixul data:image/...;base64,) → JPEG 256×256. */
    public static byte[] normalize(String base64) {
        if (base64 == null || base64.isBlank()) throw new ApiException(400, "Alege o poză.");
        String data = base64.strip();
        int comma = data.indexOf(',');
        if (data.startsWith("data:") && comma > 0) data = data.substring(comma + 1);
        byte[] bytes;
        try {
            bytes = Base64.getMimeDecoder().decode(data);
        } catch (IllegalArgumentException e) {
            throw new ApiException(400, "Poza nu este validă.");
        }
        if (bytes.length > MAX_BYTES) throw new ApiException(400, "Poza e prea mare (cel mult 2 MB).");
        return writeJpeg(square(read(bytes), SIZE), 0.86f);
    }

    static BufferedImage read(byte[] bytes) {
        try (ImageInputStream input = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            Iterator<ImageReader> readers = input == null ? null : ImageIO.getImageReaders(input);
            if (readers == null || !readers.hasNext()) throw new ApiException(400, "Poza nu este validă.");
            ImageReader reader = readers.next();
            try {
                String format = reader.getFormatName().toLowerCase(Locale.ROOT);
                if (!format.equals("jpeg") && !format.equals("png")) {
                    throw new ApiException(400, "Poza trebuie să fie JPEG sau PNG.");
                }
                reader.setInput(input, true, true);
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                if (Math.min(width, height) < MIN_SIDE || Math.max(width, height) > MAX_SIDE) {
                    throw new ApiException(400, "Poza trebuie să aibă între 32 și 4096 de pixeli pe latură.");
                }
                BufferedImage image = reader.read(0);
                if (image == null) throw new ApiException(400, "Poza nu este validă.");
                return image;
            } finally {
                reader.dispose();
            }
        } catch (IOException | RuntimeException e) {
            if (e instanceof ApiException api) throw api;
            throw new ApiException(400, "Poza nu este validă.");
        }
    }

    /** Pătratul din centru, scalat la size×size (fundal închis sub zonele transparente). */
    static BufferedImage square(BufferedImage image, int size) {
        int side = Math.min(image.getWidth(), image.getHeight());
        int x = (image.getWidth() - side) / 2;
        int y = (image.getHeight() - side) / 2;
        BufferedImage out = new BufferedImage(size, size, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = out.createGraphics();
        try {
            graphics.setColor(BACKGROUND);
            graphics.fillRect(0, 0, size, size);
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            graphics.drawImage(image, 0, 0, size, size, x, y, x + side, y + side, null);
        } finally {
            graphics.dispose();
        }
        return out;
    }

    static byte[] writeJpeg(BufferedImage image, float quality) {
        ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ImageOutputStream output = ImageIO.createImageOutputStream(bytes)) {
            ImageWriteParam param = writer.getDefaultWriteParam();
            param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            param.setCompressionQuality(quality);
            writer.setOutput(output);
            writer.write(null, new IIOImage(image, null, null), param);
        } catch (IOException e) {
            throw new IllegalStateException("Nu pot scrie poza", e);
        } finally {
            writer.dispose();
        }
        return bytes.toByteArray();
    }
}
