import Groq from 'groq-sdk';
import { loadCompanyWithArtifacts, saveArtifact, supabase } from './supabase.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' });
const COMPANY_INTEL_GROQ_MODELS = [
  process.env.GROQ_COMPANY_INTEL_MODEL || 'groq/compound',
  'llama-3.3-70b-versatile'
];

// Maximum number of concurrent tasks (CrewAI generations) per Node server
const MAX_CONCURRENCY = 3;
let activeWorkers = 0;
let workerInterval = null;

// Fallback pure-memory queue if Supabase is strictly down/unavailable
const inMemoryQueue = [];

// Per-company callbacks so callers (backend-server) can update in-memory state
// as each artifact completes, without creating circular module dependencies.
const _artifactCallbacks = new Map();  // companyId → (companyId, type, artifact) => void
const _artifactFailCallbacks = new Map(); // companyId → (companyId, type, errMsg) => void

/**
 * Register a callback that fires whenever an artifact for `companyId` finishes
 * generating. Used by backend-server to keep the in-memory _companies Map fresh.
 */
export function registerArtifactCallback(companyId, fn) {
  _artifactCallbacks.set(companyId, fn);
}

/**
 * Register a callback that fires when an artifact job for `companyId` permanently
 * fails (both CrewAI and Groq fallback exhausted). Lets the status endpoint
 * count failures so the progress bar doesn't get stuck forever.
 */
export function registerArtifactFailCallback(companyId, fn) {
  _artifactFailCallbacks.set(companyId, fn);
}

function _notifyArtifactReady(companyId, type, artifact) {
  const cb = _artifactCallbacks.get(companyId);
  if (cb) {
    try { cb(companyId, type, artifact); } catch { /* never let a callback crash the worker */ }
  }
}

function _notifyArtifactFailed(companyId, type, errMsg) {
  const cb = _artifactFailCallbacks.get(companyId);
  if (cb) {
    try { cb(companyId, type, errMsg); } catch { }
  }
}

