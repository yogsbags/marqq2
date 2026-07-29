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
]);

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

function extractFonts(html) {
  const fonts = [];
  let match;
  while ((match = FONT_FAMILY_RE.exec(html)) !== null) {
    const parts = String(match[1] || "")
      .split(",")
      .map((p) => p.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
    for (const part of parts) {
      const lower = part.toLowerCase();
      if (GENERIC_FONTS.has(lower)) continue;
      if (!fonts.some((f) => f.toLowerCase() === lower)) fonts.push(part);
      if (fonts.length >= 4) return fonts;
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
    return {
      websiteUrl: normalized,
      title,
      description,
      siteName,
      h1,
      logoUrl: extractLogoUrl(html, normalized),
      colors: pickBrandColors(hexes, themeColor),
      fonts: extractFonts(html),
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
