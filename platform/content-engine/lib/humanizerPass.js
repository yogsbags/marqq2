/**
 * Shared blader/humanizer pass
 * Upstream: https://github.com/blader/humanizer (MIT)
 *
 * Used by B2C organic captions and B2C blog / SEO article generation.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const HUMANIZER_SKILL_PATH = join(
  __dirname,
  '..',
  '..',
  'crewai',
  'skill-library',
  'marketingskills',
  'skills',
  'humanizer',
  'SKILL.md',
);

export const HUMANIZER_UPSTREAM = 'https://github.com/blader/humanizer';

let cachedSkill = null;

export async function loadHumanizerSkillMd(maxChars = 14_000) {
  if (cachedSkill) {
    return cachedSkill.length <= maxChars
      ? cachedSkill
      : `${cachedSkill.slice(0, maxChars)}\n\n[…humanizer skill truncated for context budget…]`;
  }
  try {
    cachedSkill = (await readFile(HUMANIZER_SKILL_PATH, 'utf-8')).trim();
  } catch (err) {
    console.warn('[humanizerPass] SKILL.md missing:', err.message);
    cachedSkill = '';
  }
  if (!cachedSkill) return '';
  return cachedSkill.length <= maxChars
    ? cachedSkill
    : `${cachedSkill.slice(0, maxChars)}\n\n[…humanizer skill truncated for context budget…]`;
}

/** Detect B2C from audience / market fields */
export function isB2cMarket(params = {}) {
  const blob = [
    params.market_type,
    params.market,
    params.marketType,
    params.audience_type,
    params.target_audience,
    params.audience,
    params.icp,
  ]
    .map((v) => String(v || '').toLowerCase())
    .join(' ');
  if (/\bb2b\b|enterprise|smb decision|procurement|buyer title/.test(blob) && !/\bb2c\b/.test(blob)) {
    return false;
  }
  return /\bb2c\b|consumer|patient|shopper|end.?user|retail customer|app user|everyday|household|parent|patient/.test(
    blob,
  );
}

async function groqJsonChat({ system, user, temperature = 0.55, max_tokens = 8000 }) {
  const apiKey = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
  if (!apiKey) return { ok: false, error: 'GROQ_API_KEY not configured' };
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      temperature,
      max_tokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    return { ok: false, error: `HTTP ${res.status}: ${t.slice(0, 200)}` };
  }
  const data = await res.json();
  try {
    return { ok: true, data: JSON.parse(data?.choices?.[0]?.message?.content || '{}') };
  } catch (err) {
    return { ok: false, error: `JSON parse: ${err.message}` };
  }
}

async function groqHtmlChat({ system, user, temperature = 0.5, max_tokens = 8000 }) {
  const apiKey = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
  if (!apiKey) return { ok: false, error: 'GROQ_API_KEY not configured' };
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      temperature,
      max_tokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    return { ok: false, error: `HTTP ${res.status}: ${t.slice(0, 200)}` };
  }
  const data = await res.json();
  let html = data?.choices?.[0]?.message?.content?.trim() || '';
  html = html.replace(/^```html?\n?/, '').replace(/\n?```$/, '').trim();
  return { ok: Boolean(html), html, error: html ? null : 'empty html' };
}

/**
 * Humanize a B2C SEO / blog HTML article in place.
 * Preserves tags, META/SLUG comments, headings structure; rewrites prose only.
 */
export async function humanizeBlogArticleHtml(html, {
  title = '',
  keyword = '',
  target_audience = '',
  brand_context = '',
} = {}) {
  const skill = await loadHumanizerSkillMd(16_000);
  if (!skill) {
    return { html, applied: false, reason: 'no_skill' };
  }
  if (!html || !String(html).trim()) {
    return { html, applied: false, reason: 'empty' };
  }

  const user = `Apply the humanizer skill to this B2C blog / SEO article.

## Humanizer skill (blader/humanizer)
${skill}

## B2C blog voice
- This is consumer-facing content (not encyclopedic). Personality and soul ARE appropriate.
- Sound like a knowledgeable human writing for real people — uneven rhythm, concrete claims, no corporate puff.
- Keep SEO value: target keyword "${keyword || ''}" still appears naturally a few times (~0.8–1.5% density). Do NOT keyword-stuff. Preserve secondary keyword mentions when already natural.
- Never invent stats, studies, quotes, product claims, or testimonials not already in the source HTML.
- Keep all HTML tags, <!-- META: --> and <!-- SLUG: --> comments, heading hierarchy, the FAQ <section id="faq"> with <details>/<summary> structure, and <aside id="key-takeaway"> if present.
- Preserve internal links, tables, lists, and figures. Do not strip SEO structure.
- Do not remove or rewrite FAQ questions into non-questions. Do not add <script> tags.
- Do not add markdown fences. Output the full HTML article only.

Brand context: ${brand_context || 'n/a'}
Audience: ${target_audience || 'B2C consumers'}
Title hint: ${title || 'n/a'}

## Source HTML
${String(html).slice(0, 28_000)}`;

  const result = await groqHtmlChat({
    system:
      'You are the humanizer skill rewriting a B2C blog article. Preserve HTML structure and facts. Strip AI writing patterns. Output HTML only.',
    user,
    temperature: 0.5,
    max_tokens: 8000,
  });

  if (!result.ok || !result.html) {
    return { html, applied: false, reason: result.error || 'humanize_failed' };
  }

  // Require article-ish output
  if (!/<h1|<article|<p/i.test(result.html)) {
    return { html, applied: false, reason: 'invalid_html' };
  }

  return {
    html: result.html,
    applied: true,
    reason: 'ok',
    upstream: HUMANIZER_UPSTREAM,
  };
}

/**
 * Batch-humanize caption objects { i, hook, caption, cta }.
 * Returns map by index or null on failure.
 */
export async function humanizeCaptionBatch(payload, { brand = '' } = {}) {
  const skill = await loadHumanizerSkillMd(14_000);
  if (!skill) return { ok: false, error: 'no_skill' };

  const user = `Apply the humanizer skill (blader/humanizer) to these B2C social image-post captions.

## Humanizer skill
${skill}

## Rules
- Remove AI writing patterns. Preserve every factual claim. Do NOT invent stats/names/dates.
- Keep platform voice. CTA: one short plain action line.
- Brand: ${brand || 'brand'}

## Source posts (JSON)
${JSON.stringify(payload)}

Return ONLY JSON:
{ "posts": [ { "i": 0, "hook": "...", "caption": "...", "cta": "..." } ] }`;

  const result = await groqJsonChat({
    system:
      'You are the humanizer skill. Rewrite to sound human. Never invent facts. Return JSON only.',
    user,
    temperature: 0.55,
  });

  if (!result.ok) return { ok: false, error: result.error };
  const rows = Array.isArray(result.data?.posts) ? result.data.posts : [];
  return { ok: true, posts: rows, upstream: HUMANIZER_UPSTREAM };
}
