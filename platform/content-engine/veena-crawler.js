const TEST_OVERRIDES = globalThis.__VEENA_TEST_OVERRIDES__ || {};

const fetchImpl = TEST_OVERRIDES.fetchImpl || globalThis.fetch;
let groqClientPromise = null;
let mkgServicePromise = null;

const TOP_LEVEL_FIELDS = [
  "positioning",
  "icp",
  "competitors",
  "offers",
  "messaging",
  "channels",
  "funnel",
  "metrics",
  "baselines",
  "content_pillars",
  "campaigns",
  "insights",
];

const EMPTY_CRAWL_FIELD = Object.freeze({ value: null, confidence: 0 });
const EMPTY_TEMPLATE_FIELD = Object.freeze({
  value: null,
  confidence: 0,
  last_verified: null,
  source_agent: "veena",
  expires_at: null,
});

// ── System prompts ─────────────────────────────────────────────────────────────

// Pass 1: crawl own website only — 11 fields (insights excluded, synthesized in Pass 3)
const VEENA_MKG_SYSTEM_PROMPT = `IMPORTANT: Only visit URLs that are subdomains or paths of the provided website URL. Never visit external competitor websites or unrelated domains.

You are Veena, the Company Intelligence agent. Crawl the provided company website and extract a Marketing Knowledge Graph bootstrap in strict JSON.

Output ONLY valid JSON with exactly these 12 keys:
- positioning
- icp
- competitors
- offers
- messaging
- channels
- funnel
- metrics
- baselines
- content_pillars
- campaigns
- insights

Each key must map to:
{ "value": <structured object, array, or null>, "confidence": <number from 0.0 to 1.0> }

Schema per field:
- positioning: { "statement": string, "unique_value": string }
- icp: { "company_size": string, "industry": string[], "geography": string[], "role": string[] }
- competitors: [{ "name": string, "positioning": string }]
- offers: [{ "name": string, "price_signal": string, "tier": string }]
- messaging: { "headline": string, "tagline": string, "key_messages": string[] }
- channels: [{ "channel": string, "evidence": string }]
- funnel: { "entry_points": string[], "cta_primary": string }
- metrics: null on first crawl
- baselines: null on first crawl
- content_pillars: [{ "topic": string, "evidence": string }]
- campaigns: null on first crawl
- insights: always return { "value": null, "confidence": 0 } — synthesized separately

Field rules:
- offers.price_signal: use "not publicly disclosed" if no pricing is visible. Never null.
- offers.tier: use "standard" if only one tier exists, or describe tiers found. Never null.
- channels[].evidence: must be a verbatim quote, nav label, CTA text, or footer link that
  proves the channel is used. Never null — if no explicit text, describe the page element.
- content_pillars[].evidence: same rule — quote the H2, section heading, or blog category.
- icp.industry, icp.role: always arrays, never strings.

General rules:
- Never return prose outside the JSON object.
- Never omit a top-level key.
- Use structured objects or arrays for values. Do not use raw prose blobs as values.
- If a field is not findable on the website, return { "value": null, "confidence": 0 }.
- For metrics, baselines, campaigns, and insights: always return { "value": null, "confidence": 0 }.
- Use higher confidence only for explicit website evidence.`;

// Pass 2: web search for competitors — no own-domain restriction, runs in parallel with Pass 1
const COMPETITOR_SEARCH_SYSTEM_PROMPT = `You are Veena, searching the web for a company's direct competitors.
Use web_search to run these queries:
1. "[company] competitors"
2. "[company] vs [alternative]"
3. "best [company] alternatives"
4. "top [company] alternatives site:g2.com OR site:capterra.com OR site:trustradius.com"

Return ONLY valid JSON with exactly this structure:
{
  "competitors": {
    "value": [{ "name": string, "positioning": string }],
    "confidence": number
  }
}

Rules:
- Return 3-5 direct competitors with distinct, specific positioning angles (not generic).
- positioning must describe what makes each competitor different, not just what they do.
- confidence: 0.7-0.9 for results confirmed by multiple sources; 0.4-0.6 for inferred.
- Never invent competitors not found in search results.
- Do NOT include the company itself as a competitor.`;

