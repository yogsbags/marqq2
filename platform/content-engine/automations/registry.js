/**
 * Automation Registry
 * ===================
 * Catalog of 5 named automations that agents can declare in their contract JSON.
 * Dispatcher executes them after each agent run via executeAutomationTriggers.
 *
 * Usage in contract:
 *   "automation_triggers": [
 *     { "automation_id": "fetch_meta_ads", "params": { "ad_account_id": "...", "date_range": "last_7d" }, "reason": "..." }
 *   ]
 */

import { ytDlpYoutubeFetch } from './handlers/ytdlp.js';
import { socialIntelExtract } from './handlers/social.js';
import { adsIntelScrape } from './handlers/ads.js';
import { adsIntelAnalyze } from './handlers/adsAnalysis.js';
import { executeComposioAction, getConnectedAccountToken, getConnectedAccountApiKey } from '../mcp-router.js';
import { routeLeads, routingSummary, groupByChannel, explainRouting } from './channelRouter.js';
import {
  generateSocialImage,
  generateEmailHtml,
  generateFacelessVideo,
  generateAvatarVideo,
  createSeoArticle,
} from './handlers/contentCreation.js';

export const REGISTRY = [
  {
    id: "yt_dlp_youtube_fetch",
    name: "YouTube Channel Monitor",
    description: "Fetches latest videos + transcripts from tracked YouTube channels using yt-dlp. Deduplicates against stored videos — only processes new content.",
    category: "content_intelligence",
    trigger_type: "direct_api",
    endpoint: null,
    params_schema: {
      channels: "Array of { url: string, type: 'own'|'competitor', name?: string }",
      limit: "Max videos per channel (default 20)",
      fetch_transcripts: "Whether to fetch transcripts (default true)",
    },
    returns: "{ new_videos: number, channels: [...], digest: string }",
    which_agents_can_invoke: ["isha", "maya", "arjun", "veena"],
    requires_credential: null,
  },
  {
    id: "social_intel_extract",
    name: "Social Intelligence Monitor",
    description: "Discovers recent posts from tracked social accounts (Instagram, Twitter, Facebook, YouTube) and extracts structured intelligence via Supadata /extract. Deduplicates — only processes new posts. Costs 1 Supadata credit per post.",
    category: "content_intelligence",
    trigger_type: "direct_api",
    endpoint: null,
    params_schema: {
      platforms:    "Optional string[] filter e.g. ['instagram','twitter'] (default: all active)",
      account_type: "Optional 'competitor' | 'own' (default: all)",
      limit:        "Max posts to process per account (default: 5)",
      sort_by:      "'recent' (default) | 'views' — YouTube only: recent = newest first, views = top by view count",
    },
    returns: "{ new_posts: number, accounts: [...], digest: string }",
    which_agents_can_invoke: ["isha", "maya", "arjun", "veena"],
    requires_credential: null,
  },
  {
    id: "ads_intel_analyze",
    name: "Ads Intelligence Analyzer",
    description: "Analyzes stored competitor ads (from ads_intel_scrape) against the company's MKG positioning. Identifies channel gaps, messaging themes, white space opportunities, and generates specific ad angle recommendations. Stores result in company_artifacts as 'ads_intel_analysis'.",
    category: "competitive_intel",
    trigger_type: "direct_api",
    endpoint: null,
    params_schema: {},
    returns: "{ analysis: { channel_gaps, messaging_themes, competitor_summary, white_space, recommended_angles }, ads_count, competitors_analyzed }",
    which_agents_can_invoke: ["isha", "maya", "arjun", "veena"],
    requires_credential: null,
  },
  {
    id: "ads_intel_scrape",
    name: "Ads Intelligence Scraper",
    description: "Scrapes competitor ads from LinkedIn Ad Library, Facebook Ad Library, and Google Ads Transparency Center using Apify. Stores ad creatives, copy, targeting, spend ranges, and impression data in competitor_ads table.",
    category: "competitive_intel",
    trigger_type: "direct_api",
    endpoint: null,
    params_schema: {
      competitors:  "Array of { name, linkedin_company?, facebook_page?, google_domain? }",
      platforms:    "Optional string[] e.g. ['linkedin','facebook'] (default: all three)",
      country:      "ISO 2-letter country code (default: 'IN')",
      limit:        "Max ads per competitor per platform (default: 20)",
    },
    returns: "{ total_new: number, results: [...], digest: string }",
    which_agents_can_invoke: ["isha", "maya", "arjun", "veena"],
    requires_credential: null,
  },
  {
    id: "fetch_meta_ads",
    name: "Fetch Meta Ads Performance",
    description: "Pulls ad performance metrics directly from Meta Ads Graph API via Composio OAuth token",
    category: "paid_media",
    trigger_type: "direct_api",
    endpoint: null,
    params_schema: {
      ad_account_id: "Meta Ads account ID (act_XXXXXXXXXX)",
      date_range: "e.g. last_7d or last_30d",
    },
    returns: "{ campaigns: [...], adsets: [...], ads: [...] }",
    which_agents_can_invoke: ["isha", "maya", "arjun"],
    requires_credential: "meta_ads",
  },
  {
    id: "competitor_ad_library",
    name: "Competitor Ad Library Scrape",
    description: "Scrapes Meta Ad Library public API for competitor creatives",
    category: "competitive_intel",
    trigger_type: "direct_api",
    endpoint: "META_AD_LIBRARY_API_URL",
    params_schema: {
      search_term: "Brand or keyword to search",
      country: "Two-letter country code e.g. IN",
    },
    returns: "{ ads: [{ id, page_name, creative, impressions_range }] }",
    which_agents_can_invoke: ["*"],
    requires_credential: null,
  },
  {
    id: "creative_fatigue_check",
    name: "Creative Fatigue Check",
    description: "Analyses CTR trend and frequency to identify fatigued ad creatives",
    category: "creative_analysis",
    trigger_type: "internal_fn",
    endpoint: null,
    params_schema: {
      ads: "Array of { name, impressions, clicks, frequency }",
    },
    returns: "{ fatigued_ads: [...], healthy_ads: [...], summary: string }",
    which_agents_can_invoke: ["isha", "maya"],
    requires_credential: null,
  },
  {
    id: "google_ads_fetch",
    name: "Fetch Google Ads Performance",
    description: "Pulls Google Ads campaign and keyword performance directly via Composio OAuth token + Google Ads API",
    category: "paid_media",
    trigger_type: "direct_api",
    endpoint: null,
    params_schema: {
      campaign_name: "Optional — fetch a specific campaign by exact name",
      campaign_id: "Optional — fetch a specific campaign by ID",
    },
    returns: "{ campaigns: [...], customer_lists: [...] }",
    which_agents_can_invoke: ["isha", "arjun"],
    requires_credential: "google_ads",
  },
  {
    id: "route_leads",
    name: "Route Leads by Channel",
    description: "Scores each lead against channel routing rules (seniority, quality, industry, spam count, data availability) and returns leads grouped by best channel: linkedin, email, whatsapp, voicebot, phone. Also builds multi-step sequences for high-ICP leads.",
    category: "lead_routing",
    trigger_type: "direct_api",
    params_schema: {
      leads: "Array of lead objects (from leads DB /fetch or /enrich/bulk)",
    },
    returns: "{ routed_leads, summary, groups: { linkedin, email, whatsapp, voicebot, phone } }",
    which_agents_can_invoke: ["isha", "neel", "sam", "kiran"],
    requires_credential: null,
  },
  {
    id: "heyreach_linkedin_campaign",
    name: "HeyReach LinkedIn Campaign",
    description: "Creates a LinkedIn outreach campaign via HeyReach. Adds leads with LinkedIn URLs to a new list and returns campaign details.",
    category: "outreach",
    trigger_type: "direct_api",
    params_schema: {
      campaign_name: "Campaign name",
      leads: "Array of { linkedin_url, first_name, last_name, company }",
      message_template: "Connection request message (max 300 chars, supports {{first_name}}, {{company}})",
    },
    returns: "{ list_id, campaign_id, leads_added }",
    which_agents_can_invoke: ["sam", "kiran", "neel"],
    requires_credential: "heyreach",
  },
  {
    id: "lemlist_linkedin_campaign",
    name: "Lemlist LinkedIn + Email Sequence",
    description: "Creates a multichannel sequence in Lemlist: LinkedIn connection → email follow-up. Best for high-ICP leads with both LinkedIn and email.",
    category: "outreach",
    trigger_type: "direct_api",
    params_schema: {
      campaign_name: "Campaign name",
      leads: "Array of { email, linkedin_url, first_name, last_name, company, personalization }",
      linkedin_message: "LinkedIn connection message",
      email_subject: "Follow-up email subject",
      email_body: "Follow-up email body",
    },
    returns: "{ campaign_id, leads_added }",
    which_agents_can_invoke: ["sam", "kiran"],
    requires_credential: "lemlist",
  },
  {
    id: "heyreach_list_campaigns",
    name: "HeyReach List Campaigns",
    description: "Lists HeyReach campaigns for lightweight LinkedIn campaign monitoring.",
    category: "outreach",
    trigger_type: "direct_api",
    params_schema: {
      limit: "Max campaigns to fetch (default 10)",
      keyword: "Optional campaign name filter",
    },
    returns: "{ campaigns: [...], count }",
    which_agents_can_invoke: ["sam", "kiran", "neel"],
    requires_credential: "heyreach",
  },
  {
    id: "heyreach_list_conversations",
    name: "HeyReach List Conversations",
    description: "Lists recent HeyReach LinkedIn conversations for a campaign when available.",
    category: "outreach",
    trigger_type: "direct_api",
    params_schema: {
      campaign_id: "Optional campaign ID",
      limit: "Max conversations to fetch (default 5)",
    },
    returns: "{ conversations: [...], count }",
    which_agents_can_invoke: ["sam", "kiran", "neel"],
    requires_credential: "heyreach",
  },
  {
    id: "lemlist_list_campaigns",
    name: "Lemlist List Campaigns",
    description: "Lists Lemlist campaigns so the UI can show recent sequence state.",
    category: "outreach",
    trigger_type: "direct_api",
    params_schema: {
      limit: "Max campaigns to fetch (default 10)",
      status: "Optional campaign status filter",
    },
    returns: "{ campaigns: [...], count }",
    which_agents_can_invoke: ["sam", "kiran", "neel"],
    requires_credential: "lemlist",
  },
  {
    id: "lemlist_get_campaign_stats",
    name: "Lemlist Campaign Stats",
    description: "Fetches campaign performance stats for a Lemlist campaign.",
    category: "outreach",
    trigger_type: "direct_api",
    params_schema: {
      campaign_id: "Lemlist campaign ID",
    },
    returns: "{ campaign_id, analytics }",
    which_agents_can_invoke: ["sam", "kiran", "neel"],
    requires_credential: "lemlist",
  },
  {
    id: "lemlist_get_team_credits",
    name: "Lemlist Team Credits",
    description: "Fetches remaining Lemlist team credits for monitoring capacity.",
    category: "outreach",
    trigger_type: "direct_api",
    params_schema: {},
    returns: "{ credits_remaining }",
    which_agents_can_invoke: ["sam", "kiran", "neel"],
    requires_credential: "lemlist",
  },
  {
    id: "lemlist_pause_campaign",
    name: "Lemlist Pause Campaign",
    description: "Pauses a running Lemlist campaign.",
    category: "outreach",
    trigger_type: "direct_api",
    params_schema: {
      campaign_id: "Lemlist campaign ID",
    },
    returns: "{ campaign_id, action: 'paused' }",
    which_agents_can_invoke: ["sam", "kiran", "neel"],
    requires_credential: "lemlist",
  },
  {
    id: "instantly_create_campaign",
    name: "Instantly Email Campaign",
    description: "Creates an email outreach campaign in Instantly and bulk-adds leads to it. Returns campaign_id and count of leads added.",
    category: "outreach",
    trigger_type: "direct_api",
    params_schema: {
      name: "Campaign name",
      subject: "Email subject line (supports {{first_name}}, {{company}})",
      body: "Email body (supports {{first_name}}, {{company}}, {{personalization}})",
      from_email: "Sender email address (optional — uses connected account default)",
      daily_limit: "Max emails per day (default 50)",
      leads: "Array of { email, first_name, last_name, company_name, personalization }",
    },
    returns: "{ campaign_id, campaign_name, leads_added, message }",
    which_agents_can_invoke: ["sam", "kiran", "neel"],
    requires_credential: "instantly",
  },
  {
    id: "instantly_list_campaigns",
    name: "Instantly List Campaigns",
    description: "Lists Instantly campaigns so the product can resume, inspect, or monitor launched outreach.",
    category: "outreach",
    trigger_type: "direct_api",
    params_schema: {
      limit: "Max campaigns to fetch (default 25)",
      search: "Optional text filter by campaign name",
    },
    returns: "{ campaigns: [...], count }",
    which_agents_can_invoke: ["sam", "kiran", "neel"],
    requires_credential: "instantly",
  },
  {
    id: "instantly_get_campaign_analytics",
    name: "Instantly Campaign Analytics",
    description: "Fetches Instantly analytics for a single campaign including opens, replies, sends, and related performance metrics.",
    category: "outreach",
    trigger_type: "direct_api",
    params_schema: {
      campaign_id: "Instantly campaign ID",
    },
    returns: "{ campaign_id, analytics }",
    which_agents_can_invoke: ["sam", "kiran", "neel"],
    requires_credential: "instantly",
  },
  {
    id: "instantly_get_campaign_status",
    name: "Instantly Campaign Sending Status",
    description: "Fetches the sending state for an Instantly campaign so the UI can show whether a campaign is active, paused, or blocked.",
    category: "outreach",
    trigger_type: "direct_api",
    params_schema: {
      campaign_id: "Instantly campaign ID",
    },
    returns: "{ campaign_id, sending_status }",
    which_agents_can_invoke: ["sam", "kiran", "neel"],
    requires_credential: "instantly",
  },
  {
    id: "instantly_pause_campaign",
    name: "Instantly Pause Campaign",
    description: "Pauses an Instantly campaign so sending stops immediately.",
    category: "outreach",
    trigger_type: "direct_api",
    params_schema: {
      campaign_id: "Instantly campaign ID",
    },
    returns: "{ campaign_id, action: 'paused' }",
    which_agents_can_invoke: ["sam", "kiran", "neel"],
    requires_credential: "instantly",
  },
  {
    id: "instantly_activate_campaign",
    name: "Instantly Activate Campaign",
    description: "Activates or resumes an Instantly campaign when it is ready to send.",
    category: "outreach",
    trigger_type: "direct_api",
    params_schema: {
      campaign_id: "Instantly campaign ID",
    },
    returns: "{ campaign_id, action: 'activated' }",
    which_agents_can_invoke: ["sam", "kiran", "neel"],
    requires_credential: "instantly",
  },
  {
    id: "instantly_count_unread_emails",
    name: "Instantly Count Unread Emails",
    description: "Counts unread emails in Instantly so the product can show reply load and inbox urgency.",
    category: "outreach",
    trigger_type: "direct_api",
    params_schema: {},
    returns: "{ unread_count }",
    which_agents_can_invoke: ["sam", "kiran", "neel"],
    requires_credential: "instantly",
  },
  {
    id: "instantly_list_emails",
    name: "Instantly List Emails",
    description: "Lists recent Instantly emails, optionally filtered by campaign, so the UI can show recent reply activity.",
    category: "outreach",
    trigger_type: "direct_api",
    params_schema: {
      campaign_id: "Optional Instantly campaign ID",
      is_unread: "Optional unread filter",
      limit: "Max emails to fetch (default 10)",
    },
    returns: "{ emails: [...], count }",
    which_agents_can_invoke: ["sam", "kiran", "neel"],
    requires_credential: "instantly",
  },
  {
    id: "whatsapp_send_campaign",
    name: "WhatsApp Outreach Campaign",
    description: "Sends WhatsApp outreach messages to leads with phone numbers using the connected WhatsApp Business account. Uses freeform text or an approved template when supplied.",
    category: "outreach",
    trigger_type: "direct_api",
    params_schema: {
      campaign_name: "Campaign name",
      text: "WhatsApp message body (supports {{first_name}}, {{company}}, {{full_name}})",
      template_name: "Approved WhatsApp template name (optional)",
      language_code: "Template language code, default en_US",
      leads: "Array of { phone, first_name, last_name, full_name, company }",
    },
    returns: "{ campaign_name, sent_count, failed_count, phone_number_id, results }",
    which_agents_can_invoke: ["sam", "kiran", "neel"],
    requires_credential: "whatsapp",
  },
  {
    id: "voicebot_campaign_launch",
    name: "Voicebot Outreach Campaign",
    description: "Places outbound voicebot calls to leads with phone numbers using the configured Twilio + voicebot stack.",
    category: "outreach",
    trigger_type: "direct_api",
    params_schema: {
      campaign_name: "Campaign name",
      script_hint: "Opening line or call objective",
      leads: "Array of { phone, name, company, email }",
      language: "en | hi",
      gender: "female | male",
    },
    returns: "{ campaign_name, queued_count, failed_count, calls }",
    which_agents_can_invoke: ["sam", "kiran", "neel"],
    requires_credential: null,
  },
  {
    id: "apollo_lead_enrich",
    name: "Apollo Lead Enrichment",
    description: "Enriches lead records with firmographic and contact data via Apollo API",
    category: "lead_data",
    trigger_type: "direct_api",
    endpoint: "APOLLO_API_URL",
    params_schema: {
      email: "Lead email address",
      domain: "Company domain (optional)",
    },
    returns: "{ person: {...}, organization: {...} }",
    which_agents_can_invoke: ["neel", "sam", "kiran"],
    requires_credential: null,
  },
  {
    id: "apollo_find_leads",
    name: "Apollo Lead Search",
    description: "Uses Apollo prospecting tools to find people first, then falls back to account discovery when people search is unavailable or returns no matches.",
    category: "lead_data",
    trigger_type: "direct_api",
    endpoint: null,
    params_schema: {
      country: "ISO country code (e.g. IN, US)",
      industries: "Optional array of industry names",
      seniorities: "Optional array of seniority names",
      designation_keywords: "Optional comma-separated title keywords",
      cities: "Optional comma-separated cities",
      states: "Optional comma-separated states",
      limit: "Max rows to return (max 100, default 100)",
    },
    returns: "{ leads: [...], source: 'apollo_people_search'|'apollo_search_accounts', count: number }",
    which_agents_can_invoke: ["arjun"],
    requires_credential: "apollo",
  },
  {
    id: "create_meta_campaign",
    name: "Create Meta Ads Campaign",
    description: "Creates a full Meta Ads campaign structure (Campaign → Ad Set → Creative → Ad) via the Meta Marketing API using the connected OAuth token. Supports Traffic, Lead Generation, and Conversions objectives. Returns all created IDs for future management.",
    category: "paid_media",
    trigger_type: "direct_api",
    endpoint: null,
    params_schema: {
      ad_account_id: "Optional — Meta Ads account ID (act_XXXXXXXXXX). Auto-discovered if omitted.",
      campaign_name: "Name for the campaign (required)",
      objective: "OUTCOME_TRAFFIC | OUTCOME_LEADS | OUTCOME_SALES | OUTCOME_AWARENESS (default: OUTCOME_TRAFFIC)",
      daily_budget: "Daily budget in account currency minor units, e.g. 50000 = ₹500 (required)",
      targeting: "Object: { age_min, age_max, geo_locations: { countries: ['IN'] }, genders: [1,2], interests: [] }",
      headline: "Ad headline text (required)",
      primary_text: "Ad body copy (required)",
      link_url: "Destination URL for the ad (required)",
      image_url: "Optional — hosted image URL for the ad creative",
      cta_type: "Call-to-action: LEARN_MORE | SIGN_UP | SHOP_NOW | CONTACT_US (default: LEARN_MORE)",
      page_id: "Facebook Page ID to run ads from. Auto-discovered from me/accounts if omitted.",
      status: "ACTIVE | PAUSED (default: PAUSED — review before going live)",
    },
    returns: "{ campaign_id, adset_id, creative_id, ad_id, status, preview_url }",
    which_agents_can_invoke: ["isha", "maya", "arjun", "tara"],
    requires_credential: "meta_ads",
  },
  // ── Content Creation Automations (Riya + Maya) ─────────────────────────────
  {
    id: "generate_social_image",
    name: "Generate Social Media Image",
    description: "Generates a brand-consistent social media image using Gemini Flash image generation (gemini-3.1-flash-image-preview) and uploads to imgbb CDN for a permanent URL. Supports 1:1, 16:9, 9:16, 4:5 aspect ratios for different platforms.",
    category: "content_creation",
    trigger_type: "direct_api",
    endpoint: null,
    params_schema: {
      prompt: "What to depict in the image (required)",
      aspect_ratio: "1:1 | 16:9 | 9:16 | 4:5 (default: 1:1)",
      platform: "instagram | linkedin | twitter | facebook | youtube (default: instagram)",
      brand_context: "Brand colors, style, or guidelines to guide generation",
      style: "Visual style description (default: professional, clean, modern, minimalist)",
    },
    returns: "{ image_url, cdn_url, platform, aspect_ratio, dimensions, prompt_used, revised_prompt }",
    which_agents_can_invoke: ["riya", "zara", "kiran"],
    requires_credential: null,
  },
  {
    id: "generate_email_html",
    name: "Generate Email Newsletter HTML",
    description: "Generates a complete, email-client-safe HTML newsletter with inline CSS, responsive table layout, header, body sections, and footer. Ready to paste into any ESP (Mailchimp, Klaviyo, SendGrid).",
    category: "content_creation",
    trigger_type: "direct_api",
    endpoint: null,
    params_schema: {
      subject: "Email subject line (required)",
      content: "Main content/brief for the email body",
      tone: "professional | friendly | urgent | educational (default: professional)",
      brand_name: "Company name to display in header",
      primary_color: "Hex color for header and CTAs (default: #f97316)",
      sections: "Array of section titles/descriptions to include",
    },
    returns: "{ html, subject, preview_text, brand_name, primary_color, char_count }",
    which_agents_can_invoke: ["riya", "sam", "kiran"],
    requires_credential: null,
  },
  {
    id: "generate_faceless_video",
    name: "Generate Faceless Video",
    description: "Generates a faceless AI video using Google Veo 3.1 (veo-3.1-generate-preview). Returns the operation_name immediately — poll Gemini operations API for the final video. Best for explainer videos, product demos, and b-roll without a spokesperson.",
    category: "content_creation",
    trigger_type: "direct_api",
    endpoint: null,
    params_schema: {
      prompt: "Scene description for the video (required)",
      duration: "Duration in seconds, max 8 (default: 8)",
      aspect_ratio: "16:9 | 9:16 | 1:1 (default: 16:9)",
      style: "Visual style, e.g. cinematic, documentary, animated (default: cinematic)",
    },
    returns: "{ status: 'queued', request_id, check_url, model, prompt, duration, aspect_ratio }",
    which_agents_can_invoke: ["riya", "zara"],
    requires_credential: null,
  },
  {
    id: "generate_avatar_video",
    name: "Generate Avatar / Spokesperson Video",
    description: "Generates an AI avatar spokesperson video using HeyGen v2. The avatar reads the provided script with the configured voice. Returns a processing job — poll check_url for download_url (~1-3 minutes).",
    category: "content_creation",
    trigger_type: "direct_api",
    endpoint: null,
    params_schema: {
      script: "Full script for the avatar to speak (required)",
      avatar_id: "HeyGen avatar ID (defaults to HEYGEN_AVATAR_ID env var)",
      voice_id: "HeyGen voice ID (defaults to HEYGEN_VOICE_ID env var)",
      background_color: "Hex background color (default: #ffffff)",
      width: "Video width in pixels (default: 1280)",
      height: "Video height in pixels (default: 720)",
    },
    returns: "{ status: 'processing', video_id, check_url, dimensions, script_word_count }",
    which_agents_can_invoke: ["riya", "zara"],
    requires_credential: null,
  },
  {
    id: "create_seo_article",
    name: "Create SEO Blog Article",
    description: "Generates a complete, publish-ready SEO-optimised HTML blog article using Groq LLM. Returns full article HTML with semantic markup, meta description, and URL slug. Designed for Maya to produce actual content, not just briefs.",
    category: "content_creation",
    trigger_type: "direct_api",
    endpoint: null,
    params_schema: {
      keyword: "Primary target keyword (required if topic not provided)",
      topic: "Article topic/title (required if keyword not provided)",
      word_count_target: "Target word count (default: 1200)",
      target_audience: "Who the article is written for (default: B2B decision makers)",
      brand_context: "Company positioning or product context to weave in",
    },
    returns: "{ html, title, meta_description, slug, keyword, word_count, target_audience }",
    which_agents_can_invoke: ["maya", "riya"],
    requires_credential: null,
  },
  {
    id: "optimize_meta_roas",
    name: "Meta Ads ROAS Optimizer",
    description: "Monitors Meta Ads performance and automatically optimizes for best ROAS. Pauses ads below the ROAS threshold, scales daily budget on winning ad sets, and generates an optimization report. Set as a scheduled automation (e.g. every 6 hours) for autonomous management.",
    category: "paid_media",
    trigger_type: "direct_api",
    endpoint: null,
    params_schema: {
      ad_account_id: "Optional — Meta Ads account ID. Auto-discovered if omitted.",
      roas_threshold_pause: "Pause ads with ROAS below this value (default: 1.0 — i.e. spending more than earning)",
      roas_threshold_scale: "Scale budget for ad sets with ROAS above this value (default: 3.0)",
      budget_scale_factor: "Multiply daily budget by this factor for winning ad sets (default: 1.25 = +25%)",
      budget_scale_max: "Max daily budget cap after scaling, in minor currency units (default: no cap)",
      date_range: "last_7d | last_14d | last_30d (default: last_7d)",
      dry_run: "true = report only, no changes made (default: false)",
      campaign_id: "Optional — restrict optimization to one campaign",
    },
    returns: "{ paused_ads: [...], scaled_adsets: [...], no_change: [...], roas_summary: {...}, actions_taken: number, report: string }",
    which_agents_can_invoke: ["isha", "maya", "arjun", "tara"],
    requires_credential: "meta_ads",
  },
];

