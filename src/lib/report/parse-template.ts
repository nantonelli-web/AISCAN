import JSZip from "jszip";

/**
 * Theme configuration extracted from a PPTX template file.
 * Stored as JSONB in mait_client_templates.theme_config.
 */
export interface ThemeConfig {
  colors: {
    primary: string;
    secondary: string;
    background: string;
    text: string;
    accent: string;
  };
  fonts: {
    heading: string;
    body: string;
  };
  logoBase64: string | null;
  logoMimeType: string | null;
  /** Full cover slide background image (from slide 1) */
  coverImageBase64: string | null;
  coverImageMimeType: string | null;
  /** Content slide background color (from slide 2+) */
  contentBackground: string | null;
}

/** NIMA default theme — used when no template is provided */
export const DEFAULT_THEME: ThemeConfig = {
  colors: {
    primary: "#D4A843",
    secondary: "#5b7ea3",
    background: "#0A0A0A",
    text: "#F5F5F5",
    accent: "#6b8e6b",
  },
  fonts: {
    heading: "Arial",
    body: "Arial",
  },
  logoBase64: null,
  logoMimeType: null,
  coverImageBase64: null,
  coverImageMimeType: null,
  contentBackground: null,
};

function extractSrgbColor(xml: string, tag: string, fallback: string): string {
  const tagPattern = new RegExp(
    `<a:${tag}>[\\s\\S]*?<a:srgbClr\\s+val="([A-Fa-f0-9]{6})"`,
    "i"
  );
  const match = xml.match(tagPattern);
  if (match) return `#${match[1].toUpperCase()}`;

  const sysPattern = new RegExp(
    `<a:${tag}>[\\s\\S]*?<a:sysClr[^>]+lastClr="([A-Fa-f0-9]{6})"`,
    "i"
  );
  const sysMatch = xml.match(sysPattern);
  if (sysMatch) return `#${sysMatch[1].toUpperCase()}`;

  return fallback;
}

function extractFont(xml: string, type: "majorFont" | "minorFont", fallback: string): string {
  const pattern = new RegExp(
    `<a:${type}>[\\s\\S]*?<a:latin\\s+typeface="([^"]+)"`,
    "i"
  );
  const match = xml.match(pattern);
  return match ? match[1] : fallback;
}

function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "gif") return "image/gif";
  return "image/png";
}

/**
 * Get image filenames referenced by a specific slide via its .rels file.
 */
async function getSlideImages(zip: JSZip, slideNum: number): Promise<string[]> {
  const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
  const relsFile = zip.file(relsPath);
  if (!relsFile) return [];

  const relsXml = await relsFile.async("text");
  const matches = [...relsXml.matchAll(/Target="\.\.\/media\/([^"]+)"/gi)];
  return matches.map((m) => `ppt/media/${m[1]}`);
}

/**
 * Parse an uploaded PPTX file to extract branding configuration.
 *
 * Strategy:
 * 1. Parse theme XML for colors + fonts
 * 2. Identify slide 1 images (cover) — largest = background, smallest = logo
 * 3. Identify slide 2 images (content) — typically just a small logo
 * 4. Extract background color from slide 2 XML
 */
export async function parseTemplate(buffer: ArrayBuffer): Promise<ThemeConfig> {
  try {
    const zip = await JSZip.loadAsync(buffer);

    // ── 1. Parse theme XML ─────────────────────────────────────
    let themeXml = "";
    const themeFile = zip.file("ppt/theme/theme1.xml");
    if (themeFile) {
      themeXml = await themeFile.async("text");
    }

    let colors = { ...DEFAULT_THEME.colors };
    let fonts = { ...DEFAULT_THEME.fonts };

    if (themeXml) {
      colors = {
        primary: extractSrgbColor(themeXml, "accent1", DEFAULT_THEME.colors.primary),
        secondary: extractSrgbColor(themeXml, "accent2", DEFAULT_THEME.colors.secondary),
        background: extractSrgbColor(themeXml, "dk1", DEFAULT_THEME.colors.background),
        text: extractSrgbColor(themeXml, "lt1", DEFAULT_THEME.colors.text),
        accent: extractSrgbColor(themeXml, "accent3", DEFAULT_THEME.colors.accent),
      };
      fonts = {
        heading: extractFont(themeXml, "majorFont", DEFAULT_THEME.fonts.heading),
        body: extractFont(themeXml, "minorFont", DEFAULT_THEME.fonts.body),
      };
    }

    // ── 2. Extract slide 1 images (cover) ──────────────────────
    const slide1Images = await getSlideImages(zip, 1);
    let coverImageBase64: string | null = null;
    let coverImageMimeType: string | null = null;
    let logoBase64: string | null = null;
    let logoMimeType: string | null = null;

    if (slide1Images.length > 0) {
      // Load all images with their sizes
      const imageData: { path: string; data: string; size: number }[] = [];
      for (const path of slide1Images) {
        const file = zip.file(path);
        if (file) {
          const raw = await file.async("uint8array");
          const b64 = await file.async("base64");
          imageData.push({ path, data: b64, size: raw.length });
        }
      }

      // Sort by size: largest = cover background, smallest = logo
      imageData.sort((a, b) => b.size - a.size);

      if (imageData.length >= 1) {
        // Largest image = cover background
        const cover = imageData[0];
        coverImageBase64 = cover.data;
        coverImageMimeType = getMimeType(cover.path);
      }

      if (imageData.length >= 2) {
        // Second image = logo (or smaller one on the cover)
        const logo = imageData[imageData.length - 1]; // smallest
        logoBase64 = logo.data;
        logoMimeType = getMimeType(logo.path);
      }
    }

    // ── 3. If no logo from slide 1, check slide 2 ──────────────
    if (!logoBase64) {
      const slide2Images = await getSlideImages(zip, 2);
      for (const path of slide2Images) {
        const file = zip.file(path);
        if (file) {
          const raw = await file.async("uint8array");
          // Only take small images as logo (< 200KB)
          if (raw.length < 200_000) {
            logoBase64 = await file.async("base64");
            logoMimeType = getMimeType(path);
            break;
          }
        }
      }
    }

    // ── 4. Extract content slide background color ───────────────
    let contentBackground: string | null = null;
    const slide2File = zip.file("ppt/slides/slide2.xml");
    if (slide2File) {
      const s2Xml = await slide2File.async("text");
      const bgMatch = s2Xml.match(/<a:srgbClr val="([A-Fa-f0-9]{6})"/i);
      if (bgMatch) {
        contentBackground = `#${bgMatch[1].toUpperCase()}`;
      }
    }

    return {
      colors,
      fonts,
      logoBase64,
      logoMimeType,
      coverImageBase64,
      coverImageMimeType,
      contentBackground,
    };
  } catch (err) {
    console.warn("[parse-template] Failed to parse PPTX template, using defaults:", err);
    return { ...DEFAULT_THEME };
  }
}