// Pass 3: synthesize insights from the merged MKG — pure reasoning, no browsing needed
const INSIGHTS_SYNTHESIS_SYSTEM_PROMPT = `You are Veena. Synthesize an "insights" field from the Marketing Knowledge Graph provided.

Return ONLY valid JSON:
{
  "insights": {
    "value": {
      "summary": string,
      "gaps": string[]
    },
    "confidence": number
  }
}

Rules:
- summary: 2-3 sentences covering market position, key differentiator, and one strategic risk or opportunity.
- gaps: exactly 4-5 specific data points absent from the MKG that would be most valuable to add
  (e.g. "pricing not publicly disclosed", "ICP limited to India — international expansion unclear",
  "no campaign history available", "competitor pricing benchmarks missing").
- confidence: always 0.75 (synthesized from observed data, not directly crawled).
- Never return null for summary. Never return an empty gaps array.`;

// ── Helpers ────────────────────────────────────────────────────────────────────

function createEmptyCrawlResult() {
  return Object.fromEntries(
    TOP_LEVEL_FIELDS.map((field) => [field, { ...EMPTY_CRAWL_FIELD }])
  );
}

function createEmptyTemplatePatch(agentName = "veena") {
  return Object.fromEntries(
    TOP_LEVEL_FIELDS.map((field) => [
      field,
      {
        ...EMPTY_TEMPLATE_FIELD,
        source_agent: agentName,
      },
    ])
  );
}

function stripTags(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMetaContent(html, attributeName, attributeValue) {
  const patternA = new RegExp(
    `<meta[^>]+${attributeName}=["']${attributeValue}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const patternB = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+${attributeName}=["']${attributeValue}["']`,
    "i"
  );
  return (html.match(patternA) || html.match(patternB) || [])[1]?.trim() || "";
}

function extractAllText(html, tagName, limit) {
  const pattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  const results = [];
  for (const match of html.matchAll(pattern)) {
    const text = stripTags(match[1]);
    if (text) results.push(text);
    if (results.length >= limit) break;
  }
  return results;
}

function extractCtas(html, limit) {
  const pattern = /<(button|a)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  const results = [];
  for (const match of html.matchAll(pattern)) {
    const text = stripTags(match[2]);
    if (!text) continue;
    if (text.length > 40) continue;
    if (text.split(/\s+/).length > 6) continue;
    if (!/[A-Za-z]/.test(text)) continue;
    results.push(text);
    if (results.length >= limit) break;
  }
  return results;
}

function extractJsonObject(text) {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeCrawlValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...EMPTY_CRAWL_FIELD };
  }

  const confidenceNumber = Number(value.confidence);
  const confidence = Number.isFinite(confidenceNumber)
    ? Math.min(1, Math.max(0, confidenceNumber))
    : 0;

  return {
    value: value.value ?? null,
    confidence,
  };
}

function normalizeCrawlResult(payload) {
  const normalized = createEmptyCrawlResult();
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return normalized;
  }

  for (const field of TOP_LEVEL_FIELDS) {
    normalized[field] = normalizeCrawlValue(payload[field]);
  }

  return normalized;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