/**
 * creativeFatigueCheck — internal function
 * Flags ads with high frequency AND CTR below 80% of average.
 */
function creativeFatigueCheck(params) {
  const ads = Array.isArray(params?.ads) ? params.ads : [];

  const adsWithCtr = ads.map((ad) => ({
    ...ad,
    ctr: ad.impressions > 0 ? ad.clicks / ad.impressions : 0,
  }));

  const averageCtr =
    adsWithCtr.length > 0
      ? adsWithCtr.reduce((sum, ad) => sum + ad.ctr, 0) / adsWithCtr.length
      : 0;

  const fatigued_ads = [];
  const healthy_ads = [];

  for (const ad of adsWithCtr) {
    if (ad.frequency > 3 && ad.ctr < averageCtr * 0.8) {
      fatigued_ads.push(ad);
    } else {
      healthy_ads.push(ad);
    }
  }

  const total = adsWithCtr.length;
  let summary;
  if (fatigued_ads.length === 0) {
    summary = `All ${total} ads appear healthy.`;
  } else {
    const names = fatigued_ads.map((a) => a.name).join(", ");
    summary = `${fatigued_ads.length} of ${total} ads are fatigued (high frequency, low CTR). Recommend refreshing: ${names}.`;
  }

  return { fatigued_ads, healthy_ads, summary };
}

