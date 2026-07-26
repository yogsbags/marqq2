/**
 * SEO article structure helpers
 * - Natural primary / secondary keyword placement (anti-stuffing)
 * - FAQ extraction + JSON-LD (Article, FAQPage, BreadcrumbList)
 */

function asString(v, fallback = '') {
  const s = String(v ?? '').trim();
  return s || fallback;
}

function uniqStrings(list, max = 12) {
  const out = [];
  const seen = new Set();
  for (const item of list || []) {
    const s = asString(item).toLowerCase();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(asString(item));
    if (out.length >= max) break;
  }
  return out;
}

/** Normalize primary + secondary keyword set from free-form params */
export function normalizeKeywordSet(params = {}) {
  const primary = asString(
    params.primary_keyword || params.primaryKeyword || params.keyword || params.topic,
  );
  const fromArray = [
    ...(Array.isArray(params.secondary_keywords) ? params.secondary_keywords : []),
    ...(Array.isArray(params.secondaryKeywords) ? params.secondaryKeywords : []),
  ];
  const fromCsv = String(params.secondary_keyword || params.secondaryKeywordsCsv || '')
    .split(/[,|;]/)
    .map((s) => s.trim())
    .filter(Boolean);

  let secondary = uniqStrings([...fromArray, ...fromCsv], 8).filter(
    (k) => k.toLowerCase() !== primary.toLowerCase(),
  );

  // If planner only sent one keyword, derive light secondary variants (not stuffed duplicates)
  if (primary && secondary.length < 2) {
    const stems = [
      `best ${primary}`,
      `how to ${primary}`.replace(/\bhow to how to\b/i, 'how to'),
      `${primary} guide`,
      `${primary} tips`,
      `${primary} for beginners`,
    ];
    secondary = uniqStrings([...secondary, ...stems], 5).filter(
      (k) => k.toLowerCase() !== primary.toLowerCase() && k.split(/\s+/).length <= 6,
    );
  }

  return { primary, secondary };
}

export function stripHtmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countPhrase(haystack, phrase) {
  if (!phrase) return 0;
  const h = haystack.toLowerCase();
  const p = phrase.toLowerCase();
  if (!p) return 0;
  let count = 0;
  let idx = 0;
  while (true) {
    const found = h.indexOf(p, idx);
    if (found === -1) break;
    count += 1;
    idx = found + p.length;
  }
  return count;
}

/**
 * Keyword density targets for natural placement (anti-stuffing).
 * Primary: ~0.8–1.5% of words, hard cap ~1.8%
 * Each secondary: 2–4 mentions, never denser than primary
 */
export function auditKeywordPlacement(html, { primary, secondary = [] } = {}) {
  const text = stripHtmlToText(html);
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length || 1;
  const primaryCount = countPhrase(text, primary);
  const primaryDensity = (primaryCount / wordCount) * 100;

  const secondaryStats = (secondary || []).map((kw) => {
    const count = countPhrase(text, kw);
    return {
      keyword: kw,
      count,
      density: Number(((count / wordCount) * 100).toFixed(3)),
      ok: count >= 1 && count <= 5 && count < primaryCount + 2,
    };
  });

  const stuffing =
    primaryDensity > 1.8 ||
    primaryCount > Math.max(12, Math.ceil(wordCount / 80)) ||
    secondaryStats.some((s) => s.count > 6);

  const tooThin = primaryCount < 3 && wordCount > 600;

  return {
    word_count: wordCount,
    primary: {
      keyword: primary,
      count: primaryCount,
      density: Number(primaryDensity.toFixed(3)),
      target_density: '0.8–1.5%',
      ok: !stuffing && primaryCount >= 3 && primaryDensity <= 1.8,
    },
    secondary: secondaryStats,
    stuffing,
    too_thin: tooThin,
    score: stuffing ? 'fail' : tooThin ? 'thin' : 'ok',
  };
}