// Derive a short company name from the URL hostname when no name is provided
function deriveNameFromUrl(websiteUrl) {
  try {
    const hostname = new URL(
      websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`
    ).hostname.replace(/^www\./, "").split(".")[0];
    return hostname ? hostname.charAt(0).toUpperCase() + hostname.slice(1) : "";
  } catch {
    return "";
  }
}

// Returns true if at least 3 non-null fields exist (worth synthesizing insights)
function hasMeaningfulData(result) {
  const meaningfulFields = ["positioning", "icp", "offers", "messaging", "channels", "funnel", "content_pillars"];
  return meaningfulFields.filter(f => result[f]?.value !== null).length >= 3;
}

async function fetchHomepageSignals(websiteUrl) {
  if (!websiteUrl || typeof fetchImpl !== "function") return "";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const resp = await fetchImpl(websiteUrl.trim(), {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TorqqBot/1.0)" },
    });
    if (!resp?.ok) return "";
    const html = await resp.text();
    return extractPageSignals(html);
  } catch (error) {
    console.warn("Veena crawl homepage fetch failed:", error?.message || error);
    return "";
  } finally {
    clearTimeout(timer);
  }
}

async function getGroqClient() {
  if (TEST_OVERRIDES.groqClient) return TEST_OVERRIDES.groqClient;
  if (!groqClientPromise) {
    // Always force 'groq' provider — compound and llama-3.3-70b-versatile are
    // Groq-only models; the global LLM_PROVIDER setting must not redirect here.
    groqClientPromise = import("./langfuse.js").then(({ tracedLLM }) => {
      return tracedLLM({ traceName: 'veena-crawl', tags: ['veena', 'crawler'], provider: 'groq' });
    });
  }
  return groqClientPromise;
}

async function getMkgService() {
  if (TEST_OVERRIDES.mkgService) return TEST_OVERRIDES.mkgService;
  if (!mkgServicePromise) {
    mkgServicePromise = import("./mkg-service.js").then(({ MKGService }) => MKGService);
  }
  return mkgServicePromise;
}

// ── Firecrawl: scrape homepage + /about + /pricing as clean markdown ──────────

const FIRECRAWL_PAGES_PER_CRAWL = 3;
const FIRECRAWL_CHARS_PER_PAGE  = 2500;
const FIRECRAWL_TIMEOUT_MS      = 15_000;

async function firecrawlScrapePage(url, apiKey) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FIRECRAWL_TIMEOUT_MS);
  try {
    const resp = await fetchImpl("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
      signal: ctrl.signal,
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.data?.markdown?.trim() || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function firecrawlScrapePages(websiteUrl, apiKey) {
  let origin;
  try {
    origin = new URL(
      websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`
    ).origin;
  } catch {
    return "";
  }

  const candidates = [
    origin + "/",
    origin + "/about",
    origin + "/pricing",
    origin + "/about-us",
  ];

  const sections = [];
  for (const url of candidates) {
    if (sections.length >= FIRECRAWL_PAGES_PER_CRAWL) break;
    const markdown = await firecrawlScrapePage(url, apiKey);
    if (markdown) {
      sections.push(`## ${url}\n${markdown.slice(0, FIRECRAWL_CHARS_PER_PAGE)}`);
    }
  }

  return sections.join("\n\n---\n\n");
}

// ── LLM calls ─────────────────────────────────────────────────────────────────