/**
 * getComposioToken — fetches an active OAuth access token from Composio for a given company + app.
 * Returns null if COMPOSIO_API_KEY is unset, appName is null, or no active account is found.
 */
async function getComposioToken(companyId, appName) {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey || !appName) return null;
  try {
    let fetchFn;
    try { fetchFn = fetch; } catch { fetchFn = null; }
    if (!fetchFn) {
      const mod = await import('node-fetch').catch(() => null);
      fetchFn = mod?.default || null;
    }
    if (!fetchFn) return null;
    const res = await fetchFn(
      `https://backend.composio.dev/api/v1/connectedAccounts?entityId=${encodeURIComponent(companyId)}&appName=${appName}`,
      { headers: { 'x-api-key': apiKey } }
    );
    const data = await res.json();
    const acct = data.items?.find(a => a.status === 'ACTIVE');
    return acct?.connectionConfig?.access_token || acct?.accessToken || null;
  } catch { return null; }
}

/**
 * directApiHandlers — per-automation_id handlers for trigger_type: "direct_api".
 * Each receives (params, companyId, supabaseClient) and returns a plain result object.
 */
const directApiHandlers = {
  async _heyreachRequest(companyId, path, options = {}) {
    const connectedHeyReach = await getConnectedAccountApiKey('heyreach', companyId);
    const apiKey = connectedHeyReach.api_key || null;
    if (!apiKey) {
      throw new Error(connectedHeyReach.error || 'HeyReach API key not available');
    }

    const res = await fetch(`https://api.heyreach.io/api/public${path}`, {
      ...options,
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.headers || {}),
      },
    });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!res.ok) {
      throw new Error(`HeyReach API Error: ${res.status} - ${data?.message || text || 'Unknown error'}`);
    }
    return data;
  },

  async generate_social_image(params, companyId) {
    return generateSocialImage(params, companyId);
  },
  async generate_email_html(params, companyId) {
    return generateEmailHtml(params, companyId);
  },
  async generate_faceless_video(params, companyId) {
    return generateFacelessVideo(params, companyId);
  },
  async generate_avatar_video(params, companyId) {
    return generateAvatarVideo(params, companyId);
  },
  async create_seo_article(params, companyId) {
    return createSeoArticle(params, companyId);
  },
  async ads_intel_analyze(params, companyId, supabaseClient) {
    if (!supabaseClient) return { status: 'error', error: 'supabaseClient required' };
    return adsIntelAnalyze(params, companyId, supabaseClient);
  },
  async ads_intel_scrape(params, companyId, supabaseClient) {
    if (!supabaseClient) return { status: 'error', error: 'supabaseClient required' };
    return adsIntelScrape(params, companyId, supabaseClient);
  },
  async social_intel_extract(params, companyId, supabaseClient) {
    if (!supabaseClient) return { status: 'error', error: 'supabaseClient required' };
    return socialIntelExtract(params, companyId, supabaseClient);
  },
  async yt_dlp_youtube_fetch(params, companyId, supabaseClient) {
    if (!supabaseClient) {
      return { status: 'error', error: 'supabaseClient required for yt_dlp_youtube_fetch' };
    }
    return ytDlpYoutubeFetch(params, companyId, supabaseClient);
  },
  async competitor_ad_library(params) {
    const appToken = process.env.META_AD_LIBRARY_TOKEN;
    if (!appToken) {
      return { status: 'simulated', message: 'META_AD_LIBRARY_TOKEN not configured', ads: [] };
    }
    let fetchFn;
    try { fetchFn = fetch; } catch { fetchFn = null; }
    if (!fetchFn) {
      const mod = await import('node-fetch').catch(() => null);
      fetchFn = mod?.default || null;
    }
    if (!fetchFn) return { status: 'error', error: 'fetch not available', ads: [] };

    const qs = new URLSearchParams({
      search_terms: params.search_term || '',
      ad_reached_countries: params.country || 'IN',
      fields: 'id,page_name,ad_creative_body,ad_creative_link_caption,impressions',
      limit: '25',
      access_token: appToken,
    });
    const res = await fetchFn(`https://graph.facebook.com/v19.0/ads_archive?${qs}`);
    const data = await res.json();
    if (data.error) return { status: 'error', error: data.error.message, ads: [] };
    const ads = (data.data || []).map(ad => ({
      id: ad.id,
      page_name: ad.page_name,
      creative: ad.ad_creative_body || ad.ad_creative_link_caption || '',
      impressions_range: ad.impressions,
    }));
    return { status: 'completed', ads };
  },

  async apollo_lead_enrich(params) {
    const apiKey = process.env.APOLLO_API_KEY;
    if (!apiKey) {
      return { status: 'simulated', message: 'APOLLO_API_KEY not configured', person: null, organization: null };
    }
    let fetchFn;
    try { fetchFn = fetch; } catch { fetchFn = null; }
    if (!fetchFn) {
      const mod = await import('node-fetch').catch(() => null);
      fetchFn = mod?.default || null;
    }
    if (!fetchFn) return { status: 'error', error: 'fetch not available', person: null, organization: null };

    const res = await fetchFn('https://api.apollo.io/v1/people/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({
        api_key: apiKey,
        email: params.email || null,
        domain: params.domain || null,
        reveal_personal_emails: false,
      }),
    });
    const data = await res.json();
    if (data.error) return { status: 'error', error: data.error, person: null, organization: null };
    return {
      status: 'completed',
      person: data.person || null,
      organization: data.organization || null,
    };
  },

  async apollo_find_leads(params, companyId) {
    const connectedApollo = await getConnectedAccountApiKey('apollo', companyId);
    const apolloApiKey = connectedApollo.api_key || process.env.APOLLO_API_KEY || null;
    if (!apolloApiKey) {
      return { status: 'error', error: connectedApollo.error || 'Apollo API key not available', leads: [], count: 0 };
    }

    const countryMap = { IN: 'India', US: 'United States' };
    const country = countryMap[String(params.country || 'IN').toUpperCase()] || String(params.country || 'India');
    const industries = Array.isArray(params.industries) ? params.industries.map((entry) => String(entry).replace(/_/g, ' ')).filter(Boolean) : [];
    const seniorities = Array.isArray(params.seniorities) ? params.seniorities.map((entry) => String(entry).replace(/_/g, ' ').toLowerCase()) : [];
    const titleKeywords = String(params.designation_keywords || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    const cities = String(params.cities || '').split(',').map((entry) => entry.trim()).filter(Boolean);
    const states = String(params.states || '').split(',').map((entry) => entry.trim()).filter(Boolean);
    const limit = Math.min(Math.max(Number(params.limit) || 100, 1), 100);

    const fetchApollo = async (url, options = {}) => {
      const res = await fetch(url, {
        ...options,
        headers: {
          'x-api-key': apolloApiKey,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          accept: 'application/json',
          ...(options.headers || {}),
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || data?.error_message || data?.message || `Apollo API failed: ${res.status}`);
      }
      return data;
    };

    const mapApolloPersonToLead = (person) => ({
      full_name: person.name || [person.first_name, person.last_name].filter(Boolean).join(' '),
      designation: person.title || person.headline || '—',
      company: person.employment_history?.find?.((job) => job.current)?.organization_name || person.organization_name || '—',
      city: person.city || '',
      state: person.state || '',
      icp_industry: person.organization?.industry || '',
      seniority: person.seniority ? String(person.seniority).toUpperCase() : '',
      phone_e164: person.phone_number || person.phone || '',
      email: person.email || '',
      email_norm: person.email || '',
      has_linkedin: Boolean(person.linkedin_url),
      linkedin_url: person.linkedin_url || '',
      quality: person.email ? 4 : 3,
    });

    const mapApolloAccountToLead = (account) => ({
      full_name: '',
      designation: 'Target Account',
      company: account.name || '—',
      city: account.city || account.organization_city || '',
      state: account.state || account.organization_state || '',
      icp_industry: account.industry || '',
      seniority: 'ACCOUNT',
      phone_e164: account.phone || account.primary_phone?.sanitized_number || '',
      email: '',
      email_norm: '',
      has_linkedin: Boolean(account.linkedin_url),
      linkedin_url: account.linkedin_url || '',
      quality: 3,
      website_url: account.website_url || '',
      domain: account.primary_domain || account.domain || '',
    });

    try {
      const peopleParams = new URLSearchParams({ per_page: String(limit) });
      const peopleTitles = titleKeywords.slice(0, 8);
      for (const title of peopleTitles) peopleParams.append('person_titles[]', title);
      const personLocations = [...cities, ...states, country].slice(0, 5);
      for (const location of personLocations) peopleParams.append('person_locations[]', location);
      const qKeywords = industries.join(' ');
      if (qKeywords) peopleParams.set('q_keywords', qKeywords);

      const peopleSearch = await fetchApollo(`https://api.apollo.io/api/v1/mixed_people/api_search?${peopleParams.toString()}`, {
        method: 'POST',
      });
      const peopleIds = (peopleSearch.people || []).map((person) => person.id).filter(Boolean).slice(0, limit);
      if (peopleIds.length > 0) {
        const enrichData = await fetchApollo('https://api.apollo.io/api/v1/people/bulk_match', {
          method: 'POST',
          body: JSON.stringify({
            details: peopleIds.map((id) => ({ id })),
            reveal_personal_emails: false,
            reveal_phone_number: false,
          }),
        });
        const people = enrichData.matches || [];
        return {
          status: 'completed',
          source: 'apollo_people_search',
          count: people.length,
          leads: people.map(mapApolloPersonToLead).filter((lead) => lead.company || lead.full_name),
        };
      }
    } catch {
      // Fall through to account search.
    }

    const accountQueries = industries.length
      ? industries
      : [titleKeywords[0], states[0], cities[0], country].filter(Boolean);

    try {
      const accountMap = new Map();
      for (const query of accountQueries) {
        if (accountMap.size >= limit) break;
        const accountArgs = {
          per_page: Math.max(1, Math.min(10, limit - accountMap.size)),
          q_organization_name: query,
        };
        const accountData = await fetchApollo('https://api.apollo.io/api/v1/mixed_companies/search', {
          method: 'POST',
          body: JSON.stringify(accountArgs),
        });
        const accounts = accountData.accounts || [];
        if (!Array.isArray(accounts) || accounts.length === 0) continue;
        for (const account of accounts) {
          const key = account.primary_domain || account.domain || account.name;
          if (!key || accountMap.has(key)) continue;
          accountMap.set(key, account);
          if (accountMap.size >= limit) break;
        }
      }
      const accounts = Array.from(accountMap.values());
      if (accounts.length > 0) {
        return {
          status: 'completed',
          source: 'apollo_search_accounts',
          count: accounts.length,
          leads: accounts.map(mapApolloAccountToLead).filter((lead) => lead.company),
        };
      }
      return {
        status: 'completed',
        source: 'apollo_search_accounts',
        count: 0,
        leads: [],
        message: 'Apollo returned no matching leads or accounts',
      };
    } catch (err) {
      return { status: 'error', error: err.message, leads: [], count: 0 };
    }
  },

  // ── Google Ads — via Composio toolkit actions ─────────────────────────────
  // Composio handles OAuth, token refresh, developer token, and scopes.
  // Available actions: GET_CAMPAIGN_BY_ID, GET_CAMPAIGN_BY_NAME,
  //   CREATE_CUSTOMER_LIST, GET_CUSTOMER_LISTS
  // For performance data (impressions/clicks/spend) we fetch campaigns by name
  // then enrich — Composio executes GAQL under the hood.
  async google_ads_fetch(params, companyId) {
    const results = { customer_lists: [], campaigns: [], notes: [] };

    // 1. Customer lists — requires Google Customer Match allowlisting.
    //    Treat 501/UNIMPLEMENTED as soft limitation, not a fatal error.
    const listsResult = await executeComposioAction('GOOGLEADS_GET_CUSTOMER_LISTS', {}, companyId);
    if (listsResult.error) {
      const raw = (listsResult.raw?.error || listsResult.error || '').toString();
      const isNotConnected = /not connected|credentials|auth|token/i.test(raw);
      const is501 = /501|UNIMPLEMENTED|not implemented/i.test(raw);
      if (isNotConnected) {
        return { status: 'error', error: 'Google Ads not connected. Connect in Settings → Accounts.', campaigns: [], customer_lists: [] };
      }
      results.notes.push(is501
        ? 'Customer Lists API not available for this account (requires Google Customer Match allowlisting)'
        : `Customer Lists: ${listsResult.error}`
      );
    } else {
      results.customer_lists = listsResult.result ?? [];
    }

    // 2. Campaign lookup (optional)
    if (params.campaign_name) {
      const byName = await executeComposioAction('GOOGLEADS_GET_CAMPAIGN_BY_NAME', { name: params.campaign_name }, companyId);
      results.campaign = byName.error ? { error: byName.error } : byName.result;
    } else if (params.campaign_id) {
      const byId = await executeComposioAction('GOOGLEADS_GET_CAMPAIGN_BY_ID', { id: params.campaign_id }, companyId);
      results.campaign = byId.error ? { error: byId.error } : byId.result;
    }

    return { status: 'completed', ...results };
  },

  // ── Meta Ads — via Composio METAADS_* toolkit actions ────────────────────
  // Composio's metaads toolkit (53 actions) handles OAuth, token refresh,
  // and all Meta Marketing API calls. We use executeComposioAction throughout.
  // For ad/adset status updates (no Composio action exists), we fall back to
  // the stored token + direct Graph API calls.

  /**
   * Resolve ad account ID and Facebook Page ID via Composio actions.
   * Returns { adAccountId, pageId } — pageId may be null if no page found.
   */
  async _metaSetup(params, companyId) {
    let adAccountId = params.ad_account_id;
    let pageId = params.page_id || null;

    // Use direct Graph API for account/page discovery (no Composio actions for these)
    const tokenResult = await getConnectedAccountToken('meta_ads', companyId);
    if (tokenResult.error) throw new Error(`Meta Ads not connected: ${tokenResult.error}`);
    const { access_token } = tokenResult;

    if (!adAccountId) {
      const r = await fetch(
        `https://graph.facebook.com/v19.0/me/adaccounts?fields=id,name,account_status&access_token=${access_token}`
      );
      const data = await r.json();
      if (data.error) throw new Error(`Meta adaccounts error: ${data.error.message}`);
      const accounts = data.data || [];
      const active = accounts.find(a => a.account_status === 1) || accounts[0];
      if (!active?.id) throw new Error('No active Meta ad account found. Connect Meta Ads in Settings → Accounts.');
      adAccountId = active.id.startsWith('act_') ? active.id : `act_${active.id}`;
    }

    if (!pageId) {
      const r = await fetch(
        `https://graph.facebook.com/v19.0/me/accounts?fields=id,name&access_token=${access_token}`
      );
      const data = await r.json();
      const pages = data.data || [];
      // Prefer a page whose name matches the ad account name
      const acctName = (adAccountId || '').toLowerCase();
      const matched = pages.find(p => p.name && acctName.includes(p.name.toLowerCase().split(' ')[0]));
      if (matched) pageId = matched.id;
      else if (pages.length) pageId = pages[0].id;
    }

    return { adAccountId, pageId, access_token };
  },

  async create_meta_campaign(params, companyId) {
    if (!params.campaign_name) return { status: 'error', error: 'campaign_name is required' };
    if (!params.daily_budget)  return { status: 'error', error: 'daily_budget is required (minor currency units, e.g. 50000 = ₹500)' };
    if (!params.headline)      return { status: 'error', error: 'headline is required' };
    if (!params.primary_text)  return { status: 'error', error: 'primary_text is required' };
    if (!params.link_url)      return { status: 'error', error: 'link_url is required' };

    let adAccountId, pageId, access_token;
    try {
      ({ adAccountId, pageId, access_token } = await directApiHandlers._metaSetup(params, companyId));
    } catch (e) {
      return { status: 'error', error: e.message };
    }

    // Use OUTCOME_* objectives (Meta Graph API v19+ requires these)
    const VALID_OBJECTIVES = ['OUTCOME_LEADS','OUTCOME_SALES','OUTCOME_TRAFFIC','OUTCOME_AWARENESS','OUTCOME_ENGAGEMENT','OUTCOME_APP_PROMOTION'];
    const objective = VALID_OBJECTIVES.includes(params.objective) ? params.objective : 'OUTCOME_TRAFFIC';
    const optimizationGoalMap = {
      OUTCOME_TRAFFIC: 'LINK_CLICKS', OUTCOME_LEADS: 'LEAD_GENERATION',
      OUTCOME_SALES: 'OFFSITE_CONVERSIONS', OUTCOME_AWARENESS: 'REACH',
      OUTCOME_ENGAGEMENT: 'POST_ENGAGEMENT', OUTCOME_APP_PROMOTION: 'APP_INSTALLS',
    };
    const optimizationGoal = optimizationGoalMap[objective] || 'LINK_CLICKS';
    const campaignStatus = params.status || 'PAUSED';
    const ctaType       = params.cta_type || 'LEARN_MORE';
    const targeting     = params.targeting || { age_min: 18, age_max: 65, geo_locations: { countries: ['IN'] } };
    const GRAPH = 'https://graph.facebook.com/v19.0';

    // 1. Create Campaign (direct Graph API — Composio schema validation is outdated for objectives)
    const c1 = await fetch(`${GRAPH}/${adAccountId}/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: params.campaign_name,
        objective,
        status: campaignStatus,
        special_ad_categories: [],
        is_adset_budget_sharing_enabled: false,
        access_token,
      }),
    });
    const c1d = await c1.json();
    if (c1d.error) return { status: 'error', error: `Campaign: ${c1d.error.message}`, step: 'campaign' };
    const campaignId = c1d.id;

    // 2. Create Ad Set
    const c2 = await fetch(`${GRAPH}/${adAccountId}/adsets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `${params.campaign_name} — Ad Set`,
        campaign_id: campaignId,
        daily_budget: params.daily_budget,
        billing_event: 'IMPRESSIONS',
        optimization_goal: optimizationGoal,
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        targeting,
        status: campaignStatus,
        access_token,
      }),
    });
    const c2d = await c2.json();
    if (c2d.error) return { status: 'error', error: `Ad Set: ${c2d.error.message}`, step: 'adset', campaign_id: campaignId };
    const adsetId = c2d.id;

    // 3. Create Ad Creative
    if (!pageId) {
      return {
        status: 'error',
        error: 'Facebook Page ID required for ad creative. Provide page_id param, or connect a Page in Meta Business Manager.',
        step: 'creative', campaign_id: campaignId, adset_id: adsetId,
      };
    }
    const linkData = {
      message: params.primary_text,
      link: params.link_url,
      name: params.headline,
      call_to_action: { type: ctaType, value: { link: params.link_url } },
    };
    if (params.image_url) linkData.picture = params.image_url;

    const c3 = await fetch(`${GRAPH}/${adAccountId}/adcreatives`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `${params.campaign_name} — Creative`,
        object_story_spec: { page_id: pageId, link_data: linkData },
        access_token,
      }),
    });
    const c3d = await c3.json();
    if (c3d.error) return { status: 'error', error: `Creative: ${c3d.error.message}`, step: 'creative', campaign_id: campaignId, adset_id: adsetId };
    const creativeId = c3d.id;

    // 4. Create Ad
    const c4 = await fetch(`${GRAPH}/${adAccountId}/ads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `${params.campaign_name} — Ad`,
        adset_id: adsetId,
        creative: { creative_id: creativeId },
        status: campaignStatus,
        access_token,
      }),
    });
    const c4d = await c4.json();
    if (c4d.error) return { status: 'error', error: `Ad: ${c4d.error.message}`, step: 'ad', campaign_id: campaignId, adset_id: adsetId, creative_id: creativeId };
    const adId = c4d.id;

    return {
      status: 'completed',
      campaign_id: campaignId,
      adset_id: adsetId,
      creative_id: creativeId,
      ad_id: adId,
      ad_account_id: adAccountId,
      page_id: pageId,
      objective,
      campaign_status: campaignStatus,
      message: campaignStatus === 'PAUSED'
        ? 'Campaign created and paused. Review in Meta Ads Manager, then set to ACTIVE when ready.'
        : 'Campaign created and ACTIVE — spending has begun.',
    };
  },

  async optimize_meta_roas(params, companyId) {
    // Use Composio METAADS_GET_INSIGHTS for performance data;
    // direct Graph API (via stored token) for status/budget updates
    // since Composio has no UPDATE_AD or UPDATE_AD_SET actions.
    const tokenResult = await getConnectedAccountToken('meta_ads', companyId);
    if (tokenResult.error) return { status: 'error', error: tokenResult.error };
    const { access_token } = tokenResult;

    let adAccountId;
    try {
      ({ adAccountId } = await directApiHandlers._metaSetup(params, companyId));
    } catch (e) {
      return { status: 'error', error: e.message };
    }

    const dryRun      = params.dry_run === true || params.dry_run === 'true';
    const roasPause   = parseFloat(params.roas_threshold_pause  ?? 1.0);
    const roasScale   = parseFloat(params.roas_threshold_scale  ?? 3.0);
    const scaleFactor = parseFloat(params.budget_scale_factor   ?? 1.25);
    const budgetCap   = params.budget_scale_max ? parseInt(params.budget_scale_max) : null;
    const VALID_META_PRESETS_OPT = ['today','yesterday','last_7d','last_30d','this_month','last_month','this_quarter','lifetime'];
    const datePreset  = VALID_META_PRESETS_OPT.includes(params.date_range) ? params.date_range : 'last_7d';

    // 1. Fetch ad-level insights via Composio
    const insightParams = {
      object_id: adAccountId,
      level: 'ad',
      fields: ['ad_id','ad_name','adset_id','adset_name','campaign_id','campaign_name','spend','impressions','clicks','actions','purchase_roas'],
      date_preset: datePreset,
    };
    if (params.campaign_id) insightParams.filtering = [{ field: 'campaign.id', operator: 'EQUAL', value: params.campaign_id }];

    const insightRes = await executeComposioAction('METAADS_GET_INSIGHTS', insightParams, companyId);
    if (insightRes.error) return { status: 'error', error: insightRes.error };

    const adInsights = insightRes.result?.data || insightRes.result || [];
    if (!Array.isArray(adInsights) || !adInsights.length) {
      return { status: 'completed', message: `No ad data found for ${datePreset}. No actions taken.`, paused_ads: [], scaled_adsets: [], actions_taken: 0 };
    }

    // 2. Compute ROAS per ad
    function computeRoas(ins) {
      if (ins.purchase_roas?.length) {
        const r = ins.purchase_roas.find(x => x.action_type === 'omni_purchase' || x.action_type === 'purchase');
        if (r) return parseFloat(r.value);
      }
      const spend = parseFloat(ins.spend || 0);
      if (spend === 0) return null;
      const conversions = (ins.actions || [])
        .filter(a => ['purchase','complete_registration','lead','offsite_conversion.fb_pixel_purchase'].includes(a.action_type))
        .reduce((s, a) => s + parseFloat(a.value || 0), 0);
      return conversions > 0 ? conversions / spend : 0;
    }

    // 3. Group by adset
    const adsetMap = {};
    const adsWithRoas = adInsights.map(ins => {
      const roas  = computeRoas(ins);
      const spend = parseFloat(ins.spend || 0);
      if (!adsetMap[ins.adset_id]) adsetMap[ins.adset_id] = { id: ins.adset_id, name: ins.adset_name, roas_values: [] };
      if (roas !== null) adsetMap[ins.adset_id].roas_values.push(roas);
      return { ...ins, roas, spend };
    });

    const toPause         = adsWithRoas.filter(ad => ad.roas !== null && ad.roas < roasPause && ad.spend > 0);
    const adsetIdsToScale = Object.values(adsetMap).filter(as => {
      if (!as.roas_values.length) return false;
      return (as.roas_values.reduce((a, b) => a + b, 0) / as.roas_values.length) >= roasScale;
    });

    const paused_ads = [], scaled_adsets = [];
    let actions_taken = 0;

    // 4. Pause low-ROAS ads via direct Graph API (no Composio UPDATE_AD action)
    for (const ad of toPause) {
      if (!dryRun) {
        const r = await fetch(`https://graph.facebook.com/v19.0/${ad.ad_id}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'PAUSED', access_token }),
        });
        const d = await r.json();
        if (d.error) { paused_ads.push({ ad_id: ad.ad_id, name: ad.ad_name, roas: ad.roas, spend: ad.spend, action: 'pause_failed', error: d.error.message }); continue; }
      }
      paused_ads.push({ ad_id: ad.ad_id, name: ad.ad_name, roas: ad.roas?.toFixed(2), spend: ad.spend, action: dryRun ? 'would_pause' : 'paused' });
      actions_taken++;
    }

    // 5. Scale winning adsets via direct Graph API (no Composio UPDATE_AD_SET action)
    for (const as of adsetIdsToScale) {
      const budgetRes  = await fetch(`https://graph.facebook.com/v19.0/${as.id}?fields=daily_budget,name&access_token=${access_token}`);
      const budgetData = await budgetRes.json();
      if (budgetData.error) continue;
      const currentBudget = parseInt(budgetData.daily_budget || 0);
      const newBudget     = budgetCap ? Math.min(Math.round(currentBudget * scaleFactor), budgetCap) : Math.round(currentBudget * scaleFactor);
      const avgRoas       = (as.roas_values.reduce((a, b) => a + b, 0) / as.roas_values.length).toFixed(2);

      if (!dryRun && newBudget > currentBudget) {
        const r = await fetch(`https://graph.facebook.com/v19.0/${as.id}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ daily_budget: newBudget, access_token }),
        });
        const d = await r.json();
        if (d.error) { scaled_adsets.push({ adset_id: as.id, name: as.name, avg_roas: avgRoas, action: 'scale_failed', error: d.error.message }); continue; }
      }
      scaled_adsets.push({ adset_id: as.id, name: as.name, avg_roas: avgRoas, budget_before: currentBudget, budget_after: newBudget, action: dryRun ? 'would_scale' : (newBudget > currentBudget ? 'scaled' : 'at_cap') });
      if (newBudget > currentBudget) actions_taken++;
    }

    const allRoas        = adsWithRoas.filter(a => a.roas !== null).map(a => a.roas);
    const totalSpend     = adsWithRoas.reduce((s, a) => s + a.spend, 0);
    const avgRoasOverall = allRoas.length ? (allRoas.reduce((a, b) => a + b, 0) / allRoas.length).toFixed(2) : 'N/A';

    const reportLines = [
      `## Meta Ads ROAS Optimization — ${datePreset}`,
      `**Account**: ${adAccountId} | **Spend**: ${totalSpend.toFixed(2)} | **Avg ROAS**: ${avgRoasOverall} | **Ads analyzed**: ${adsWithRoas.length}`,
      '',
      paused_ads.length ? `### ${dryRun?'Would Pause':'Paused'} (ROAS < ${roasPause})\n${paused_ads.map(a=>`- ${a.name}: ROAS ${a.roas}, Spend ${a.spend}`).join('\n')}` : '### No ads paused',
      '',
      scaled_adsets.length ? `### ${dryRun?'Would Scale':'Scaled'} Budgets (avg ROAS ≥ ${roasScale})\n${scaled_adsets.map(a=>`- ${a.name}: ROAS ${a.avg_roas}, Budget ${a.budget_before}→${a.budget_after}`).join('\n')}` : '### No budgets scaled',
      '',
      dryRun ? '_Dry run — no changes made._' : `**${actions_taken} action(s) taken.**`,
    ];

    return {
      status: 'completed',
      date_range: datePreset,
      ad_account_id: adAccountId,
      paused_ads,
      scaled_adsets,
      no_change: adsWithRoas.filter(ad => !toPause.find(p=>p.ad_id===ad.ad_id) && ad.roas !== null).map(ad=>({ ad_id: ad.ad_id, name: ad.ad_name, roas: ad.roas?.toFixed(2), spend: ad.spend })),
      roas_summary: { avg_roas: avgRoasOverall, total_spend: totalSpend.toFixed(2), ads_analyzed: adsWithRoas.length },
      actions_taken,
      dry_run: dryRun,
      report: reportLines.join('\n'),
    };
  },

  async fetch_meta_ads(params, companyId) {
    let adAccountId;
    try {
      ({ adAccountId } = await directApiHandlers._metaSetup(params, companyId));
    } catch (e) {
      return { status: 'error', error: e.message, campaigns: [], adsets: [], ads: [] };
    }

    // Composio METAADS_GET_INSIGHTS valid presets: today, yesterday, last_7d, last_30d, this_month, last_month, this_quarter, lifetime
    const VALID_META_PRESETS = ['today','yesterday','last_7d','last_30d','this_month','last_month','this_quarter','lifetime'];
    const datePreset = VALID_META_PRESETS.includes(params.date_range) ? params.date_range : 'last_30d';

    const insightRes = await executeComposioAction('METAADS_GET_INSIGHTS', {
      object_id: adAccountId,
      level: 'ad',
      fields: ['campaign_name','adset_name','ad_name','impressions','clicks','spend','ctr','cpc','reach','purchase_roas','actions'],
      date_preset: datePreset,
    }, companyId);

    if (insightRes.error) return { status: 'error', error: insightRes.error, campaigns: [], adsets: [], ads: [] };

    const rawAds = insightRes.result?.data || insightRes.result || [];
    const ads = (Array.isArray(rawAds) ? rawAds : []).map(r => ({
      campaign: r.campaign_name,
      adset: r.adset_name,
      ad: r.ad_name,
      impressions: r.impressions,
      clicks: r.clicks,
      spend: r.spend,
      ctr: r.ctr,
      cpc: r.cpc,
      reach: r.reach,
      roas: r.purchase_roas?.find?.(x => x.action_type === 'omni_purchase')?.value || null,
    }));

    const byCampaign = {};
    for (const ad of ads) {
      if (!byCampaign[ad.campaign]) byCampaign[ad.campaign] = { name: ad.campaign, spend: 0, clicks: 0, impressions: 0, conversions: 0 };
      byCampaign[ad.campaign].spend        += Number(ad.spend || 0);
      byCampaign[ad.campaign].clicks       += Number(ad.clicks || 0);
      byCampaign[ad.campaign].impressions  += Number(ad.impressions || 0);
    }
    const campaigns = Object.values(byCampaign).map(c => ({
      ...c,
      spend: c.spend.toFixed(2),
      ctr: c.impressions > 0 ? ((c.clicks / c.impressions) * 100).toFixed(2) + '%' : '0%',
    }));

    return { status: 'completed', date_range: datePreset, campaigns, adsets: [], ads };
  },

  // ── Channel Router ────────────────────────────────────────────────────────
  async route_leads(params, companyId) {
    const leads = params.leads || [];
    if (!leads.length) return { status: 'error', error: 'leads array is required' };

    // Agent-driven routing — loads MKG, asks Groq/Isha to decide channels
    // Falls back to rules if MKG missing or Groq unavailable
    const result = await routeLeads(leads, companyId);

    return {
      status: 'completed',
      total: leads.length,
      mode: result.mode,            // 'agent' or 'rules'
      mkg_loaded: result.mkg_loaded,
      agent_notes: result.agent_notes,
      summary: result.summary,
      groups: {
        linkedin:  (result.groups.linkedin  || []).map(l => ({ ...l, _explain: explainRouting(l) })),
        email:     (result.groups.email     || []).map(l => ({ ...l, _explain: explainRouting(l) })),
        whatsapp:  (result.groups.whatsapp  || []).map(l => ({ ...l, _explain: explainRouting(l) })),
        voicebot:  (result.groups.voicebot  || []).map(l => ({ ...l, _explain: explainRouting(l) })),
        phone:     (result.groups.phone     || []).map(l => ({ ...l, _explain: explainRouting(l) })),
      },
      routed_leads: result.routed_leads.map(l => ({
        full_name:    l.full_name,
        designation:  l.designation,
        company:      l.company,
        city:         l.city,
        email:        l.email || l.email_norm,
        phone:        l.phone_e164,
        linkedin_url: l.linkedin_url,
        seniority:    l.seniority,
        icp_industry: l.icp_industry,
        quality:      l.quality,
        routing:      l.routing,
      })),
    };
  },

  // ── HeyReach — LinkedIn Campaign ──────────────────────────────────────────
  async heyreach_linkedin_campaign(params, companyId) {
    const {
      campaign_name = 'Marqq LinkedIn Outreach',
      leads = [],
      message_template = 'Hi {{first_name}}, I came across your profile and would love to connect!',
    } = params;

    const validLeads = leads.filter(l => l.linkedin_url);
    if (!validLeads.length) return { status: 'error', error: 'No leads with linkedin_url provided' };

    // HeyReach public API does not expose campaign creation. Use an existing active campaign.
    let campaigns;
    try {
      const campaignsData = await directApiHandlers._heyreachRequest(companyId, '/campaign/GetAll', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      campaigns = Array.isArray(campaignsData?.items) ? campaignsData.items : [];
    } catch (err) {
      return { status: 'error', error: err.message };
    }

    const normalizedName = campaign_name.trim().toLowerCase();
    const targetCampaign = campaigns.find((campaign) => String(campaign?.name || '').trim().toLowerCase() === normalizedName)
      || campaigns.find((campaign) => String(campaign?.status || '').toUpperCase() === 'ACTIVE')
      || campaigns[0];

    if (!targetCampaign?.id) {
      return { status: 'error', error: 'No usable HeyReach campaign found. Create and activate a campaign in HeyReach first.' };
    }

    try {
      await directApiHandlers._heyreachRequest(companyId, '/campaign/AddLeadsToListV2', {
        method: 'POST',
        body: JSON.stringify({
          campaignId: String(targetCampaign.id),
          leads: validLeads.map((lead) => ({
            firstName: lead.first_name || '',
            lastName: lead.last_name || '',
            email: lead.email || '',
            linkedinUrl: lead.linkedin_url,
            company: lead.company || '',
            position: lead.personalization || '',
          })),
        }),
      });
    } catch (err) {
      return { status: 'error', error: `HeyReach lead add failed: ${err.message}` };
    }

    return {
      status: 'completed',
      campaign_id: String(targetCampaign.id),
      campaign_name: targetCampaign.name || campaign_name,
      leads_in_list: validLeads.length,
      message_template,
      campaigns_available: Array.isArray(campaigns) ? campaigns.length : 0,
      next_step: `Leads were added to the existing HeyReach campaign "${targetCampaign.name || campaign_name}". Review message steps in HeyReach before sending.`,
      leads_summary: validLeads.slice(0, 5).map(l => `${l.first_name} ${l.last_name} @ ${l.company} — ${l.linkedin_url}`),
    };
  },

  // ── Lemlist — LinkedIn + Email Sequence ───────────────────────────────────
  async lemlist_linkedin_campaign(params, companyId) {
    const {
      campaign_name = 'Marqq LinkedIn + Email Sequence',
      leads = [],
      linkedin_message = 'Hi {{first_name}}, saw your work at {{company}} — would love to connect!',
      email_subject    = 'Quick question, {{first_name}}',
      email_body       = 'Hi {{first_name}},\n\nI noticed {{company}} and wanted to reach out...\n\nWould a 15-min call make sense?',
    } = params;

    const validLeads = leads.filter(l => l.email);
    if (!validLeads.length) return { status: 'error', error: 'No leads with email provided' };

    // 1. Create campaign in Lemlist
    const campaignRes = await executeComposioAction('LEMLIST_POST_CREATE_CAMPAIGN', {
      name: campaign_name,
    }, companyId);

    if (campaignRes.error) return { status: 'error', error: `Lemlist campaign creation failed: ${campaignRes.error}` };

    const campaignId = campaignRes.result?.campaignId
      || campaignRes.result?.id
      || campaignRes.result?.data?.campaignId;

    // 2. Get team info for context
    const teamRes = await executeComposioAction('LEMLIST_GET_TEAM_INFO', {}, companyId);
    const credits = teamRes.result?.credits || null;

    return {
      status: 'completed',
      campaign_id: campaignId,
      campaign_name,
      leads_queued: validLeads.length,
      linkedin_leads: leads.filter(l => l.linkedin_url).length,
      email_leads: validLeads.length,
      credits_remaining: credits,
      sequence: [
        { step: 1, channel: 'linkedin', action: 'Connection request', message: linkedin_message },
        { step: 2, channel: 'email',    action: 'Follow-up email',    delay_days: 3, subject: email_subject, body: email_body },
      ],
      note: 'Campaign created. Add leads manually in Lemlist or use the campaign_id with LEMLIST API to bulk-import.',
    };
  },

  async heyreach_list_campaigns(params, companyId) {
    const limit = Math.min(Math.max(Number(params.limit) || 10, 1), 100);
    const keyword = String(params.keyword || '').trim().toLowerCase();
    let rawCampaigns = [];
    try {
      const data = await directApiHandlers._heyreachRequest(companyId, '/campaign/GetAll', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      rawCampaigns = Array.isArray(data?.items) ? data.items : [];
    } catch (err) {
      return { status: 'error', error: `HeyReach list campaigns failed: ${err.message}`, campaigns: [], count: 0 };
    }

    const campaigns = (Array.isArray(rawCampaigns) ? rawCampaigns : []).map((campaign) => ({
      id: campaign.id || campaign.campaignId || null,
      name: campaign.name || campaign.campaignName || 'Untitled campaign',
      status: campaign.status || null,
      raw: campaign,
    }))
      .filter((campaign) => !keyword || String(campaign.name || '').toLowerCase().includes(keyword))
      .slice(0, limit);

    return { status: 'completed', count: campaigns.length, campaigns };
  },

  async heyreach_list_conversations(params, companyId) {
    const limit = Math.min(Math.max(Number(params.limit) || 5, 1), 20);
    const campaignId = params.campaign_id != null ? Number(params.campaign_id) : null;
    const payload = {
      limit,
      offset: 0,
      filters: {
        ...(Number.isFinite(campaignId) ? { campaignIds: [campaignId] } : {}),
      },
    };

    const res = await executeComposioAction('HEYREACH_GET_CONVERSATIONS_V2', payload, companyId);
    if (res.error) {
      return { status: 'error', error: `HeyReach conversations failed: ${res.error}`, conversations: [], count: 0 };
    }

    const rawConversations = res.result?.items || res.result?.conversations || res.result?.data || res.result || [];
    const conversations = (Array.isArray(rawConversations) ? rawConversations : []).map((conversation) => ({
      id: conversation.id || conversation.conversationId || null,
      lead_name: conversation.fullName || conversation.leadName || conversation.name || '',
      profile_url: conversation.profileUrl || conversation.leadProfileUrl || '',
      seen: conversation.seen ?? null,
      snippet: conversation.lastMessageText || conversation.last_message || conversation.snippet || '',
      raw: conversation,
    }));

    return { status: 'completed', count: conversations.length, conversations };
  },

  async lemlist_list_campaigns(params, companyId) {
    const limit = Math.min(Math.max(Number(params.limit) || 10, 1), 100);
    const status = String(params.status || '').trim();
    const res = await executeComposioAction('LEMLIST_GET_LIST_CAMPAIGNS', {
      limit,
      page: 1,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      ...(status ? { status } : {}),
    }, companyId);

    if (res.error) {
      return { status: 'error', error: `Lemlist list campaigns failed: ${res.error}`, campaigns: [], count: 0 };
    }

    const rawCampaigns = res.result?.items || res.result?.campaigns || res.result?.data || res.result || [];
    const campaigns = (Array.isArray(rawCampaigns) ? rawCampaigns : []).map((campaign) => ({
      id: campaign._id || campaign.id || campaign.campaignId || null,
      name: campaign.name || campaign.campaignName || 'Untitled campaign',
      status: campaign.status || null,
      raw: campaign,
    }));

    return { status: 'completed', count: campaigns.length, campaigns };
  },

  async lemlist_get_campaign_stats(params, companyId) {
    const campaignId = params.campaign_id || params.campaignId;
    if (!campaignId) {
      return { status: 'error', error: 'campaign_id is required', analytics: null };
    }

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (30 * 24 * 60 * 60 * 1000));
    const res = await executeComposioAction('LEMLIST_GET_CAMPAIGN_STATS', {
      campaignId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      channels: ['linkedin', 'email'],
    }, companyId);

    if (res.error) {
      return { status: 'error', error: `Lemlist campaign stats failed: ${res.error}`, campaign_id: String(campaignId), analytics: null };
    }

    return {
      status: 'completed',
      campaign_id: String(campaignId),
      analytics: res.result?.data || res.result || null,
    };
  },

  async lemlist_get_team_credits(_params, companyId) {
    const res = await executeComposioAction('LEMLIST_GET_TEAM_CREDITS', {}, companyId);
    if (res.error) {
      return { status: 'error', error: `Lemlist credits failed: ${res.error}`, credits_remaining: null };
    }

    const credits = res.result?.credits || res.result?.data?.credits || res.result || null;
    return { status: 'completed', credits_remaining: credits };
  },

  async lemlist_pause_campaign(params, companyId) {
    const campaignId = params.campaign_id || params.campaignId;
    if (!campaignId) {
      return { status: 'error', error: 'campaign_id is required' };
    }

    const res = await executeComposioAction('LEMLIST_POST_PAUSE_CAMPAIGN', {
      campaignId,
    }, companyId);
    if (res.error) {
      return { status: 'error', error: `Lemlist pause failed: ${res.error}`, campaign_id: String(campaignId) };
    }

    return { status: 'completed', campaign_id: String(campaignId), action: 'paused', result: res.result || null };
  },

  // ── Instantly — Email Campaign via Composio ───────────────────────────────
  // Flow: CREATE_CAMPAIGN → CREATE_LEAD (bulk) → return campaign_id
  async instantly_create_campaign(params, companyId) {
    const {
      name = 'Marqq Outreach Campaign',
      subject,
      body,
      from_email,
      daily_limit = 50,
      leads = [],
    } = params;

    if (!subject || !body) {
      return { status: 'error', error: 'subject and body are required' };
    }

    // 1. Create campaign
    const campaignRes = await executeComposioAction('INSTANTLY_CREATE_CAMPAIGN', {
      name,
      subject,
      body,
      from_email: from_email || undefined,
      daily_limit,
    }, companyId);

    if (campaignRes.error) {
      return { status: 'error', error: `Campaign creation failed: ${campaignRes.error}` };
    }

    const campaignId = campaignRes.result?.id || campaignRes.result?.campaign_id
      || campaignRes.result?.data?.id;

    // 2. Add leads to campaign in batches of 100
    let leadsAdded = 0;
    const validLeads = leads.filter(l => l.email);
    for (let i = 0; i < validLeads.length; i += 100) {
      const batch = validLeads.slice(i, i + 100);
      for (const lead of batch) {
        const lr = await executeComposioAction('INSTANTLY_CREATE_LEAD', {
          campaign_id: campaignId,
          email: lead.email,
          first_name: lead.first_name || '',
          last_name: lead.last_name || '',
          company_name: lead.company_name || '',
          personalization: lead.personalization || '',
        }, companyId);
        if (!lr.error) leadsAdded++;
      }
    }

    return {
      status: 'completed',
      campaign_id: campaignId,
      campaign_name: name,
      leads_added: leadsAdded,
      message: `Campaign "${name}" created with ${leadsAdded} leads`,
    };
  },

  async instantly_list_campaigns(params, companyId) {
    const limit = Math.min(Math.max(Number(params.limit) || 25, 1), 100);
    const search = String(params.search || '').trim();
    const res = await executeComposioAction('INSTANTLY_LIST_CAMPAIGNS', {
      limit,
      ...(search ? { search } : {}),
    }, companyId);

    if (res.error) {
      return { status: 'error', error: `Instantly list campaigns failed: ${res.error}`, campaigns: [], count: 0 };
    }

    const rawCampaigns = res.result?.items || res.result?.campaigns || res.result?.data || res.result || [];
    const campaigns = (Array.isArray(rawCampaigns) ? rawCampaigns : []).map((campaign) => ({
      id: campaign.id || campaign.campaign_id || campaign.campaignId || null,
      name: campaign.name || campaign.campaign_name || campaign.campaignName || 'Untitled campaign',
      status: campaign.status || campaign.state || campaign.campaign_status || null,
      created_at: campaign.created_at || campaign.createdAt || null,
      updated_at: campaign.updated_at || campaign.updatedAt || null,
      raw: campaign,
    }));

    return {
      status: 'completed',
      count: campaigns.length,
      campaigns,
    };
  },

  async instantly_get_campaign_analytics(params, companyId) {
    const campaignId = params.campaign_id || params.id;
    if (!campaignId) {
      return { status: 'error', error: 'campaign_id is required', analytics: null };
    }

    const res = await executeComposioAction('INSTANTLY_GET_CAMPAIGN_ANALYTICS', {
      campaign_id: campaignId,
      id: campaignId,
    }, companyId);

    if (res.error) {
      return { status: 'error', error: `Instantly analytics failed: ${res.error}`, campaign_id: campaignId, analytics: null };
    }

    const analytics = res.result?.analytics || res.result?.data || res.result || null;
    return {
      status: 'completed',
      campaign_id: String(campaignId),
      analytics,
    };
  },

  async instantly_get_campaign_status(params, companyId) {
    const campaignId = params.campaign_id || params.id;
    if (!campaignId) {
      return { status: 'error', error: 'campaign_id is required', sending_status: null };
    }

    const res = await executeComposioAction('INSTANTLY_GET_CAMPAIGN_SENDING_STATUS', {
      campaign_id: campaignId,
      id: campaignId,
    }, companyId);

    if (res.error) {
      return { status: 'error', error: `Instantly sending status failed: ${res.error}`, campaign_id: campaignId, sending_status: null };
    }

    const sendingStatus = res.result?.status || res.result?.data || res.result || null;
    return {
      status: 'completed',
      campaign_id: String(campaignId),
      sending_status: sendingStatus,
    };
  },

  async instantly_pause_campaign(params, companyId) {
    const campaignId = params.campaign_id || params.id;
    if (!campaignId) {
      return { status: 'error', error: 'campaign_id is required' };
    }

    const res = await executeComposioAction('INSTANTLY_PAUSE_CAMPAIGN', {
      id: campaignId,
    }, companyId);

    if (res.error) {
      return { status: 'error', error: `Instantly pause failed: ${res.error}`, campaign_id: String(campaignId) };
    }

    return {
      status: 'completed',
      campaign_id: String(campaignId),
      action: 'paused',
      result: res.result || null,
    };
  },

  async instantly_activate_campaign(params, companyId) {
    const campaignId = params.campaign_id || params.id;
    if (!campaignId) {
      return { status: 'error', error: 'campaign_id is required' };
    }

    const res = await executeComposioAction('INSTANTLY_ACTIVATE_CAMPAIGN', {
      id: campaignId,
    }, companyId);

    if (res.error) {
      return { status: 'error', error: `Instantly activate failed: ${res.error}`, campaign_id: String(campaignId) };
    }

    return {
      status: 'completed',
      campaign_id: String(campaignId),
      action: 'activated',
      result: res.result || null,
    };
  },

  async instantly_count_unread_emails(_params, companyId) {
    const res = await executeComposioAction('INSTANTLY_COUNT_UNREAD_EMAILS', {}, companyId);

    if (res.error) {
      return { status: 'error', error: `Instantly unread count failed: ${res.error}`, unread_count: null };
    }

    const unreadCount = res.result?.count
      ?? res.result?.unread_count
      ?? res.result?.data?.count
      ?? res.result?.data?.unread_count
      ?? null;

    return {
      status: 'completed',
      unread_count: unreadCount,
    };
  },

  async instantly_list_emails(params, companyId) {
    const limit = Math.min(Math.max(Number(params.limit) || 10, 1), 50);
    const payload = {
      limit,
      ...(params.campaign_id ? { campaign_id: params.campaign_id } : {}),
      ...(params.is_unread != null ? { is_unread: Boolean(params.is_unread) } : {}),
      sort_order: 'desc',
    };

    const res = await executeComposioAction('INSTANTLY_LIST_EMAILS', payload, companyId);

    if (res.error) {
      return { status: 'error', error: `Instantly list emails failed: ${res.error}`, emails: [], count: 0 };
    }

    const rawEmails = res.result?.items || res.result?.emails || res.result?.data || res.result || [];
    const emails = (Array.isArray(rawEmails) ? rawEmails : []).map((email) => ({
      id: email.id || null,
      thread_id: email.thread_id || null,
      subject: email.subject || email.email_subject || '',
      from_email: email.from_email || email.from || '',
      to_email: email.to_email || email.to || email.lead || '',
      is_unread: Boolean(email.is_unread),
      email_type: email.email_type || email.type || '',
      body_preview: email.body_preview || email.preview || email.snippet || '',
      created_at: email.created_at || email.createdAt || email.date || null,
      raw: email,
    }));

    return {
      status: 'completed',
      count: emails.length,
      emails,
    };
  },

  // ── WhatsApp — Direct Outreach via Composio ───────────────────────────────
  async whatsapp_send_campaign(params, companyId) {
    const {
      campaign_name = 'Marqq WhatsApp Outreach',
      text,
      template_name,
      language_code = 'en_US',
      leads = [],
    } = params;

    if (!text && !template_name) {
      return { status: 'error', error: 'text or template_name is required' };
    }

    const normalizePhone = (value) => String(value || '').replace(/[^\d]/g, '');
    const applyVars = (source, lead) => String(source || '')
      .replaceAll('{{first_name}}', lead.first_name || lead.full_name?.split(' ')?.[0] || '')
      .replaceAll('{{company}}', lead.company || lead.company_name || '')
      .replaceAll('{{full_name}}', lead.full_name || [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim());

    const phoneRes = await executeComposioAction('WHATSAPP_GET_PHONE_NUMBERS', { limit: 25 }, companyId);
    if (phoneRes.error) {
      return { status: 'error', error: `WhatsApp phone lookup failed: ${phoneRes.error}` };
    }

    const phoneNumber = phoneRes.result?.data?.[0];
    const phoneNumberId = phoneNumber?.id;
    const senderNumber = phoneNumber?.display_phone_number || null;
    if (!phoneNumberId) {
      return { status: 'error', error: 'No active WhatsApp Business phone number found' };
    }

    const validLeads = leads
      .map((lead) => ({
        ...lead,
        to_number: normalizePhone(lead.to_number || lead.phone || lead.phone_e164 || lead.mobile || lead.mobile_number),
      }))
      .filter((lead) => lead.to_number);

    if (!validLeads.length) {
      return { status: 'error', error: 'No leads with phone numbers provided' };
    }

    const results = [];
    let sentCount = 0;
    let failedCount = 0;

    for (const lead of validLeads) {
      const actionSlug = template_name ? 'WHATSAPP_SEND_TEMPLATE_MESSAGE' : 'WHATSAPP_SEND_MESSAGE';
      const payload = template_name
        ? {
            phone_number_id: phoneNumberId,
            to_number: lead.to_number,
            template_name,
            language_code,
          }
        : {
            phone_number_id: phoneNumberId,
            to_number: lead.to_number,
            text: applyVars(text, lead),
          };

      const res = await executeComposioAction(actionSlug, payload, companyId);
      const messageId = res.result?.messages?.[0]?.id || res.result?.message_id || null;
      if (res.error) {
        failedCount += 1;
        results.push({
          to_number: lead.to_number,
          full_name: lead.full_name || [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim(),
          status: 'failed',
          error: res.error,
        });
        continue;
      }

      sentCount += 1;
      results.push({
        to_number: lead.to_number,
        full_name: lead.full_name || [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim(),
        status: 'sent',
        message_id: messageId,
      });
    }

    return {
      status: failedCount > 0 && sentCount > 0 ? 'partial' : failedCount > 0 ? 'error' : 'completed',
      campaign_name,
      phone_number_id: phoneNumberId,
      sender_number: senderNumber,
      sent_count: sentCount,
      failed_count: failedCount,
      results,
      message: `WhatsApp outreach processed for ${validLeads.length} leads`,
    };
  },

  // ── Voicebot — Twilio outbound calling via existing backend route ─────────
  async voicebot_campaign_launch(params, companyId) {
    const {
      campaign_name = 'Marqq Voicebot Outreach',
      script_hint = 'Introduce Productverse and ask if this is a good time for a short conversation.',
      leads = [],
      language = 'en',
      gender = 'female',
    } = params;

    const normalizePhone = (value) => String(value || '').replace(/[^\d+]/g, '');
    const validLeads = leads
      .map((lead) => ({
        ...lead,
        phone: normalizePhone(lead.phone || lead.phone_e164 || lead.mobile || lead.mobile_number),
      }))
      .filter((lead) => lead.phone);

    if (!validLeads.length) {
      return { status: 'error', error: 'No leads with phone numbers provided' };
    }

    const baseUrl = `http://127.0.0.1:${process.env.PORT || 3008}`;
    const calls = [];
    let queuedCount = 0;
    let failedCount = 0;

    for (const lead of validLeads.slice(0, 100)) {
      try {
        const response = await fetch(`${baseUrl}/api/voicebot/twilio/calls`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: lead.phone,
            companyId,
            campaignId: campaign_name,
            leadName: lead.name || lead.full_name || '',
            leadPhone: lead.phone,
            leadEmail: lead.email || '',
            language,
            gender,
            openingLine: script_hint,
          }),
        });

        const json = await response.json().catch(() => null);
        if (!response.ok) {
          failedCount += 1;
          calls.push({
            phone: lead.phone,
            status: 'failed',
            error: json?.error || `Voicebot call failed with ${response.status}`,
          });
          continue;
        }

        queuedCount += 1;
        calls.push({
          phone: lead.phone,
          status: 'queued',
          sid: json?.sid || null,
          to: json?.to || lead.phone,
        });
      } catch (error) {
        failedCount += 1;
        calls.push({
          phone: lead.phone,
          status: 'failed',
          error: String(error),
        });
      }
    }

    return {
      status: failedCount > 0 && queuedCount > 0 ? 'partial' : failedCount > 0 ? 'error' : 'completed',
      campaign_name,
      queued_count: queuedCount,
      failed_count: failedCount,
      calls,
      message: `Voicebot outreach processed for ${validLeads.length} leads`,
    };
  },
};

/**
 * executeAutomation — dispatches a single trigger to the appropriate handler.
 */
async function executeAutomation(trigger, companyId, runId, supabaseClient = null) {
  const entry = REGISTRY.find((r) => r.id === trigger.automation_id);
  if (!entry) {
    return { status: "error", error: "unknown automation_id: " + trigger.automation_id };
  }

  if (entry.trigger_type === "internal_fn") {
    const result = creativeFatigueCheck(trigger.params || {});
    return { status: "completed", ...result };
  }

  // direct_api — use the specific handler if one exists
  if (entry.trigger_type === "direct_api") {
    const handler = directApiHandlers[entry.id];
    if (handler) {
      try {
        return await handler(trigger.params || {}, companyId, supabaseClient);
      } catch (err) {
        return { status: "error", error: err.message, automation_id: entry.id };
      }
    }
    // No handler yet → simulated
    return { status: "simulated", message: "no handler for: " + entry.id, automation_id: entry.id };
  }

  // n8n_webhook — POST to configured webhook URL
  const url = process.env[entry.endpoint];
  if (!url) {
    return {
      status: "simulated",
      message: "endpoint not configured: " + entry.endpoint,
      automation_id: entry.id,
    };
  }

  // Resolve OAuth access token from Composio if this automation requires one
  let access_token = null;
  if (entry.requires_credential) {
    access_token = await getComposioToken(companyId, entry.requires_credential);
    if (!access_token) {
      console.warn(`[automations] No active Composio token for ${entry.requires_credential} (company: ${companyId}) — proceeding without access_token`);
    }
  }

  try {
    const { default: fetch } = await import("node-fetch").catch(() => {
      throw new Error("node-fetch not available");
    });

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        automation_id: entry.id,
        params: trigger.params || {},
        company_id: companyId,
        run_id: runId,
        ...(access_token ? { access_token } : {}),
      }),
    });

    const data = await response.json();
    return data;
  } catch (err) {
    // Fallback: if fetch not available or network error, return simulated
    if (err.message === "node-fetch not available") {
      return {
        status: "simulated",
        message: "endpoint not configured: " + entry.endpoint,
        automation_id: entry.id,
      };
    }
    return { status: "error", error: err.message, automation_id: entry.id };
  }
}