export function extractFaqPairs(html) {
  const pairs = [];
  // Prefer dedicated FAQ section
  const faqBlock =
    html.match(/<section[^>]*id=["']faq["'][^>]*>([\s\S]*?)<\/section>/i) ||
    html.match(/<h2[^>]*>\s*faq[\s\S]*?<\/h2>([\s\S]*?)(?=<h2|$)/i);

  const block = faqBlock?.[1] || html;
  const details = [...block.matchAll(/<details[^>]*>\s*<summary[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi)];
  for (const m of details) {
    const q = stripHtmlToText(m[1]);
    const a = stripHtmlToText(m[2]);
    if (q && a) pairs.push({ question: q, answer: a.slice(0, 500) });
  }

  if (pairs.length) return pairs.slice(0, 8);

  // Fallback: H3 question + following paragraph
  const h3s = [...block.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/gi)];
  for (const m of h3s) {
    const q = stripHtmlToText(m[1]);
    const a = stripHtmlToText(m[2]);
    if (q.includes('?') && a) pairs.push({ question: q, answer: a.slice(0, 500) });
  }
  return pairs.slice(0, 8);
}

export function stripJsonLdScripts(html) {
  return String(html || '').replace(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi,
    '',
  );
}

function slugify(s) {
  return asString(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

/**
 * Build Google-eligible JSON-LD graph: BlogPosting + FAQPage + BreadcrumbList
 */
export function buildArticleJsonLd({
  title,
  description,
  slug,
  primaryKeyword,
  secondaryKeywords = [],
  faq = [],
  brandName = 'Brand',
  siteUrl = 'https://example.com',
  authorName = 'Editorial Team',
} = {}) {
  const base = String(siteUrl || 'https://example.com').replace(/\/$/, '');
  const path = `/blog/${slug || slugify(primaryKeyword || title || 'article')}`;
  const pageUrl = `${base}${path}`;
  const now = new Date().toISOString();

  const blogPosting = {
    '@type': 'BlogPosting',
    '@id': `${pageUrl}#article`,
    headline: title || primaryKeyword,
    description: description || '',
    datePublished: now,
    dateModified: now,
    inLanguage: 'en',
    keywords: [primaryKeyword, ...secondaryKeywords].filter(Boolean).join(', '),
    mainEntityOfPage: { '@type': 'WebPage', '@id': pageUrl },
    author: { '@type': 'Person', name: authorName },
    publisher: {
      '@type': 'Organization',
      name: brandName,
      logo: {
        '@type': 'ImageObject',
        url: `${base}/logo.png`,
      },
    },
    image: [`${base}/og${path}.jpg`],
    articleSection: 'Blog',
    wordCount: undefined,
  };

  const breadcrumb = {
    '@type': 'BreadcrumbList',
    '@id': `${pageUrl}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: base },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${base}/blog` },
      { '@type': 'ListItem', position: 3, name: title || primaryKeyword, item: pageUrl },
    ],
  };

  const graph = [blogPosting, breadcrumb];

  if (faq.length >= 2) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${pageUrl}#faq`,
      mainEntity: faq.map((pair) => ({
        '@type': 'Question',
        name: pair.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: pair.answer,
        },
      })),
    });
  }

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  };
}

export function injectJsonLd(html, jsonLd) {
  const clean = stripJsonLdScripts(html).trim();
  const script = `<script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2)}\n</script>`;
  // Keep JSON-LD inside/after article for embeddable HTML fragments
  if (/<\/article>/i.test(clean)) {
    return clean.replace(/<\/article>/i, `${script}\n</article>`);
  }
  return `${clean}\n${script}`;
}

/**
 * Ensure FAQ <section id="faq"> exists with at least 4 Q&As when missing.
 * Used as a safety net after LLM generation.
 */