async function runCompoundCrawl(systemPrompt, userContent, timeoutMs = 120_000) {
  const groq = await getGroqClient();
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("crawl_timeout")), timeoutMs);
    timeoutId.unref?.();
  });

  try {
    return await Promise.race([
      groq.chat.completions.create({
        model: "groq/compound",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: 0.3,
        max_completion_tokens: 2000,
        compound_custom: {
          tools: { enabled_tools: ["web_search", "visit_website"] },
        },
      }),
      timeoutPromise,
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

// Pass 1: compound website crawl → 11 fields (insights excluded)
async function runPass1(userContent) {
  const completion = await runCompoundCrawl(VEENA_MKG_SYSTEM_PROMPT, userContent);
  const raw = completion?.choices?.[0]?.message?.content?.trim() || "";
  const parsed = extractJsonObject(raw);
  if (!parsed) throw new Error("compound_non_json");
  return normalizeCrawlResult(parsed);
}

// Pass 2: competitor web search — runs in parallel with Pass 1
async function runPass2Competitors(companyName, websiteUrl) {
  const userContent = `Company: ${companyName}
Website: ${websiteUrl}

Search the web to find the top direct competitors of ${companyName}. Use all four search queries from your instructions.`;

  const completion = await runCompoundCrawl(
    COMPETITOR_SEARCH_SYSTEM_PROMPT,
    userContent,
    60_000,
  );
  const raw = completion?.choices?.[0]?.message?.content?.trim() || "";
  const parsed = extractJsonObject(raw);
  if (parsed?.competitors) return normalizeCrawlValue(parsed.competitors);
  return null;
}

// Pass 3: insights synthesis from merged MKG — llama-70b, no browsing
async function runPass3Insights(mergedResult, companyName) {
  // Serialize only the populated fields to keep context tight
  const snapshot = {};
  for (const field of TOP_LEVEL_FIELDS) {
    if (field === "insights") continue;
    if (mergedResult[field]?.value !== null) snapshot[field] = mergedResult[field].value;
  }

  const userContent = `Company: ${companyName}

Marketing Knowledge Graph:
${JSON.stringify(snapshot, null, 2)}

Synthesize the insights field.`;

  const groq = await getGroqClient();
  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: INSIGHTS_SYNTHESIS_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    temperature: 0.3,
    max_tokens: 600,
    response_format: { type: "json_object" },
  });

  const raw = completion?.choices?.[0]?.message?.content?.trim() || "";
  const parsed = extractJsonObject(raw);
  if (parsed?.insights) return normalizeCrawlValue(parsed.insights);
  return null;
}

// Fallback: Firecrawl (if key set) + llama-70b when compound fails entirely
async function runFallbackCrawl(userContent, websiteUrl) {
  const firecrawlApiKey = (process.env.FIRECRAWL_API_KEY || "").trim();
  let enrichedContent = userContent;

  if (firecrawlApiKey && websiteUrl) {
    try {
      const scraped = await firecrawlScrapePages(websiteUrl, firecrawlApiKey);
      if (scraped) {
        enrichedContent = `${userContent}\n\nFull page content (scraped):\n${scraped}`;
        console.log(`[veena] Firecrawl enriched fallback for ${websiteUrl}`);
      }
    } catch (err) {
      console.warn("[veena] Firecrawl scrape failed, proceeding without it:", err?.message || err);
    }
  }

  const groq = await getGroqClient();
  return groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: VEENA_MKG_SYSTEM_PROMPT },
      { role: "user", content: enrichedContent },
    ],
    temperature: 0.2,
    max_tokens: 2000,
    response_format: { type: "json_object" },
  });
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function extractPageSignals(html) {
  const safeHtml = String(html || "");
  const title = stripTags((safeHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
  const ogSite = extractMetaContent(safeHtml, "property", "og:site_name");
  const ogDescription = extractMetaContent(safeHtml, "property", "og:description");
  const metaDescription = extractMetaContent(safeHtml, "name", "description");
  const h1 = extractAllText(safeHtml, "h1", 1)[0] || "";
  const h2s = extractAllText(safeHtml, "h2", 3);
  const ctas = extractCtas(safeHtml, 5);

  return [
    title && `Title: ${title}`,
    ogSite && `og:site_name: ${ogSite}`,
    ogDescription && `og:description: ${ogDescription}`,
    metaDescription && `meta description: ${metaDescription}`,
    h1 && `H1: ${h1}`,
    h2s.length && `H2s: ${h2s.join("; ")}`,
    ctas.length && `CTAs: ${ctas.join("; ")}`,
  ]
    .filter(Boolean)
    .join(" | ");
}

/**
 * Crawl a company website and return a normalised 12-field MKG result.
 *
 * Strategy (3 passes):
 *  Pass 1 + Pass 2 run in parallel:
 *    Pass 1 — compound crawls the company's own website (positioning, messaging,
 *              offers, channels, funnel, content_pillars).
 *    Pass 2 — compound web_search for "[company] competitors / vs / alternatives".
 *             Result replaces Pass 1 competitors only if confidence improves.
 *  If Pass 1 fails entirely → Firecrawl (when FIRECRAWL_API_KEY set) + llama-70b fallback.
 *  Pass 3 (after merge) — llama-70b synthesizes insights from the populated MKG.
 *
 * @param {string} websiteUrl
 * @param {string} [companyName] - optional; derived from URL hostname if omitted
 */
export async function crawlCompanyForMKG(websiteUrl, companyName) {
  const normalizedUrl = String(websiteUrl || "").trim();
  const resolvedName = companyName?.trim() || deriveNameFromUrl(normalizedUrl);

  const pageHints = await fetchHomepageSignals(normalizedUrl);
  const userContent = `Website: ${normalizedUrl}

Page signals:
${pageHints || "(none)"}

Only visit URLs under ${normalizedUrl} domain.
Extract MKG fields.`;

  // ── Pass 1 + Pass 2 in parallel ───────────────────────────────────────────
  const [pass1Settlement, pass2Settlement] = await Promise.allSettled([
    runPass1(userContent),
    resolvedName
      ? runPass2Competitors(resolvedName, normalizedUrl)
      : Promise.resolve(null),
  ]);

  let result = null;

  if (pass1Settlement.status === "fulfilled") {
    result = pass1Settlement.value;
    console.log(
      `[veena] Pass 1 complete — competitors: ${result.competitors.confidence}, ` +
      `positioning: ${result.positioning.confidence}`
    );
  } else {
    console.warn("[veena] Pass 1 (compound) failed:", pass1Settlement.reason?.message);
  }

  // ── Fallback if Pass 1 failed ──────────────────────────────────────────────
  if (!result) {
    console.log(`[veena] Falling back to ${(process.env.FIRECRAWL_API_KEY || "").trim() ? "Firecrawl +" : ""} llama-70b`);
    try {
      const completion = await runFallbackCrawl(userContent, normalizedUrl);
      const raw = completion?.choices?.[0]?.message?.content?.trim() || "";
      const parsed = extractJsonObject(raw);
      if (parsed) result = normalizeCrawlResult(parsed);
    } catch (err) {
      console.warn("[veena] Fallback failed:", err?.message || err);
    }
  }

  if (!result) return createEmptyCrawlResult();

  // ── Merge Pass 2 competitors ───────────────────────────────────────────────
  if (pass2Settlement.status === "fulfilled" && pass2Settlement.value) {
    const p2 = pass2Settlement.value;
    if (p2.confidence > result.competitors.confidence) {
      result.competitors = p2;
      console.log(`[veena] Pass 2 improved competitors: ${p2.confidence}`);
    }
  } else if (pass2Settlement.status === "rejected") {
    console.warn("[veena] Pass 2 (competitor search) failed:", pass2Settlement.reason?.message);
  }

  // ── Pass 3: insights synthesis ─────────────────────────────────────────────
  if (hasMeaningfulData(result) && resolvedName) {
    try {
      const insightsResult = await runPass3Insights(result, resolvedName);
      if (insightsResult) {
        result.insights = insightsResult;
        console.log(`[veena] Pass 3 insights synthesized (confidence: ${insightsResult.confidence})`);
      }
    } catch (err) {
      console.warn("[veena] Pass 3 (insights) failed:", err?.message || err);
    }
  }

  return result;
}

export function buildContextPatchFromCrawl(crawlJson, agentName = "veena", runId) {
  void runId;
  const normalized = normalizeCrawlResult(crawlJson);
  const today = new Date();
  const expires = new Date(today);
  expires.setDate(expires.getDate() + 30);

  return Object.fromEntries(
    TOP_LEVEL_FIELDS.map((field) => {
      const { value, confidence } = normalized[field];
      return [
        field,
        {
          value,
          confidence,
          last_verified: confidence > 0 ? formatDate(today) : null,
          source_agent: agentName,
          expires_at: confidence > 0 ? formatDate(expires) : null,
        },
      ];
    })
  );
}

export async function initializeMKGTemplate(companyId) {
  const emptyPatch = createEmptyTemplatePatch("veena");
  const mkgService = await getMkgService();
  return mkgService.patch(companyId, emptyPatch);
}