function extractJsonObject(text) {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function stripUrls(value) {
  return cleanText(value).replace(/https?:\/\/\S+/gi, '').replace(/\s{2,}/g, ' ').trim();
}

function compactSentence(value, fallback = '') {
  return cleanText(value, fallback).replace(/\s+/g, ' ');
}

function uniqueStrings(values, limit = 12) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const text = cleanText(value);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

function fallbackStartDate() {
  const now = new Date();
  now.setDate(now.getDate() + 1);
  return now.toISOString().slice(0, 10);
}

function buildArtifactSpec(type, companyName, context) {
  const sharedRules = [
    `Company: ${companyName}`,
    'Ground the analysis in the provided website URL and company profile.',
    'Prefer company-specific facts over generic marketing advice.',
    'If a fact is inferred rather than explicit, state it cautiously within the relevant field instead of inventing certainty.',
    'Return exactly one valid JSON object and no markdown.'
  ];

  switch (type) {
    case 'social_calendar':
      return {
        temperature: 0.25,
        maxCompletionTokens: 2200,
        systemPrompt: [
          'You are a senior social strategist building a publish-ready B2B social media calendar.',
          ...sharedRules,
          'Create a practical 4-week calendar with specific post ideas, not abstract weekly themes.',
          'Output JSON shape: { "timezone": string, "startDate": "YYYY-MM-DD", "weeks": number, "channels": string[], "cadence": { "postsPerWeek": number }, "themes": string[], "items": [{ "date": "YYYY-MM-DD", "channel": string, "format": string, "pillar": string, "hook": string, "captionBrief": string, "cta": string, "assetNotes": string, "complianceNote": string }] }.',
          'Provide 10 to 16 items total. Hooks should feel specific to the company and sector. Caption briefs should be 1 to 2 sentences, not placeholders.',
          'Do not invent raw URLs, article links, or media links. assetNotes must describe the asset brief only.'
        ].join(' '),
      };
    case 'lookalike_audiences':
      return {
        temperature: 0.15,
        maxCompletionTokens: 1900,
        systemPrompt: [
          'You are a paid media strategist building lookalike audience plans.',
          ...sharedRules,
          'Output JSON shape: { "seedAudiences": string[], "lookalikes": [{ "platform": string, "targeting": string[], "exclusions": string[], "creativeAngles": string[] }], "measurement": string[] }.',
          'Seed audiences must describe concrete first-party audience sources actually available to this business, not generic personas.',
          'Each platform plan must include 4 to 8 targeting notes, 2 to 5 exclusions, and 3 to 6 creative angles.',
          'Prefer remarketing lists, CRM cohorts, site behaviors, app events, and research-engagement cohorts over demographic stereotypes.',
          'Do not use vague targeting like only age/income unless it is paired with a first-party seed logic and a channel-specific use case.'
        ].join(' '),
      };
    case 'competitor_intelligence':
      return {
        temperature: 0.2,
        maxCompletionTokens: 1800,
        systemPrompt: [
          'You are a competitive intelligence strategist.',
          ...sharedRules,
          'Identify the most relevant direct competitors or alternatives, not generic market leaders unless they truly compete.',
          'Output JSON shape: { "topCompetitors": [{ "name": string, "website": string, "whyRelevant": string, "positioningSnapshot": string, "strengths": string[], "weaknesses": string[] }], "comparison": { "yourDifferentiators": string[], "messagingGaps": string[], "opportunities": string[] } }.',
          'Return 4 to 6 competitors. Strengths and weaknesses should be concise, concrete, and company-specific.'
        ].join(' '),
      };
    case 'positioning_messaging':
      return {
        temperature: 0.25,
        maxCompletionTokens: 1800,
        systemPrompt: [
          'You are a product marketing strategist developing positioning and messaging.',
          ...sharedRules,
          'Output JSON shape: { "valueProposition": string, "differentiators": string[], "messagingPillars": [{ "pillar": string, "description": string, "audienceRelevance": string }], "brandVoice": { "tone": string[], "dosList": string[], "dontsList": string[] }, "elevatorPitches": { "short": string, "medium": string, "long": string } }.',
          'Avoid vague claims like "innovative" or "cutting-edge" unless tied to a concrete capability or market proof.'
        ].join(' '),
      };
    case 'pricing_intelligence':
      return {
        temperature: 0.15,
        maxCompletionTokens: 1800,
        systemPrompt: [
          'You are a pricing strategist.',
          ...sharedRules,
          'Do not assume the company is a SaaS product if the website suggests services, advisory, brokerage, or other non-SaaS models.',
          'Output JSON shape: { "pricingModelSummary": string, "publicPricingVisibility": string, "competitorBenchmarks": [{ "name": string, "pricingModel": string, "startingPoint": string, "notes": string }], "packagingRecommendations": [{ "offer": string, "targetCustomer": string, "pricingApproach": string, "rationale": string }], "valueMetrics": string[], "risks": string[], "nextQuestions": string[] }.',
          'If public pricing is unavailable, say so clearly and shift to packaging and fee-structure hypotheses instead of fabricating exact prices.',
          'Do not cite PDFs, tariff documents, or exact fee numbers unless they are clearly established in the supplied context or verifiable via web search. Prefer ranges or "not publicly disclosed" when uncertain.'
        ].join(' '),
      };
    case 'channel_strategy':
      return {
        temperature: 0.15,
        maxCompletionTokens: 1800,
        systemPrompt: [
          'You are a GTM strategist designing channel roles and operating cadence.',
          ...sharedRules,
          'Output JSON shape: { "channels": [{ "name": string, "role": string, "cadence": string, "contentMix": string[], "growthLoops": string[] }], "budgetSplitGuidance": string[], "measurement": string[] }.',
          'Return 4 to 6 channels only. Each channel role must be distinct and tied to a funnel job.',
          'Cadence must be operationally specific, for example "3 LinkedIn posts/week + 1 analyst POV/month", not "post regularly".',
          'Content mix should name concrete asset types. Growth loops should describe how one channel feeds another or creates retargeting/data advantages.',
          'Budget split guidance should be phrased as percentage ranges or stage-based allocation logic, not generic "invest more in X".'
        ].join(' '),
      };
    case 'website_audit':
      return {
        temperature: 0.2,
        maxCompletionTokens: 2200,
        systemPrompt: [
          'You are a conversion-rate optimisation expert auditing a company website.',
          ...sharedRules,
          'Output JSON shape: { "summary": string, "firstImpression": { "clarityScore": number, "trustScore": number, "visualHierarchyScore": number }, "conversionFunnel": { "primaryCta": string, "recommendedCtas": string[], "frictionPoints": string[] }, "copyRecommendations": { "headlineOptions": string[], "ctaCopyOptions": string[] }, "uxRecommendations": { "quickWins": string[], "highImpactChanges": string[] }, "homepageSections": [{ "section": string, "whatWorks": string[], "issues": string[], "recommendations": string[] }], "experiments": [{ "name": string, "hypothesis": string, "successMetric": string, "implementation": string[] }], "priorityPlan": [{ "task": string, "priority": "high"|"medium"|"low", "why": string, "effort": string, "ownerHint": string }] }.',
          'Scores must be 0-100 integers. Provide 3 to 5 homepage sections, 2 to 4 experiments, and 5 to 8 priority plan items.',
          'Do not invent URLs or specific page copy unless clearly inferrable from the company profile.'
        ].join(' '),
      };
    case 'opportunities':
      return {
        temperature: 0.2,
        maxCompletionTokens: 2000,
        systemPrompt: [
          'You are a growth strategist identifying actionable opportunities for a company.',
          ...sharedRules,
          'Output JSON shape: { "summary": string, "quickWins": [{ "title": string, "priority": "high"|"medium"|"low", "description": string, "expectedImpact": string, "timeToValue": string }], "opportunities": [{ "title": string, "category": string, "priority": "high"|"medium"|"low", "effort": string, "expectedImpact": string, "nextSteps": string[] }], "risksAndMitigations": [{ "risk": string, "mitigation": string }], "90DayPlan": [{ "week": number, "focus": string, "keyActivities": string[] }] }.',
          'Provide 3 to 5 quick wins, 5 to 8 opportunities, 3 to 5 risks, and a 90-day plan with 8 to 12 weekly entries.',
          'Quick wins must be achievable within 30 days. Opportunities should span 30 to 180 days.'
        ].join(' '),
      };
    case 'icps':
      return {
        temperature: 0.2,
        maxCompletionTokens: 1800,
        systemPrompt: [
          'You are a B2B go-to-market strategist defining ideal customer profiles.',
          ...sharedRules,
          'Output JSON shape: { "icps": [{ "name": string, "who": string, "hook": string, "channels": string[], "qualifiers": string[], "disqualifiers": string[] }], "cohorts": [{ "name": string, "priority": number, "definition": string, "messagingAngle": string }], "notes": string[] }.',
          'Define 2 to 4 ICPs and 3 to 6 cohorts. Priority for cohorts is an integer (1 = highest). Qualifiers and disqualifiers must be concrete, not generic demographic filler.',
          'Channels should list actual channels (e.g., "LinkedIn outbound", "Google Search", "referral network"), not generic types.'
        ].join(' '),
      };
    case 'client_profiling':
      return {
        temperature: 0.2,
        maxCompletionTokens: 1800,
        systemPrompt: [
          'You are a customer research strategist profiling existing client segments.',
          ...sharedRules,
          'Output JSON shape: { "segments": [{ "name": string, "profile": string, "jobsToBeDone": string[], "painPoints": string[], "objections": string[], "triggers": string[], "channels": string[] }], "insights": string[] }.',
          'Define 3 to 5 client segments. Each segment needs 3 to 6 jobs-to-be-done, 3 to 5 pain points, 2 to 4 objections, 2 to 4 purchase triggers, and 2 to 4 preferred channels.',
          'Insights should be cross-segment patterns or counter-intuitive findings, not restatements of segment details.'
        ].join(' '),
      };
    case 'partner_profiling':
      return {
        temperature: 0.2,
        maxCompletionTokens: 1600,
        systemPrompt: [
          'You are a partnerships strategist profiling potential channel and integration partners.',
          ...sharedRules,
          'Output JSON shape: { "partnerTypes": [{ "name": string, "valueExchange": string, "selectionCriteria": string[], "activationPlaybook": string[] }], "insights": string[] }.',
          'Define 3 to 5 partner types relevant to this business (e.g., integration partners, referral partners, resellers, co-marketing partners).',
          'Activation playbook must be a concrete step-by-step list, not vague intent statements.',
          'Selection criteria must be measurable or observable, not generic like "must be a good fit".'
        ].join(' '),
      };
    case 'marketing_strategy':
      return {
        temperature: 0.2,
        maxCompletionTokens: 2000,
        systemPrompt: [
          'You are a CMO-level strategist building a 90-day marketing strategy.',
          ...sharedRules,
          'Output JSON shape: { "objective": string, "positioning": string, "targetSegments": string[], "messagingPillars": string[], "kpis": string[], "funnelPlan": [{ "stage": string, "goal": string, "channels": string[], "offers": string[] }], "90DayPlan": [{ "week": number, "focus": string, "keyActivities": string[] }], "risksAndMitigations": [{ "risk": string, "mitigation": string }] }.',
          'Funnel plan must cover Awareness, Consideration, and Conversion stages at minimum. Channels and offers must be specific to this business.',
          '90-day plan should have 8 to 12 weekly entries grouping related activities. KPIs must be measurable metrics with clear units.'
        ].join(' '),
      };
    case 'sales_enablement':
      return {
        temperature: 0.25,
        maxCompletionTokens: 2200,
        systemPrompt: [
          'You are a sales enablement expert building sales assets for a company.',
          ...sharedRules,
          'Output JSON shape: { "battlecards": [{ "competitor": string, "strengths": string[], "weaknesses": string[], "differentiators": string[], "objectionHandlers": [{ "objection": string, "response": string }] }], "demoScripts": { "5min": string, "15min": string, "30min": string }, "objectionHandlers": [{ "category": string, "objection": string, "response": string, "supportingData": string }], "pricingGuidance": { "tierRecommendations": string, "discountStrategy": string, "valueJustification": string, "competitivePositioning": string } }.',
          'Provide 2 to 4 competitor battlecards. Each battlecard needs 3 to 5 strengths/weaknesses and 2 to 4 objection handlers.',
          'Demo scripts should be narrative, not bullet points. Objection handlers must address real sales-call objections specific to this industry.'
        ].join(' '),
      };
    case 'content_strategy':
      return {
        temperature: 0.2,
        maxCompletionTokens: 1800,
        systemPrompt: [
          'You are a content strategist building a sustainable content plan.',
          ...sharedRules,
          'Output JSON shape: { "contentPillars": [{ "name": string, "purpose": string, "exampleTopics": string[] }], "formats": string[], "distributionRules": string[], "repurposingPlan": string[], "governance": { "reviewChecklist": string[] } }.',
          'Define 3 to 5 content pillars. Each pillar needs 4 to 8 example topics specific to the company and sector.',
          'Formats should be concrete asset types (e.g., "900-word LinkedIn article", "60s explainer video", not just "videos").',
          'Distribution rules must describe when, where, and how to share each format. Repurposing plan must map one format to at least two downstream uses.'
        ].join(' '),
      };
    case 'lead_magnets':
      return {
        temperature: 0.25,
        maxCompletionTokens: 2000,
        systemPrompt: [
          'You are a demand generation strategist designing high-converting lead magnets.',
          ...sharedRules,
          'Output JSON shape: { "leadMagnets": [{ "name": string, "format": string, "promise": string, "outline": string[], "landingPageCopy": { "headline": string, "subheadline": string, "bullets": string[], "cta": string }, "followUpSequence": [{ "day": number, "subject": string, "goal": string }] }], "notes": string[] }.',
          'Provide 3 to 5 lead magnets spanning different funnel stages and formats (e.g., checklist, calculator, guide, webinar, audit).',
          'Each lead magnet outline should have 4 to 8 specific sections. Landing page bullets must describe concrete benefits, not features.',
          'Follow-up sequence must have 3 to 5 emails spaced across 14 days. Subject lines must be specific, not generic templates.'
        ].join(' '),
      };
    default:
      return {
        temperature: 0.3,
        maxCompletionTokens: 1024,
        systemPrompt: `You are an expert marketing strategist. Generate ${type} for ${companyName}. Return valid JSON only. Use arrays for lists, double-quoted keys, and no markdown.`,
      };
  }
}

function normalizeSocialCalendar(raw) {
  const data = asObject(raw);
  const sourceItems = asArray(data.items).length
    ? asArray(data.items)
    : asArray(data.calendarItems).length
      ? asArray(data.calendarItems)
      : asArray(data.social_calendar).flatMap((week) => asArray(asObject(week).posts));

  const items = sourceItems.map((item, index) => {
    const row = asObject(item);
    return {
      date: cleanText(row.date, fallbackStartDate()),
      channel: cleanText(row.channel || row.platform, 'LinkedIn'),
      format: cleanText(row.format || row.contentType, 'Post'),
      pillar: cleanText(row.pillar || row.theme, `Theme ${index + 1}`),
      hook: cleanText(row.hook || row.topic || row.title, 'Share a company-specific insight'),
      captionBrief: cleanText(row.captionBrief || row.caption || row.description, 'Summarize the insight with a concrete takeaway and a clear next step.'),
      cta: cleanText(row.cta || row.callToAction, 'Learn more on the website'),
      assetNotes: stripUrls(row.assetNotes || row.asset_brief || row.assetBrief) || 'Pair with a clean static, chart, or short expert-led video asset.',
      complianceNote: cleanText(row.complianceNote || row.disclaimer || row.compliance, 'Validate factual and regulatory statements before publishing.')
    };
  }).filter((item) => item.hook);

  return {
    timezone: cleanText(data.timezone, 'Asia/Kolkata'),
    startDate: cleanText(data.startDate, items[0]?.date || fallbackStartDate()),
    weeks: Number.isFinite(Number(data.weeks)) ? Number(data.weeks) : 4,
    channels: uniqueStrings([
      ...asArray(data.channels),
      ...items.map((item) => item.channel)
    ], 8),
    cadence: {
      postsPerWeek: Number.isFinite(Number(asObject(data.cadence).postsPerWeek))
        ? Number(asObject(data.cadence).postsPerWeek)
        : Math.max(3, Math.ceil(items.length / 4) || 3)
    },
    themes: uniqueStrings([
      ...asArray(data.themes),
      ...items.map((item) => item.pillar)
    ], 10),
    items
  };
}

function normalizeLookalikeAudiences(raw) {
  const data = asObject(raw);
  const sourceLookalikes = asArray(data.lookalikes).length
    ? asArray(data.lookalikes)
    : asArray(data.lookalike_audiences);

  return {
    seedAudiences: uniqueStrings([
      ...asArray(data.seedAudiences),
      ...asArray(data.seed_audiences),
      ...asArray(data.audienceSeeds)
    ], 10),
    lookalikes: sourceLookalikes.map((entry, index) => {
      const row = asObject(entry);
      return {
        platform: cleanText(row.platform, `Platform ${index + 1}`),
        targeting: uniqueStrings([
          ...asArray(row.targeting),
          ...asArray(row.targeting_details),
          ...asArray(row.audiences)
        ], 10),
        exclusions: uniqueStrings([
          ...asArray(row.exclusions),
          ...asArray(row.exclude),
          ...asArray(row.negativeAudiences)
        ], 8),
        creativeAngles: uniqueStrings([
          ...asArray(row.creativeAngles),
          ...asArray(row.creative_angles),
          ...asArray(row.messaging)
        ], 8)
      };
    }).filter((entry) => entry.platform && (entry.targeting.length || entry.creativeAngles.length)),
    measurement: uniqueStrings([
      ...asArray(data.measurement),
      ...asArray(data.measurementPlan),
      ...asArray(data.successMetrics)
    ], 8)
  };
}

function normalizeCompetitorIntelligence(raw) {
  const data = asObject(raw);
  const comparison = asObject(data.comparison);
  const competitorRows = asArray(data.topCompetitors).length
    ? asArray(data.topCompetitors)
    : asArray(data.competitors).length
      ? asArray(data.competitors)
      : asArray(data.alternatives);

  return {
    topCompetitors: competitorRows.map((entry) => {
      const row = asObject(entry);
      return {
        name: cleanText(row.name || row.competitor || row.brand, 'Unknown competitor'),
        website: cleanText(row.website || row.url || row.domain),
        whyRelevant: cleanText(row.whyRelevant || row.relevance, 'Competes for similar customers or attention.'),
        positioningSnapshot: cleanText(row.positioningSnapshot || row.positioning, 'Positioning summary unavailable.'),
        strengths: uniqueStrings(asArray(row.strengths).concat(asArray(row.pros)), 6),
        weaknesses: uniqueStrings(asArray(row.weaknesses).concat(asArray(row.cons)), 6)
      };
    }).filter((entry) => entry.name && entry.positioningSnapshot),
    comparison: {
      yourDifferentiators: uniqueStrings(
        asArray(comparison.yourDifferentiators).concat(asArray(data.yourDifferentiators)).concat(asArray(data.differentiators)),
        10
      ),
      messagingGaps: uniqueStrings(
        asArray(comparison.messagingGaps).concat(asArray(data.messagingGaps)).concat(asArray(data.gaps)),
        10
      ),
      opportunities: uniqueStrings(
        asArray(comparison.opportunities).concat(asArray(data.opportunities)).concat(asArray(data.whiteSpace)),
        10
      )
    }
  };
}

function normalizePositioningMessaging(raw) {
  const data = asObject(raw);
  return {
    valueProposition: cleanText(data.valueProposition),
    differentiators: uniqueStrings(asArray(data.differentiators), 8),
    messagingPillars: asArray(data.messagingPillars).map((entry) => {
      const row = asObject(entry);
      return {
        pillar: cleanText(row.pillar),
        description: cleanText(row.description),
        audienceRelevance: cleanText(row.audienceRelevance)
      };
    }).filter((entry) => entry.pillar && entry.description),
    brandVoice: {
      tone: uniqueStrings(asArray(asObject(data.brandVoice).tone), 6),
      dosList: uniqueStrings(asArray(asObject(data.brandVoice).dosList), 8),
      dontsList: uniqueStrings(asArray(asObject(data.brandVoice).dontsList), 8)
    },
    elevatorPitches: {
      short: cleanText(asObject(data.elevatorPitches).short),
      medium: cleanText(asObject(data.elevatorPitches).medium),
      long: cleanText(asObject(data.elevatorPitches).long)
    }
  };
}

function normalizePricingIntelligence(raw) {
  const data = asObject(raw);
  return {
    pricingModelSummary: compactSentence(data.pricingModelSummary),
    publicPricingVisibility: cleanText(data.publicPricingVisibility, 'Unknown'),
    competitorBenchmarks: asArray(data.competitorBenchmarks).map((entry) => {
      const row = asObject(entry);
      return {
        name: cleanText(row.name),
        pricingModel: compactSentence(row.pricingModel),
        startingPoint: compactSentence(row.startingPoint),
        notes: compactSentence(row.notes)
      };
    }).filter((entry) => entry.name && entry.pricingModel),
    packagingRecommendations: asArray(data.packagingRecommendations).map((entry) => {
      const row = asObject(entry);
      return {
        offer: cleanText(row.offer),
        targetCustomer: cleanText(row.targetCustomer),
        pricingApproach: compactSentence(row.pricingApproach),
        rationale: compactSentence(row.rationale)
      };
    }).filter((entry) => entry.offer && entry.targetCustomer),
    valueMetrics: uniqueStrings(asArray(data.valueMetrics), 8),
    risks: uniqueStrings(asArray(data.risks), 8),
    nextQuestions: uniqueStrings(asArray(data.nextQuestions), 8)
  };
}

function normalizeChannelStrategy(raw) {
  const data = asObject(raw);
  const sourceChannels = asArray(data.channels).length
    ? asArray(data.channels)
    : asArray(data.channelStrategy);

  return {
    channels: sourceChannels.map((entry) => {
      const row = asObject(entry);
      return {
        name: cleanText(row.name || row.channel),
        role: compactSentence(row.role || row.description),
        cadence: compactSentence(row.cadence),
        contentMix: uniqueStrings([
          ...asArray(row.contentMix),
          ...asArray(row.tactics),
          ...asArray(row.contentTypes)
        ], 8),
        growthLoops: uniqueStrings([
          ...asArray(row.growthLoops),
          ...asArray(row.loops),
          ...asArray(row.feedbackLoops)
        ], 6)
      };
    }).filter((entry) => entry.name && entry.role),
    budgetSplitGuidance: uniqueStrings([
      ...asArray(data.budgetSplitGuidance),
      ...asArray(data.budgetSplit),
      ...asArray(data.budgetGuidance)
    ], 8),
    measurement: uniqueStrings([
      ...asArray(data.measurement),
      ...asArray(data.metrics),
      ...asArray(data.measurementPlan)
    ], 8)
  };
}

function normalizeWebsiteAudit(raw) {
  const data = asObject(raw);
  const first = asObject(data.firstImpression);
  const funnel = asObject(data.conversionFunnel);
  const copy = asObject(data.copyRecommendations);
  const ux = asObject(data.uxRecommendations);
  return {
    summary: cleanText(data.summary),
    firstImpression: {
      clarityScore: Number.isFinite(Number(first.clarityScore)) ? Math.round(Number(first.clarityScore)) : null,
      trustScore: Number.isFinite(Number(first.trustScore)) ? Math.round(Number(first.trustScore)) : null,
      visualHierarchyScore: Number.isFinite(Number(first.visualHierarchyScore)) ? Math.round(Number(first.visualHierarchyScore)) : null
    },
    conversionFunnel: {
      primaryCta: cleanText(funnel.primaryCta),
      recommendedCtas: uniqueStrings(asArray(funnel.recommendedCtas), 8),
      frictionPoints: uniqueStrings(asArray(funnel.frictionPoints), 10)
    },
    copyRecommendations: {
      headlineOptions: uniqueStrings(asArray(copy.headlineOptions), 8),
      ctaCopyOptions: uniqueStrings(asArray(copy.ctaCopyOptions), 8)
    },
    uxRecommendations: {
      quickWins: uniqueStrings(asArray(ux.quickWins), 10),
      highImpactChanges: uniqueStrings(asArray(ux.highImpactChanges), 10)
    },
    homepageSections: asArray(data.homepageSections).map((s) => {
      const row = asObject(s);
      return {
        section: cleanText(row.section, 'Section'),
        whatWorks: uniqueStrings(asArray(row.whatWorks), 6),
        issues: uniqueStrings(asArray(row.issues), 6),
        recommendations: uniqueStrings(asArray(row.recommendations), 6)
      };
    }).filter((s) => s.section),
    experiments: asArray(data.experiments).map((e) => {
      const row = asObject(e);
      return {
        name: cleanText(row.name, 'Experiment'),
        hypothesis: cleanText(row.hypothesis),
        successMetric: cleanText(row.successMetric),
        implementation: uniqueStrings(asArray(row.implementation), 6)
      };
    }).filter((e) => e.name),
    priorityPlan: asArray(data.priorityPlan).map((p) => {
      const row = asObject(p);
      return {
        task: cleanText(row.task, 'Task'),
        priority: cleanText(row.priority, 'medium'),
        why: cleanText(row.why),
        effort: cleanText(row.effort),
        ownerHint: cleanText(row.ownerHint)
      };
    }).filter((p) => p.task)
  };
}

function normalizeOpportunities(raw) {
  const data = asObject(raw);
  return {
    summary: cleanText(data.summary),
    quickWins: asArray(data.quickWins).map((w) => {
      const row = asObject(w);
      return {
        title: cleanText(row.title, 'Quick win'),
        priority: cleanText(row.priority, 'medium'),
        description: cleanText(row.description),
        expectedImpact: cleanText(row.expectedImpact),
        timeToValue: cleanText(row.timeToValue)
      };
    }).filter((w) => w.title),
    opportunities: asArray(data.opportunities).map((o) => {
      const row = asObject(o);
      return {
        title: cleanText(row.title, 'Opportunity'),
        category: cleanText(row.category),
        priority: cleanText(row.priority, 'medium'),
        effort: cleanText(row.effort),
        expectedImpact: cleanText(row.expectedImpact),
        nextSteps: uniqueStrings(asArray(row.nextSteps).concat(row.nextStep ? [row.nextStep] : []), 6)
      };
    }).filter((o) => o.title),
    risksAndMitigations: asArray(data.risksAndMitigations).map((r) => {
      if (typeof r === 'string') return { risk: r, mitigation: '' };
      const row = asObject(r);
      return { risk: cleanText(row.risk), mitigation: cleanText(row.mitigation) };
    }).filter((r) => r.risk),
    '90DayPlan': asArray(data['90DayPlan'] || data.ninetyDayPlan).map((w, idx) => {
      const row = asObject(w);
      return {
        week: Number.isFinite(Number(row.week)) ? Number(row.week) : idx + 1,
        focus: cleanText(row.focus),
        keyActivities: uniqueStrings(asArray(row.keyActivities), 8)
      };
    }).filter((w) => w.focus)
  };
}

function normalizeIcps(raw) {
  const data = asObject(raw);
  return {
    icps: asArray(data.icps).map((icp, idx) => {
      const row = asObject(icp);
      return {
        name: cleanText(row.name, `ICP ${idx + 1}`),
        who: cleanText(row.who),
        hook: cleanText(row.hook),
        channels: uniqueStrings(asArray(row.channels), 8),
        qualifiers: uniqueStrings(asArray(row.qualifiers), 8),
        disqualifiers: uniqueStrings(asArray(row.disqualifiers), 8)
      };
    }).filter((icp) => icp.name),
    cohorts: asArray(data.cohorts).map((c, idx) => {
      const row = asObject(c);
      return {
        name: cleanText(row.name, `Cohort ${idx + 1}`),
        priority: Number.isFinite(Number(row.priority)) ? Number(row.priority) : idx + 1,
        definition: cleanText(row.definition),
        messagingAngle: cleanText(row.messagingAngle)
      };
    }).filter((c) => c.name),
    notes: uniqueStrings(asArray(data.notes), 10)
  };
}

function normalizeClientProfiling(raw) {
  const data = asObject(raw);
  return {
    segments: asArray(data.segments).map((s, idx) => {
      const row = asObject(s);
      return {
        name: cleanText(row.name, `Segment ${idx + 1}`),
        profile: cleanText(row.profile),
        jobsToBeDone: uniqueStrings(asArray(row.jobsToBeDone), 8),
        painPoints: uniqueStrings(asArray(row.painPoints), 8),
        objections: uniqueStrings(asArray(row.objections), 6),
        triggers: uniqueStrings(asArray(row.triggers), 6),
        channels: uniqueStrings(asArray(row.channels), 6)
      };
    }).filter((s) => s.name),
    insights: uniqueStrings(asArray(data.insights), 10)
  };
}

function normalizePartnerProfiling(raw) {
  const data = asObject(raw);
  return {
    partnerTypes: asArray(data.partnerTypes).map((p, idx) => {
      const row = asObject(p);
      return {
        name: cleanText(row.name, `Partner ${idx + 1}`),
        valueExchange: cleanText(row.valueExchange),
        selectionCriteria: uniqueStrings(asArray(row.selectionCriteria), 10),
        activationPlaybook: uniqueStrings(asArray(row.activationPlaybook), 10)
      };
    }).filter((p) => p.name),
    insights: uniqueStrings(asArray(data.insights), 10)
  };
}

function normalizeMarketingStrategy(raw) {
  const data = asObject(raw);
  return {
    objective: cleanText(data.objective),
    positioning: cleanText(data.positioning),
    targetSegments: uniqueStrings(asArray(data.targetSegments), 10),
    messagingPillars: uniqueStrings(asArray(data.messagingPillars), 8),
    kpis: uniqueStrings(asArray(data.kpis), 10),
    funnelPlan: asArray(data.funnelPlan).map((s, idx) => {
      const row = asObject(s);
      return {
        stage: cleanText(row.stage, `Stage ${idx + 1}`),
        goal: cleanText(row.goal),
        channels: uniqueStrings(asArray(row.channels).concat(typeof row.channels === 'string' ? [row.channels] : []), 6),
        offers: uniqueStrings(asArray(row.offers).concat(typeof row.offers === 'string' ? [row.offers] : []), 6)
      };
    }).filter((s) => s.stage),
    '90DayPlan': asArray(data['90DayPlan'] || data.ninetyDayPlan).map((w, idx) => {
      const row = asObject(w);
      return {
        week: Number.isFinite(Number(row.week)) ? Number(row.week) : idx + 1,
        focus: cleanText(row.focus),
        keyActivities: uniqueStrings(asArray(row.keyActivities), 8)
      };
    }).filter((w) => w.focus),
    risksAndMitigations: asArray(data.risksAndMitigations).map((r) => {
      if (typeof r === 'string') return { risk: r, mitigation: '' };
      const row = asObject(r);
      return { risk: cleanText(row.risk), mitigation: cleanText(row.mitigation) };
    }).filter((r) => r.risk)
  };
}

function normalizeContentStrategy(raw) {
  const data = asObject(raw);
  const governance = asObject(data.governance);
  return {
    contentPillars: asArray(data.contentPillars).map((p, idx) => {
      const row = asObject(p);
      return {
        name: cleanText(row.name, `Pillar ${idx + 1}`),
        purpose: cleanText(row.purpose),
        exampleTopics: uniqueStrings(asArray(row.exampleTopics), 10)
      };
    }).filter((p) => p.name),
    formats: uniqueStrings(asArray(data.formats), 12),
    distributionRules: uniqueStrings(asArray(data.distributionRules), 12),
    repurposingPlan: uniqueStrings(asArray(data.repurposingPlan), 10),
    governance: {
      reviewChecklist: uniqueStrings(asArray(governance.reviewChecklist), 12)
    }
  };
}

function normalizeLeadMagnets(raw) {
  const data = asObject(raw);
  return {
    leadMagnets: asArray(data.leadMagnets).map((m, idx) => {
      const row = asObject(m);
      const lp = asObject(row.landingPageCopy);
      return {
        name: cleanText(row.name, `Lead Magnet ${idx + 1}`),
        format: cleanText(row.format),
        promise: cleanText(row.promise),
        outline: uniqueStrings(asArray(row.outline), 10),
        landingPageCopy: {
          headline: cleanText(lp.headline),
          subheadline: cleanText(lp.subheadline),
          bullets: uniqueStrings(asArray(lp.bullets), 8),
          cta: cleanText(lp.cta)
        },
        followUpSequence: asArray(row.followUpSequence).map((f, fIdx) => {
          const fe = asObject(f);
          return {
            day: Number.isFinite(Number(fe.day)) ? Number(fe.day) : fIdx + 1,
            subject: cleanText(fe.subject),
            goal: cleanText(fe.goal)
          };
        }).filter((f) => f.subject)
      };
    }).filter((m) => m.name),
    notes: uniqueStrings(asArray(data.notes), 10)
  };
}

function normalizeArtifact(type, raw) {
  switch (type) {
    case 'social_calendar':
      return normalizeSocialCalendar(raw);
    case 'lookalike_audiences':
      return normalizeLookalikeAudiences(raw);
    case 'competitor_intelligence':
      return normalizeCompetitorIntelligence(raw);
    case 'positioning_messaging':
      return normalizePositioningMessaging(raw);
    case 'pricing_intelligence':
      return normalizePricingIntelligence(raw);
    case 'channel_strategy':
      return normalizeChannelStrategy(raw);
    case 'website_audit':
      return normalizeWebsiteAudit(raw);
    case 'opportunities':
      return normalizeOpportunities(raw);
    case 'icps':
      return normalizeIcps(raw);
    case 'client_profiling':
      return normalizeClientProfiling(raw);
    case 'partner_profiling':
      return normalizePartnerProfiling(raw);
    case 'marketing_strategy':
      return normalizeMarketingStrategy(raw);
    case 'content_strategy':
      return normalizeContentStrategy(raw);
    case 'lead_magnets':
      return normalizeLeadMagnets(raw);
    default:
      return raw;
  }
}

async function generateArtifactWithGroq(type, companyName, inputs) {
  let lastError = null;
  const spec = buildArtifactSpec(type, companyName, inputs);

  for (const model of COMPANY_INTEL_GROQ_MODELS) {
    const messages = [
      {
        role: 'system',
        content: spec.systemPrompt
      },
      {
        role: 'user',
        content: `Inputs: ${JSON.stringify(inputs)}`
      }
    ];

    try {
      console.log(`[QueueWorker] Trying Groq model "${model}" for ${type}...`);
      const completion = await groq.chat.completions.create({
        model,
        messages,
        temperature: spec.temperature,
        ...(model === 'groq/compound'
          ? {
            max_completion_tokens: spec.maxCompletionTokens,
            top_p: 1,
            compound_custom: {
              tools: {
                enabled_tools: ['web_search', 'visit_website']
              }
            }
          }
          : {
            response_format: { type: 'json_object' }
          })
      });
      console.log(`[QueueWorker] Groq model "${model}" succeeded for ${type}.`);
      return JSON.parse(completion.choices[0]?.message?.content?.trim() || '{}');
    } catch (error) {
      lastError = error;
      try {
        console.log(`[QueueWorker] Retrying Groq model "${model}" for ${type} with strict JSON recovery...`);
        const completion = await groq.chat.completions.create({
          model,
          messages: [
            ...messages,
            {
              role: 'user',
              content: 'Your last response must be strict JSON. Return only one valid JSON object with no markdown or commentary.'
            }
          ],
          temperature: Math.min(spec.temperature, 0.2),
          ...(model === 'groq/compound'
            ? {
              max_completion_tokens: spec.maxCompletionTokens,
              top_p: 1,
              compound_custom: {
                tools: {
                  enabled_tools: ['web_search', 'visit_website']
                }
              }
            }
            : {})
        });

        const raw = completion.choices[0]?.message?.content?.trim() || '';
        const candidate = extractJsonObject(raw);
        if (!candidate) throw error;
        console.log(`[QueueWorker] Groq model "${model}" recovered valid JSON for ${type}.`);
        return JSON.parse(candidate);
      } catch (retryError) {
        lastError = retryError;
      }
    }
  }

  throw lastError;
}

/**
 * Poller that checks Supabase logic via the Atomic take_next_job RPC.
 */
async function processQueue() {
  if (activeWorkers >= MAX_CONCURRENCY) return;

  let job = null;

  // 1. Try to pop a job from Postgres via Supabase RPC (Atomic Lock)
  if (supabase) {
    try {
      const { data, error } = await supabase.rpc('take_next_job');
      if (!error && data && data.length > 0) {
        job = {
          jobId: data[0].id,
          companyId: data[0].company_id,
          type: data[0].artifact_type,
          inputs: data[0].inputs,
          fromSupabase: true
        };
      }
    } catch (err) {
      // Silent fail on polling errors to prevent log spam
    }
  }

  // 2. If no Supabase job (or it errored out), try the fallback in-memory queue
  if (!job && inMemoryQueue.length > 0) {
    job = inMemoryQueue.shift();
  }

  // If we grabbed a job, process it and then immediately attempt to grab another
  if (job) {
    activeWorkers++;
    processJob(job).finally(() => {
      activeWorkers--;
      setImmediate(processQueue);
    });
  }
}

/**
 * Execute the generation job (via CrewAI or fallback Groq)
 */
async function processJob(job) {
  const { jobId, companyId, type, inputs, fromSupabase } = job;

  // Need to load the company data context
  const companyData = await loadCompanyWithArtifacts(companyId);
  if (!companyData) {
    console.warn(`[QueueWorker] ❌ Skipping job: Cannot load company context for ${companyId}`);
    if (fromSupabase) await updateJobStatus(jobId, 'failed', 'Company data not found');
    return;
  }

  const { companyName, websiteUrl, profile } = companyData.company;
  console.log(`[QueueWorker] Generating ${type} for ${companyName}...`);

  try {
    const now = new Date().toISOString()
    const directGroqData = await generateArtifactWithGroq(type, companyName, {
      ...(inputs || {}),
      websiteUrl,
      companyProfile: profile
    });
    const artifact = { type, updatedAt: now, data: normalizeArtifact(type, directGroqData) };
    await saveArtifact(companyId, artifact)
    _notifyArtifactReady(companyId, type, artifact);
    console.log(`[QueueWorker] ✅ Completed ${type} for ${companyName} via direct Groq.`);
    if (fromSupabase) await updateJobStatus(jobId, 'completed');
  } catch (groqErr) {
    const errorMessage = groqErr instanceof Error ? groqErr.message : String(groqErr);
    console.log(`[QueueWorker] Direct Groq failed (${errorMessage}). Falling back to CrewAI for ${type}...`);
    try {
      const CREWAI_URL = process.env.CREWAI_URL || 'http://localhost:8002';
      const resp = await fetch(`${CREWAI_URL}/api/crewai/company-intel/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_name: companyName, company_url: websiteUrl, artifact_type: type, inputs, company_profile: profile })
      });

      if (!resp.ok) {
        throw new Error(`CrewAI responded with ${resp.status}`);
      }

      const crewData = await resp.json();
      if (crewData.status === 'failed') {
        throw new Error(crewData.error || 'CrewAI generation failed');
      }

      const now = new Date().toISOString()
      const artifact = { type, updatedAt: crewData.generated_at || now, data: crewData.data }
      await saveArtifact(companyId, artifact);
      _notifyArtifactReady(companyId, type, artifact);
      console.log(`[QueueWorker] ✅ Completed ${type} via CrewAI fallback.`);
      if (fromSupabase) await updateJobStatus(jobId, 'completed');
    } catch (fallbackErr) {
      const fallbackMessage = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      console.error(`[QueueWorker] ❌ Error on ${type}:`, fallbackMessage);
      if (fromSupabase) await updateJobStatus(jobId, 'failed', fallbackMessage);
      _notifyArtifactFailed(companyId, type, fallbackMessage);
    }
  }
}

/**
 * Mark a supabase job as completed or failed
 */
async function updateJobStatus(jobId, status, errorMessage = null) {
  if (!supabase) return;
  try {
    const payload = { status, updated_at: new Date().toISOString() };
    if (status === 'completed' || status === 'failed') payload.completed_at = payload.updated_at;
    if (errorMessage) payload.error_message = errorMessage;

    await supabase.from('generation_jobs').update(payload).eq('id', jobId);
  } catch (err) { }
}

/**
 * Enqueue helper: pushes to the Supabase Postgres Queue table safely,
 * or falls back to an in-memory queue array.
 */
export async function enqueueGeneration(companyData, type, inputs) {
  if (supabase) {
    try {
      const payload = {
        company_id: companyData.id,
        artifact_type: type,
        inputs: inputs || {},
        status: 'pending', // Re-queue if it previously failed
        error_message: null
      };

      const { error } = await supabase
        .from('generation_jobs')
        .upsert(payload, { onConflict: 'company_id,artifact_type' });

      if (error) {
        if (error.code === '42P01') console.warn('⚠️ Supabase: "generation_jobs" table does not exist. (Did you run the SQL script?) Falling back to Memory Queue.');
        else console.warn(`⚠️ Supabase Job insertion error: ${error.message}`);
        inMemoryQueue.push({ companyId: companyData.id, type, inputs, fromSupabase: false });
      }
    } catch (err) {
      inMemoryQueue.push({ companyId: companyData.id, type, inputs, fromSupabase: false });
    }
  } else {
    // Basic fallback purely to Node memory if env vars were never set
    inMemoryQueue.push({ companyId: companyData.id, type, inputs, fromSupabase: false });
  }

  // Attempt to immediately process logic if there are empty concurrency slots
  processQueue();
}

/**
 * Starts the polling worker to pull jobs from the Supabase Postgres Queue.
 */
export function startWorker() {
  console.log('[QueueWorker] Started listening for Postgres/Memory jobs (Concurrency max: 3).');
  // Poll every 5 seconds for new DB jobs or memory jobs
  workerInterval = setInterval(processQueue, 5000);
  // Also kick off immediately on boot
  processQueue();
}