export function ensureFaqSection(html, { primary, secondary = [], seedQuestions = [] } = {}) {
  if (/id=["']faq["']/i.test(html) && extractFaqPairs(html).length >= 2) {
    return html;
  }

  const seeds = uniqStrings(
    [
      ...seedQuestions,
      `What is ${primary}?`,
      `How does ${primary} work?`,
      secondary[0] ? `What is the difference between ${primary} and ${secondary[0]}?` : null,
      `Who should use ${primary}?`,
      `What are common mistakes with ${primary}?`,
      secondary[1] ? `How do I get started with ${secondary[1]}?` : `How do I get started with ${primary}?`,
    ].filter(Boolean),
    6,
  );

  const details = seeds
    .map((q) => {
      const a =
        'Give a clear, helpful answer in plain language. Cover the reader’s intent, one practical next step, and any caveats — without repeating the same phrase over and over.';
      return `<details><summary>${escapeHtml(q)}</summary><p>${escapeHtml(a)}</p></details>`;
    })
    .join('\n');

  const section = `\n<section id="faq">\n<h2>Frequently asked questions</h2>\n${details}\n</section>\n`;

  if (/<\/article>/i.test(html)) {
    return html.replace(/<\/article>/i, `${section}</article>`);
  }
  return `${html}${section}`;
}

/** Ensure definition / key-takeaway block exists near the top (AEO-friendly). */
export function ensureKeyTakeaway(html, { primary } = {}) {
  if (/id=["']key-takeaway["']/i.test(html)) return html;
  const def = primary
    ? `<aside id="key-takeaway"><p><strong>${escapeHtml(primary)}:</strong> A practical, plain-language definition belongs here — what it is and why it matters for the reader.</p></aside>\n`
    : '';
  if (!def) return html;
  // Insert after first </p> following <h1>, or after <h1>
  if (/<h1[^>]*>[\s\S]*?<\/h1>/i.test(html)) {
    return html.replace(/(<h1[^>]*>[\s\S]*?<\/h1>)/i, `$1\n${def}`);
  }
  return html;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Prompt block for LLM: natural keyword spray + schema-ready HTML structure */
export function buildKeywordAndSchemaPromptBlock({
  primary,
  secondary,
  wordCount,
  seedFaqs = [],
}) {
  const minPrimary = Math.max(3, Math.round(Number(wordCount || 1200) * 0.008));
  const maxPrimary = Math.max(minPrimary + 2, Math.round(Number(wordCount || 1200) * 0.015));

  return `
KEYWORD STRATEGY (page-1 on-page SEO — no stuffing):
- Primary keyword: "${primary}"
- Secondary keywords: ${secondary.length ? secondary.map((k) => `"${k}"`).join(', ') : '(derive 3–5 closely related phrases)'}
- Place primary in: H1 (or close variant), first 100 words, ≥1 H2, meta description, one image alt if any, conclusion — naturally.
- Primary exact-match count target: ${minPrimary}–${maxPrimary} times in ~${wordCount} words (~0.8–1.5% density). Never exceed ~1.8%.
- Each secondary: 2–4 natural mentions; use synonyms/stemming; never force awkward repeats.
- Forbidden: keyword lists, repeated identical sentences, bolding every keyword, stuffing titles with commas of keywords.
- Prefer semantic coverage (entities, related questions) over exact-match spam.

STRUCTURE FOR RANKING + RICH RESULTS:
- Semantic HTML only inside <article>…</article>
- Include a dedicated FAQ section: <section id="faq"><h2>Frequently asked questions</h2> with 4–6 <details><summary>Question?</summary><p>Answer…</p></details>
${seedFaqs.length ? `- Prefer these FAQ angles when relevant: ${seedFaqs.map((q) => `"${q}"`).join('; ')}` : ''}
- FAQ answers must be self-contained (40–60 words), include primary or a secondary keyword only when natural.
- Do NOT invent statistics, reviews, star ratings, or fake Organization claims.
- Do NOT output JSON-LD yourself — a post-processor injects valid BlogPosting + FAQPage + BreadcrumbList JSON-LD from your FAQ HTML.
- Optional: one ordered How-to style H2 with <ol><li> steps if the topic is instructional (helps HowTo eligibility later).
`;
}

/**
 * Distilled from ai-seo + seo-audit + schema-markup + content-strategy skills.
 * Concrete SEO-rich article requirements for the writer.
 */
export function buildSeoRichArticleChecklist({ primary, secondary = [], wordCount = 1200 } = {}) {
  return `
SEO-RICH ARTICLE CHECKLIST (authoritative — from ai-seo, seo-audit, schema-markup, content-strategy skills):

ON-PAGE (seo-audit)
1. Single H1 with primary keyword (or close natural variant) — not stuffed.
2. Meta description ≤155 chars, includes primary once, clear benefit + intent match.
3. URL slug short, hyphenated, includes primary stem.
4. H2/H3 hierarchy mirrors search intent (no skipped levels).
5. Intro answers the query in the first 2–3 sentences (featured-snippet / AI Overview friendly).
6. Include one scannable comparison or steps block: <table> OR <ol> with 4–7 concrete steps.
7. Internal-link placeholders as plain anchors: <a href="/related-topic">descriptive anchor</a> (2–4), no empty "click here".
8. External citations only if already in brand_context — never invent studies/URLs.
9. Image slots as <figure><img alt="descriptive alt with secondary keyword if natural" src="" /><figcaption>…</figcaption></figure> (1–2), empty src OK.

CONTENT DEPTH (content-strategy + ai-seo)
10. Cover primary + each secondary as its own H2 or substantial H3 (topical completeness).
11. Definition box near top: <aside id="key-takeaway"><p><strong>${primary || 'Topic'}:</strong> one clear definition sentence.</p></aside>
12. "Who this is for" / "Who should skip" nuance (E-E-A-T honesty — no fake credentials).
13. Practical takeaways H2 with 5–7 bullets a reader can act on today.
14. CTA conclusion that matches search intent (informational → soft next step; commercial → clear offer language without hype).
15. Target ~${wordCount}+ words of real prose (not padded fluff).

AI SEARCH / AEO (ai-seo)
16. Self-contained answer blocks under H2s (40–80 words) that can be quoted by AI Overviews.
17. Prefer specific entities, product/category names, and concrete scenarios over vague "landscape" language.
18. FAQ section eligible for FAQ rich results (real questions users ask).
19. No chatbot closers ("In conclusion, it is important to note…").

SCHEMA (schema-markup) — HTML only; JSON-LD injected later
20. Keep FAQ in <section id="faq"> with <details>/<summary>.
21. Do not invent AggregateRating, Review, or fake author credentials.

Secondary phrases to cover naturally: ${
    secondary.length ? secondary.map((k) => `"${k}"`).join(', ') : 'derive from topic cluster'
  }.
`;
}

/** Score how SEO-rich the finished HTML is (for UI / QA). */
export function scoreSeoRichness(html, { primary = '', secondary = [] } = {}) {
  const h = String(html || '');
  const checks = {
    has_h1: /<h1[\s>]/i.test(h),
    has_meta_comment: /<!--\s*META:/i.test(h),
    has_slug_comment: /<!--\s*SLUG:/i.test(h),
    h2_count: Math.min(12, (h.match(/<h2[\s>]/gi) || []).length),
    has_faq_section: /id=["']faq["']/i.test(h) && extractFaqPairs(h).length >= 2,
    has_key_takeaway: /id=["']key-takeaway["']/i.test(h) || /<aside[\s>]/i.test(h),
    has_list_or_table: /<(ul|ol|table)[\s>]/i.test(h),
    has_internal_links: /<a\s+[^>]*href=["']\/[^"']+["']/i.test(h),
    has_figure: /<figure[\s>]/i.test(h),
    has_json_ld: /application\/ld\+json/i.test(h),
    primary_in_h1: primary
      ? new RegExp(`<h1[^>]*>[^<]*${escapeRegExp(primary)}`, 'i').test(h)
      : false,
    secondary_coverage: (secondary || []).filter((kw) =>
      kw ? h.toLowerCase().includes(String(kw).toLowerCase()) : false,
    ).length,
  };

  const points = [
    checks.has_h1,
    checks.has_meta_comment,
    checks.has_slug_comment,
    checks.h2_count >= 4,
    checks.has_faq_section,
    checks.has_key_takeaway,
    checks.has_list_or_table,
    checks.has_internal_links,
    checks.has_figure,
    checks.has_json_ld,
    checks.primary_in_h1,
    checks.secondary_coverage >= Math.min(2, (secondary || []).length || 2),
  ].filter(Boolean).length;

  const max = 12;
  const score = Math.round((points / max) * 100);
  return {
    score,
    grade: score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D',
    checks,
    points,
    max,
  };
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
