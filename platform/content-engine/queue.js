import { GoogleGenAI } from '@google/genai';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  getSupabaseReadClient,
  getSupabaseWriteClient,
  loadCompanyWithArtifacts,
  saveArtifact,
  supabase,
} from './supabase.js';
import { tracedLLM } from './langfuse.js';
import { getLLMModel, LLM_PROVIDER, isGroqProvider } from './llm-client.js';

const groq = tracedLLM({ traceName: 'company-intel', tags: ['company-intel', 'queue'] });
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
const gemini = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;
// Respect explicit COMPANY_INTEL_PRIMARY_PROVIDER override; otherwise follow LLM_PROVIDER.
const COMPANY_INTEL_PRIMARY_PROVIDER = (
  process.env.COMPANY_INTEL_PRIMARY_PROVIDER || LLM_PROVIDER
).toLowerCase();
const COMPANY_INTEL_GEMINI_MODEL =
  process.env.COMPANY_INTEL_GEMINI_MODEL ||
  process.env.GEMINI_PRIMARY_MODEL ||
  'gemini-3.1-pro-preview';
const GEMINI_THINKING_LEVEL =
  process.env.GEMINI_THINKING_LEVEL ||
  process.env.COMPANY_INTEL_GEMINI_THINKING_LEVEL ||
  'medium';
const COMPANY_INTEL_GROQ_MODELS = [
  getLLMModel('company-intel'),
  ...(isGroqProvider ? ['llama-3.3-70b-versatile'] : []),
];
const GEMINI_JSON_REPAIR_GROQ_MODELS = [
  process.env.GEMINI_JSON_REPAIR_MODEL || 'openai/gpt-oss-20b',
  'groq/compound-mini',
].filter((model, index, models) => model && models.indexOf(model) === index);
const GEMINI_DEBUG_DIR = process.env.COMPANY_INTEL_GEMINI_DEBUG_DIR || '/tmp/marqq-gemini-debug';
const COMPANY_INTEL_TRACE_DIR = process.env.COMPANY_INTEL_TRACE_DIR || join(process.cwd(), 'logs', 'company-intel-traces');

// Gemini hits per-model RPM limits quickly during full 15-artifact generation,
// so keep the queue effectively sequential when Gemini is the primary provider.
const MAX_CONCURRENCY = COMPANY_INTEL_PRIMARY_PROVIDER === 'gemini' ? 1 : 3;
let activeWorkers = 0;
let workerInterval = null;

// Fallback pure-memory queue if Supabase is strictly down/unavailable
const inMemoryQueue = [];
const companyContextCache = new Map();

// Per-company callbacks so callers (backend-server) can update in-memory state
// as each artifact completes, without creating circular module dependencies.
const _artifactCallbacks = new Map();  // companyId → (companyId, type, artifact) => void
const _artifactFailCallbacks = new Map(); // companyId → (companyId, type, errMsg) => void

function getQueueReadClient() {
  return getSupabaseReadClient() || supabase
}

function getQueueWriteClient() {
  return getSupabaseWriteClient() || supabase
}

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
  const cached = companyContextCache.get(companyId);
  if (cached) {
    cached.artifacts = {
      ...(cached.artifacts || {}),
      [type]: artifact,
    };
    companyContextCache.set(companyId, cached);
  }
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

