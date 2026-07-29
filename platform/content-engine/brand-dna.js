/**
 * Brand DNA extraction — scrape homepage signals + LLM enrichment.
 * Used by onboarding "Review your Brand DNA" before agent activation.
 */

const HEX_RE = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
const FONT_FAMILY_RE = /font-family\s*:\s*([^;}{]+)/gi;
const IMG_RE = /<img\b[^>]*>/gi;
const SOURCE_RE = /<source\b[^>]*>/gi;
const ATTR_RE = /([a-zA-Z_:.-]+)\s*=\s*["']([^"']*)["']/g;
const SCHEMA_LOGO_RE =
  /<meta[^>]+(?:itemprop|property)=["']logo["'][^>]+content=["']([^"']+)["'][^>]*>/i;
const SCHEMA_LOGO_RE_ALT =
  /<meta[^>]+content=["']([^"']+)["'][^>]+(?:itemprop|property)=["']logo["'][^>]*>/i;
const THEME_COLOR_RE =
  /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["'][^>]*>/i;
const APPLE_ICON_RE =
  /<link[^>]+rel=["']apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>/i;
const ICON_RE =
  /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["'][^>]*>/i;
const TITLE_RE = /<title[^>]*>([^<]+)<\/title>/i;
const META_DESC_RE =
  /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i;
const META_DESC_RE_ALT =
  /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>/i;
const OG_SITE_RE =
  /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["'][^>]*>/i;
const H1_RE = /<h1[^>]*>([^<]+)<\/h1>/i;

const GENERIC_FONTS = new Set([
  "inherit",
  "initial",
  "unset",
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "emoji",
  "math",
  "fangsong",
  "-apple-system",
  "blinkmacsystemfont",
  "arial",
  "helvetica",
  "helvetica neue",
  "times",
  "times new roman",
  "georgia",
  "courier",
  "courier new",
  "verdana",
  "tahoma",
  "trebuchet ms",
  "segoe ui",
  "roboto", // often a system/UI default on Android; still allow if only font — filtered by role weight below
]);

/** Named brand typefaces we still keep even if also common system fonts. */
const ALLOWED_COMMON_BRAND_FONTS = new Set([
  "roboto",
  "georgia",
  "helvetica neue",
]);

function cleanFontToken(raw) {
  return String(raw || "")
    .replace(/!important/gi, "")
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isGenericFontName(name) {
  const lower = cleanFontToken(name).toLowerCase();
  if (!lower) return true;
  if (ALLOWED_COMMON_BRAND_FONTS.has(lower)) return false;
  return GENERIC_FONTS.has(lower);
}

function normalizeFontFamilyList(familyCss) {
  return String(familyCss || "")
    .split(",")
    .map(cleanFontToken)
    .filter((name) => name && !isGenericFontName(name));
}

function pickVisualFonts(samples = []) {
  const weighted = new Map();
  const bump = (name, weight) => {
    const cleaned = cleanFontToken(name);
    if (!cleaned || isGenericFontName(cleaned)) return;
    const key = cleaned.toLowerCase();
    const prev = weighted.get(key);
    if (!prev || weight > prev.weight) {
      weighted.set(key, { name: cleaned, weight });
    } else {
      weighted.set(key, { name: prev.name, weight: prev.weight + weight * 0.25 });
    }
  };

  for (const sample of samples) {
    const role = String(sample?.role || "");
    const fonts = normalizeFontFamilyList(sample?.fontFamily);
    const roleWeight =
      /h1|heading/i.test(role) ? 20 :
      /h2|h3/i.test(role) ? 14 :
      /body|p|paragraph/i.test(role) ? 12 :
      /nav/i.test(role) ? 8 :
      /button|cta/i.test(role) ? 6 :
      4;
    // Prefer the primary face in the stack.
    if (fonts[0]) bump(fonts[0], roleWeight);
    if (fonts[1]) bump(fonts[1], Math.max(2, roleWeight / 3));
  }

  return [...weighted.values()]
    .sort((a, b) => b.weight - a.weight)
    .map((f) => f.name)
    .slice(0, 3);
}

function normalizeWebsiteUrl(url) {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return String(url || "").trim().replace(/\/$/, "");
  }
}

function absolutizeUrl(baseUrl, href) {
  if (!href) return null;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function parseAttrs(tag) {
  const attrs = {};
  let match;
  ATTR_RE.lastIndex = 0;
  while ((match = ATTR_RE.exec(tag)) !== null) {
    attrs[match[1].toLowerCase()] = match[2];
  }
  return attrs;
}

function pickSrcFromSrcset(srcset) {
  const first = String(srcset || "")
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0])
    .find(Boolean);
  return first || null;
}

function decodeUriSafe(value) {
  const raw = String(value || "");
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    return raw;
  }
}

function looksLikeLogoText(value) {
  const text = decodeUriSafe(value);
  // Match "logo" as a token even when URL-encoded spaces (%20) glued digits to the word
  // e.g. "The%20Elevate%20-%20Logo%20Variations.psd.png" → "... Logo Variations..."
  return /(?:^|[^a-z0-9])(logo|logotype|brandmark|brand-logo|site-logo|navbar-brand|header-logo|imagelogo)(?:[^a-z0-9]|$)/i.test(
    text,
  );
}

function looksLikeNonLogoImage(value) {
  const text = decodeUriSafe(value);
  return /\b(hero|banner|cover|og-image|opengraph|social|thumbnail|thumb|background|bg-|poster|card)\b/i.test(
    text,
  );
}

function isUsableLogoSrc(src) {
  const value = String(src || "").trim();
  if (!value) return false;
  if (/^(chrome-extension|moz-extension|safari-extension|edge-extension|blob|data):/i.test(value)) {
    return false;
  }
  return true;
}

function scoreLogoCandidate(attrs) {
  const src = decodeUriSafe(attrs.src || attrs["data-src"] || "");
  const dataUx = String(attrs["data-ux"] || "");
  const dataAid = String(attrs["data-aid"] || "");
  const descriptor = [
    attrs.alt,
    attrs.title,
    attrs.class,
    attrs.id,
    attrs["aria-label"],
    attrs.src,
    attrs.srcset,
    attrs["data-src"],
    dataUx,
    dataAid,
  ]
    .filter(Boolean)
    .map(decodeUriSafe)
    .join(" ");

  let score = 0;
  if (looksLikeLogoText(attrs.alt)) score += 80;
  if (looksLikeLogoText(attrs.class)) score += 70;
  if (looksLikeLogoText(attrs.id)) score += 70;
  if (looksLikeLogoText(attrs.src) || looksLikeLogoText(attrs["data-src"])) score += 55;
  if (looksLikeLogoText(attrs.title) || looksLikeLogoText(attrs["aria-label"])) score += 40;
  // GoDaddy / common builders mark the header logo explicitly.
  if (/ImageLogo/i.test(dataUx) || /HEADER_LOGO/i.test(dataAid)) score += 120;
  if (/header|nav|masthead|brand/i.test(descriptor)) score += 15;
  if (/\.svg(?:[?#]|$)/i.test(src)) score += 12;
  if (looksLikeNonLogoImage(descriptor) && !/ImageLogo|HEADER_LOGO/i.test(`${dataUx} ${dataAid}`)) {
    score -= 80;
  }
  return score;
}

function expandShortHex(hex) {
  if (hex.length === 4) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`.toLowerCase();
  }
  return hex.toLowerCase();
}

function luminance(hex) {
  const h = expandShortHex(hex).slice(1);
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function saturation(hex) {
  const h = expandShortHex(hex).slice(1);
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

function rgbStringToHex(value) {
  const m = String(value || "").match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!m) return null;
  const r = Number(m[1]);
  const g = Number(m[2]);
  const b = Number(m[3]);
  if (![r, g, b].every((n) => Number.isFinite(n))) return null;
  return `#${[r, g, b].map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0")).join("")}`;
}

function isBoringNeutral(hex) {
  const s = saturation(hex);
  const l = luminance(hex);
  // Near-gray or near black/white with no chroma — keep only if we need a bg/text slot.
  return s < 0.12 && l > 0.08 && l < 0.92;
}

function pickBrandColors(hexes, themeColor) {
  const counts = new Map();
  for (const raw of hexes) {
    const hex = expandShortHex(raw);
    if (hex === "#000000" || hex === "#ffffff" || hex === "#fff" || hex === "#000") continue;
    counts.set(hex, (counts.get(hex) || 0) + 1);
  }
  if (themeColor) {
    const t = expandShortHex(themeColor);
    counts.set(t, (counts.get(t) || 0) + 5);
  }
  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || luminance(a[0]) - luminance(b[0]))
    .map(([hex]) => hex);

  const dark = ranked.find((h) => luminance(h) < 0.35);
  const mid = ranked.find((h) => h !== dark && luminance(h) >= 0.35 && luminance(h) < 0.75);
  const light = ranked.find((h) => h !== dark && h !== mid && luminance(h) >= 0.75)
    || ranked.find((h) => h !== dark && h !== mid)
    || "#faf7f0";

  return [dark || ranked[0] || "#0f3d2e", mid || light || "#f0e9d8", light || "#faf7f0"]
    .filter(Boolean)
    .slice(0, 3);
}

/**
 * Prefer rendered UI colors (computed styles + viewport screenshot accents)
 * over raw HTML hex scraping, which picks up builder/widget CSS noise.
 */
function pickVisualBrandColors({ themeColor, computed = [], screenshotAccents = [] } = {}) {
  const weighted = new Map();
  const bump = (hex, weight) => {
    if (!hex) return;
    const h = expandShortHex(hex);
    if (!/^#[0-9a-f]{6}$/.test(h)) return;
    weighted.set(h, (weighted.get(h) || 0) + weight);
  };

  if (themeColor) bump(themeColor, 12);

  for (const sample of computed) {
    const role = String(sample?.role || "");
    const color = rgbStringToHex(sample?.color);
    const bg = rgbStringToHex(sample?.backgroundColor);
    const roleWeight =
      /button|cta|theme/i.test(role) ? 14 :
      /heading|h1|nav/i.test(role) ? 8 :
      /body|section|header/i.test(role) ? 6 :
      3;
    if (bg && bg !== "#000000" && bg !== "#ffffff") bump(bg, roleWeight + (saturation(bg) > 0.25 ? 6 : 0));
    if (color && color !== "#000000" && color !== "#ffffff") {
      bump(color, roleWeight + (saturation(color) > 0.35 ? 8 : 0));
    }
    // Keep pure black/white as palette anchors when they dominate UI.
    if (bg === "#000000" || bg === "#ffffff") bump(bg, 4);
    if (color === "#000000" || color === "#ffffff") bump(color, 3);
  }

  for (const hex of screenshotAccents) bump(hex, 5);

  const ranked = [...weighted.entries()]
    .sort((a, b) => b[1] - a[1] || saturation(b[0]) - saturation(a[0]))
    .map(([hex]) => hex);

  if (!ranked.length) return null;

  const dark =
    ranked.find((h) => luminance(h) < 0.25) ||
    ranked.find((h) => luminance(h) < 0.4) ||
    "#000000";
  const accent =
    ranked.find((h) => h !== dark && saturation(h) >= 0.35) ||
    ranked.find((h) => h !== dark && !isBoringNeutral(h) && luminance(h) >= 0.25 && luminance(h) <= 0.85) ||
    ranked.find((h) => h !== dark) ||
    "#04d9d8";
  const light =
    ranked.find((h) => h !== dark && h !== accent && luminance(h) >= 0.75) ||
    ranked.find((h) => h !== dark && h !== accent && saturation(h) >= 0.35) ||
    ranked.find((h) => h !== dark && h !== accent) ||
    "#ffffff";

  return [dark, accent, light].map((h) => expandShortHex(h)).slice(0, 3);
}

async function resolvePlaywrightChromium() {
  try {
    const pe = await import("playwright-extra");
    const stealthMod = await import("puppeteer-extra-plugin-stealth");
    const stealth = stealthMod.default || stealthMod;
    pe.chromium.use(stealth());
    return pe.chromium;
  } catch {
    try {
      const pw = await import("playwright");
      return pw.chromium;
    } catch {
      return null;
    }
  }
}

/**
 * Headless render: sample computed UI colors + fonts (+ screenshot accents).
 * Returns null when Playwright/Chromium is unavailable.
 */
async function extractVisualBrandSignals(websiteUrl, themeColor = null) {
  if (process.env.BRAND_DNA_DISABLE_SCREENSHOT === "1") return null;
  const chromium = await resolvePlaywrightChromium();
  if (!chromium) return null;

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    await page.goto(websiteUrl, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForTimeout(2500);

    const computed = await page.evaluate(() => {
      const pick = (role, el) => {
        if (!el) return null;
        const cs = getComputedStyle(el);
        return {
          role,
          color: cs.color,
          backgroundColor: cs.backgroundColor,
          fontFamily: cs.fontFamily,
        };
      };
      const q = (sel) => document.querySelector(sel);
      const samples = [
        pick("body", document.body),
        pick("header", q("header, [data-ux='Header'], .widget-header")),
        pick("section", q("section, [data-ux='Section']")),
        pick("h1", q("h1")),
        pick("h2", q("h2")),
        pick("h3", q("h3")),
        pick("p", q("p")),
        pick("nav", q("nav a, a[data-typography='NavAlpha'], a[data-ux='NavLink']")),
        pick("cta", q("[data-ux='Button'], a[data-aid*='BUTTON'], button, a.btn, .btn")),
      ].filter(Boolean);

      for (const el of Array.from(document.querySelectorAll("a, button")).slice(0, 40)) {
        const cs = getComputedStyle(el);
        const bg = cs.backgroundColor;
        if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
          samples.push({
            role: "cta",
            color: cs.color,
            backgroundColor: bg,
            fontFamily: cs.fontFamily,
          });
        }
      }
      return samples;
    });

    const shot = await page.screenshot({ type: "png", fullPage: false });
    const screenshotAccents = await sampleScreenshotAccents(shot);
    const colors = pickVisualBrandColors({ themeColor, computed, screenshotAccents });
    const fonts = pickVisualFonts(computed);
    if ((!colors || colors.length < 3) && !fonts.length) return null;
    return {
      colors: colors && colors.length >= 3 ? colors : null,
      fonts: fonts.length ? fonts : null,
    };
  } catch (err) {
    console.warn("[brand-dna] visual brand extract failed:", err?.message || err);
    return null;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* ignore */
      }
    }
  }
}

/** @deprecated use extractVisualBrandSignals */
async function extractColorsFromScreenshot(websiteUrl, themeColor = null) {
  const visual = await extractVisualBrandSignals(websiteUrl, themeColor);
  return visual?.colors || null;
}

/** Sample saturated accent hexes from a viewport PNG (optional sharp). */
async function sampleScreenshotAccents(pngBuffer) {
  try {
    const sharpMod = await import("sharp").catch(() => null);
    const sharp = sharpMod?.default || sharpMod;
    if (!sharp) return [];
    const buf = Buffer.isBuffer(pngBuffer) ? pngBuffer : Buffer.from(pngBuffer);
    const { data, info } = await sharp(buf).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
    const { width, height } = info;
    const buckets = new Map();
    const bump = (r, g, b) => {
      const rq = Math.round(r / 16) * 16;
      const gq = Math.round(g / 16) * 16;
      const bq = Math.round(b / 16) * 16;
      const hex = `#${[rq, gq, bq].map((n) => Math.min(255, n).toString(16).padStart(2, "0")).join("")}`;
      const s = saturation(hex);
      const l = luminance(hex);
      if (s < 0.35 || l < 0.12 || l > 0.9) return;
      buckets.set(hex, (buckets.get(hex) || 0) + 1);
    };
    const bands = [
      [0, Math.min(110, height)],
      [Math.max(0, height - 220), height],
    ];
    for (const [y0, y1] of bands) {
      for (let y = y0; y < y1; y += 6) {
        for (let x = 0; x < width; x += 6) {
          const i = (y * width + x) * 4;
          if (data[i + 3] < 200) continue;
          bump(data[i], data[i + 1], data[i + 2]);
        }
      }
    }
    return [...buckets.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([hex]) => hex);
  } catch {
    return [];
  }
}

function extractFonts(html) {
  const fonts = [];
  let match;
  FONT_FAMILY_RE.lastIndex = 0;
  while ((match = FONT_FAMILY_RE.exec(html)) !== null) {
    const parts = normalizeFontFamilyList(match[1]);
    for (const part of parts) {
      if (!fonts.some((f) => f.toLowerCase() === part.toLowerCase())) fonts.push(part);
      if (fonts.length >= 3) return fonts;
    }
  }
  return fonts;
}

function extractLogoUrl(html, baseUrl) {
  const candidates = [];

  for (const tag of html.match(IMG_RE) || []) {
    const attrs = parseAttrs(tag);
    const src = attrs.src || attrs["data-src"] || pickSrcFromSrcset(attrs.srcset || attrs["data-srcset"]);
    if (!isUsableLogoSrc(src)) continue;
    const score = scoreLogoCandidate(attrs);
    if (score > 0) candidates.push({ src, score });
  }

  for (const tag of html.match(SOURCE_RE) || []) {
    const attrs = parseAttrs(tag);
    const src = attrs.src || attrs["data-src"] || pickSrcFromSrcset(attrs.srcset || attrs["data-srcset"]);
    if (!isUsableLogoSrc(src)) continue;
    const score = scoreLogoCandidate(attrs);
    if (score > 40) candidates.push({ src, score: score - 5 });
  }

  candidates.sort((a, b) => b.score - a.score);
  if (candidates[0]) return absolutizeUrl(baseUrl, candidates[0].src);

  const schemaLogo = (html.match(SCHEMA_LOGO_RE) || html.match(SCHEMA_LOGO_RE_ALT) || [])[1];
  if (isUsableLogoSrc(schemaLogo)) return absolutizeUrl(baseUrl, schemaLogo);

  const apple = (html.match(APPLE_ICON_RE) || [])[1];
  if (isUsableLogoSrc(apple)) return absolutizeUrl(baseUrl, apple);
  const icon = (html.match(ICON_RE) || [])[1];
  if (isUsableLogoSrc(icon)) return absolutizeUrl(baseUrl, icon);

  // Keep social share images as a separate signal, but do not label them logos.
  // og:image is often a hero/banner and caused Brand DNA to show the wrong asset.
  return null;
}

function stripHtml(text) {
  return String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function scrapeBrandSignals(websiteUrl) {
  const normalized = normalizeWebsiteUrl(websiteUrl);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const resp = await fetch(normalized, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MarqqBot/1.0)" },
      redirect: "follow",
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();
    const title = stripHtml((html.match(TITLE_RE) || [])[1] || "");
    const description = stripHtml(
      (html.match(META_DESC_RE) || html.match(META_DESC_RE_ALT) || [])[1] || "",
    );
    const siteName = stripHtml((html.match(OG_SITE_RE) || [])[1] || "");
    const h1 = stripHtml((html.match(H1_RE) || [])[1] || "");
    const themeColor = (html.match(THEME_COLOR_RE) || [])[1] || null;
    const hexes = html.match(HEX_RE) || [];
    const htmlColors = pickBrandColors(hexes, themeColor);
    const htmlFonts = extractFonts(html);
    let colors = htmlColors;
    let fonts = htmlFonts;
    let colorSource = "html-hex";
    let fontSource = "html-css";
    try {
      const visual = await extractVisualBrandSignals(
        normalized,
        themeColor ? expandShortHex(themeColor) : null,
      );
      if (visual?.colors?.length >= 3) {
        colors = visual.colors;
        colorSource = "screenshot";
      }
      if (visual?.fonts?.length) {
        fonts = visual.fonts;
        fontSource = "screenshot";
      }
    } catch (err) {
      console.warn("[brand-dna] visual brand signals skipped:", err?.message || err);
    }
    return {
      websiteUrl: normalized,
      title,
      description,
      siteName,
      h1,
      logoUrl: extractLogoUrl(html, normalized),
      colors,
      colorSource,
      fonts: fonts.length ? fonts : ["Inter", "Georgia"],
      fontSource,
      themeColor: themeColor ? expandShortHex(themeColor) : null,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function buildBrandDnaPrompt({ companyName, websiteUrl, industry, icp, signals }) {
  return `You are a brand strategist extracting Brand DNA from a company website.

Company name (user-provided): ${companyName || "Unknown"}
Website: ${websiteUrl}
Industry hint: ${industry || "—"}
ICP hint: ${icp || "—"}

Homepage signals:
- og:site_name: ${signals?.siteName || "—"}
- title: ${signals?.title || "—"}
- h1: ${signals?.h1 || "—"}
- meta description: ${signals?.description || "—"}
- scraped colors: ${(signals?.colors || []).join(", ") || "—"}
- scraped fonts: ${(signals?.fonts || []).join(", ") || "—"}
- logo url: ${signals?.logoUrl || "—"}

Return ONE JSON object only with exactly these fields:
{
  "companyName": "official brand name",
  "websiteUrl": "${websiteUrl}",
  "logoUrl": "absolute url or null",
  "businessSummary": "2-4 sentence plain-language company overview",
  "fonts": ["PrimaryFont", "SecondaryFont"],
  "colors": ["#hex1", "#hex2", "#hex3"],
  "brandTagline": "one punchy brand tagline",
  "toneOfVoice": "2-3 sentences describing how the brand speaks"
}

Rules:
- Prefer scraped colors/fonts/logo when present; refine only if missing or clearly wrong.
- colors must be exactly 3 hex codes.
- fonts: 1-3 named typefaces (not generic CSS keywords).
- Do not invent social proof or fake claims.
- Keep toneOfVoice concrete and usable for content agents.`;
}

export function normalizeBrandDna(raw, fallback = {}) {
  const colors = Array.isArray(raw?.colors)
    ? raw.colors.map((c) => String(c || "").trim()).filter((c) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c)).slice(0, 3)
    : [];
  const fonts = Array.isArray(raw?.fonts)
    ? raw.fonts.map((f) => String(f || "").trim()).filter(Boolean).slice(0, 4)
    : [];

  return {
    companyName: String(raw?.companyName || fallback.companyName || "").trim() || "Your Company",
    websiteUrl: normalizeWebsiteUrl(raw?.websiteUrl || fallback.websiteUrl || ""),
    logoUrl: typeof raw?.logoUrl === "string" && raw.logoUrl.trim() ? raw.logoUrl.trim() : (fallback.logoUrl || null),
    businessSummary: String(raw?.businessSummary || fallback.businessSummary || "").trim(),
    fonts: fonts.length ? fonts : (fallback.fonts || ["Inter", "Georgia"]),
    colors: colors.length >= 3 ? colors : (fallback.colors || ["#0f3d2e", "#f0e9d8", "#faf7f0"]),
    brandTagline: String(raw?.brandTagline || fallback.brandTagline || "").trim(),
    toneOfVoice: String(raw?.toneOfVoice || fallback.toneOfVoice || "").trim(),
  };
}

export { normalizeWebsiteUrl };