/**
 * executeAutomationTriggers — exported dispatcher.
 * Called after each agent run to process any automation_triggers declared in the contract.
 *
 * @param {object} contract - parsed agent contract
 * @param {string} companyId - company identifier
 * @returns {Promise<Array>} - array of { automation_id, status, result }
 */
export async function executeAutomationTriggers(contract, companyId) {
  if (!contract.automation_triggers || contract.automation_triggers.length === 0) {
    return [];
  }

  let client = null;
  try {
    const mod = await import("../supabase.js");
    client = mod.supabaseAdmin || mod.supabase || null;
  } catch {
    client = null;
  }

  const collected = [];

  for (const trigger of contract.automation_triggers) {
    const result = await executeAutomation(trigger, companyId, contract.run_id, client);
    const status = result.status || "completed";

    if (client) {
      try {
        const registryEntry = REGISTRY.find((r) => r.id === trigger.automation_id);
        await client.from("automation_runs").insert({
          company_id: companyId || null,
          run_id: contract.run_id || null,
          automation_id: trigger.automation_id,
          automation_name: registryEntry?.name || trigger.automation_id,
          status,
          params: trigger.params || {},
          result,
          triggered_by_agent: contract.agent || null,
        });
      } catch (insertErr) {
        console.warn("[automations] Failed to insert automation_run row:", insertErr.message);
      }
    }

    collected.push({ automation_id: trigger.automation_id, status, result });
  }

  return collected;
}