function clampScore(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function summarizeArtifactsForPrompt(type, artifacts) {
  const map = asObject(artifacts);
  if (!Object.keys(map).length) return undefined;

  const include = {};

  if (type === 'sales_enablement') {
    const competitor = asObject(asObject(map.competitor_intelligence).data);
    const positioning = asObject(asObject(map.positioning_messaging).data);
    const pricing = asObject(asObject(map.pricing_intelligence).data);

    if (Object.keys(competitor).length) {
      include.competitor_intelligence = {
        topCompetitors: asArray(competitor.topCompetitors).slice(0, 4),
        comparison: asObject(competitor.comparison),
      };
    }
    if (Object.keys(positioning).length) {
      include.positioning_messaging = {
        valueProposition: positioning.valueProposition,
        differentiators: asArray(positioning.differentiators).slice(0, 6),
        messagingPillars: asArray(positioning.messagingPillars).slice(0, 4),
      };
    }
    if (Object.keys(pricing).length) {
      include.pricing_intelligence = {
        pricingModelSummary: pricing.pricingModelSummary,
        packagingRecommendations: asArray(pricing.packagingRecommendations).slice(0, 3),
        valueMetrics: asArray(pricing.valueMetrics).slice(0, 6),
      };
    }
  }

  if (type === 'lookalike_audiences') {
    const icps = asObject(asObject(map.icps).data);
    const clients = asObject(asObject(map.client_profiling).data);
    const offers = asObject(asObject(map.company_profile).data);

    if (Object.keys(icps).length) {
      include.icps = {
        icps: asArray(icps.icps).slice(0, 4),
        cohorts: asArray(icps.cohorts).slice(0, 4),
      };
    }
    if (Object.keys(clients).length) {
      include.client_profiling = {
        segments: asArray(clients.segments).slice(0, 4),
        insights: asArray(clients.insights).slice(0, 6),
      };
    }
    if (Object.keys(offers).length) {
      include.company_profile = {
        offerings: asArray(offers.offerings).slice(0, 6),
        primaryAudience: asArray(offers.primaryAudience).slice(0, 6),
      };
    }
  }

  if (type === 'channel_strategy') {
    const icps = asObject(asObject(map.icps).data);
    const content = asObject(asObject(map.content_strategy).data);
    const social = asObject(asObject(map.social_calendar).data);
    const opportunities = asObject(asObject(map.opportunities).data);

    if (Object.keys(icps).length) {
      include.icps = {
        icps: asArray(icps.icps).slice(0, 4),
      };
    }
    if (Object.keys(content).length) {
      include.content_strategy = {
        contentPillars: asArray(content.contentPillars).slice(0, 4),
        formats: asArray(content.formats).slice(0, 6),
        distributionRules: asArray(content.distributionRules).slice(0, 6),
      };
    }
    if (Object.keys(social).length) {
      include.social_calendar = {
        channels: asArray(social.channels).slice(0, 6),
        themes: asArray(social.themes).slice(0, 6),
      };
    }
    if (Object.keys(opportunities).length) {
      include.opportunities = {
        quickWins: asArray(opportunities.quickWins).slice(0, 3),
        opportunities: asArray(opportunities.opportunities).slice(0, 4),
      };
    }
  }

  if (type === 'marketing_strategy') {
    const profile = asObject(asObject(map.company_profile).data);
    const positioning = asObject(asObject(map.positioning_messaging).data);
    const icps = asObject(asObject(map.icps).data);
    const opportunities = asObject(asObject(map.opportunities).data);
    const channel = asObject(asObject(map.channel_strategy).data);

    if (Object.keys(profile).length) {
      include.company_profile = {
        offerings: asArray(profile.offerings).slice(0, 6),
        primaryAudience: asArray(profile.primaryAudience).slice(0, 6),
        geoFocus: asArray(profile.geoFocus).slice(0, 4),
      };
    }
    if (Object.keys(positioning).length) {
      include.positioning_messaging = {
        valueProposition: positioning.valueProposition,
        differentiators: asArray(positioning.differentiators).slice(0, 6),
        messagingPillars: asArray(positioning.messagingPillars).slice(0, 4),
      };
    }
    if (Object.keys(icps).length) {
      include.icps = {
        icps: asArray(icps.icps).slice(0, 4),
        cohorts: asArray(icps.cohorts).slice(0, 4),
      };
    }
    if (Object.keys(opportunities).length) {
      include.opportunities = {
        quickWins: asArray(opportunities.quickWins).slice(0, 3),
        opportunities: asArray(opportunities.opportunities).slice(0, 4),
      };
    }
    if (Object.keys(channel).length) {
      include.channel_strategy = {
        channels: asArray(channel.channels).slice(0, 5),
        budgetSplitGuidance: asArray(channel.budgetSplitGuidance).slice(0, 5),
      };
    }
  }

  if (type === 'competitor_intelligence') {
    const profile = asObject(asObject(map.company_profile).data);
    const positioning = asObject(asObject(map.positioning_messaging).data);
    const icps = asObject(asObject(map.icps).data);

    if (Object.keys(profile).length) {
      include.company_profile = {
        offerings: asArray(profile.offerings).slice(0, 6),
        productsServices: asArray(profile.productsServices).slice(0, 4),
        primaryAudience: asArray(profile.primaryAudience).slice(0, 6),
        geoFocus: asArray(profile.geoFocus).slice(0, 4),
      };
    }
    if (Object.keys(positioning).length) {
      include.positioning_messaging = {
        valueProposition: positioning.valueProposition,
        differentiators: asArray(positioning.differentiators).slice(0, 6),
      };
    }
    if (Object.keys(icps).length) {
      include.icps = {
        icps: asArray(icps.icps).slice(0, 4),
      };
    }
  }

  if (type === 'positioning_messaging') {
    const profile = asObject(asObject(map.company_profile).data);
    const competitor = asObject(asObject(map.competitor_intelligence).data);
    const pricing = asObject(asObject(map.pricing_intelligence).data);
    const opportunities = asObject(asObject(map.opportunities).data);

    if (Object.keys(profile).length) {
      include.company_profile = {
        offerings: asArray(profile.offerings).slice(0, 6),
        productsServices: asArray(profile.productsServices).slice(0, 4),
        primaryAudience: asArray(profile.primaryAudience).slice(0, 6),
        summary: profile.summary,
      };
    }
    if (Object.keys(competitor).length) {
      include.competitor_intelligence = {
        topCompetitors: asArray(competitor.topCompetitors).slice(0, 4),
        comparison: asObject(competitor.comparison),
      };
    }
    if (Object.keys(pricing).length) {
      include.pricing_intelligence = {
        pricingModelSummary: pricing.pricingModelSummary,
        packagingRecommendations: asArray(pricing.packagingRecommendations).slice(0, 4),
      };
    }
    if (Object.keys(opportunities).length) {
      include.opportunities = {
        quickWins: asArray(opportunities.quickWins).slice(0, 3),
        opportunities: asArray(opportunities.opportunities).slice(0, 4),
      };
    }
  }

  if (type === 'pricing_intelligence') {
    const profile = asObject(asObject(map.company_profile).data);
    const positioning = asObject(asObject(map.positioning_messaging).data);
    const competitor = asObject(asObject(map.competitor_intelligence).data);
    const opportunities = asObject(asObject(map.opportunities).data);

    if (Object.keys(profile).length) {
      include.company_profile = {
        offerings: asArray(profile.offerings).slice(0, 6),
        productsServices: asArray(profile.productsServices).slice(0, 4),
        primaryAudience: asArray(profile.primaryAudience).slice(0, 6),
      };
    }
    if (Object.keys(positioning).length) {
      include.positioning_messaging = {
        valueProposition: positioning.valueProposition,
        differentiators: asArray(positioning.differentiators).slice(0, 6),
      };
    }
    if (Object.keys(competitor).length) {
      include.competitor_intelligence = {
        topCompetitors: asArray(competitor.topCompetitors).slice(0, 4),
      };
    }
    if (Object.keys(opportunities).length) {
      include.opportunities = {
        opportunities: asArray(opportunities.opportunities).slice(0, 4),
      };
    }
  }

  return Object.keys(include).length ? include : undefined;
}

function buildGenerationInputs(type, inputs, options = {}) {
  const baseInputs = { ...(inputs || {}) };
  const artifactContext = summarizeArtifactsForPrompt(type, options.existingArtifacts);
  if (artifactContext) {
    baseInputs.relatedArtifacts = artifactContext;
  }
  return baseInputs;
}

function buildNormalizedScores(rawScores, specs) {
  const scores = asObject(rawScores);
  const rubric = asObject(scores.rubric);
  const normalized = { rubric: {} };

  for (const [scoreKey, spec] of Object.entries(specs)) {
    const group = asObject(rubric[scoreKey]);
    const fields = Array.isArray(spec.fields) ? spec.fields : [];
    const weights = Array.isArray(spec.weights) ? spec.weights : [];
    let hasRubricValue = false;
    let computed = 0;
    normalized.rubric[scoreKey] = {};

    fields.forEach((field, index) => {
      const rawValue = group[field];
      if (Number.isFinite(Number(rawValue))) hasRubricValue = true;
      const value = clampScore(rawValue);
      normalized.rubric[scoreKey][field] = value;
      computed += value * (weights[index] || 0);
    });

    normalized[scoreKey] = hasRubricValue
      ? Math.round(computed)
      : clampScore(scores[scoreKey]);
  }

  return normalized;
}

function buildArtifactSpec(type, companyName, context) {
  const geoFocus = Array.isArray(context?.companyProfile?.geoFocus)
    ? context.companyProfile.geoFocus.map((value) => String(value).toLowerCase())
    : [];
  const websiteUrl = typeof context?.websiteUrl === 'string' ? context.websiteUrl.toLowerCase() : '';
  const marketGeo = typeof context?.geo === 'string' ? context.geo.toLowerCase() : '';
  const indiaContext =
    geoFocus.includes('india') ||
    marketGeo.includes('india') ||
    websiteUrl.endsWith('.in') ||
    websiteUrl.includes('.in/');
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
        maxCompletionTokens: 3600,
        systemPrompt: [
          'You are a senior social strategist building a publish-ready B2B social media calendar.',
          ...sharedRules,
          'Create a practical 4-week calendar with specific post ideas, not abstract weekly themes.',
          'Output JSON shape: { "scores": { "channelCoverage": number, "cadenceReadiness": number, "campaignCohesion": number, "rubric": { "channelCoverage": { "channelDiversity": number, "funnelCoverage": number, "calendarBreadth": number }, "cadenceReadiness": { "cadenceSpecificity": number, "assetPracticality": number, "operationalConsistency": number }, "campaignCohesion": { "themeAlignment": number, "ctaClarity": number, "messageContinuity": number } } }, "timezone": string, "startDate": "YYYY-MM-DD", "weeks": number, "channels": string[], "cadence": { "postsPerWeek": number }, "themes": string[], "items": [{ "date": "YYYY-MM-DD", "channel": string, "format": string, "pillar": string, "hook": string, "captionBrief": string, "cta": string, "assetNotes": string, "complianceNote": string }] }.',
          'Rubric scores must be 0-100 integers. Derive top-level scores consistently: channelCoverage = 35% channelDiversity + 35% funnelCoverage + 30% calendarBreadth; cadenceReadiness = 35% cadenceSpecificity + 35% assetPracticality + 30% operationalConsistency; campaignCohesion = 40% themeAlignment + 30% ctaClarity + 30% messageContinuity.',
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
          'Output JSON shape: { "scores": { "seedQuality": number, "targetingDepth": number, "launchReadiness": number, "rubric": { "seedQuality": { "firstPartyStrength": number, "signalRelevance": number, "seedVariety": number }, "targetingDepth": { "platformSpecificity": number, "exclusionQuality": number, "creativeAlignment": number }, "launchReadiness": { "measurementClarity": number, "executionSpecificity": number, "audienceUsability": number } } }, "seedAudiences": string[], "lookalikes": [{ "platform": string, "targeting": string[], "exclusions": string[], "creativeAngles": string[] }], "measurement": string[] }.',
          'Rubric scores must be 0-100 integers. Derive top-level scores consistently: seedQuality = 40% firstPartyStrength + 35% signalRelevance + 25% seedVariety; targetingDepth = 35% platformSpecificity + 35% exclusionQuality + 30% creativeAlignment; launchReadiness = 35% measurementClarity + 35% executionSpecificity + 30% audienceUsability.',
          'Seed audiences must describe concrete first-party audience sources actually available to this business, not generic personas.',
          'Each platform plan must include 4 to 8 targeting notes, 2 to 5 exclusions, and 3 to 6 creative angles.',
          'Prefer remarketing lists, CRM cohorts, site behaviors, app events, and research-engagement cohorts over demographic stereotypes.',
          'Do not use vague targeting like only age/income unless it is paired with a first-party seed logic and a channel-specific use case.',
          'Never return placeholders such as platform1, audience1, t1, e1, c1, metric1, or template labels of any kind.',
          'Use real ad platforms only, such as Meta Ads, Google Ads, LinkedIn Ads, or YouTube.',
          'Base seeds and audience logic on the supplied ICPs, client segments, offers, and website behaviors when available.'
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
          'Output JSON shape: { "scores": { "competitorCoverage": number, "differentiationStrength": number, "whitespaceOpportunity": number, "rubric": { "competitorCoverage": { "relevanceCoverage": number, "sourceCoverage": number, "competitiveBreadth": number }, "differentiationStrength": { "differentiatorClarity": number, "gapSpecificity": number, "comparisonDepth": number }, "whitespaceOpportunity": { "opportunityQuality": number, "messagingWhitespace": number, "actionability": number } } }, "topCompetitors": [{ "name": string, "website": string, "whyRelevant": string, "positioningSnapshot": string, "strengths": string[], "weaknesses": string[] }], "comparison": { "yourDifferentiators": string[], "messagingGaps": string[], "opportunities": string[] } }.',
          'Rubric scores must be 0-100 integers. Derive top-level scores consistently: competitorCoverage = 40% relevanceCoverage + 30% sourceCoverage + 30% competitiveBreadth; differentiationStrength = 40% differentiatorClarity + 30% gapSpecificity + 30% comparisonDepth; whitespaceOpportunity = 40% opportunityQuality + 30% messagingWhitespace + 30% actionability.',
          'Return 4 to 6 competitors. Strengths and weaknesses should be concise, concrete, and company-specific.',
          'Prioritize direct or adjacent India-relevant AI solution firms, agencies, studios, or consultancies that plausibly compete for the same real-estate, fintech, or ecommerce AI budgets.',
          'Do not invent competitor names. If unsure, prefer named real companies with a concise caveat in whyRelevant rather than fabricated brands.',
          'Do not include messaging or opportunity advice about channels that are not grounded in the supplied company context.'
        ].join(' '),
      };
    case 'positioning_messaging':
      return {
        temperature: 0.25,
        maxCompletionTokens: 1800,
        systemPrompt: [
          'You are a product marketing strategist developing positioning and messaging.',
          ...sharedRules,
          'Output JSON shape: { "scores": { "propositionClarity": number, "differentiationStrength": number, "messageConsistency": number, "rubric": { "propositionClarity": { "valuePropSpecificity": number, "outcomeClarity": number, "audienceFit": number }, "differentiationStrength": { "differentiatorSpecificity": number, "competitiveSeparation": number, "proofOrientation": number }, "messageConsistency": { "pillarAlignment": number, "brandVoiceCohesion": number, "pitchConsistency": number } } }, "valueProposition": string, "differentiators": string[], "messagingPillars": [{ "pillar": string, "description": string, "audienceRelevance": string }], "brandVoice": { "tone": string[], "dosList": string[], "dontsList": string[] }, "elevatorPitches": { "short": string, "medium": string, "long": string } }.',
          'Rubric scores must be 0-100 integers. Derive top-level scores consistently: propositionClarity = 40% valuePropSpecificity + 35% outcomeClarity + 25% audienceFit; differentiationStrength = 40% differentiatorSpecificity + 35% competitiveSeparation + 25% proofOrientation; messageConsistency = 35% pillarAlignment + 35% brandVoiceCohesion + 30% pitchConsistency.',
          'Avoid vague claims like "innovative" or "cutting-edge" unless tied to a concrete capability or market proof.',
          'Use the named offers and sectors from company context. Do not revert to generic AI-agency copy.',
          'Differentiators should be proof-oriented and specific, not just restatements of being premium or innovative.',
          'Do not use empty-brand phrases like "innovative AI solutions" unless paired with a concrete outcome, capability, or sector-specific proof point.',
          'Value proposition must mention the business outcome, not just the offer category.',
          'Messaging pillars should express a customer-facing promise or proof angle, not just repeat the company’s service names.',
          'Avoid phrases like "elevate your business", "new heights", "innovative AI solutions", or "premium AI integration" unless each is grounded by a specific business outcome, offer, or proof point.',
          'Use competitor gaps and pricing/packaging context to sharpen the message. The output should explain why a buyer should choose this company over broader development shops.',
          'Favor clear business outcomes such as faster deployment, sector fit, measurable efficiency, clearer ROI, or lower implementation risk.'
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
          'Output JSON shape: { "scores": { "pricingClarity": number, "marketCompetitiveness": number, "packagingReadiness": number, "rubric": { "pricingClarity": { "modelSpecificity": number, "visibilityClarity": number, "valueMetricFit": number }, "marketCompetitiveness": { "benchmarkCoverage": number, "marketFit": number, "pricingPositionLogic": number }, "packagingReadiness": { "offerPackagingStrength": number, "implementationClarity": number, "riskPreparedness": number } } }, "pricingModelSummary": string, "publicPricingVisibility": string, "competitorBenchmarks": [{ "name": string, "pricingModel": string, "startingPoint": string, "notes": string }], "packagingRecommendations": [{ "offer": string, "targetCustomer": string, "pricingApproach": string, "rationale": string }], "valueMetrics": string[], "risks": string[], "nextQuestions": string[] }.',
          'Rubric scores must be 0-100 integers. Derive top-level scores consistently: pricingClarity = 40% modelSpecificity + 30% visibilityClarity + 30% valueMetricFit; marketCompetitiveness = 35% benchmarkCoverage + 35% marketFit + 30% pricingPositionLogic; packagingReadiness = 40% offerPackagingStrength + 30% implementationClarity + 30% riskPreparedness.',
          'If public pricing is unavailable, say so clearly and shift to packaging and fee-structure hypotheses instead of fabricating exact prices.',
          indiaContext
            ? 'This company operates in India. Use INR / Rs / ₹ as the default currency and benchmark against Indian market pricing unless a different currency is explicitly required by the source context.'
            : 'Use the company’s primary market currency when it is clearly implied by the source context.',
          'Do not cite PDFs, tariff documents, or exact fee numbers unless they are clearly established in the supplied context or verifiable via web search. Prefer ranges or "not publicly disclosed" when uncertain.'
          ,
          'If the company appears to be a services or solutions firm, do not output SaaS defaults like freemium, per-seat subscription, or generic monthly plans unless the source context clearly supports that model.',
          'Never use placeholders such as Competitor A, Bundle A, Free tier, or $10/month.',
          'Packaging recommendations should be named around the company’s actual offers, sectors, or engagement styles.',
          'Competitor benchmarks must use named competitors from the supplied competitor intelligence when available; otherwise state that public pricing is not disclosed.'
        ].join(' '),
      };
    case 'channel_strategy':
      return {
        temperature: 0.15,
        maxCompletionTokens: 1800,
        systemPrompt: [
          'You are a GTM strategist designing channel roles and operating cadence.',
          ...sharedRules,
          'Output JSON shape: { "scores": { "channelFit": number, "cadenceStrength": number, "measurementReadiness": number, "rubric": { "channelFit": { "channelRoleClarity": number, "funnelCoverage": number, "mixRelevance": number }, "cadenceStrength": { "cadenceSpecificity": number, "contentMixQuality": number, "loopStrength": number }, "measurementReadiness": { "budgetLogic": number, "measurementSpecificity": number, "operationalPracticality": number } } }, "channels": [{ "name": string, "role": string, "cadence": string, "contentMix": string[], "growthLoops": string[] }], "budgetSplitGuidance": string[], "measurement": string[] }.',
          'Rubric scores must be 0-100 integers. Derive top-level scores consistently: channelFit = 40% channelRoleClarity + 35% funnelCoverage + 25% mixRelevance; cadenceStrength = 35% cadenceSpecificity + 35% contentMixQuality + 30% loopStrength; measurementReadiness = 35% budgetLogic + 35% measurementSpecificity + 30% operationalPracticality.',
          'Return 4 to 6 channels only. Each channel role must be distinct and tied to a funnel job.',
          'Cadence must be operationally specific, for example "3 LinkedIn posts/week + 1 analyst POV/month", not "post regularly".',
          'Content mix should name concrete asset types. Growth loops should describe how one channel feeds another or creates retargeting/data advantages.',
          'Budget split guidance should be phrased as percentage ranges or stage-based allocation logic, not generic "invest more in X".',
          'Do not leave channels, measurement, or budget guidance empty.',
          'Use only channels supported by the company context or adjacent B2B channels that fit this company’s motion. If social presence is not explicit, prioritize website, LinkedIn, outbound email, webinars, partner/referral, and search over consumer-heavy channels.',
          'Never return placeholders or empty arrays. Every channel must include a role, cadence, 2 to 4 content-mix items, and 1 to 3 growth loops.'
        ].join(' '),
      };
    case 'website_audit':
      return {
        temperature: 0.2,
        maxCompletionTokens: 3600,
        systemPrompt: [
          'You are a conversion-rate optimisation expert auditing a company website.',
          ...sharedRules,
          'Output JSON shape: { "summary": string, "firstImpression": { "clarityScore": number, "trustScore": number, "visualHierarchyScore": number, "rubric": { "clarity": { "headlineSpecificity": number, "offerClarity": number, "ctaClarity": number }, "trust": { "proofSignals": number, "complianceSignals": number, "credibilitySignals": number }, "visualHierarchy": { "ctaProminence": number, "contentScannability": number, "aboveTheFoldStructure": number } } }, "conversionFunnel": { "primaryCta": string, "recommendedCtas": string[], "frictionPoints": string[] }, "copyRecommendations": { "headlineOptions": string[], "ctaCopyOptions": string[] }, "uxRecommendations": { "quickWins": string[], "highImpactChanges": string[] }, "homepageSections": [{ "section": string, "whatWorks": string[], "issues": string[], "recommendations": string[] }], "experiments": [{ "name": string, "hypothesis": string, "successMetric": string, "implementation": string[] }], "priorityPlan": [{ "task": string, "priority": "high"|"medium"|"low", "why": string, "effort": string, "ownerHint": string }] }.',
          'Rubric scores must be 0-100 integers and should reflect observable website evidence, not vibes.',
          'Derive the top-level scores from the rubric consistently: clarityScore = 35% headlineSpecificity + 40% offerClarity + 25% ctaClarity; trustScore = 40% proofSignals + 35% complianceSignals + 25% credibilitySignals; visualHierarchyScore = 40% ctaProminence + 30% contentScannability + 30% aboveTheFoldStructure.',
          'Provide 3 to 5 homepage sections, 2 to 4 experiments, and 5 to 8 priority plan items.',
          'Do not invent URLs or specific page copy unless clearly inferrable from the company profile.'
        ].join(' '),
      };
    case 'opportunities':
      return {
        temperature: 0.2,
        maxCompletionTokens: 2600,
        systemPrompt: [
          'You are a growth strategist identifying actionable opportunities for a company.',
          ...sharedRules,
          'Output JSON shape: { "scores": { "growthPotential": number, "quickWinReadiness": number, "executionClarity": number, "rubric": { "growthPotential": { "opportunityQuality": number, "impactStrength": number, "marketRelevance": number }, "quickWinReadiness": { "quickWinSpecificity": number, "timeToValueClarity": number, "nearTermPracticality": number }, "executionClarity": { "planSpecificity": number, "riskCoverage": number, "nextStepActionability": number } } }, "summary": string, "quickWins": [{ "title": string, "priority": "high"|"medium"|"low", "description": string, "expectedImpact": string, "timeToValue": string }], "opportunities": [{ "title": string, "category": string, "priority": "high"|"medium"|"low", "effort": string, "expectedImpact": string, "nextSteps": string[] }], "risksAndMitigations": [{ "risk": string, "mitigation": string }], "ninetyDayPlan": [{ "week": number, "focus": string, "keyActivities": string[] }] }.',
          'Rubric scores must be 0-100 integers. Derive top-level scores consistently: growthPotential = 40% opportunityQuality + 35% impactStrength + 25% marketRelevance; quickWinReadiness = 35% quickWinSpecificity + 35% timeToValueClarity + 30% nearTermPracticality; executionClarity = 40% planSpecificity + 25% riskCoverage + 35% nextStepActionability.',
          'Keep the artifact compact and execution-focused.',
          'Return exactly 3 quick wins, 3 to 4 opportunities, 2 risks, and a ninety-day plan with exactly 4 weekly entries.',
          'Each opportunity should have 2 to 3 next steps only. Quick wins must be achievable within 30 days. Opportunities should span 30 to 180 days.',
          'Anchor every quick win, opportunity, and weekly plan item to the actual company context: offerings, target sectors, audience, geography, and current positioning.',
          'Do not propose generic AI-company filler such as "deploy AI chatbot", "launch analytics", "pilot automation", "hire AI talent", or "expand to martech" unless the company context explicitly supports it and the action is tied to a named offer or sector.',
          'For services companies, prefer GTM actions like sector-specific case studies, offer packaging, landing pages, outbound plays, partnerships, proof assets, vertical campaigns, or conversion improvements tied to the existing offers.',
          'The ninety-day plan must read like a realistic GTM execution roadmap for this exact company, not a generic innovation roadmap.',
          'Each weekly focus must mention a concrete business motion, vertical, named offer, asset, or proof item grounded in the company profile.',
          'If the company profile does not explicitly show active social channels, do not default to Instagram, YouTube, or WhatsApp tactics. Prefer website pages, outbound sequences, case studies, partnerships, webinars, audit offers, sales collateral, or vertical landing pages.',
          'Use the named offers and sectors from the company context wherever possible. For example, refer to "AI App Development", "Real Estate AI Solutions", "Fintech AI Solutions", and "Ecommerce AI Solutions" instead of generic "AI solutions".',
          'At least 2 of the 4 ninety-day plan entries must reference a specific offer or sector from the company context.',
          'At least 2 quick wins must create proof, demand capture, or conversion assets for existing offers rather than inventing new products.',
          'Each key activity must be a concrete deliverable or action, not a vague noun. Good examples: "Draft real-estate case study outline", "Publish fintech landing page copy", "Assemble ecommerce webinar invite list". Bad examples: "Research", "Marketing", "Development", "Planning".',
          'Each weekly plan entry must contain 2 to 3 key activities that together produce a visible GTM asset, page, campaign, or proof point by the end of that week.',
          'Do not use broad finance labels like BFSI unless the company context explicitly uses them. Prefer the exact sector names from context such as fintech, real estate, and ecommerce.',
          'Do not assume consumer-social execution like Instagram, Reels, or WhatsApp campaigns unless the company context explicitly supports those channels.',
          'Prefer deliverables such as landing pages, case studies, solution briefs, webinar invites, partner outreach, pricing assets, and outbound sequences over vague growth ideas.',
          'Be terse: titles under 8 words, descriptions under 18 words, expectedImpact under 14 words, each next step under 12 words, each risk and mitigation under 16 words, and each weekly activity under 10 words.'
        ].join(' '),
      };
    case 'icps':
      return {
        temperature: 0.2,
        maxCompletionTokens: 1800,
        systemPrompt: [
          'You are a B2B go-to-market strategist defining ideal customer profiles.',
          ...sharedRules,
          'Output JSON shape: { "scores": { "segmentFit": number, "targetingClarity": number, "activationReadiness": number, "rubric": { "segmentFit": { "icpDefinitionQuality": number, "marketFit": number, "cohortCoverage": number }, "targetingClarity": { "qualifierSpecificity": number, "channelClarity": number, "messagingAngleStrength": number }, "activationReadiness": { "hookClarity": number, "priorityUsefulness": number, "disqualifierQuality": number } } }, "icps": [{ "name": string, "who": string, "hook": string, "channels": string[], "qualifiers": string[], "disqualifiers": string[] }], "cohorts": [{ "name": string, "priority": number, "definition": string, "messagingAngle": string }], "notes": string[] }.',
          'Rubric scores must be 0-100 integers. Derive top-level scores consistently: segmentFit = 40% icpDefinitionQuality + 35% marketFit + 25% cohortCoverage; targetingClarity = 35% qualifierSpecificity + 30% channelClarity + 35% messagingAngleStrength; activationReadiness = 35% hookClarity + 30% priorityUsefulness + 35% disqualifierQuality.',
          'Define 2 to 4 ICPs and 3 to 6 cohorts. Priority for cohorts is an integer (1 = highest). Qualifiers and disqualifiers must be concrete, not generic demographic filler.',
          'Channels should list actual channels (e.g., "LinkedIn outbound", "Google Search", "referral network"), not generic types.',
          'If social presence is not explicit in context, do not default to Instagram, YouTube, or WhatsApp. Prefer LinkedIn, website inbound, partner/referral, webinars, and outbound email.'
        ].join(' '),
      };
    case 'client_profiling':
      return {
        temperature: 0.2,
        maxCompletionTokens: 1800,
        systemPrompt: [
          'You are a customer research strategist profiling existing client segments.',
          ...sharedRules,
          'Output JSON shape: { "scores": { "segmentCoverage": number, "painClarity": number, "activationReadiness": number, "rubric": { "segmentCoverage": { "segmentDefinition": number, "personaBreadth": number, "channelCoverage": number }, "painClarity": { "painSpecificity": number, "objectionDepth": number, "insightQuality": number }, "activationReadiness": { "jobsToBeDoneClarity": number, "triggerActionability": number, "channelUsability": number } } }, "segments": [{ "name": string, "profile": string, "jobsToBeDone": string[], "painPoints": string[], "objections": string[], "triggers": string[], "channels": string[] }], "insights": string[] }.',
          'Define 3 to 5 client segments. Each segment needs 3 to 6 jobs-to-be-done, 3 to 5 pain points, 2 to 4 objections, 2 to 4 purchase triggers, and 2 to 4 preferred channels.',
          'Rubric scores must be 0-100 integers and based on the evidence in the company context, not generic benchmarking.',
          'Derive the top-level scores from the rubric consistently: segmentCoverage = 40% segmentDefinition + 35% personaBreadth + 25% channelCoverage; painClarity = 40% painSpecificity + 35% objectionDepth + 25% insightQuality; activationReadiness = 35% jobsToBeDoneClarity + 40% triggerActionability + 25% channelUsability.',
          'Insights should be cross-segment patterns or counter-intuitive findings, not restatements of segment details.',
          'Do not assume consumer-social channels unless they are explicitly supported by the company context.'
        ].join(' '),
      };
    case 'partner_profiling':
      return {
        temperature: 0.2,
        maxCompletionTokens: 1600,
        systemPrompt: [
          'You are a partnerships strategist profiling potential channel and integration partners.',
          ...sharedRules,
          'Output JSON shape: { "scores": { "partnerCoverage": number, "valueExchangeClarity": number, "activationReadiness": number, "rubric": { "partnerCoverage": { "partnerArchetypeCoverage": number, "ecosystemFit": number, "coverageDepth": number }, "valueExchangeClarity": { "mutualValueSpecificity": number, "selectionCriteriaQuality": number, "commercialClarity": number }, "activationReadiness": { "playbookActionability": number, "partnerQualificationReadiness": number, "executionPracticality": number } } }, "partnerTypes": [{ "name": string, "valueExchange": string, "selectionCriteria": string[], "activationPlaybook": string[] }], "insights": string[] }.',
          'Define 3 to 5 partner types relevant to this business (e.g., integration partners, referral partners, resellers, co-marketing partners).',
          'Rubric scores must be 0-100 integers and should reflect the strength of the generated partner profile, not generic assumptions.',
          'Derive the top-level scores from the rubric consistently: partnerCoverage = 40% partnerArchetypeCoverage + 35% ecosystemFit + 25% coverageDepth; valueExchangeClarity = 40% mutualValueSpecificity + 35% selectionCriteriaQuality + 25% commercialClarity; activationReadiness = 40% playbookActionability + 35% partnerQualificationReadiness + 25% executionPracticality.',
          'Activation playbook must be a concrete step-by-step list, not vague intent statements.',
          'Selection criteria must be measurable or observable, not generic like "must be a good fit".',
          'Prefer B2B partner motions such as integration, referral, implementation, or co-sell partnerships over vague reseller templates unless context supports them.'
        ].join(' '),
      };
    case 'marketing_strategy':
      return {
        temperature: 0.2,
        maxCompletionTokens: 2800,
        systemPrompt: [
          'You are a CMO-level strategist building a 90-day marketing strategy.',
          ...sharedRules,
          'Output JSON shape: { "scores": { "strategicClarity": number, "funnelStrength": number, "executionReadiness": number, "rubric": { "strategicClarity": { "objectiveSpecificity": number, "positioningStrength": number, "segmentFocus": number }, "funnelStrength": { "funnelCoverage": number, "offerChannelFit": number, "kpiQuality": number }, "executionReadiness": { "planSpecificity": number, "riskPreparedness": number, "operationalSequencing": number } } }, "objective": string, "positioning": string, "targetSegments": string[], "messagingPillars": string[], "kpis": string[], "funnelPlan": [{ "stage": string, "goal": string, "channels": string[], "offers": string[] }], "90DayPlan": [{ "week": number, "focus": string, "keyActivities": string[] }], "risksAndMitigations": [{ "risk": string, "mitigation": string }] }.',
          'Rubric scores must be 0-100 integers. Derive top-level scores consistently: strategicClarity = 35% objectiveSpecificity + 35% positioningStrength + 30% segmentFocus; funnelStrength = 35% funnelCoverage + 35% offerChannelFit + 30% kpiQuality; executionReadiness = 40% planSpecificity + 25% riskPreparedness + 35% operationalSequencing.',
          'Funnel plan must cover Awareness, Consideration, and Conversion stages at minimum. Channels and offers must be specific to this business.',
          'Keep the artifact compact and execution-focused.',
          'Return 2 to 4 target segments, 3 to 5 messaging pillars, 4 to 6 KPIs, 3 funnel stages, a 90-day plan with exactly 6 weekly entries, and 2 to 3 risks.',
          'KPIs must be measurable metrics with clear units. Each weekly plan entry should have 2 to 3 key activities only.',
          'Use the actual offers, audiences, and sectors from the company context. Do not add new target segments such as martech unless they are explicitly present in context.',
          'If social presence is not explicit, do not default to Instagram, YouTube, or WhatsApp. Prefer website, LinkedIn, outbound email, webinars, referrals, partner channels, and proof assets.',
          'The 90-day plan should read like a grounded GTM execution roadmap for the existing offers, not a generic demand-gen playbook.',
          'Anchor the strategy around the named offers first: AI App Development, Real Estate AI Solutions, Fintech AI Solutions, and Ecommerce AI Solutions.',
          'At least 4 of the 6 weekly plan entries must produce an offer-led deliverable such as a landing page, case study, webinar, sector brief, outbound sequence, pricing/package asset, or sales collateral for one of those named offers.',
          'Do not use generic weekly focus labels like "Generate leads", "Enhance engagement", or "Review performance". Each focus must name an offer, sector, or deliverable.',
          'Treat channels as support layers for distributing offer-led assets, not as the strategy itself.',
          'Do not mention YouTube unless the company context explicitly supports it.'
        ].join(' '),
      };
    case 'sales_enablement':
      return {
        temperature: 0.25,
        maxCompletionTokens: 3600,
        systemPrompt: [
          'You are a sales enablement expert building sales assets for a company.',
          ...sharedRules,
          'Output JSON shape: { "scores": { "competitiveReadiness": number, "objectionCoverage": number, "pricingConfidence": number, "rubric": { "competitiveReadiness": { "battlecardCoverage": number, "differentiatorStrength": number, "competitiveSpecificity": number }, "objectionCoverage": { "objectionDepth": number, "responseQuality": number, "proofSupport": number }, "pricingConfidence": { "pricingGuidanceSpecificity": number, "valueJustificationStrength": number, "discountLogic": number } } }, "battlecards": [{ "competitor": string, "strengths": string[], "weaknesses": string[], "differentiators": string[], "objectionHandlers": [{ "objection": string, "response": string }] }], "demoScripts": { "5min": string, "15min": string, "30min": string }, "objectionHandlers": [{ "category": string, "objection": string, "response": string, "supportingData": string }], "pricingGuidance": { "tierRecommendations": string, "discountStrategy": string, "valueJustification": string, "competitivePositioning": string } }.',
          'Rubric scores must be 0-100 integers. Derive top-level scores consistently: competitiveReadiness = 35% battlecardCoverage + 35% differentiatorStrength + 30% competitiveSpecificity; objectionCoverage = 35% objectionDepth + 40% responseQuality + 25% proofSupport; pricingConfidence = 35% pricingGuidanceSpecificity + 35% valueJustificationStrength + 30% discountLogic.',
          'Provide 2 to 4 competitor battlecards. Each battlecard needs 3 to 5 strengths/weaknesses and 2 to 4 objection handlers.',
          'Demo scripts should be narrative, not bullet points. Objection handlers must address real sales-call objections specific to this industry.',
          'Do not leave any required section empty. If context is incomplete, make the best grounded sales recommendation from the provided company, competitor, positioning, and pricing context.',
          'Battlecards must use named competitors from the supplied competitor intelligence when available, not blanks or placeholders.',
          'Pricing guidance must reflect the company’s apparent business model. If public pricing is unavailable, explain packaging and negotiation guidance instead of inventing list prices.'
        ].join(' '),
      };
    case 'content_strategy':
      return {
        temperature: 0.2,
        maxCompletionTokens: 1800,
        systemPrompt: [
          'You are a content strategist building a sustainable content plan.',
          ...sharedRules,
          'Output JSON shape: { "scores": { "pillarStrength": number, "distributionReadiness": number, "governanceMaturity": number, "rubric": { "pillarStrength": { "pillarSpecificity": number, "topicQuality": number, "purposeClarity": number }, "distributionReadiness": { "formatRange": number, "distributionSpecificity": number, "repurposingStrength": number }, "governanceMaturity": { "reviewDiscipline": number, "operationalClarity": number, "qualityControl": number } } }, "contentPillars": [{ "name": string, "purpose": string, "exampleTopics": string[] }], "formats": string[], "distributionRules": string[], "repurposingPlan": string[], "governance": { "reviewChecklist": string[] } }.',
          'Rubric scores must be 0-100 integers. Derive top-level scores consistently: pillarStrength = 35% pillarSpecificity + 35% topicQuality + 30% purposeClarity; distributionReadiness = 30% formatRange + 35% distributionSpecificity + 35% repurposingStrength; governanceMaturity = 35% reviewDiscipline + 30% operationalClarity + 35% qualityControl.',
          'Define 3 to 5 content pillars. Each pillar needs 4 to 8 example topics specific to the company and sector.',
          'Formats should be concrete asset types (e.g., "900-word LinkedIn article", "60s explainer video", not just "videos").',
          'Distribution rules must describe when, where, and how to share each format. Repurposing plan must map one format to at least two downstream uses.',
          'If the company does not show an explicit X/Twitter presence, do not default distribution to Twitter. Prefer website, LinkedIn, outbound email, webinars, partner channels, and owned assets.'
        ].join(' '),
      };
    case 'lead_magnets':
      return {
        temperature: 0.25,
        maxCompletionTokens: 2000,
        systemPrompt: [
          'You are a demand generation strategist designing high-converting lead magnets.',
          ...sharedRules,
          'Output JSON shape: { "scores": { "offerStrength": number, "conversionReadiness": number, "nurtureReadiness": number, "rubric": { "offerStrength": { "promiseStrength": number, "offerRelevance": number, "formatFit": number }, "conversionReadiness": { "landingPageClarity": number, "ctaStrength": number, "outlineQuality": number }, "nurtureReadiness": { "sequenceQuality": number, "followUpSpecificity": number, "funnelProgression": number } } }, "leadMagnets": [{ "name": string, "format": string, "promise": string, "outline": string[], "landingPageCopy": { "headline": string, "subheadline": string, "bullets": string[], "cta": string }, "followUpSequence": [{ "day": number, "subject": string, "goal": string }] }], "notes": string[] }.',
          'Rubric scores must be 0-100 integers. Derive top-level scores consistently: offerStrength = 40% promiseStrength + 35% offerRelevance + 25% formatFit; conversionReadiness = 35% landingPageClarity + 35% ctaStrength + 30% outlineQuality; nurtureReadiness = 35% sequenceQuality + 35% followUpSpecificity + 30% funnelProgression.',
          'Provide 3 to 5 lead magnets spanning different funnel stages and formats (e.g., checklist, calculator, guide, webinar, audit).',
          'Each lead magnet outline should have 4 to 8 specific sections. Landing page bullets must describe concrete benefits, not features.',
          'Follow-up sequence must have 3 to 5 emails spaced across 14 days. Subject lines must be specific, not generic templates.',
          'Do not assume Instagram, YouTube, or WhatsApp distribution unless the company context explicitly supports those channels. Keep notes and follow-up logic grounded in owned and B2B channels first.'
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
  const scores = buildNormalizedScores(data.scores, {
    channelCoverage: { fields: ['channelDiversity', 'funnelCoverage', 'calendarBreadth'], weights: [0.35, 0.35, 0.3] },
    cadenceReadiness: { fields: ['cadenceSpecificity', 'assetPracticality', 'operationalConsistency'], weights: [0.35, 0.35, 0.3] },
    campaignCohesion: { fields: ['themeAlignment', 'ctaClarity', 'messageContinuity'], weights: [0.4, 0.3, 0.3] }
  });
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
    scores,
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
  const scores = buildNormalizedScores(data.scores, {
    seedQuality: { fields: ['firstPartyStrength', 'signalRelevance', 'seedVariety'], weights: [0.4, 0.35, 0.25] },
    targetingDepth: { fields: ['platformSpecificity', 'exclusionQuality', 'creativeAlignment'], weights: [0.35, 0.35, 0.3] },
    launchReadiness: { fields: ['measurementClarity', 'executionSpecificity', 'audienceUsability'], weights: [0.35, 0.35, 0.3] }
  });
  const sourceLookalikes = asArray(data.lookalikes).length
    ? asArray(data.lookalikes)
    : asArray(data.lookalike_audiences);

  return {
    scores,
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
  const scores = buildNormalizedScores(data.scores, {
    competitorCoverage: { fields: ['relevanceCoverage', 'sourceCoverage', 'competitiveBreadth'], weights: [0.4, 0.3, 0.3] },
    differentiationStrength: { fields: ['differentiatorClarity', 'gapSpecificity', 'comparisonDepth'], weights: [0.4, 0.3, 0.3] },
    whitespaceOpportunity: { fields: ['opportunityQuality', 'messagingWhitespace', 'actionability'], weights: [0.4, 0.3, 0.3] }
  });
  const comparison = asObject(data.comparison);
  const competitorRows = asArray(data.topCompetitors).length
    ? asArray(data.topCompetitors)
    : asArray(data.competitors).length
      ? asArray(data.competitors)
      : asArray(data.alternatives);

  return {
    scores,
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
  const scores = buildNormalizedScores(data.scores, {
    propositionClarity: { fields: ['valuePropSpecificity', 'outcomeClarity', 'audienceFit'], weights: [0.4, 0.35, 0.25] },
    differentiationStrength: { fields: ['differentiatorSpecificity', 'competitiveSeparation', 'proofOrientation'], weights: [0.4, 0.35, 0.25] },
    messageConsistency: { fields: ['pillarAlignment', 'brandVoiceCohesion', 'pitchConsistency'], weights: [0.35, 0.35, 0.3] }
  });
  return {
    scores,
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
  const scores = buildNormalizedScores(data.scores, {
    pricingClarity: { fields: ['modelSpecificity', 'visibilityClarity', 'valueMetricFit'], weights: [0.4, 0.3, 0.3] },
    marketCompetitiveness: { fields: ['benchmarkCoverage', 'marketFit', 'pricingPositionLogic'], weights: [0.35, 0.35, 0.3] },
    packagingReadiness: { fields: ['offerPackagingStrength', 'implementationClarity', 'riskPreparedness'], weights: [0.4, 0.3, 0.3] }
  });
  return {
    scores,
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
  const scores = buildNormalizedScores(data.scores, {
    channelFit: { fields: ['channelRoleClarity', 'funnelCoverage', 'mixRelevance'], weights: [0.4, 0.35, 0.25] },
    cadenceStrength: { fields: ['cadenceSpecificity', 'contentMixQuality', 'loopStrength'], weights: [0.35, 0.35, 0.3] },
    measurementReadiness: { fields: ['budgetLogic', 'measurementSpecificity', 'operationalPracticality'], weights: [0.35, 0.35, 0.3] }
  });
  const sourceChannels = asArray(data.channels).length
    ? asArray(data.channels)
    : asArray(data.channelStrategy);

  return {
    scores,
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
  const rubric = asObject(first.rubric);
  const clarityRubric = asObject(rubric.clarity);
  const trustRubric = asObject(rubric.trust);
  const visualRubric = asObject(rubric.visualHierarchy);
  const funnel = asObject(data.conversionFunnel);
  const copy = asObject(data.copyRecommendations);
  const ux = asObject(data.uxRecommendations);
  const computedClarityScore = Math.round(
    clampScore(clarityRubric.headlineSpecificity) * 0.35 +
    clampScore(clarityRubric.offerClarity) * 0.4 +
    clampScore(clarityRubric.ctaClarity) * 0.25
  );
  const computedTrustScore = Math.round(
    clampScore(trustRubric.proofSignals) * 0.4 +
    clampScore(trustRubric.complianceSignals) * 0.35 +
    clampScore(trustRubric.credibilitySignals) * 0.25
  );
  const computedVisualHierarchyScore = Math.round(
    clampScore(visualRubric.ctaProminence) * 0.4 +
    clampScore(visualRubric.contentScannability) * 0.3 +
    clampScore(visualRubric.aboveTheFoldStructure) * 0.3
  );
  return {
    summary: cleanText(data.summary),
    firstImpression: {
      clarityScore: computedClarityScore,
      trustScore: computedTrustScore,
      visualHierarchyScore: computedVisualHierarchyScore,
      rubric: {
        clarity: {
          headlineSpecificity: clampScore(clarityRubric.headlineSpecificity),
          offerClarity: clampScore(clarityRubric.offerClarity),
          ctaClarity: clampScore(clarityRubric.ctaClarity)
        },
        trust: {
          proofSignals: clampScore(trustRubric.proofSignals),
          complianceSignals: clampScore(trustRubric.complianceSignals),
          credibilitySignals: clampScore(trustRubric.credibilitySignals)
        },
        visualHierarchy: {
          ctaProminence: clampScore(visualRubric.ctaProminence),
          contentScannability: clampScore(visualRubric.contentScannability),
          aboveTheFoldStructure: clampScore(visualRubric.aboveTheFoldStructure)
        }
      }
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
  const scores = buildNormalizedScores(data.scores, {
    growthPotential: { fields: ['opportunityQuality', 'impactStrength', 'marketRelevance'], weights: [0.4, 0.35, 0.25] },
    quickWinReadiness: { fields: ['quickWinSpecificity', 'timeToValueClarity', 'nearTermPracticality'], weights: [0.35, 0.35, 0.3] },
    executionClarity: { fields: ['planSpecificity', 'riskCoverage', 'nextStepActionability'], weights: [0.4, 0.25, 0.35] }
  });
  return {
    scores,
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
  const scores = buildNormalizedScores(data.scores, {
    segmentFit: { fields: ['icpDefinitionQuality', 'marketFit', 'cohortCoverage'], weights: [0.4, 0.35, 0.25] },
    targetingClarity: { fields: ['qualifierSpecificity', 'channelClarity', 'messagingAngleStrength'], weights: [0.35, 0.3, 0.35] },
    activationReadiness: { fields: ['hookClarity', 'priorityUsefulness', 'disqualifierQuality'], weights: [0.35, 0.3, 0.35] }
  });
  return {
    scores,
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
  const scores = asObject(data.scores);
  const rubric = asObject(scores.rubric);
  const segmentCoverageRubric = asObject(rubric.segmentCoverage);
  const painClarityRubric = asObject(rubric.painClarity);
  const activationReadinessRubric = asObject(rubric.activationReadiness);
  const computedSegmentCoverage = Math.round(
    clampScore(segmentCoverageRubric.segmentDefinition) * 0.4 +
    clampScore(segmentCoverageRubric.personaBreadth) * 0.35 +
    clampScore(segmentCoverageRubric.channelCoverage) * 0.25
  );
  const computedPainClarity = Math.round(
    clampScore(painClarityRubric.painSpecificity) * 0.4 +
    clampScore(painClarityRubric.objectionDepth) * 0.35 +
    clampScore(painClarityRubric.insightQuality) * 0.25
  );
  const computedActivationReadiness = Math.round(
    clampScore(activationReadinessRubric.jobsToBeDoneClarity) * 0.35 +
    clampScore(activationReadinessRubric.triggerActionability) * 0.4 +
    clampScore(activationReadinessRubric.channelUsability) * 0.25
  );
  return {
    scores: {
      segmentCoverage: computedSegmentCoverage,
      painClarity: computedPainClarity,
      activationReadiness: computedActivationReadiness,
      rubric: {
        segmentCoverage: {
          segmentDefinition: clampScore(segmentCoverageRubric.segmentDefinition),
          personaBreadth: clampScore(segmentCoverageRubric.personaBreadth),
          channelCoverage: clampScore(segmentCoverageRubric.channelCoverage)
        },
        painClarity: {
          painSpecificity: clampScore(painClarityRubric.painSpecificity),
          objectionDepth: clampScore(painClarityRubric.objectionDepth),
          insightQuality: clampScore(painClarityRubric.insightQuality)
        },
        activationReadiness: {
          jobsToBeDoneClarity: clampScore(activationReadinessRubric.jobsToBeDoneClarity),
          triggerActionability: clampScore(activationReadinessRubric.triggerActionability),
          channelUsability: clampScore(activationReadinessRubric.channelUsability)
        }
      }
    },
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
  const scores = asObject(data.scores);
  const rubric = asObject(scores.rubric);
  const partnerCoverageRubric = asObject(rubric.partnerCoverage);
  const valueExchangeClarityRubric = asObject(rubric.valueExchangeClarity);
  const activationReadinessRubric = asObject(rubric.activationReadiness);
  const computedPartnerCoverage = Math.round(
    clampScore(partnerCoverageRubric.partnerArchetypeCoverage) * 0.4 +
    clampScore(partnerCoverageRubric.ecosystemFit) * 0.35 +
    clampScore(partnerCoverageRubric.coverageDepth) * 0.25
  );
  const computedValueExchangeClarity = Math.round(
    clampScore(valueExchangeClarityRubric.mutualValueSpecificity) * 0.4 +
    clampScore(valueExchangeClarityRubric.selectionCriteriaQuality) * 0.35 +
    clampScore(valueExchangeClarityRubric.commercialClarity) * 0.25
  );
  const computedActivationReadiness = Math.round(
    clampScore(activationReadinessRubric.playbookActionability) * 0.4 +
    clampScore(activationReadinessRubric.partnerQualificationReadiness) * 0.35 +
    clampScore(activationReadinessRubric.executionPracticality) * 0.25
  );
  return {
    scores: {
      partnerCoverage: computedPartnerCoverage,
      valueExchangeClarity: computedValueExchangeClarity,
      activationReadiness: computedActivationReadiness,
      rubric: {
        partnerCoverage: {
          partnerArchetypeCoverage: clampScore(partnerCoverageRubric.partnerArchetypeCoverage),
          ecosystemFit: clampScore(partnerCoverageRubric.ecosystemFit),
          coverageDepth: clampScore(partnerCoverageRubric.coverageDepth)
        },
        valueExchangeClarity: {
          mutualValueSpecificity: clampScore(valueExchangeClarityRubric.mutualValueSpecificity),
          selectionCriteriaQuality: clampScore(valueExchangeClarityRubric.selectionCriteriaQuality),
          commercialClarity: clampScore(valueExchangeClarityRubric.commercialClarity)
        },
        activationReadiness: {
          playbookActionability: clampScore(activationReadinessRubric.playbookActionability),
          partnerQualificationReadiness: clampScore(activationReadinessRubric.partnerQualificationReadiness),
          executionPracticality: clampScore(activationReadinessRubric.executionPracticality)
        }
      }
    },
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
  const scores = buildNormalizedScores(data.scores, {
    strategicClarity: { fields: ['objectiveSpecificity', 'positioningStrength', 'segmentFocus'], weights: [0.35, 0.35, 0.3] },
    funnelStrength: { fields: ['funnelCoverage', 'offerChannelFit', 'kpiQuality'], weights: [0.35, 0.35, 0.3] },
    executionReadiness: { fields: ['planSpecificity', 'riskPreparedness', 'operationalSequencing'], weights: [0.4, 0.25, 0.35] }
  });
  return {
    scores,
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

function normalizeSalesEnablement(raw) {
  const data = asObject(raw);
  const pricingGuidance = asObject(data.pricingGuidance);
  const scores = buildNormalizedScores(data.scores, {
    competitiveReadiness: { fields: ['battlecardCoverage', 'differentiatorStrength', 'competitiveSpecificity'], weights: [0.35, 0.35, 0.3] },
    objectionCoverage: { fields: ['objectionDepth', 'responseQuality', 'proofSupport'], weights: [0.35, 0.4, 0.25] },
    pricingConfidence: { fields: ['pricingGuidanceSpecificity', 'valueJustificationStrength', 'discountLogic'], weights: [0.35, 0.35, 0.3] }
  });

  return {
    scores,
    battlecards: asArray(data.battlecards).map((entry) => {
      const row = asObject(entry);
      return {
        competitor: cleanText(row.competitor),
        strengths: uniqueStrings(asArray(row.strengths), 8),
        weaknesses: uniqueStrings(asArray(row.weaknesses), 8),
        differentiators: uniqueStrings(asArray(row.differentiators), 8),
        objectionHandlers: asArray(row.objectionHandlers).map((item) => {
          const handler = asObject(item);
          return {
            objection: cleanText(handler.objection),
            response: cleanText(handler.response)
          };
        }).filter((item) => item.objection && item.response)
      };
    }).filter((entry) => entry.competitor),
    demoScripts: {
      '5min': cleanText(asObject(data.demoScripts)['5min']),
      '15min': cleanText(asObject(data.demoScripts)['15min']),
      '30min': cleanText(asObject(data.demoScripts)['30min'])
    },
    objectionHandlers: asArray(data.objectionHandlers).map((entry) => {
      const row = asObject(entry);
      return {
        category: cleanText(row.category),
        objection: cleanText(row.objection),
        response: cleanText(row.response),
        supportingData: cleanText(row.supportingData)
      };
    }).filter((entry) => entry.objection && entry.response),
    pricingGuidance: {
      tierRecommendations: cleanText(pricingGuidance.tierRecommendations),
      discountStrategy: cleanText(pricingGuidance.discountStrategy),
      valueJustification: cleanText(pricingGuidance.valueJustification),
      competitivePositioning: cleanText(pricingGuidance.competitivePositioning)
    }
  };
}

function normalizeContentStrategy(raw) {
  const data = asObject(raw);
  const scores = buildNormalizedScores(data.scores, {
    pillarStrength: { fields: ['pillarSpecificity', 'topicQuality', 'purposeClarity'], weights: [0.35, 0.35, 0.3] },
    distributionReadiness: { fields: ['formatRange', 'distributionSpecificity', 'repurposingStrength'], weights: [0.3, 0.35, 0.35] },
    governanceMaturity: { fields: ['reviewDiscipline', 'operationalClarity', 'qualityControl'], weights: [0.35, 0.3, 0.35] }
  });
  const governance = asObject(data.governance);
  return {
    scores,
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
  const scores = buildNormalizedScores(data.scores, {
    offerStrength: { fields: ['promiseStrength', 'offerRelevance', 'formatFit'], weights: [0.4, 0.35, 0.25] },
    conversionReadiness: { fields: ['landingPageClarity', 'ctaStrength', 'outlineQuality'], weights: [0.35, 0.35, 0.3] },
    nurtureReadiness: { fields: ['sequenceQuality', 'followUpSpecificity', 'funnelProgression'], weights: [0.35, 0.35, 0.3] }
  });
  return {
    scores,
    leadMagnets: asArray(data.leadMagnets ?? data.lead_magnets).map((m, idx) => {
      const row = asObject(m);
      const lp = asObject(row.landingPageCopy);
      // cleanText('', fallback) returns '' (empty string is still a string) — keep items with a default name
      const nameFromModel = typeof row.name === 'string' ? row.name.trim() : '';
      return {
        name: nameFromModel || `Lead Magnet ${idx + 1}`,
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

export function normalizeArtifact(type, raw) {
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
    case 'sales_enablement':
      return normalizeSalesEnablement(raw);
    case 'content_strategy':
      return normalizeContentStrategy(raw);
    case 'lead_magnets':
      return normalizeLeadMagnets(raw);
    default:
      return raw;
  }
}

function schemaString() {
  return { type: 'string' };
}

function schemaInteger() {
  return { type: 'integer' };
}

function schemaScoreInteger() {
  return { type: 'integer', minimum: 0, maximum: 100 };
}

function schemaStringArray(minItems = 0, maxItems = 12) {
  return { type: 'array', minItems, maxItems, items: schemaString() };
}

function schemaObject(properties, required = Object.keys(properties)) {
  return {
    type: 'object',
    additionalProperties: false,
    properties,
    required,
  };
}

function schemaArray(itemSchema, minItems = 0, maxItems = 12) {
  return {
    type: 'array',
    minItems,
    maxItems,
    items: itemSchema,
  };
}

function schemaRubric(fields) {
  return schemaObject(
    Object.fromEntries(fields.map((field) => [field, schemaScoreInteger()])),
    fields,
  );
}

function schemaScoreBlock(topLevelFields, rubricMap) {
  return schemaObject({
    ...Object.fromEntries(topLevelFields.map((field) => [field, schemaScoreInteger()])),
    rubric: schemaObject(
      Object.fromEntries(
        Object.entries(rubricMap).map(([key, fields]) => [key, schemaRubric(fields)])
      ),
      Object.keys(rubricMap),
    ),
  }, [...topLevelFields, 'rubric']);
}

function buildGeminiArtifactSchema(type) {
  switch (type) {
    case 'competitor_intelligence':
      return schemaObject({
        scores: schemaScoreBlock(
          ['competitorCoverage', 'differentiationStrength', 'whitespaceOpportunity'],
          {
            competitorCoverage: ['relevanceCoverage', 'sourceCoverage', 'competitiveBreadth'],
            differentiationStrength: ['differentiatorClarity', 'gapSpecificity', 'comparisonDepth'],
            whitespaceOpportunity: ['opportunityQuality', 'messagingWhitespace', 'actionability'],
          },
        ),
        topCompetitors: schemaArray(schemaObject({
          name: schemaString(),
          website: schemaString(),
          whyRelevant: schemaString(),
          positioningSnapshot: schemaString(),
          strengths: schemaStringArray(2, 8),
          weaknesses: schemaStringArray(2, 8),
        }), 4, 6),
        comparison: schemaObject({
          yourDifferentiators: schemaStringArray(2, 8),
          messagingGaps: schemaStringArray(2, 8),
          opportunities: schemaStringArray(2, 8),
        }),
      });
    case 'positioning_messaging':
      return schemaObject({
        scores: schemaScoreBlock(
          ['propositionClarity', 'differentiationStrength', 'messageConsistency'],
          {
            propositionClarity: ['valuePropSpecificity', 'outcomeClarity', 'audienceFit'],
            differentiationStrength: ['differentiatorSpecificity', 'competitiveSeparation', 'proofOrientation'],
            messageConsistency: ['pillarAlignment', 'brandVoiceCohesion', 'pitchConsistency'],
          },
        ),
        valueProposition: schemaString(),
        differentiators: schemaStringArray(3, 8),
        messagingPillars: schemaArray(schemaObject({
          pillar: schemaString(),
          description: schemaString(),
          audienceRelevance: schemaString(),
        }), 3, 6),
        brandVoice: schemaObject({
          tone: schemaStringArray(1, 6),
          dosList: schemaStringArray(2, 8),
          dontsList: schemaStringArray(2, 8),
        }),
        elevatorPitches: schemaObject({
          short: schemaString(),
          medium: schemaString(),
          long: schemaString(),
        }),
      });
    case 'pricing_intelligence':
      return schemaObject({
        scores: schemaScoreBlock(
          ['pricingClarity', 'marketCompetitiveness', 'packagingReadiness'],
          {
            pricingClarity: ['modelSpecificity', 'visibilityClarity', 'valueMetricFit'],
            marketCompetitiveness: ['benchmarkCoverage', 'marketFit', 'pricingPositionLogic'],
            packagingReadiness: ['offerPackagingStrength', 'implementationClarity', 'riskPreparedness'],
          },
        ),
        pricingModelSummary: schemaString(),
        publicPricingVisibility: schemaString(),
        competitorBenchmarks: schemaArray(schemaObject({
          name: schemaString(),
          pricingModel: schemaString(),
          startingPoint: schemaString(),
          notes: schemaString(),
        }), 2, 6),
        packagingRecommendations: schemaArray(schemaObject({
          offer: schemaString(),
          targetCustomer: schemaString(),
          pricingApproach: schemaString(),
          rationale: schemaString(),
        }), 2, 6),
        valueMetrics: schemaStringArray(3, 10),
        risks: schemaStringArray(3, 10),
        nextQuestions: schemaStringArray(3, 10),
      });
    case 'channel_strategy':
      return schemaObject({
        scores: schemaScoreBlock(
          ['channelFit', 'cadenceStrength', 'measurementReadiness'],
          {
            channelFit: ['channelRoleClarity', 'funnelCoverage', 'mixRelevance'],
            cadenceStrength: ['cadenceSpecificity', 'contentMixQuality', 'loopStrength'],
            measurementReadiness: ['budgetLogic', 'measurementSpecificity', 'operationalPracticality'],
          },
        ),
        channels: schemaArray(schemaObject({
          name: schemaString(),
          role: schemaString(),
          cadence: schemaString(),
          contentMix: schemaStringArray(2, 8),
          growthLoops: schemaStringArray(0, 6),
        }), 4, 6),
        budgetSplitGuidance: schemaStringArray(1, 6),
        measurement: schemaStringArray(2, 8),
      });
    case 'website_audit':
      return schemaObject({
        summary: schemaString(),
        firstImpression: schemaObject({
          clarityScore: schemaScoreInteger(),
          trustScore: schemaScoreInteger(),
          visualHierarchyScore: schemaScoreInteger(),
          rubric: schemaObject({
            clarity: schemaRubric(['headlineSpecificity', 'offerClarity', 'ctaClarity']),
            trust: schemaRubric(['proofSignals', 'complianceSignals', 'credibilitySignals']),
            visualHierarchy: schemaRubric(['ctaProminence', 'contentScannability', 'aboveTheFoldStructure']),
          }),
        }),
        conversionFunnel: schemaObject({
          primaryCta: schemaString(),
          recommendedCtas: schemaStringArray(1, 6),
          frictionPoints: schemaStringArray(2, 10),
        }),
        copyRecommendations: schemaObject({
          headlineOptions: schemaStringArray(2, 6),
          ctaCopyOptions: schemaStringArray(2, 6),
        }),
        uxRecommendations: schemaObject({
          quickWins: schemaStringArray(2, 8),
          highImpactChanges: schemaStringArray(2, 8),
        }),
        homepageSections: schemaArray(schemaObject({
          section: schemaString(),
          whatWorks: schemaStringArray(1, 6),
          issues: schemaStringArray(1, 6),
          recommendations: schemaStringArray(1, 6),
        }), 3, 5),
        experiments: schemaArray(schemaObject({
          name: schemaString(),
          hypothesis: schemaString(),
          successMetric: schemaString(),
          implementation: schemaStringArray(2, 4),
        }), 2, 4),
        priorityPlan: schemaArray(schemaObject({
          task: schemaString(),
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          why: schemaString(),
          effort: schemaString(),
          ownerHint: schemaString(),
        }), 5, 8),
      });
    case 'opportunities':
      return schemaObject({
        scores: schemaScoreBlock(
          ['growthPotential', 'quickWinReadiness', 'executionClarity'],
          {
            growthPotential: ['opportunityQuality', 'impactStrength', 'marketRelevance'],
            quickWinReadiness: ['quickWinSpecificity', 'timeToValueClarity', 'nearTermPracticality'],
            executionClarity: ['planSpecificity', 'riskCoverage', 'nextStepActionability'],
          },
        ),
        summary: schemaString(),
        quickWins: schemaArray(schemaObject({
          title: schemaString(),
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          description: schemaString(),
          expectedImpact: schemaString(),
          timeToValue: schemaString(),
        }), 3, 3),
        opportunities: schemaArray(schemaObject({
          title: schemaString(),
          category: schemaString(),
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          effort: schemaString(),
          expectedImpact: schemaString(),
          nextSteps: schemaStringArray(2, 3),
        }), 3, 4),
        risksAndMitigations: schemaArray(schemaObject({
          risk: schemaString(),
          mitigation: schemaString(),
        }), 2, 2),
        ninetyDayPlan: schemaArray(schemaObject({
          week: schemaInteger(),
          focus: schemaString(),
          keyActivities: schemaStringArray(2, 4),
        }), 4, 4),
      });
    case 'icps':
      return schemaObject({
        scores: schemaScoreBlock(
          ['segmentFit', 'targetingClarity', 'activationReadiness'],
          {
            segmentFit: ['icpDefinitionQuality', 'marketFit', 'cohortCoverage'],
            targetingClarity: ['qualifierSpecificity', 'channelClarity', 'messagingAngleStrength'],
            activationReadiness: ['hookClarity', 'priorityUsefulness', 'disqualifierQuality'],
          },
        ),
        icps: schemaArray(schemaObject({
          name: schemaString(),
          who: schemaString(),
          hook: schemaString(),
          channels: schemaStringArray(2, 6),
          qualifiers: schemaStringArray(2, 8),
          disqualifiers: schemaStringArray(1, 8),
        }), 2, 4),
        cohorts: schemaArray(schemaObject({
          name: schemaString(),
          priority: schemaInteger(),
          definition: schemaString(),
          messagingAngle: schemaString(),
        }), 3, 6),
        notes: schemaStringArray(1, 8),
      });
    case 'client_profiling':
      return schemaObject({
        scores: schemaScoreBlock(
          ['segmentCoverage', 'painClarity', 'activationReadiness'],
          {
            segmentCoverage: ['segmentDefinition', 'personaBreadth', 'channelCoverage'],
            painClarity: ['painSpecificity', 'objectionDepth', 'insightQuality'],
            activationReadiness: ['jobsToBeDoneClarity', 'triggerActionability', 'channelUsability'],
          },
        ),
        segments: schemaArray(schemaObject({
          name: schemaString(),
          profile: schemaString(),
          jobsToBeDone: schemaStringArray(3, 8),
          painPoints: schemaStringArray(3, 8),
          objections: schemaStringArray(2, 6),
          triggers: schemaStringArray(2, 6),
          channels: schemaStringArray(2, 6),
        }), 3, 5),
        insights: schemaStringArray(2, 10),
      });
    case 'partner_profiling':
      return schemaObject({
        scores: schemaScoreBlock(
          ['partnerCoverage', 'valueExchangeClarity', 'activationReadiness'],
          {
            partnerCoverage: ['partnerArchetypeCoverage', 'ecosystemFit', 'coverageDepth'],
            valueExchangeClarity: ['mutualValueSpecificity', 'selectionCriteriaQuality', 'commercialClarity'],
            activationReadiness: ['playbookActionability', 'partnerQualificationReadiness', 'executionPracticality'],
          },
        ),
        partnerTypes: schemaArray(schemaObject({
          name: schemaString(),
          valueExchange: schemaString(),
          selectionCriteria: schemaStringArray(2, 8),
          activationPlaybook: schemaStringArray(3, 10),
        }), 3, 5),
        insights: schemaStringArray(2, 10),
      });
    case 'marketing_strategy':
      return schemaObject({
        scores: schemaScoreBlock(
          ['strategicClarity', 'funnelStrength', 'executionReadiness'],
          {
            strategicClarity: ['objectiveSpecificity', 'positioningStrength', 'segmentFocus'],
            funnelStrength: ['funnelCoverage', 'offerChannelFit', 'kpiQuality'],
            executionReadiness: ['planSpecificity', 'riskPreparedness', 'operationalSequencing'],
          },
        ),
        objective: schemaString(),
        positioning: schemaString(),
        targetSegments: schemaStringArray(2, 4),
        messagingPillars: schemaStringArray(3, 5),
        kpis: schemaStringArray(4, 6),
        funnelPlan: schemaArray(schemaObject({
          stage: schemaString(),
          goal: schemaString(),
          channels: schemaStringArray(1, 4),
          offers: schemaStringArray(1, 4),
        }), 3, 3),
        '90DayPlan': schemaArray(schemaObject({
          week: schemaInteger(),
          focus: schemaString(),
          keyActivities: schemaStringArray(2, 3),
        }), 6, 6),
        risksAndMitigations: schemaArray(schemaObject({
          risk: schemaString(),
          mitigation: schemaString(),
        }), 2, 3),
      });
    case 'sales_enablement':
      return schemaObject({
        scores: schemaScoreBlock(
          ['competitiveReadiness', 'objectionCoverage', 'pricingConfidence'],
          {
            competitiveReadiness: ['battlecardCoverage', 'differentiatorStrength', 'competitiveSpecificity'],
            objectionCoverage: ['objectionDepth', 'responseQuality', 'proofSupport'],
            pricingConfidence: ['pricingGuidanceSpecificity', 'valueJustificationStrength', 'discountLogic'],
          },
        ),
        battlecards: schemaArray(schemaObject({
          competitor: schemaString(),
          strengths: schemaStringArray(2, 4),
          weaknesses: schemaStringArray(2, 4),
          differentiators: schemaStringArray(2, 4),
          objectionHandlers: schemaArray(schemaObject({
            objection: schemaString(),
            response: schemaString(),
          }), 2, 3),
        }), 2, 3),
        demoScripts: schemaObject({
          '5min': schemaString(),
          '15min': schemaString(),
          '30min': schemaString(),
        }),
        objectionHandlers: schemaArray(schemaObject({
          category: schemaString(),
          objection: schemaString(),
          response: schemaString(),
          supportingData: schemaString(),
        }), 3, 5),
        pricingGuidance: schemaObject({
          tierRecommendations: schemaString(),
          discountStrategy: schemaString(),
          valueJustification: schemaString(),
          competitivePositioning: schemaString(),
        }),
      });
    case 'content_strategy':
      return schemaObject({
        scores: schemaScoreBlock(
          ['pillarStrength', 'distributionReadiness', 'governanceMaturity'],
          {
            pillarStrength: ['pillarSpecificity', 'topicQuality', 'purposeClarity'],
            distributionReadiness: ['formatRange', 'distributionSpecificity', 'repurposingStrength'],
            governanceMaturity: ['reviewDiscipline', 'operationalClarity', 'qualityControl'],
          },
        ),
        contentPillars: schemaArray(schemaObject({
          name: schemaString(),
          purpose: schemaString(),
          exampleTopics: schemaStringArray(4, 10),
        }), 3, 5),
        formats: schemaStringArray(3, 12),
        distributionRules: schemaStringArray(3, 12),
        repurposingPlan: schemaStringArray(2, 10),
        governance: schemaObject({
          reviewChecklist: schemaStringArray(3, 12),
        }),
      });
    case 'lead_magnets':
      return schemaObject({
        scores: schemaScoreBlock(
          ['offerStrength', 'conversionReadiness', 'nurtureReadiness'],
          {
            offerStrength: ['promiseStrength', 'offerRelevance', 'formatFit'],
            conversionReadiness: ['landingPageClarity', 'ctaStrength', 'outlineQuality'],
            nurtureReadiness: ['sequenceQuality', 'followUpSpecificity', 'funnelProgression'],
          },
        ),
        leadMagnets: schemaArray(schemaObject({
          name: schemaString(),
          format: schemaString(),
          promise: schemaString(),
          outline: schemaStringArray(4, 8),
          landingPageCopy: schemaObject({
            headline: schemaString(),
            subheadline: schemaString(),
            bullets: schemaStringArray(3, 8),
            cta: schemaString(),
          }),
          followUpSequence: schemaArray(schemaObject({
            day: schemaInteger(),
            subject: schemaString(),
            goal: schemaString(),
          }), 3, 5),
        }), 3, 5),
        notes: schemaStringArray(1, 10),
      });
    case 'social_calendar':
      return schemaObject({
        scores: schemaScoreBlock(
          ['channelCoverage', 'cadenceReadiness', 'campaignCohesion'],
          {
            channelCoverage: ['channelDiversity', 'funnelCoverage', 'calendarBreadth'],
            cadenceReadiness: ['cadenceSpecificity', 'assetPracticality', 'operationalConsistency'],
            campaignCohesion: ['themeAlignment', 'ctaClarity', 'messageContinuity'],
          },
        ),
        timezone: schemaString(),
        startDate: schemaString(),
        weeks: schemaInteger(),
        channels: schemaStringArray(2, 4),
        cadence: schemaObject({
          postsPerWeek: schemaInteger(),
        }),
        themes: schemaStringArray(3, 6),
        items: schemaArray(schemaObject({
          date: schemaString(),
          channel: schemaString(),
          format: schemaString(),
          pillar: schemaString(),
          hook: schemaString(),
          captionBrief: schemaString(),
          cta: schemaString(),
          assetNotes: schemaString(),
          complianceNote: schemaString(),
        }), 8, 12),
      });
    case 'lookalike_audiences':
      return schemaObject({
        scores: schemaScoreBlock(
          ['seedQuality', 'targetingDepth', 'launchReadiness'],
          {
            seedQuality: ['firstPartyStrength', 'signalRelevance', 'seedVariety'],
            targetingDepth: ['platformSpecificity', 'exclusionQuality', 'creativeAlignment'],
            launchReadiness: ['measurementClarity', 'executionSpecificity', 'audienceUsability'],
          },
        ),
        seedAudiences: schemaStringArray(3, 10),
        lookalikes: schemaArray(schemaObject({
          platform: schemaString(),
          targeting: schemaStringArray(4, 8),
          exclusions: schemaStringArray(2, 5),
          creativeAngles: schemaStringArray(3, 6),
        }), 2, 6),
        measurement: schemaStringArray(2, 8),
      });
    default:
      return null;
  }
}

async function writeGeminiDebugFile(label, suffix, payload) {
  try {
    await mkdir(GEMINI_DEBUG_DIR, { recursive: true });
    const safeLabel = String(label || 'artifact').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 120);
    const filePath = join(GEMINI_DEBUG_DIR, `${safeLabel}-${Date.now()}-${suffix}.txt`);
    await writeFile(filePath, String(payload || ''), 'utf-8');
    console.warn(`[QueueWorker] Gemini debug captured at ${filePath}`);
  } catch {
    // non-blocking
  }
}

function compactGeminiSystemPrompt(systemPrompt) {
  return String(systemPrompt || '')
    // Gemini already gets the machine-readable schema via responseJsonSchema.
    // Keeping the full textual JSON contract here bloats the request and appears
    // to make the heaviest artifacts less reliable in the worker path.
    .replace(/Output JSON shape:[\s\S]*?(?=(?:Rubric scores must|Provide \d|Define \d|Do not |If public pricing|Funnel plan must|$))/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function sanitizeTraceSegment(value, fallback = 'unknown') {
  return String(value || fallback).replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 120) || fallback;
}

async function writeCompanyIntelTrace(traceContext, filename, payload) {
  if (!traceContext?.companyId || !traceContext?.type) return;
  try {
    const dir = join(
      COMPANY_INTEL_TRACE_DIR,
      sanitizeTraceSegment(traceContext.companyId, 'company'),
      sanitizeTraceSegment(traceContext.type, 'artifact'),
    );
    await mkdir(dir, { recursive: true });
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
    await writeFile(join(dir, filename), body, 'utf-8');
  } catch {
    // non-blocking
  }
}

export async function saveCompanyIntelArtifactTrace(companyId, type, filename, payload) {
  return writeCompanyIntelTrace({ companyId, type }, filename, payload);
}

async function repairGeminiJsonWithGroq({ label, raw, schema, traceContext }) {
  const schemaText = schema ? JSON.stringify(schema) : '{}';
  const repairMessages = [
    {
      role: 'system',
      content: [
        'You convert another LLM output into valid JSON.',
        'Return exactly one valid JSON object and no markdown.',
        'The source may be malformed JSON, bullet points, or sectioned prose.',
        'Preserve the original meaning and wording as much as possible.',
        'Do not add new claims. Only structure, normalize, and minimally repair missing syntax when necessary.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `Artifact label: ${label}`,
        `Target JSON schema: ${schemaText}`,
        'Source output to convert:',
        raw || '<empty>',
      ].join('\n\n'),
    },
  ];

  let lastError = null;
  for (const model of GEMINI_JSON_REPAIR_GROQ_MODELS) {
    try {
      console.log(`[QueueWorker] Trying Groq JSON repair model "${model}" for ${label}...`);
      const completion = await groq.chat.completions.create({
        model,
        messages: repairMessages,
        temperature: 0,
        ...(model.startsWith('groq/compound')
          ? {
            max_completion_tokens: 2200,
            top_p: 1,
          }
          : {
            response_format: { type: 'json_object' },
          }),
      });
      const repairedRaw = completion.choices[0]?.message?.content?.trim() || '';
      const repairedCandidate = extractJsonObject(repairedRaw);
      if (!repairedCandidate) throw new Error(`Repair model "${model}" did not return JSON`);
      const parsed = JSON.parse(repairedCandidate);
      await writeCompanyIntelTrace(traceContext, 'gemini-repair-raw.txt', repairedRaw);
      await writeCompanyIntelTrace(traceContext, 'gemini-repair-json.json', parsed);
      console.log(`[QueueWorker] Groq JSON repair model "${model}" recovered valid JSON for ${label}.`);
      return parsed;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error(`Failed to repair malformed Gemini JSON for ${label}`);
}

async function generateJsonWithGemini({ model, systemPrompt, userContent, temperature, maxCompletionTokens, label, schema, traceContext }) {
  if (!gemini) throw new Error('Gemini API key is not configured');

  console.log(`[QueueWorker] Trying Gemini model "${model}" for ${label}...`);
  try {
    const compactSystemPrompt = compactGeminiSystemPrompt(systemPrompt);
    const response = await gemini.models.generateContent({
      model,
      contents: [
        `System instructions:\n${compactSystemPrompt}`,
        `User input:\n${userContent}`,
        [
          'Write a structured analysis in plain text, not JSON.',
          'Use short section headings and bullet points where helpful.',
          'Mirror the requested field names and structure conceptually, but do not use braces, brackets, or JSON syntax.',
          'Do not use curly braces, square brackets, quoted keys, comma-delimited object fields, or key:value formatting.',
          'Do not start lines with field names followed by a colon.',
          'Use readable headings like Summary, Quick Wins, Opportunities, Risks, and 90-Day Plan.',
          'Be concise, specific, and complete enough for a downstream parser to reconstruct the artifact.',
        ].join(' ')
      ].join('\n\n'),
      config: {
        temperature,
        maxOutputTokens: maxCompletionTokens,
        thinkingConfig: {
          thinkingLevel: GEMINI_THINKING_LEVEL,
        },
      },
    });

    const raw = typeof response.text === 'function' ? await response.text() : response.text;
    await writeCompanyIntelTrace(traceContext, 'gemini-raw.txt', raw || '');
    const candidate = extractJsonObject(raw || '');
    if (!candidate) {
      await writeGeminiDebugFile(label, 'raw-invalid-json', raw || '<empty>');
      try {
        return await repairGeminiJsonWithGroq({ label, raw: raw || '', schema, traceContext });
      } catch {
        throw new Error(`Gemini model "${model}" did not return valid JSON for ${label}`);
      }
    }
    try {
      const parsed = JSON.parse(candidate);
      await writeCompanyIntelTrace(traceContext, 'gemini-json.json', parsed);
      console.log(`[QueueWorker] Gemini model "${model}" succeeded for ${label}.`);
      return parsed;
    } catch (error) {
      await writeGeminiDebugFile(label, 'raw-parse-failure', raw || '<empty>');
      try {
        return await repairGeminiJsonWithGroq({ label, raw: candidate, schema, traceContext });
      } catch {
        throw error;
      }
    }
  } catch (error) {
    const details = error instanceof Error
      ? `${error.name}: ${error.message}\n${error.stack || ''}`
      : String(error);
    await writeGeminiDebugFile(label, 'error', details);
    throw error;
  }
}

export async function generateArtifactWithGroq(type, companyName, inputs, options = {}) {
  let lastError = null;
  const generationInputs = buildGenerationInputs(type, inputs, options);
  const spec = buildArtifactSpec(type, companyName, generationInputs);
  const geminiUserContent = `Inputs: ${JSON.stringify(generationInputs)}`;
  const geminiSchema = buildGeminiArtifactSchema(type);
  const traceContext = {
    companyId: options.companyId,
    type,
  };

  if (COMPANY_INTEL_PRIMARY_PROVIDER === 'gemini') {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        return await generateJsonWithGemini({
          model: COMPANY_INTEL_GEMINI_MODEL,
          systemPrompt: spec.systemPrompt,
          userContent: geminiUserContent,
          temperature: spec.temperature,
          maxCompletionTokens: spec.maxCompletionTokens,
          label: `${type} (attempt ${attempt})`,
          schema: geminiSchema,
          traceContext,
        });
      } catch (error) {
        lastError = error;
        if (attempt < 2) {
          console.warn(`[QueueWorker] Gemini attempt ${attempt} failed for ${type}, retrying once: ${error.message}`);
          continue;
        }
        console.warn(`[QueueWorker] Gemini primary failed for ${type}, falling back to Groq: ${error.message}`);
      }
    }
  }

  for (const model of COMPANY_INTEL_GROQ_MODELS) {
    const messages = [
      {
        role: 'system',
        content: spec.systemPrompt
      },
      {
        role: 'user',
        content: `Inputs: ${JSON.stringify(generationInputs)}`
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
  const queueReadClient = getQueueReadClient()

  // 1. Try to pop a job from Postgres via Supabase RPC (Atomic Lock)
  if (queueReadClient) {
    try {
      const { data, error } = await queueReadClient.rpc('take_next_job');
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
  const embeddedCompanyContext = inputs?.__companyContext && typeof inputs.__companyContext === 'object'
    ? { company: inputs.__companyContext, artifacts: {} }
    : null;
  const safeInputs = { ...(inputs || {}) };
  delete safeInputs.__companyContext;

  // Need to load the company data context
  const companyData =
    (await loadCompanyWithArtifacts(companyId)) ||
    companyContextCache.get(companyId) ||
    embeddedCompanyContext ||
    null;
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
      ...safeInputs,
      websiteUrl,
      companyProfile: profile
    }, {
      companyId,
      existingArtifacts: companyData.artifacts || {},
    });
    const artifact = { type, updatedAt: now, data: normalizeArtifact(type, directGroqData) };
    await saveCompanyIntelArtifactTrace(companyId, type, 'final-artifact.json', artifact.data);
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
        body: JSON.stringify({ company_name: companyName, company_url: websiteUrl, artifact_type: type, inputs: safeInputs, company_profile: profile })
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
  const queueWriteClient = getQueueWriteClient()
  if (!queueWriteClient) return;
  try {
    const payload = { status, updated_at: new Date().toISOString() };
    if (status === 'completed' || status === 'failed') payload.completed_at = payload.updated_at;
    if (errorMessage) payload.error_message = errorMessage;

    await queueWriteClient.from('generation_jobs').update(payload).eq('id', jobId);
  } catch (err) { }
}

/**
 * Enqueue helper: pushes to the Supabase Postgres Queue table safely,
 * or falls back to an in-memory queue array.
 */
export async function enqueueGeneration(companyData, type, inputs, options = {}) {
  if (companyData?.id) {
    const cached = companyContextCache.get(companyData.id) || { company: companyData, artifacts: {} };
    cached.company = companyData;
    companyContextCache.set(companyData.id, cached);
  }

  if (options.preferMemory) {
    inMemoryQueue.push({
      companyId: companyData.id,
      type,
      inputs: {
        ...(inputs || {}),
        __companyContext: {
          id: companyData.id,
          companyName: companyData.companyName,
          websiteUrl: companyData.websiteUrl,
          profile: companyData.profile || {},
          createdAt: companyData.createdAt || null,
          updatedAt: companyData.updatedAt || null,
        },
      },
      fromSupabase: false,
    });
    processQueue();
    return;
  }

  const queueWriteClient = getQueueWriteClient()
  if (queueWriteClient) {
    try {
      const payload = {
        company_id: companyData.id,
        artifact_type: type,
        inputs: {
          ...(inputs || {}),
          __companyContext: {
            id: companyData.id,
            companyName: companyData.companyName,
            websiteUrl: companyData.websiteUrl,
            profile: companyData.profile || {},
            createdAt: companyData.createdAt || null,
            updatedAt: companyData.updatedAt || null,
          },
        },
        status: 'pending', // Re-queue if it previously failed
        error_message: null
      };

      const { error } = await queueWriteClient
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