/**
 * computeNextRun — parses a cron string (5 fields) and returns the next Date.
 *
 * Supported patterns:
 *   "star/15 * * * *"   → next 15-min boundary from now
 *   "0 star/N * * *"    → next N-hour boundary (N can be 1-23)
 *   "0 H * * *"      → today at H:00 UTC if not past, else tomorrow at H:00
 *   "0 H * * DOW"    → next occurrence of day-of-week (0=Sun) at H:00 UTC
 *   anything else    → now + 1 hour
 */
export function computeNextRun(cronStr) {
  const now = new Date();
  const parts = (cronStr || '').trim().split(/\s+/);
  if (parts.length !== 5) {
    return new Date(now.getTime() + 60 * 60 * 1000);
  }

  const [min, hour, dom, month, dow] = parts;

  // */15 * * * * — every 15 minutes
  if (min.startsWith('*/') && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    const interval = parseInt(min.slice(2), 10);
    if (!isNaN(interval) && interval > 0) {
      const ms = interval * 60 * 1000;
      const next = new Date(Math.ceil(now.getTime() / ms) * ms);
      return next;
    }
  }

  // 0 */N * * * — every N hours
  if (min === '0' && hour.startsWith('*/') && dom === '*' && month === '*' && dow === '*') {
    const n = parseInt(hour.slice(2), 10);
    if (!isNaN(n) && n > 0) {
      const ms = n * 60 * 60 * 1000;
      const next = new Date(Math.ceil(now.getTime() / ms) * ms);
      return next;
    }
  }

  // 0 H * * DOW — weekly on specific day-of-week at H:00 UTC
  if (min === '0' && /^\d+$/.test(hour) && dom === '*' && month === '*' && /^\d+$/.test(dow)) {
    const h = parseInt(hour, 10);
    const targetDow = parseInt(dow, 10);
    const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, 0, 0, 0));
    let daysAhead = (targetDow - now.getUTCDay() + 7) % 7;
    if (daysAhead === 0 && candidate <= now) {
      daysAhead = 7;
    }
    candidate.setUTCDate(candidate.getUTCDate() + daysAhead);
    return candidate;
  }

  // 0 H * * * — daily at H:00 UTC
  if (min === '0' && /^\d+$/.test(hour) && dom === '*' && month === '*' && dow === '*') {
    const h = parseInt(hour, 10);
    const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, 0, 0, 0));
    if (candidate <= now) {
      candidate.setUTCDate(candidate.getUTCDate() + 1);
    }
    return candidate;
  }

  // fallback — now + 1 hour
  return new Date(now.getTime() + 60 * 60 * 1000);
}

/**
 * upsertScheduledAutomation — creates or updates a scheduled automation row in Supabase.
 *
 * @param {string} companyId
 * @param {{ automation_id: string, cron: string, params?: object }} trigger
 * @param {string|null} agentName
 * @param {object} supabaseClient - Supabase JS client
 * @returns {Promise<{ automation_id: string, cron: string, next_run: string }>}
 */
export async function upsertScheduledAutomation(companyId, trigger, agentName, supabaseClient) {
  const entry = REGISTRY.find((r) => r.id === trigger.automation_id);
  if (!entry) {
    throw new Error('Unknown automation_id: ' + trigger.automation_id);
  }

  const nextRun = computeNextRun(trigger.cron);

  const { error } = await supabaseClient
    .from('scheduled_automations')
    .upsert(
      {
        company_id: companyId,
        automation_id: trigger.automation_id,
        cron: trigger.cron,
        params: trigger.params || {},
        active: true,
        next_run: nextRun.toISOString(),
        updated_at: new Date().toISOString(),
        created_by_agent: agentName || null,
      },
      { onConflict: 'company_id,automation_id' }
    );

  if (error) {
    throw new Error('upsertScheduledAutomation DB error: ' + error.message);
  }

  return {
    automation_id: trigger.automation_id,
    cron: trigger.cron,
    next_run: nextRun.toISOString(),
  };
}

/**
 * runDueScheduledAutomations — queries scheduled_automations for rows with next_run <= now,
 * executes each, updates last_run and next_run, and logs to automation_runs.
 *
 * @param {object} supabaseClient - Supabase JS client
 * @returns {Promise<Array<{ company_id, automation_id, status }>>}
 */
export async function runDueScheduledAutomations(supabaseClient) {
  const now = new Date().toISOString();

  const { data: dueRows, error: queryErr } = await supabaseClient
    .from('scheduled_automations')
    .select('*')
    .eq('active', true)
    .lte('next_run', now);

  if (queryErr) {
    throw new Error('runDueScheduledAutomations query error: ' + queryErr.message);
  }

  const collected = [];

  for (const row of dueRows || []) {
    const runId = Math.random().toString(36).slice(2);
    let result;

    try {
      result = await executeAutomation(
        { automation_id: row.automation_id, params: row.params },
        row.company_id,
        runId,
        supabaseClient
      );
    } catch (execErr) {
      result = { status: 'error', error: execErr.message };
    }

    const nextRun = computeNextRun(row.cron);
    const runNow = new Date().toISOString();

    // Update the scheduled row
    await supabaseClient
      .from('scheduled_automations')
      .update({
        last_run: runNow,
        next_run: nextRun.toISOString(),
        updated_at: runNow,
      })
      .eq('id', row.id);

    // Log to automation_runs
    const registryEntry = REGISTRY.find((r) => r.id === row.automation_id);
    try {
      await supabaseClient.from('automation_runs').insert({
        company_id: row.company_id || null,
        run_id: runId,
        automation_id: row.automation_id,
        automation_name: registryEntry?.name || row.automation_id,
        status: result.status || 'completed',
        params: row.params || {},
        result,
        triggered_by_agent: row.created_by_agent || null,
      });
    } catch (insertErr) {
      console.warn('[automations] Failed to insert automation_run for scheduled row:', insertErr.message);
    }

    collected.push({
      company_id: row.company_id,
      automation_id: row.automation_id,
      status: result.status || 'completed',
    });
  }

  return collected;
}
