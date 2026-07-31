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
import {
  executeComposioAction,
  getConnectedAccountToken,
  getConnectedAccountApiKey,
  getConnectedAccountApiKeyForEntities,
  formatApolloConnectionError,
  metaGraphProxy,
} from '../mcp-router.js';
import { routeLeads, routingSummary, groupByChannel, explainRouting } from './channelRouter.js';
import { getPreferredMetaAdAccountId, getPreferredGoogleAdsCustomerId } from '../connector-preferences.js';
import { enrichLead as enrichLeadProvider, findLeads as findLeadsProvider } from '../lead-data-providers.js';
import {
  generateSocialImage,
  generateEmailHtml,
  generateFacelessVideo,
  generateAvatarVideo,
  createSeoArticle,
  createLandingPage,
} from './handlers/contentCreation.js';
import { generateB2cOrganicPack } from './handlers/b2cOrganicPack.js';
import { generateYoutubeContentPackage, repurposeContentPackage } from './handlers/contentPackages.js';
import { managePaidAdsLoop, enrollPaidAdsLoop } from './handlers/managePaidAdsLoop.js';
import {
  auditExistingBlog,
  buildSeoOrganicPlan,
  executeSeoPlanArticles,
} from './handlers/seoOrganicPipeline.js';
import { defaultLLMClient, getLLMModel } from '../llm-client.js';

export { enrollPaidAdsLoop };

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
    which_agents_can_invoke: ["isha", "maya", "arjun", "zara"],
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
    which_agents_can_invoke: ["isha", "arjun", "zara"],
    requires_credential: "google_ads",
  },
  {
    id: "linkedin_ads_fetch",
    name: "Fetch LinkedIn Ads Performance",
    description: "Pulls LinkedIn Ads accounts, campaigns, and analytics via Composio LinkedIn Ads toolkit",
    category: "paid_media",
    trigger_type: "direct_api",
    endpoint: null,
    params_schema: {
      ad_account_id: "Optional — LinkedIn sponsored account ID (numeric)",
      date_range: "e.g. last_7d or last_30d",
    },
    returns: "{ accounts: [...], campaigns: [...], analytics: [...] }",
    which_agents_can_invoke: ["zara", "isha", "arjun", "maya"],
    requires_credential: "linkedin_ads",
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
    which_agents_can_invoke: ["sam", "arjun", "kiran", "neel"],
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
    which_agents_can_invoke: ["sam", "arjun", "kiran", "neel"],
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
    which_agents_can_invoke: ["sam", "arjun", "kiran", "neel"],
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
    description: "Creates an Instantly campaign with proper sequences + schedule, bulk-adds leads, optionally registers reply webhook and interested subsequence.",
    category: "outreach",
    trigger_type: "direct_api",
    params_schema: {
      name: "Campaign name",
      subject: "Email subject line (supports {{first_name}}, {{company}})",
      body: "Email body (supports {{first_name}}, {{company}}, {{personalization}})",
      sequence_emails: "Optional array of { subject, body, delay_days } for multi-touch",
      from_email: "Sender email — must match an Instantly account (optional; auto-picks first active)",
      daily_limit: "Max emails per day (default 50)",
      timezone: "Campaign schedule timezone (default Asia/Kolkata)",
      leads: "Array of { email, first_name, last_name, company_name, personalization }",
      verify_leads: "Verify emails on import (default false)",
      register_webhook: "Register Marqq Instantly webhook for replies (default true when PUBLIC_BASE_URL set)",
      create_interested_subsequence: "Create interested-lead subsequence from follow-up copy (default true when sequence_emails has 2+)",
      activate: "Activate campaign after create (default false — draft mode)",
      enrich_leads: "After adding leads, run Instantly SuperSearch/AI enrichment on the campaign (default false)",
      enrich_mode: "'supersearch' (default) | 'ai' — which Instantly enrichment to create/run",
    },
    returns: "{ campaign_id, campaign_name, leads_added, sender_accounts, webhook, subsequence, enrichment, message }",
    which_agents_can_invoke: ["sam", "arjun", "kiran", "neel"],
    requires_credential: "instantly",
  },
  {
    id: "instantly_enrich_resource",
    name: "Instantly Enrich Campaign/List",
    description: "Creates and runs Instantly SuperSearch or AI enrichment on an existing campaign or lead list (email verify, profile, company, funding, etc.).",
    category: "outreach",
    trigger_type: "direct_api",
    params_schema: {
      resource_id: "Instantly campaign_id or list_id",
      resource_type: "'campaign' (default) | 'list'",
      enrich_mode: "'supersearch' (default) | 'ai'",
      run: "Trigger enrichment run after create (default true)",
    },
    returns: "{ enrichment_id, create, settings, run, status }",
    which_agents_can_invoke: ["sam", "arjun", "kiran", "neel"],
    requires_credential: "instantly",
  },
  {
    id: "instantly_list_accounts",
    name: "Instantly List Sender Accounts",
    description: "Lists Instantly sending mailboxes so campaigns can be bound to a valid email_list before activate.",
    category: "outreach",
    trigger_type: "direct_api",
    params_schema: {
      limit: "Max accounts (default 25)",
      search: "Optional email/domain filter",
      status: "Optional account status filter (1=Active)",
    },
    returns: "{ accounts: [...], count }",
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
    description: "Activates or resumes an Instantly campaign when sender accounts + leads are ready. Checks LIST_ACCOUNTS first.",
    category: "outreach",
    trigger_type: "direct_api",
    params_schema: {
      campaign_id: "Instantly campaign ID",
    },
    returns: "{ campaign_id, action: 'activated', sender_accounts }",
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
    id: "instantly_register_webhook",
    name: "Instantly Register Reply Webhook",
    description: "Registers Instantly → Marqq webhook so reply/interest events post to /api/webhooks/instantly.",
    category: "outreach",
    trigger_type: "direct_api",
    params_schema: {
      campaign_id: "Optional campaign UUID to scope events",
      event_type: "Event type (default all_events)",
      target_hook_url: "Override webhook URL (defaults to PUBLIC_BASE_URL + /api/webhooks/instantly)",
    },
    returns: "{ webhook_id, target_hook_url, event_type }",
    which_agents_can_invoke: ["sam", "kiran", "neel"],
    requires_credential: "instantly",
  },
  {
    id: "instantly_create_subsequence",
    name: "Instantly Create Subsequence",
    description: "Creates a condition-triggered subsequence (e.g. interested CRM status) under a parent campaign.",
    category: "outreach",
    trigger_type: "direct_api",
    params_schema: {
      campaign_id: "Parent Instantly campaign UUID",
      name: "Subsequence name",
      subject: "Follow-up email subject",
      body: "Follow-up email body",
      crm_status: "CRM interest status that triggers (default 1 = Interested)",
      timezone: "Schedule timezone",
    },
    returns: "{ subsequence_id, campaign_id }",
    which_agents_can_invoke: ["sam", "kiran", "neel"],
    requires_credential: "instantly",
  },
  {
    id: "instantly_verify_email",
    name: "Instantly Verify Email",
    description: "Verifies a single email address for deliverability before outreach.",
    category: "outreach",
    trigger_type: "direct_api",
    params_schema: {
      email: "Email to verify",
    },
    returns: "{ email, verification }",
    which_agents_can_invoke: ["sam", "kiran", "arjun", "neel"],
    requires_credential: "instantly",
  },
  {
    id: "instantly_update_lead_interest",
    name: "Instantly Update Lead Interest",
    description: "Sets Instantly interest status for a lead (interested, meeting booked, not interested, etc.).",
    category: "outreach",
    trigger_type: "direct_api",
    params_schema: {
      lead_email: "Lead email",
      interest_value: "0 OOO | 1 Interested | 2 Meeting Booked | 3 Meeting Completed | 4 Closed | -1 Not Interested | -2 Wrong Person | -3 Lost",
      campaign_id: "Optional campaign scope",
    },
    returns: "{ lead_email, interest_value }",
    which_agents_can_invoke: ["sam", "kiran", "neel"],
    requires_credential: "instantly",
  },
  {
    id: "instantly_mark_thread_read",
    name: "Instantly Mark Thread Read",
    description: "Marks an Instantly email thread as read after Marqq processes the reply.",
    category: "outreach",
    trigger_type: "direct_api",
    params_schema: {
      thread_id: "Instantly thread UUID",
    },
    returns: "{ thread_id, action: 'marked_read' }",
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
    which_agents_can_invoke: ["sam", "arjun", "kiran", "neel"],
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
      leads: "Array of { phone, name, company, email, opening_line? } — per-lead opening_line preferred",
      language: "en | hi",
      gender: "female | male",
    },
    returns: "{ campaign_name, queued_count, failed_count, calls }",
    which_agents_can_invoke: ["sam", "kiran", "neel"],
    requires_credential: null,
  },
  {
    id: "find_leads",
    name: "Find Leads",
    description: "Provider-agnostic B2B prospect search. Uses the workspace's preferred lead-data connector (Apollo people/account search, or Hunter domain/company discovery). Pass provider to force one.",
    category: "lead_data",
    trigger_type: "direct_api",
    endpoint: null,
    params_schema: {
      provider: "Optional: apollo | hunter (auto-resolves from connected + preference)",
      country: "ISO country code (e.g. IN, US)",
      industries: "Optional array of industry names",
      seniorities: "Optional array of seniority names",
      designation_keywords: "Optional comma-separated title keywords",
      titles: "Optional array of buyer titles (alias of designation_keywords)",
      domains: "Optional company domains — preferred path for Hunter",
      companies: "Optional company names — Hunter domain search fallback",
      cities: "Optional comma-separated cities",
      states: "Optional comma-separated states",
      limit: "Max rows to return (max 100, default 100)",
    },
    returns: "{ leads: [...], provider, source, count: number }",
    which_agents_can_invoke: ["arjun", "neel", "sam"],
    requires_credential: null,
  },
  {
    id: "enrich_lead",
    name: "Enrich Lead",
    description: "Provider-agnostic contact enrichment via Apollo or Hunter (email match / email finder).",
    category: "lead_data",
    trigger_type: "direct_api",
    endpoint: null,
    params_schema: {
      provider: "Optional: apollo | hunter",
      email: "Lead email address",
      domain: "Company domain (optional)",
      full_name: "Full name for Hunter email finder",
      first_name: "First name",
      last_name: "Last name",
      company: "Company name (optional)",
    },
    returns: "{ person: {...}, organization: {...}, provider, source }",
    which_agents_can_invoke: ["arjun", "neel", "sam", "kiran"],
    requires_credential: null,
  },
  {
    id: "apollo_lead_enrich",
    name: "Apollo Lead Enrichment",
    description: "Legacy alias — prefers Apollo when connected; otherwise falls through to enrich_lead.",
    category: "lead_data",
    trigger_type: "direct_api",
    endpoint: "APOLLO_API_URL",
    params_schema: {
      email: "Lead email address",
      domain: "Company domain (optional)",
    },
    returns: "{ person: {...}, organization: {...} }",
    which_agents_can_invoke: ["neel", "sam", "kiran", "arjun"],
    requires_credential: null,
  },
  {
    id: "apollo_find_leads",
    name: "Apollo Lead Search",
    description: "Legacy alias for find_leads with provider=apollo when Apollo is connected; otherwise uses any connected lead-data provider.",
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
    returns: "{ leads: [...], source, provider, count: number }",
    which_agents_can_invoke: ["arjun"],
    requires_credential: null,
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
    which_agents_can_invoke: ["zara", "isha", "maya", "arjun", "tara"],
    requires_credential: "meta_ads",
  },
  {
    id: "create_google_ads_campaign",
    name: "Create Google Ads Campaign",
    description: "Creates a PAUSED Google Ads Search campaign scaffold via Composio: Campaign Budget → Campaign → Ad Group → Responsive Search Ad. Review in Google Ads before enabling.",
    category: "paid_media",
    trigger_type: "direct_api",
    endpoint: null,
    params_schema: {
      customer_id: "Optional Google Ads customer ID (digits). Uses workspace preference / connection default if omitted.",
      campaign_name: "Campaign name (required)",
      daily_budget: "Daily budget in major currency units or Meta-style minor units (required)",
      headline: "Primary RSA headline (required)",
      primary_text: "RSA description / body (required)",
      link_url: "Final URL (required)",
      status: "PAUSED | ENABLED (default: PAUSED)",
      advertising_channel_type: "SEARCH | DISPLAY (default: SEARCH)",
    },
    returns: "{ customer_id, budget_resource_name, campaign_resource_name, ad_group_resource_name, ad_resource_name, status }",
    which_agents_can_invoke: ["zara", "isha", "maya", "arjun", "tara"],
    requires_credential: "google_ads",
  },
  {
    id: "create_linkedin_ads_campaign",
    name: "Create LinkedIn Ads Campaign",
    description: "Creates a PAUSED LinkedIn Ads campaign via Marketing API (campaign group + campaign). Uses connected LinkedIn Ads OAuth token. Creative attach is left for Campaign Manager review.",
    category: "paid_media",
    trigger_type: "direct_api",
    endpoint: null,
    params_schema: {
      ad_account_id: "Optional LinkedIn sponsored account ID. Auto-discovered via SEARCH_AD_ACCOUNTS if omitted.",
      campaign_name: "Campaign name (required)",
      daily_budget: "Daily budget in major currency units (required)",
      currency_code: "ISO currency e.g. USD | INR (default: USD)",
      objective: "LEAD_GENERATION | WEBSITE_VISITS | BRAND_AWARENESS | WEBSITE_CONVERSIONS",
      headline: "Optional — stored in notes for creative setup",
      primary_text: "Optional — stored in notes for creative setup",
      link_url: "Optional destination URL noted on the campaign result",
      status: "PAUSED | DRAFT | ACTIVE (default: PAUSED)",
    },
    returns: "{ ad_account_id, campaign_group_id, campaign_id, status, campaign_manager_url }",
    which_agents_can_invoke: ["zara", "isha", "maya", "arjun", "tara"],
    requires_credential: "linkedin_ads",
  },
  // ── Content Creation Automations (Riya + Maya) ─────────────────────────────
  {
    id: "generate_social_image",
    name: "Generate Social / Ad Image",
    description: "Generates a brand-consistent image via Gemini 3.1 Flash-Lite Image (gemini-3.1-flash-lite-image), uploads to imgbb CDN (Cloudinary fallback), and returns a permanent URL. Supports 1:1, 16:9, 9:16, 4:5 for paid ads and social.",
    category: "content_creation",
    trigger_type: "direct_api",
    endpoint: null,
    params_schema: {
      prompt: "What to depict in the image (required)",
      aspect_ratio: "1:1 | 16:9 | 9:16 | 4:5 (default: 1:1)",
      platform: "instagram | linkedin | facebook | google | twitter | youtube (default: instagram)",
      brand_context: "Brand colors, style, or guidelines to guide generation",
      style: "Visual style description (default: professional, clean, modern, minimalist)",
      headline: "Optional ad headline context (kept off-image unless prompt asks)",
      primary_text: "Optional ad primary text context",
    },
    returns: "{ image_url, cdn_url, cloudinary_url, host, platform, aspect_ratio, prompt_used, model }",
    which_agents_can_invoke: ["riya", "maya", "zara", "sam", "kiran"],
    requires_credential: null,
  },
  {
    id: "generate_b2c_organic_pack",
    name: "Generate B2C Organic Content Pack",
    description: "Creates 3 platform-native content angles for Instagram, Facebook, LinkedIn, and X — captions + Gemini creatives, with optional Instagram Reel and Facebook video variants.",
    category: "content_creation",
    trigger_type: "direct_api",
    endpoint: null,
    params_schema: {
      brand: "Brand name",
      offer: "Product or offer",
      audience: "B2C audience description",
      brand_context: "Optional brand style notes",
      channels: "Optional subset: instagram|facebook|linkedin|twitter",
      include_video: "Optional boolean; when true, generate Instagram Reel and Facebook video variants",
    },
    returns: "{ posts: [...], cta_flow, ready_count }",
    which_agents_can_invoke: ["riya", "kiran", "maya", "zara"],
    requires_credential: null,
  },
  {
    id: "generate_email_html",
    name: "Generate Email Newsletter HTML",
    description: "Generates a complete, email-client-safe HTML newsletter using email-sequence, copywriting, and copy-editing marketing skills. Inline CSS, responsive table layout, header/body/footer — ready for Mailchimp, Klaviyo, or Gmail go-live.",
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
    returns: "{ html, subject, preview_text, brand_name, primary_color, char_count, skill_alignment }",
    which_agents_can_invoke: ["riya", "sam", "kiran"],
    requires_credential: null,
  },
  {
    id: "generate_youtube_content_package",
    name: "Generate YouTube Production Package",
    description: "Creates a YouTube-native package: title variants, hooks, retention-oriented script beats, metadata, chapters, thumbnail briefs, and repurposing targets.",
    category: "content_creation",
    trigger_type: "direct_api",
    endpoint: null,
    params_schema: {
      topic: "Video topic or brief",
      audience: "Target viewer or ICP",
      objective: "Awareness, leads, education, or conversion goal",
      format: "long_form | short",
      brand: "Brand or company name",
    },
    returns: "{ titles, hooks, script, metadata, thumbnail_briefs, repurpose_targets }",
    which_agents_can_invoke: ["riya", "zara", "kiran", "maya"],
    requires_credential: null,
  },
  {
    id: "repurpose_content_package",
    name: "Repurpose Content Across Channels",
    description: "Turns one source asset into LinkedIn, X, Instagram, Facebook, and Reddit-native drafts with platform-specific quality checks.",
    category: "content_creation",
    trigger_type: "direct_api",
    endpoint: null,
    params_schema: {
      source: "Transcript, article, newsletter, or source content",
      topic: "Source topic",
      subreddit: "Optional target subreddit",
    },
    returns: "{ linkedin, x, instagram, facebook, reddit }",
    which_agents_can_invoke: ["riya", "kiran", "sam", "zara"],
    requires_credential: null,
  },
  {
    id: "create_landing_page",
    name: "Create Landing Page",
    description:
      "Generates conversion-ready landing page structure + HTML using page-cro, copywriting, and form-cro marketing skills. Returns page_structure for preview and go-live to Webflow/WordPress.",
    category: "content_creation",
    trigger_type: "direct_api",
    endpoint: null,
    params_schema: {
      product: "Product or offer name (required)",
      offer: "Value proposition / offer summary",
      audience: "Target audience",
      goal: "lead_gen | saas_trial | ecommerce | webinar | default",
      cta: "Primary CTA button text",
      brand_context: "Optional brand / positioning notes",
      pain_points: "Optional array of audience pain points",
    },
    returns:
      "{ title, slug, meta_description, page_structure, html, ab_tests, skill_alignment }",
    which_agents_can_invoke: ["riya", "tara", "neel"],
    requires_credential: null,
  },
  {
    id: "generate_faceless_video",
    name: "Generate Ad / Faceless Video",
    description: "Generates a short ad-ready video with Gemini/Veo, then falls back to Fal.ai Seedance 2.0 Fast when the primary provider fails. The fallback uses Nano Banana Pro to create missing first/last reference frames, then hosts the completed video on Cloudinary (folder ai-videos). Supports text-to-video and first/last-frame image-to-video.",
    category: "content_creation",
    trigger_type: "direct_api",
    endpoint: null,
    params_schema: {
      prompt: "Scene description for the video (required)",
      duration: "Duration in seconds, 4–15 (default: 8)",
      aspect_ratio: "16:9 | 9:16 (default: 16:9)",
      resolution: "480p | 720p (default: 720p for Seedance fallback)",
      style: "Visual style, e.g. cinematic, documentary, UGC (default: cinematic)",
      image_url: "Optional first-frame reference image URL (alias: first_image_url)",
      source_video_url: "Optional selected stock/source video URL (for Gemini Omni Flash editing)",
      stock_video_url: "Alias for source_video_url; use a Pexels video URL when stock footage is selected",
      first_image_url: "Optional first-frame reference image URL; generated with Nano Banana Pro when absent",
      last_image_url: "Optional last-frame reference image URL; generated with Nano Banana Pro when absent",
      first_frame_prompt: "Optional Nano Banana Pro prompt for the opening frame",
      last_frame_prompt: "Optional Nano Banana Pro prompt for the closing frame",
      generate_reference_frames: "boolean; default true when Fal fallback is used",
      generate_audio: "boolean; default true for Seedance native audio",
      image_base64: "Optional reference image base64 (image-to-video)",
    },
    returns: "{ status, video_url, cloudinary_url, model, prompt, duration, aspect_ratio, video_editing, source_video_url }",
    which_agents_can_invoke: ["riya", "maya", "zara", "sam"],
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
    description:
      "Generates a complete, publish-ready SEO-optimised HTML blog article using Groq LLM. For B2C (market_type=b2c or consumer audience), drafts with the humanizer skill and runs a second humanizer pass (blader/humanizer) so prose sounds human — no invented facts. Prefer running build_seo_organic_plan first (Semrush/Ahrefs) so keyword + topic come from the goal-aligned queue.",
    category: "content_creation",
    trigger_type: "direct_api",
    endpoint: null,
    params_schema: {
      keyword: "Primary target keyword (required if topic not provided)",
      primary_keyword: "Alias for keyword",
      secondary_keywords:
        "Array of 3–5 related phrases to weave naturally (no stuffing). Derived if omitted.",
      faq_questions: "Optional seed FAQ questions (4–6) for FAQPage rich results",
      topic: "Article topic/title (required if keyword not provided)",
      word_count_target: "Target word count (default: 1200)",
      target_audience:
        "Who the article is written for. Use consumer language for B2C (e.g. 'everyday consumers', 'patients', 'app users'). Default: B2B decision makers",
      brand_context: "Company positioning or product context to weave in",
      brand_name: "Publisher brand for JSON-LD",
      site_url: "Canonical site origin for JSON-LD URLs",
      market_type: "b2c | b2b | mixed — set b2c to force consumer voice + humanizer pass",
      market: "Alias for market_type",
      humanize:
        "true/false — override: force or skip humanizer. Default: on for B2C, off for B2B",
      generate_image: "true/false — generate a 16:9 editorial hero image with the configured image provider (default: true)",
      image_url: "Optional existing image URL; skips image generation and uses this URL",
    },
    returns:
      "{ html, title, meta_description, slug, primary_keyword, secondary_keywords, faq, json_ld, schemas, keyword_audit, seo_richness, word_count, market, skill_alignment }",
    which_agents_can_invoke: ["maya", "riya"],
    requires_credential: null,
  },
  {
    id: "audit_existing_blog",
    name: "Audit Existing Blog Content",
    description: "Audits a public sitemap and bounded set of blog pages for title/meta/H1/canonical, thin content, image alt text, internal links, and statically detectable structured data. Optionally samples rendered pages through Firecrawl for JS content and schema evidence.",
    category: "seo",
    trigger_type: "direct_api",
    endpoint: null,
    params_schema: {
      domain: "Root domain (falls back to workspace website URL)",
      limit: "Pages to audit, 5–100 (default: 50)",
      use_firecrawl: "true to render a bounded sample through Firecrawl (default: false)",
      firecrawl_limit: "Rendered pages to sample, max 10 (default: 10)",
    },
    returns: "{ status, domain, sitemap_url, summary, pages, rendered_audit, gaps, errors, note }",
    which_agents_can_invoke: ["maya", "riya"],
    requires_credential: null,
  },
  {
    id: "build_seo_organic_plan",
    name: "Build SEO Organic Plan",
    description:
      "Audits existing blog pages first, then uses Semrush/Ahrefs/GSC when connected to build a goal-aligned topical authority plan. When disconnected, the pipeline estimates keyword volumes via web search. The plan includes new article topics, content gaps, and refresh candidates. Then create_seo_article / execute_seo_plan_articles from the queue.",
    category: "seo",
    trigger_type: "direct_api",
    endpoint: null,
    params_schema: {
      domain: "Root domain e.g. nouriva.tech (falls back to workspace website URL)",
      database: "Semrush/Ahrefs country DB code (default us)",
      preferred_toolkit: "semrush | ahrefs — try this toolkit first",
      apify_actor_id: "Optional user-selected Apify keyword Actor ID; its dataset fields are normalized when present",
      apify_task_id: "Optional Apify Task ID instead of actor_id",
      apify_input: "Optional JSON input for the selected Apify Actor/Task",
      gsc_site_url: "Optional Search Console property URL (sc-domain:… or https://…)",
      audit_limit: "Optional existing blog pages to audit before planning (default: 50)",
      use_firecrawl: "Optional true for a bounded rendered-page audit when Firecrawl is connected",
      firecrawl_limit: "Optional rendered-page sample size, max 10",
      brand_context: "Optional positioning context",
      quantified_target: "Override GTM quantified goal",
      timeline_target: "Override GTM timeline e.g. 90d",
      channel_bet: "Override GTM channel bet",
    },
    returns:
      "{ status, domain, topical_authority, topic_clusters, article_queue, goal_alignment, volume_target, gsc, stages, needs? }",
    which_agents_can_invoke: ["maya", "riya"],
    requires_credential: null,
  },
  {
    id: "execute_seo_plan_articles",
    name: "Execute SEO Plan Articles",
    description:
      "Writes the next N articles from an SEO organic plan (or rebuilds the plan first) via create_seo_article, aligned to GTM numeric goals. Caps at 5 per run.",
    category: "seo",
    trigger_type: "direct_api",
    endpoint: null,
    params_schema: {
      article_queue: "Optional queue from build_seo_organic_plan",
      limit: "How many articles to write now (default 3, max 5)",
      domain: "Domain if rebuilding plan",
      target_audience: "Audience for articles",
      brand_context: "Brand context",
      market_type: "b2c | b2b",
      humanize: "Pass-through to create_seo_article",
    },
    returns: "{ status, written, attempted, results[], plan_snapshot }",
    which_agents_can_invoke: ["maya", "riya"],
    requires_credential: null,
  },
  {
    id: "manage_paid_ads_loop",
    name: "Paid Ads Closed Loop",
    description:
      "Post-launch optimizer aligned to paid-ads + ads-budget + ads-creative + ab-test-setup: paces vs GTM goal, 3x Kill Rule / 20% scale with 3d cooldown, Meta fatigue (freq>5), distinct-angle A/B variants with hypotheses, winning creative/cohort only after min sample. Auto-enrolled on create; cron every 6h.",
    category: "paid_media",
    trigger_type: "direct_api",
    endpoint: null,
    params_schema: {
      enrolled: "Array of enrolled campaigns { campaign_id, adset_id, channel, link_url, headline, ... }",
      campaign_id: "Optional one-shot campaign to process",
      quantified_target: "Override GTM goal e.g. '500 leads'",
      timeline_target: "Override GTM timeline e.g. '90 days' or ISO date",
      auto_optimize: "Pause/scale (default true)",
      auto_refresh_creatives: "Fatigue → new variants (default true)",
      dry_run: "Report only when true",
      roas_threshold_pause: "Pause ads below this ROAS (default 1.0)",
      roas_threshold_scale: "Scale ad sets above this ROAS (default 3.0)",
      budget_scale_factor: "Budget multiplier for winners (default 1.25)",
    },
    returns:
      "{ goals, campaigns: [{ pacing, fatigue, winning_creative, winning_cohort, new_variants, actions }], report }",
    which_agents_can_invoke: ["zara", "isha", "maya", "arjun"],
    requires_credential: "meta_ads",
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
 * ads-creative aligned: frequency >5 prospecting OR CTR <80% of avg with ≥1k impressions.
 */
function creativeFatigueCheck(params) {
  const ads = Array.isArray(params?.ads) ? params.ads : [];

  const adsWithCtr = ads.map((ad) => ({
    ...ad,
    ctr: ad.impressions > 0 ? ad.clicks / ad.impressions : 0,
  }));

  const withImpressions = adsWithCtr.filter((a) => (a.impressions || 0) >= 100);
  const averageCtr =
    withImpressions.length > 0
      ? withImpressions.reduce((sum, ad) => sum + ad.ctr, 0) / withImpressions.length
      : adsWithCtr.length > 0
        ? adsWithCtr.reduce((sum, ad) => sum + ad.ctr, 0) / adsWithCtr.length
        : 0;

  const fatigued_ads = [];
  const healthy_ads = [];

  for (const ad of adsWithCtr) {
    const freq = Number(ad.frequency || 0);
    const lowCtr =
      (ad.impressions || 0) >= 1000 && averageCtr > 0 && ad.ctr < averageCtr * 0.8;
    if (freq > 5 || lowCtr) {
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
    summary = `${fatigued_ads.length} of ${total} ads are fatigued (freq>5 and/or CTR<80% of peers). Recommend refreshing: ${names}.`;
  }

  return { fatigued_ads, healthy_ads, summary, average_ctr: averageCtr };
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

function instantlyPublicWebhookUrl(override) {
  if (override) return String(override).trim();
  const base = String(
    process.env.PUBLIC_BASE_URL ||
      process.env.TWILIO_PUBLIC_BASE_URL ||
      process.env.RAILWAY_PUBLIC_DOMAIN ||
      ""
  ).replace(/\/$/, "");
  if (!base) return null;
  const withScheme = /^https?:\/\//i.test(base) ? base : `https://${base}`;
  return `${withScheme}/api/webhooks/instantly`;
}

function instantlyDefaultSchedule(timezone = "Asia/Kolkata") {
  return {
    schedules: [
      {
        name: "Business hours",
        timing: { from: "09:00", to: "17:00" },
        days: { 0: false, 1: true, 2: true, 3: true, 4: true, 5: true, 6: false },
        timezone,
      },
    ],
  };
}

function instantlyBuildSequences(emails) {
  const steps = (Array.isArray(emails) ? emails : [])
    .filter((e) => e && (e.subject || e.body))
    .map((e, i) => ({
      type: "email",
      delay: i === 0 ? 0 : Number(e.delay_days ?? e.delay ?? 3),
      variants: [
        {
          subject: String(e.subject || "Quick question"),
          body: String(e.body || ""),
        },
      ],
    }));
  return steps.length ? [{ steps }] : null;
}

async function instantlyListSenderAccounts(companyId, params = {}) {
  const res = await executeComposioAction(
    "INSTANTLY_LIST_ACCOUNTS",
    {
      limit: Math.min(Math.max(Number(params.limit) || 25, 1), 100),
      ...(params.search ? { search: String(params.search) } : {}),
      ...(params.status != null ? { status: Number(params.status) } : { status: 1 }),
    },
    companyId
  );
  if (res.error) {
    return { error: res.error, accounts: [] };
  }
  const raw = res.result?.items || res.result?.accounts || res.result?.data || res.result || [];
  const accounts = (Array.isArray(raw) ? raw : [])
    .map((a) => ({
      email: a.email || a.username || a.address || null,
      status: a.status ?? null,
      provider: a.provider_code ?? a.provider ?? null,
      raw: a,
    }))
    .filter((a) => a.email);
  return { accounts, error: null };
}

async function generatePaidAdCreativeBrief(params = {}, companyId) {
  const model = getLLMModel('agent-run');
  const response = await defaultLLMClient.chat.completions.create({
    model,
    temperature: 0.7,
    max_tokens: 700,
    messages: [
      {
        role: 'system',
        content: `You are Riya, Marqq's performance creative agent, applying the ad-creative skill.
Generate one precise visual-generation brief for a Meta ${String(params.creative_type || 'IMAGE').toUpperCase()} ad.
Return JSON only with: prompt, brand_context, style, rationale, angle.
The prompt must be product-led, visually specific, and suitable for a 1:1 paid-social image.
Never invent people, testimonials, logos, UI text, claims, or product features.
Avoid generic AI imagery: no robots, humanoid AI, glowing AI brains, floating heads, or unrelated business people.
Include a clear visual hook, the product experience or tangible outcome, composition, lighting, and subject.
Do not ask the image model to render copy; ad copy is handled separately.`
      },
      {
        role: 'user',
        content: JSON.stringify({
          company_id: companyId,
          company: params.company_name,
          product: params.product || 'Nouriva AI personalized nutrition and meal-planning app',
          audience: params.audience || 'Health-conscious Indian adults seeking practical personalized meal planning',
          objective: params.objective || 'OUTCOME_LEADS',
          creative_type: String(params.creative_type || 'IMAGE').toUpperCase(),
          headline: params.headline,
          primary_text: params.primary_text,
          website: params.link_url,
          brand_context: params.brand_context || 'Use Nouriva AI brand DNA if available: warm, trustworthy, clean, food-forward health technology.',
          requested_creative_prompt: params.creative_prompt || null,
        }),
      },
    ],
  });
  const content = response?.choices?.[0]?.message?.content || '';
  const cleaned = String(content).replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const jsonText = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  let parsed;
  try { parsed = JSON.parse(jsonText); } catch { parsed = null; }
  if (parsed?.prompt) return { ...parsed, model };
  if (cleaned) {
    return {
      prompt: cleaned,
      brand_context: params.brand_context || '',
      style: params.creative_style || '',
      rationale: 'LLM returned a plain-text creative brief; using it directly as the generation prompt.',
      angle: 'llm_generated',
      model,
    };
  }
  throw new Error('Riya returned no usable creative prompt');
}

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
  async generate_b2c_organic_pack(params, companyId) {
    return generateB2cOrganicPack(params, companyId);
  },
  async generate_youtube_content_package(params, companyId) {
    return generateYoutubeContentPackage(params, companyId);
  },
  async repurpose_content_package(params, companyId) {
    return repurposeContentPackage(params, companyId);
  },
  async generate_email_html(params, companyId) {
    return generateEmailHtml(params, companyId);
  },
  async create_landing_page(params, companyId) {
    return createLandingPage(params, companyId);
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
  async build_seo_organic_plan(params, companyId, supabaseClient) {
    return buildSeoOrganicPlan(params, companyId, supabaseClient);
  },
  async audit_existing_blog(params, companyId) {
    return auditExistingBlog(params, companyId);
  },
  async execute_seo_plan_articles(params, companyId, supabaseClient) {
    return executeSeoPlanArticles(params, companyId, supabaseClient);
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
      return { status: 'error', error: 'META_AD_LIBRARY_TOKEN not configured', ads: [] };
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

  async find_leads(params, companyId) {
    return findLeadsProvider(params || {}, companyId, [companyId]);
  },

  async enrich_lead(params, companyId) {
    return enrichLeadProvider(params || {}, companyId, [companyId]);
  },

  async apollo_lead_enrich(params, companyId) {
    return enrichLeadProvider({ ...(params || {}), provider: 'apollo' }, companyId, [companyId]);
  },

  async apollo_find_leads(params, companyId) {
    // Prefer Apollo when connected; resolveLeadDataProvider falls back to Hunter otherwise.
    return findLeadsProvider({ ...(params || {}), provider: 'apollo' }, companyId, [companyId]);
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

  async linkedin_ads_fetch(params, companyId) {
    const notes = [];
    const toArray = (value) => {
      if (Array.isArray(value)) return value;
      if (Array.isArray(value?.elements)) return value.elements;
      if (Array.isArray(value?.data)) return value.data;
      if (Array.isArray(value?.items)) return value.items;
      if (Array.isArray(value?.results)) return value.results;
      return [];
    };

    const accountsRes = await executeComposioAction(
      'LINKEDIN_ADS_SEARCH_AD_ACCOUNTS',
      { status: ['ACTIVE'], page_size: 25 },
      companyId,
    );
    if (accountsRes.error) {
      const raw = String(accountsRes.error || '');
      if (/not connected|credentials|auth|token/i.test(raw)) {
        return {
          status: 'error',
          error: 'LinkedIn Ads not connected. Connect in Settings → Accounts.',
          accounts: [],
          campaigns: [],
          analytics: [],
        };
      }
      return { status: 'error', error: accountsRes.error, accounts: [], campaigns: [], analytics: [] };
    }

    const accountsRaw = toArray(accountsRes.result);
    const accounts = accountsRaw.map((row) => {
      const id =
        row?.id ||
        row?.account_id ||
        String(row?.account || row?.urn || '')
          .split(':')
          .pop();
      return {
        id: id ? String(id).replace(/^urn:li:sponsoredAccount:/, '') : null,
        name: row?.name || row?.accountName || 'LinkedIn Ads account',
        status: row?.status || row?.accountStatus || null,
        type: row?.type || null,
        raw: row,
      };
    }).filter((a) => a.id);

    const preferredAccountId = String(params.ad_account_id || params.account_id || '').replace(/\D/g, '');
    const adAccountId = preferredAccountId || accounts[0]?.id || null;
    if (!adAccountId) {
      return {
        status: 'completed',
        accounts,
        campaigns: [],
        analytics: [],
        notes: ['No LinkedIn Ads accounts found for this connection.'],
      };
    }

    const campaignsRes = await executeComposioAction(
      'LINKEDIN_ADS_SEARCH_CAMPAIGNS',
      {
        adAccountId: Number(adAccountId),
        pageSize: 50,
        q: 'search',
      },
      companyId,
    );
    if (campaignsRes.error) notes.push(`Campaigns: ${campaignsRes.error}`);
    const campaignsRaw = campaignsRes.error ? [] : toArray(campaignsRes.result);
    const campaigns = campaignsRaw.map((row) => {
      const id =
        row?.id ||
        String(row?.campaign || row?.urn || '')
          .split(':')
          .pop();
      return {
        id: id ? String(id) : null,
        name: row?.name || row?.campaignName || 'Untitled campaign',
        status: row?.status || row?.campaignStatus || null,
        type: row?.type || row?.campaignType || null,
        daily_budget: row?.dailyBudget?.amount || row?.daily_budget || null,
        total_budget: row?.totalBudget?.amount || row?.total_budget || null,
        platform: 'LinkedIn',
        raw: row,
      };
    });

    const rangeKey = String(params.date_range || 'last_30d').toLowerCase();
    const days = rangeKey.includes('7') ? 7 : rangeKey.includes('month') && !rangeKey.includes('last_') ? 30 : 30;
    const end = new Date();
    const start = new Date(Date.now() - days * 86_400_000);
    const asLiDate = (d) => ({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });

    const analyticsRes = await executeComposioAction(
      'LINKEDIN_ADS_GET_AD_ANALYTICS',
      {
        pivot: 'CAMPAIGN',
        timeGranularity: 'ALL',
        fields: 'impressions,clicks,costInLocalCurrency,externalWebsiteConversions,oneClickLeads',
        accounts: [`urn:li:sponsoredAccount:${adAccountId}`],
        dateRange: { start: asLiDate(start), end: asLiDate(end) },
      },
      companyId,
    );
    if (analyticsRes.error) notes.push(`Analytics: ${analyticsRes.error}`);
    const analyticsRaw = analyticsRes.error ? [] : toArray(analyticsRes.result);
    const analytics = analyticsRaw.map((row) => {
      const spend = Number(row?.costInLocalCurrency || row?.costInUsd || row?.spend || 0);
      const impressions = Number(row?.impressions || 0);
      const clicks = Number(row?.clicks || 0);
      const conversions = Number(
        row?.externalWebsiteConversions || row?.oneClickLeads || row?.conversions || 0,
      );
      return {
        campaign: row?.pivotValues?.[0] || row?.campaign || row?.name || null,
        spend,
        impressions,
        clicks,
        conversions,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        platform: 'LinkedIn',
        raw: row,
      };
    });

    // Prefer analytics-backed campaign rows when available
    const campaignRows = analytics.length
      ? analytics.map((a) => ({
          name: a.campaign || 'Campaign',
          spend: a.spend,
          impressions: a.impressions,
          clicks: a.clicks,
          conversions: a.conversions,
          ctr: a.ctr,
          platform: 'LinkedIn',
        }))
      : campaigns.map((c) => ({
          name: c.name,
          spend: Number(c.daily_budget || 0),
          impressions: 0,
          clicks: 0,
          conversions: 0,
          ctr: 0,
          status: c.status,
          platform: 'LinkedIn',
        }));

    return {
      status: 'completed',
      date_range: rangeKey,
      ad_account_id: adAccountId,
      accounts,
      campaigns: campaignRows,
      analytics,
      notes,
    };
  },

  // ── Meta Ads — via Composio METAADS_* toolkit actions ────────────────────
  // Composio's metaads toolkit (53 actions) handles OAuth, token refresh,
  // and all Meta Marketing API calls. We use executeComposioAction throughout.
  // For ad/adset status updates (no Composio action exists), we fall back to
  // the stored token + direct Graph API calls.

  /**
   * Resolve ad account ID and Facebook Page ID via Composio proxy.
   * Composio masks OAuth tokens, so we never call Graph with a raw access_token.
   * Returns { adAccountId, pageId, connectedAccountId }.
   */
  async _metaSetup(params, companyId) {
    let adAccountId = params.ad_account_id;
    let pageId = params.page_id || null;
    let connectedAccountId = null;

    if (!adAccountId) {
      adAccountId = getPreferredMetaAdAccountId(companyId) || null;
    }

    if (!adAccountId) {
      const listed = await metaGraphProxy(companyId, {
        method: 'GET',
        path: '/me/adaccounts',
        query: { fields: 'id,name,account_status', limit: 50 },
      });
      if (listed.error) throw new Error(`Meta adaccounts error: ${listed.error}`);
      connectedAccountId = listed.connectedAccountId || null;
      const accounts = listed.result?.data || listed.result?.accounts || [];
      if (!Array.isArray(accounts) || !accounts.length) {
        throw new Error('No Meta ad accounts found for this connection. Check Meta Business Manager access.');
      }
      if (accounts.length > 1) {
        const labels = accounts
          .slice(0, 8)
          .map((a) => `${a.name || a.id} (${a.id})`)
          .join(', ');
        throw new Error(
          `Multiple Meta ad accounts found (${accounts.length}). Choose one in Settings → Accounts → Meta Ads${labels ? `: ${labels}` : ''}.`
        );
      }
      const active = accounts.find((a) => a.account_status === 1) || accounts[0];
      if (!active?.id) throw new Error('No active Meta ad account found. Connect Meta Ads in Settings → Accounts.');
      adAccountId = active.id.startsWith('act_') ? active.id : `act_${active.id}`;
    } else if (!String(adAccountId).startsWith('act_')) {
      adAccountId = `act_${adAccountId}`;
    }

    if (!pageId) {
      const pagesRes = await metaGraphProxy(companyId, {
        method: 'GET',
        path: '/me/accounts',
        query: { fields: 'id,name', limit: 25 },
      });
      if (!pagesRes.error) {
        connectedAccountId = connectedAccountId || pagesRes.connectedAccountId || null;
        const pages = pagesRes.result?.data || [];
        const acctName = (adAccountId || '').toLowerCase();
        const matched = pages.find((p) => p.name && acctName.includes(p.name.toLowerCase().split(' ')[0]));
        if (matched) pageId = matched.id;
        else if (pages.length) pageId = pages[0].id;
      }
    }

    return { adAccountId, pageId, connectedAccountId };
  },

  async create_meta_campaign(params, companyId, supabaseClient = null) {
    if (!params.campaign_name) return { status: 'error', error: 'campaign_name is required' };
    if (!params.daily_budget)  return { status: 'error', error: 'daily_budget is required (minor currency units, e.g. 50000 = ₹500)' };
    if (!params.headline)      return { status: 'error', error: 'headline is required' };
    if (!params.primary_text)  return { status: 'error', error: 'primary_text is required' };
    if (!params.link_url)      return { status: 'error', error: 'link_url is required' };

    let adAccountId, pageId;
    try {
      ({ adAccountId, pageId } = await directApiHandlers._metaSetup(params, companyId));
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
    const channel = String(params.channel || params.paid_channel || params.platform || '').toLowerCase();
    const publisherPlatforms = (() => {
      if (Array.isArray(params.publisher_platforms) && params.publisher_platforms.length) {
        return params.publisher_platforms.map(String);
      }
      if (channel === 'facebook') return ['facebook'];
      if (channel === 'instagram') return ['instagram'];
      if (
        channel === 'facebook_instagram' ||
        channel === 'fb_instagram' ||
        channel === 'meta' ||
        channel === 'fb+insta'
      ) {
        return ['facebook', 'instagram'];
      }
      return null; // Advantage+ / automatic placements when unspecified
    })();
    const targeting = {
      age_min: 18,
      age_max: 65,
      geo_locations: { countries: ['IN'] },
      ...(params.targeting && typeof params.targeting === 'object' ? params.targeting : {}),
      ...(publisherPlatforms ? { publisher_platforms: publisherPlatforms } : {}),
    };

    if (!pageId) {
      return {
        status: 'error',
        error: 'Facebook Page ID required for ad creative. Provide page_id param, or connect a Page in Meta Business Manager.',
        step: 'creative',
      };
    }

    // A paid-ad launch must own a real creative asset before any Meta write.
    // Reuse an explicitly approved asset; otherwise invoke Riya's existing
    // image-generation pipeline and persist the hosted result in the draft.
    const creativeType = String(params.creative_type || (params.generate_video ? 'VIDEO' : 'IMAGE')).toUpperCase();
    let generatedAsset = null;
    let creativeBrief = null;

    // Video generation is deliberately asynchronous. Return a durable draft
    // immediately and let the worker update it when the hosted asset exists.
    // Meta creation remains impossible until the user approves the ready draft
    // and a Meta video_id is available.
    if (creativeType === 'VIDEO' && !params.video_id && params.async !== false) {
      const asyncDraftId = `meta-creative-${companyId}-${Date.now()}`;
      const asyncCreatedAt = new Date().toISOString();
      const asyncDraft = {
        campaign_name: String(params.campaign_name),
        platform: 'meta',
        account_id: adAccountId,
        page_id: pageId,
        objective,
        headline: String(params.headline),
        primary_text: String(params.primary_text),
        link_url: String(params.link_url),
        image_url: params.image_url || null,
        video_url: params.video_url || null,
        video_id: null,
        creative_type: 'VIDEO',
        cta_type: ctaType,
        targeting,
        status: 'generating',
        asset_generation: { status: 'queued', agent: 'riya' },
        created_at: asyncCreatedAt,
      };
      const saveAsyncDraft = async (data, handoff = 'Video creative generation is running asynchronously.') => {
        if (!supabaseClient?.from) return;
        await supabaseClient.from('agent_artifacts').upsert({
          id: asyncDraftId,
          company_id: companyId,
          agent: 'riya',
          type: 'paid_ad_creative_draft',
          data,
          handoff_notes: handoff,
          tags: ['paid-ads', 'meta', 'video', data.status || 'generating'],
          saved_at: new Date().toISOString(),
          payload: { id: asyncDraftId, companyId, agent: 'riya', type: 'paid_ad_creative_draft', data },
        }, { onConflict: 'id' });
      };
      try { await saveAsyncDraft(asyncDraft); } catch (error) {
        console.warn('[create_meta_campaign] async video draft persistence failed:', error?.message || error);
      }
      setImmediate(async () => {
        try {
          const brief = await generatePaidAdCreativeBrief({ ...params, creative_type: 'VIDEO' }, companyId);
          const generated = await generateFacelessVideo({
            prompt: brief.prompt,
            duration: params.duration || 8,
            aspect_ratio: params.aspect_ratio || '9:16',
            style: brief.style || params.creative_style || 'premium, warm, appetizing Indian food and clean mobile product demo',
            generate_audio: params.generate_audio !== false,
          }, companyId);
          const videoUrl = generated?.cloudinary_url || generated?.video_url || generated?.url || null;
          const status = videoUrl ? 'ready_for_approval' : (generated?.status === 'queued' ? 'processing' : 'failed');
          await saveAsyncDraft({
            ...asyncDraft,
            status,
            video_url: videoUrl,
            asset_generation: {
              status: generated?.status || 'error',
              model: generated?.model || null,
              host: generated?.host || null,
              prompt_used: generated?.prompt || brief.prompt,
              brief: { agent: 'riya', model: brief.model, angle: brief.angle || null, rationale: brief.rationale || null, prompt: brief.prompt },
              operation_name: generated?.operation_name || null,
              error: generated?.error || null,
            },
          }, status === 'ready_for_approval' ? 'Video creative is ready. Approve it and upload it to Meta before campaign creation.' : 'Video creative generation did not complete.');
        } catch (error) {
          try { await saveAsyncDraft({ ...asyncDraft, status: 'failed', asset_generation: { status: 'error', error: error?.message || String(error) } }, 'Video creative generation failed.'); } catch {}
        }
      });
      return {
        status: 'pending',
        step: 'creative_generation',
        creative_draft_id: asyncDraftId,
        creative_draft: asyncDraft,
        poll_url: `/api/paid-ads/creative-status?companyId=${encodeURIComponent(companyId)}&artifactId=${encodeURIComponent(asyncDraftId)}`,
        message: 'Video creative generation started asynchronously. Meta upload is gated until the video is ready and approved.',
      };
    }

    if ((creativeType === 'IMAGE' && !params.image_url) || (creativeType === 'VIDEO' && !params.video_id && !params.video_url)) {
      try {
        creativeBrief = await generatePaidAdCreativeBrief(params, companyId);
      } catch (error) {
        return {
          status: 'error',
          error: `Riya creative brief failed: ${error?.message || error}`,
          step: 'creative_brief',
          composio_action: 'METAADS_CREATE_AD_CREATIVE',
        };
      }
      const fallbackPrompt = `Create a product-led paid social ad image for Nouriva AI, a personalized nutrition and meal-planning app for Indian households. Show a beautifully arranged balanced Indian meal beside a smartphone displaying a clean personalized weekly meal-plan interface, with a subtle lab-report personalization cue. Focus on the tangible outcome: knowing what to eat next. Do not depict robots, humanoid AI, abstract AI symbols, floating heads, generic business people, or unrelated male characters. Do not render any words, logos, or fake UI text in the image.`;
      if (creativeType === 'IMAGE') {
        generatedAsset = await generateSocialImage({
          prompt: creativeBrief?.prompt || params.creative_prompt || fallbackPrompt,
          aspect_ratio: params.aspect_ratio || '1:1',
          platform: 'facebook_instagram',
          brand_context: creativeBrief?.brand_context || params.brand_context || 'Nouriva AI: warm, trustworthy personalized nutrition and meal planning for Indian households; use the existing Nouriva visual identity and avoid generic AI imagery.',
          style: creativeBrief?.style || params.creative_style || 'warm, appetizing, premium Indian food photography, soft natural light, clean mobile product composition, trustworthy health brand, no people unless essential',
          headline: params.headline,
          primary_text: params.primary_text,
        }, companyId);
      } else {
        generatedAsset = await generateFacelessVideo({
          prompt: creativeBrief?.prompt || params.creative_prompt || fallbackPrompt,
          duration: params.duration || 8,
          aspect_ratio: params.aspect_ratio || '9:16',
          style: creativeBrief?.style || params.creative_style || 'premium, warm, appetizing Indian food and clean mobile product demo',
          generate_audio: params.generate_audio !== false,
        }, companyId);
      }
      const generatedUrl = creativeType === 'VIDEO'
        ? (generatedAsset?.cloudinary_url || generatedAsset?.video_url || generatedAsset?.url || null)
        : (generatedAsset?.cdn_url || generatedAsset?.image_url || generatedAsset?.cloudinary_url || null);
      const assetSucceeded = creativeType === 'VIDEO'
        ? ['success', 'completed'].includes(String(generatedAsset?.status || '').toLowerCase())
        : generatedAsset?.status === 'success';
      if (!assetSucceeded || !generatedUrl) {
        return {
          status: 'error',
          error: `Creative generation failed: ${generatedAsset?.error || 'no hosted image returned'}`,
          step: 'creative_generation',
          composio_action: 'METAADS_CREATE_AD_CREATIVE',
        };
      }
      if (creativeType === 'VIDEO') params.video_url = generatedUrl;
      else params.image_url = generatedUrl;
    }
    // Persist the complete Marqq-side creative draft before uploading anything
    // to Meta. This gives the UI/audit trail a local draft even when Meta
    // rejects the upload, and keeps campaign-side mutations gated on success.
    const creativeDraft = {
      campaign_name: String(params.campaign_name),
      platform: 'meta',
      account_id: adAccountId,
      page_id: pageId,
      objective,
      headline: String(params.headline),
      primary_text: String(params.primary_text),
      link_url: String(params.link_url),
      image_url: params.image_url || null,
      video_url: params.video_url || null,
      video_id: params.video_id || null,
      asset_generation: generatedAsset ? {
        status: generatedAsset.status,
        model: generatedAsset.model || null,
        host: generatedAsset.host || null,
        prompt_used: generatedAsset.prompt_used || null,
        brief: creativeBrief ? {
          agent: 'riya',
          model: creativeBrief.model || null,
          angle: creativeBrief.angle || null,
          rationale: creativeBrief.rationale || null,
          prompt: creativeBrief.prompt,
        } : null,
      } : null,
      cta_type: ctaType,
      targeting,
      status: 'draft',
      created_at: new Date().toISOString(),
    };
    const creativeDraftId = `meta-creative-${companyId}-${Date.now()}`;
    if (supabaseClient?.from) {
      try {
        await supabaseClient.from('agent_artifacts').upsert({
          id: creativeDraftId,
          company_id: companyId,
          agent: 'zara',
          type: 'paid_ad_creative_draft',
          data: creativeDraft,
          handoff_notes: 'Created locally before Meta upload; requires approval before live activation.',
          tags: ['paid-ads', 'meta', 'draft'],
          saved_at: creativeDraft.created_at,
          payload: { id: creativeDraftId, companyId, agent: 'zara', type: 'paid_ad_creative_draft', data: creativeDraft },
        }, { onConflict: 'id' });
      } catch (error) {
        console.warn('[create_meta_campaign] creative draft persistence failed:', error?.message || error);
      }
    }
    if (creativeType === 'VIDEO' && !params.video_id) {
      return {
        status: 'error',
        error: 'Video asset generated and saved, but Meta requires a video_id before METAADS_CREATE_AD_CREATIVE. Upload the approved hosted video to Meta, then continue the draft.',
        step: 'creative_generation',
        video_url: params.video_url || null,
        creative_draft_id: creativeDraftId,
        creative_draft: creativeDraft,
        composio_action: 'METAADS_CREATE_AD_CREATIVE',
      };
    }
    // Use Composio's typed Meta Ads actions for all writes. The proxy is kept
    // for read-only account/page discovery, but native actions provide the
    // toolkit's validated creative/campaign/ad-set/ad schemas and structured
    // errors.
    const actionResult = async (action, input, step, ids = {}) => {
      const response = await executeComposioAction(action, input, companyId);
      const result = response?.result || null;
      if (response?.error) return {
        status: 'error',
        error: `${step}: ${response.error}`,
        step: step.toLowerCase().replaceAll(' ', '_'),
        ...ids,
        creative_draft_id: creativeDraftId,
        creative_draft: creativeDraft,
        composio_action: action,
        raw: response.raw || null,
      };
      const id = result?.id || result?.data?.id || result?.result?.id || null;
      if (!id) return {
        status: 'error',
        error: `${step}: missing id in Composio response`,
        step: step.toLowerCase().replaceAll(' ', '_'),
        ...ids,
        creative_draft_id: creativeDraftId,
        creative_draft: creativeDraft,
        composio_action: action,
        raw: result,
      };
      return { id, result };
    };

    if (creativeType === 'IMAGE' && !params.image_url) {
      return {
        status: 'error',
        error: 'Creative: image_url is required for an IMAGE creative. Generate or select the creative asset before approval.',
        step: 'creative',
        creative_draft_id: creativeDraftId,
        creative_draft: creativeDraft,
        composio_action: 'METAADS_CREATE_AD_CREATIVE',
      };
    }
    const nativeCreative = await actionResult('METAADS_CREATE_AD_CREATIVE', {
      account_id: adAccountId,
      name: `${params.campaign_name} — Creative`,
      creative: {
        type: creativeType,
        page_id: pageId,
        message: params.primary_text,
        website_url: params.link_url,
        call_to_action: ctaType,
        ...(params.image_url ? { image_url: params.image_url } : {}),
        ...(params.video_id ? { video_id: params.video_id } : {}),
      },
    }, 'Creative');
    let creative = nativeCreative;
    // Current Composio METAADS_CREATE_AD_CREATIVE versions incorrectly map
    // image_url into Meta's link_data as image_url; Meta expects `picture` for
    // a URL-based link creative. Keep the native action as the first path, but
    // use the correctly shaped Composio proxy request for this known adapter
    // incompatibility. Campaign/ad-set/ad writes remain native actions.
    if (
      nativeCreative.status === 'error' &&
      params.image_url &&
      /unsupported field in object_story_spec|image_url/i.test(String(nativeCreative.error || ''))
    ) {
      const fallbackCreative = await metaGraphProxy(companyId, {
        method: 'POST',
        path: `/${adAccountId}/adcreatives`,
        body: {
          name: `${params.campaign_name} — Creative`,
          object_story_spec: {
            page_id: pageId,
            link_data: {
              message: params.primary_text,
              link: params.link_url,
              name: params.headline,
              picture: params.image_url,
              call_to_action: { type: ctaType, value: { link: params.link_url } },
            },
          },
        },
      });
      if (!fallbackCreative.error && fallbackCreative.result?.id) {
        creative = { id: fallbackCreative.result.id, result: fallbackCreative.result, transport: 'proxy_fallback' };
      } else {
        return {
          ...nativeCreative,
          error: `Creative: native action and picture fallback failed: ${fallbackCreative.error || 'missing id'}`,
          fallback_error: fallbackCreative.error || null,
        };
      }
    }
    if (creative.status === 'error') return creative;
    const creativeId = creative.id;

    // Campaign, ad set, and ad are created only after the creative exists.
    const nativeObjective = {
      OUTCOME_LEADS: 'LEAD_GENERATION',
      OUTCOME_SALES: 'CONVERSIONS',
      OUTCOME_TRAFFIC: 'LINK_CLICKS',
      OUTCOME_AWARENESS: 'BRAND_AWARENESS',
      OUTCOME_ENGAGEMENT: 'POST_ENGAGEMENT',
      OUTCOME_APP_PROMOTION: 'APP_INSTALLS',
    }[objective] || 'LINK_CLICKS';
    const campaign = await actionResult('METAADS_CREATE_CAMPAIGN', {
      account_id: adAccountId,
      name: params.campaign_name,
      objective: nativeObjective,
      status: campaignStatus,
      special_ad_categories: [],
    }, 'Campaign', { creative_id: creativeId });
    if (campaign.status === 'error') return campaign;
    const campaignId = campaign.id;

    const nativeTargeting = {
      age_min: targeting.age_min,
      age_max: targeting.age_max,
      location_type: 'countries',
      locations: targeting.geo_locations?.countries || ['IN'],
    };
    const adset = await actionResult('METAADS_CREATE_AD_SET', {
      campaign_id: campaignId,
      name: `${params.campaign_name} — Ad Set`,
      status: campaignStatus,
      daily_budget: params.daily_budget,
      billing_event: 'IMPRESSIONS',
      optimization_goal: nativeObjective === 'LEAD_GENERATION' ? 'OFFSITE_CONVERSIONS' : optimizationGoal,
      bid_amount: params.bid_amount ?? 50,
      targeting: nativeTargeting,
    }, 'Ad Set', { campaign_id: campaignId, creative_id: creativeId });
    if (adset.status === 'error') return adset;
    const adsetId = adset.id;

    const ad = await actionResult('METAADS_CREATE_AD', {
      ad_set_id: adsetId,
      name: `${params.campaign_name} — Ad`,
      status: campaignStatus,
      creative: { type: creativeType, page_id: pageId, message: params.primary_text, website_url: params.link_url, call_to_action: ctaType, ...(params.image_url ? { image_url: params.image_url } : {}), ...(params.video_id ? { video_id: params.video_id } : {}) },
    }, 'Ad', { campaign_id: campaignId, adset_id: adsetId, creative_id: creativeId });
    if (ad.status === 'error') return ad;
    const adId = ad.id;

    let loop_enrollment = null;
    if (params.skip_loop_enrollment !== true && params.skip_loop_enrollment !== 'true') {
      try {
        loop_enrollment = await enrollPaidAdsLoop(companyId, {
          campaign_id: campaignId,
          adset_id: adsetId,
          creative_id: creativeId,
          ad_id: adId,
          ad_account_id: adAccountId,
          page_id: pageId,
          channel: channel || 'meta',
          campaign_name: params.campaign_name,
          link_url: params.link_url,
          headline: params.headline,
          primary_text: params.primary_text,
          image_url: params.image_url || null,
          cta_type: ctaType,
          ads_status: campaignStatus,
          objective,
        }, {
          quantified_target: params.quantified_target,
          timeline_target: params.timeline_target,
          objective,
          dry_run: params.loop_dry_run === true,
          agentName: 'zara',
        });
      } catch (enrollErr) {
        console.warn('[create_meta_campaign] loop enroll failed:', enrollErr.message);
        loop_enrollment = { ok: false, error: enrollErr.message };
      }
    }

    const enrollNote = loop_enrollment?.ok
      ? ` Closed loop enrolled (every 6h) → next run ${loop_enrollment.next_run}.`
      : '';

    return {
      status: 'completed',
      campaign_id: campaignId,
      adset_id: adsetId,
      creative_id: creativeId,
      ad_id: adId,
      creative_draft_id: creativeDraftId,
      ad_account_id: adAccountId,
      page_id: pageId,
      objective,
      campaign_status: campaignStatus,
      message: (campaignStatus === 'PAUSED'
        ? 'Campaign created and paused. Review in Meta Ads Manager, then set to ACTIVE when ready.'
        : 'Campaign created and ACTIVE — spending has begun.') + enrollNote,
      loop_enrollment,
    };
  },
  async create_google_ads_campaign(params, companyId) {
    if (!params.campaign_name) return { status: 'error', error: 'campaign_name is required' };
    if (!params.headline) return { status: 'error', error: 'headline is required' };
    if (!params.primary_text) return { status: 'error', error: 'primary_text is required' };
    if (!params.link_url) return { status: 'error', error: 'link_url is required' };

    const budgetMicros = (() => {
      const n = Number(params.daily_budget ?? params.budget);
      if (!Number.isFinite(n) || n <= 0) return null;
      if (n >= 1_000_000) return Math.round(n);
      if (n < 1000) return Math.round(n * 1_000_000);
      return Math.round((n / 100) * 1_000_000);
    })();
    if (!budgetMicros) return { status: 'error', error: 'daily_budget is required (e.g. 500 for ₹500/day)' };

    let customerId = String(params.customer_id || params.google_ads_customer_id || getPreferredGoogleAdsCustomerId(companyId) || '')
      .replace(/[-\s]/g, '');
    if (!customerId) {
      const listed = await executeComposioAction('GOOGLEADS_LIST_ACCESSIBLE_CUSTOMERS', {}, companyId);
      if (listed.error) return { status: 'error', error: listed.error, step: 'customer' };
      const rows = listed.result?.resource_names || listed.result?.customers || listed.result || [];
      const first = Array.isArray(rows) ? rows[0] : null;
      const raw = typeof first === 'string' ? first : first?.resource_name || first?.id || '';
      customerId = String(raw).replace(/[^\d]/g, '');
    }
    if (!customerId) {
      return { status: 'error', error: 'No Google Ads customer_id found. Pick one in Settings → Accounts.', step: 'customer' };
    }

    const status = String(params.status || 'PAUSED').toUpperCase() === 'ENABLED' ? 'ENABLED' : 'PAUSED';
    const channelType = String(params.advertising_channel_type || 'SEARCH').toUpperCase() === 'DISPLAY'
      ? 'DISPLAY'
      : 'SEARCH';
    const base = { customer_id: customerId, partial_failure: false, response_content_type: 'MUTABLE_RESOURCE' };

    const extractResourceName = (payload) => {
      const r = payload?.result ?? payload;
      const results = r?.results || r?.result?.results || [];
      if (Array.isArray(results) && results[0]) {
        const row = results[0];
        return (
          row.resource_name ||
          row.campaign_budget?.resource_name ||
          row.campaignBudget?.resource_name ||
          row.campaign?.resource_name ||
          row.ad_group?.resource_name ||
          row.adGroup?.resource_name ||
          row.ad_group_ad?.resource_name ||
          row.adGroupAd?.resource_name ||
          null
        );
      }
      if (typeof r?.resource_name === 'string') return r.resource_name;
      const str = JSON.stringify(r || {});
      const m = str.match(/customers\/\d+\/(?:campaignBudgets|campaigns|adGroups|adGroupAds)\/[\w~-]+/);
      return m ? m[0] : null;
    };

    const budgetRes = await executeComposioAction('GOOGLEADS_MUTATE_CAMPAIGN_BUDGETS', {
      ...base,
      operations: [{
        create: {
          name: `${params.campaign_name} Budget`,
          amount_micros: budgetMicros,
          delivery_method: 'STANDARD',
          explicitly_shared: false,
        },
      }],
    }, companyId);
    if (budgetRes.error) return { status: 'error', error: budgetRes.error, step: 'budget', raw: budgetRes.raw };
    const budgetResourceName = extractResourceName(budgetRes);
    if (!budgetResourceName) {
      return { status: 'error', error: 'Budget created but resource name missing from Composio response', step: 'budget', raw: budgetRes.result };
    }

    const campaignRes = await executeComposioAction('GOOGLEADS_MUTATE_CAMPAIGNS', {
      ...base,
      operations: [{
        create: {
          name: params.campaign_name,
          status,
          advertising_channel_type: channelType,
          campaign_budget: budgetResourceName,
          contains_eu_political_advertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
          network_settings: channelType === 'SEARCH'
            ? {
                target_google_search: true,
                target_search_network: true,
                target_content_network: false,
                target_partner_search_network: false,
              }
            : undefined,
        },
      }],
    }, companyId);
    if (campaignRes.error) {
      return { status: 'error', error: campaignRes.error, step: 'campaign', budget_resource_name: budgetResourceName, raw: campaignRes.raw };
    }
    const campaignResourceName = extractResourceName(campaignRes);
    if (!campaignResourceName) {
      return { status: 'error', error: 'Campaign created but resource name missing', step: 'campaign', budget_resource_name: budgetResourceName, raw: campaignRes.result };
    }

    const adGroupRes = await executeComposioAction('GOOGLEADS_MUTATE_AD_GROUPS', {
      ...base,
      operations: [{
        create: {
          name: `${params.campaign_name} — Ad Group`,
          campaign: campaignResourceName,
          status,
          type: channelType === 'SEARCH' ? 'SEARCH_STANDARD' : 'DISPLAY_STANDARD',
          cpc_bid_micros: Math.max(Math.round(budgetMicros * 0.05), 10_000),
        },
      }],
    }, companyId);
    if (adGroupRes.error) {
      return {
        status: 'error',
        error: adGroupRes.error,
        step: 'ad_group',
        budget_resource_name: budgetResourceName,
        campaign_resource_name: campaignResourceName,
        raw: adGroupRes.raw,
      };
    }
    const adGroupResourceName = extractResourceName(adGroupRes);

    let adResourceName = null;
    let adNote = null;
    if (adGroupResourceName && channelType === 'SEARCH') {
      const headlines = [
        String(params.headline).slice(0, 30),
        String(params.headline).slice(0, 28) || 'Learn more',
        'Get started today',
      ].filter(Boolean);
      const descriptions = [
        String(params.primary_text).slice(0, 90),
        String(params.primary_text).slice(0, 88) || 'See how it works.',
      ].filter(Boolean);

      const adRes = await executeComposioAction('GOOGLEADS_MUTATE_AD_GROUP_ADS', {
        ...base,
        operations: [{
          create: {
            ad_group: adGroupResourceName,
            status,
            ad: {
              final_urls: [params.link_url],
              responsive_search_ad: {
                headlines: headlines.slice(0, 3).map((text) => ({ text })),
                descriptions: descriptions.slice(0, 2).map((text) => ({ text })),
              },
            },
          },
        }],
      }, companyId);
      if (adRes.error) {
        adNote = `Campaign + ad group created; RSA failed: ${adRes.error}`;
      } else {
        adResourceName = extractResourceName(adRes);
      }
    }

    const campaignId = String(campaignResourceName || '').split('/').pop() || null;

    let loop_enrollment = null;
    if (campaignId && params.skip_loop_enrollment !== true && params.skip_loop_enrollment !== 'true') {
      try {
        loop_enrollment = await enrollPaidAdsLoop(companyId, {
          campaign_id: campaignId,
          channel: 'google',
          campaign_name: params.campaign_name,
          link_url: params.link_url,
          headline: params.headline,
          primary_text: params.primary_text,
          ads_status: status,
          objective: params.objective || params.advertising_channel_type,
        }, {
          quantified_target: params.quantified_target,
          timeline_target: params.timeline_target,
          agentName: 'zara',
        });
      } catch (e) {
        loop_enrollment = { ok: false, error: e.message };
      }
    }

    return {
      status: 'completed',
      customer_id: customerId,
      budget_resource_name: budgetResourceName,
      campaign_resource_name: campaignResourceName,
      campaign_id: campaignId,
      ad_group_resource_name: adGroupResourceName,
      ad_resource_name: adResourceName,
      campaign_status: status,
      ads_url: `https://ads.google.com/aw/campaigns?ocid=${customerId}`,
      message: (adNote
        || (status === 'PAUSED'
          ? 'Google Ads campaign created and PAUSED. Review in Google Ads, then enable when ready.'
          : 'Google Ads campaign created and ENABLED — spending may begin.'))
        + (loop_enrollment?.ok ? ` Closed loop enrolled (monitor; Meta has full auto-actions).` : ''),
      loop_enrollment,
    };
  },

  async create_linkedin_ads_campaign(params, companyId) {
    if (!params.campaign_name) return { status: 'error', error: 'campaign_name is required' };
    const dailyMajor = (() => {
      const n = Number(params.daily_budget ?? params.budget);
      if (!Number.isFinite(n) || n <= 0) return null;
      if (n >= 1_000_000) return n / 1_000_000; // micros mistaken
      if (n >= 1000 && n < 1_000_000) return n / 100; // Meta-style minor units
      return n;
    })();
    if (!dailyMajor) return { status: 'error', error: 'daily_budget is required (e.g. 500 for ₹500/day)' };

    const tokenResult = await getConnectedAccountToken('linkedin_ads', companyId);
    if (tokenResult.error) {
      if (tokenResult.masked) {
        return {
          status: 'error',
          error:
            'LinkedIn Ads is connected, but Composio masks the OAuth token. Use Composio LinkedIn Ads tools/proxy, or disable "Mask Connected Account Secrets" in Composio project settings.',
        };
      }
      return { status: 'error', error: tokenResult.error };
    }
    const accessToken = tokenResult.access_token;
    const linkedinVersion = process.env.LINKEDIN_API_VERSION || '202501';
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
      'Linkedin-Version': linkedinVersion,
    };

    let adAccountId = String(params.ad_account_id || '').replace(/\D/g, '');
    if (!adAccountId) {
      const accountsRes = await executeComposioAction(
        'LINKEDIN_ADS_SEARCH_AD_ACCOUNTS',
        { status: ['ACTIVE'], page_size: 25 },
        companyId,
      );
      if (accountsRes.error) return { status: 'error', error: accountsRes.error, step: 'account' };
      const rows = accountsRes.result?.elements || accountsRes.result?.data || accountsRes.result || [];
      const list = Array.isArray(rows) ? rows : [];
      const first = list[0];
      adAccountId = String(first?.id || first?.account_id || '')
        .replace(/^urn:li:sponsoredAccount:/, '')
        .replace(/\D/g, '');
    }
    if (!adAccountId) {
      return { status: 'error', error: 'No LinkedIn Ads account found. Connect LinkedIn Ads and ensure an active ad account exists.', step: 'account' };
    }

    const currencyCode = String(params.currency_code || params.currency || 'USD').toUpperCase();
    const statusRaw = String(params.status || 'PAUSED').toUpperCase();
    const campaignStatus = statusRaw === 'ACTIVE' ? 'ACTIVE' : statusRaw === 'DRAFT' ? 'DRAFT' : 'PAUSED';
    const objectiveMap = {
      OUTCOME_LEADS: 'LEAD_GENERATION',
      LEADS: 'LEAD_GENERATION',
      LEAD_GENERATION: 'LEAD_GENERATION',
      OUTCOME_TRAFFIC: 'WEBSITE_VISITS',
      TRAFFIC: 'WEBSITE_VISITS',
      WEBSITE_VISITS: 'WEBSITE_VISITS',
      OUTCOME_AWARENESS: 'BRAND_AWARENESS',
      AWARENESS: 'BRAND_AWARENESS',
      BRAND_AWARENESS: 'BRAND_AWARENESS',
      OUTCOME_SALES: 'WEBSITE_CONVERSIONS',
      SALES: 'WEBSITE_CONVERSIONS',
      WEBSITE_CONVERSIONS: 'WEBSITE_CONVERSIONS',
    };
    const objectiveType = objectiveMap[String(params.objective || 'WEBSITE_VISITS').toUpperCase()] || 'WEBSITE_VISITS';
    const accountUrn = `urn:li:sponsoredAccount:${adAccountId}`;
    const startMs = Date.now() + 60_000;

    // 1. Campaign group
    const groupBody = {
      account: accountUrn,
      name: `${params.campaign_name} — Group`,
      status: campaignStatus === 'ACTIVE' ? 'ACTIVE' : 'DRAFT',
      runSchedule: { start: startMs },
    };
    const groupRes = await fetch(
      `https://api.linkedin.com/rest/adAccounts/${adAccountId}/adCampaignGroups`,
      { method: 'POST', headers, body: JSON.stringify(groupBody) },
    );
    const groupText = await groupRes.text();
    let groupJson = {};
    try { groupJson = groupText ? JSON.parse(groupText) : {}; } catch { /* empty */ }
    if (!groupRes.ok) {
      return {
        status: 'error',
        error: groupJson?.message || groupJson?.error || groupText.slice(0, 400) || `Campaign group failed (${groupRes.status})`,
        step: 'campaign_group',
        ad_account_id: adAccountId,
      };
    }
    const campaignGroupId = String(
      groupRes.headers.get('x-restli-id') ||
      groupJson.id ||
      '',
    ).replace(/^urn:li:sponsoredCampaignGroup:/, '');
    if (!campaignGroupId) {
      return { status: 'error', error: 'Campaign group created but id missing', step: 'campaign_group', ad_account_id: adAccountId };
    }

    // 2. Campaign (PAUSED by default)
    const campaignBody = {
      account: accountUrn,
      campaignGroup: `urn:li:sponsoredCampaignGroup:${campaignGroupId}`,
      name: params.campaign_name,
      objectiveType,
      type: 'SPONSORED_UPDATES',
      status: campaignStatus,
      costType: 'CPC',
      creativeSelection: 'OPTIMIZED',
      audienceExpansionEnabled: false,
      offsiteDeliveryEnabled: false,
      dailyBudget: {
        amount: Number(dailyMajor).toFixed(2),
        currencyCode,
      },
      unitCost: {
        amount: Math.max(Number(dailyMajor) * 0.05, 1).toFixed(2),
        currencyCode,
      },
      locale: { country: 'US', language: 'en' },
      runSchedule: { start: startMs },
      targetingCriteria: params.targeting && typeof params.targeting === 'object'
        ? params.targeting
        : {
            include: {
              and: [
                {
                  or: {
                    'urn:li:adTargetingFacet:locations': ['urn:li:geo:103644278'],
                  },
                },
              ],
            },
          },
    };

    const campRes = await fetch(
      `https://api.linkedin.com/rest/adAccounts/${adAccountId}/adCampaigns`,
      { method: 'POST', headers, body: JSON.stringify(campaignBody) },
    );
    const campText = await campRes.text();
    let campJson = {};
    try { campJson = campText ? JSON.parse(campText) : {}; } catch { /* empty */ }
    if (!campRes.ok) {
      return {
        status: 'error',
        error: campJson?.message || campJson?.error || campText.slice(0, 400) || `Campaign failed (${campRes.status})`,
        step: 'campaign',
        ad_account_id: adAccountId,
        campaign_group_id: campaignGroupId,
      };
    }
    const campaignId = String(
      campRes.headers.get('x-restli-id') ||
      campJson.id ||
      '',
    ).replace(/^urn:li:sponsoredCampaign:/, '');

    const managerUrl = `https://www.linkedin.com/campaignmanager/accounts/${adAccountId}/campaigns`;

    let loop_enrollment = null;
    if (campaignId && params.skip_loop_enrollment !== true && params.skip_loop_enrollment !== 'true') {
      try {
        loop_enrollment = await enrollPaidAdsLoop(companyId, {
          campaign_id: campaignId,
          ad_account_id: adAccountId,
          channel: 'linkedin',
          campaign_name: params.campaign_name,
          link_url: params.link_url,
          headline: params.headline,
          primary_text: params.primary_text,
          ads_status: campaignStatus,
          objective: objectiveType,
        }, {
          quantified_target: params.quantified_target,
          timeline_target: params.timeline_target,
          agentName: 'zara',
        });
      } catch (e) {
        loop_enrollment = { ok: false, error: e.message };
      }
    }

    return {
      status: 'completed',
      ad_account_id: adAccountId,
      campaign_group_id: campaignGroupId,
      campaign_id: campaignId || null,
      campaign_status: campaignStatus,
      objective: objectiveType,
      headline: params.headline || null,
      primary_text: params.primary_text || null,
      link_url: params.link_url || null,
      campaign_manager_url: managerUrl,
      message: (campaignStatus === 'PAUSED' || campaignStatus === 'DRAFT'
        ? 'LinkedIn campaign created in PAUSED/DRAFT state. Attach creative in Campaign Manager, then activate.'
        : 'LinkedIn campaign created and ACTIVE — spending may begin once creatives are approved.')
        + (loop_enrollment?.ok ? ' Closed loop enrolled (monitor; Meta has full auto-actions).' : ''),
      loop_enrollment,
    };
  },

  async manage_paid_ads_loop(params, companyId, supabaseClient) {
    return managePaidAdsLoop(params, companyId, supabaseClient);
  },

  async optimize_meta_roas(params, companyId) {
    // Use Composio METAADS_GET_INSIGHTS for performance data;
    // Graph mutations go through Composio proxy (tokens are masked).
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

    // 4. Pause low-ROAS ads via Composio proxy
    for (const ad of toPause) {
      if (!dryRun) {
        const r = await metaGraphProxy(companyId, {
          method: 'POST',
          path: `/${ad.ad_id}`,
          body: { status: 'PAUSED' },
        });
        if (r.error) { paused_ads.push({ ad_id: ad.ad_id, name: ad.ad_name, roas: ad.roas, spend: ad.spend, action: 'pause_failed', error: r.error }); continue; }
      }
      paused_ads.push({ ad_id: ad.ad_id, name: ad.ad_name, roas: ad.roas?.toFixed(2), spend: ad.spend, action: dryRun ? 'would_pause' : 'paused' });
      actions_taken++;
    }

    // 5. Scale winning adsets via Composio proxy
    for (const as of adsetIdsToScale) {
      const budgetRes = await metaGraphProxy(companyId, {
        method: 'GET',
        path: `/${as.id}`,
        query: { fields: 'daily_budget,name' },
      });
      if (budgetRes.error) continue;
      const budgetData = budgetRes.result || {};
      const currentBudget = parseInt(budgetData.daily_budget || 0);
      const newBudget     = budgetCap ? Math.min(Math.round(currentBudget * scaleFactor), budgetCap) : Math.round(currentBudget * scaleFactor);
      const avgRoas       = (as.roas_values.reduce((a, b) => a + b, 0) / as.roas_values.length).toFixed(2);

      if (!dryRun && newBudget > currentBudget) {
        const r = await metaGraphProxy(companyId, {
          method: 'POST',
          path: `/${as.id}`,
          body: { daily_budget: newBudget },
        });
        if (r.error) { scaled_adsets.push({ adset_id: as.id, name: as.name, avg_roas: avgRoas, action: 'scale_failed', error: r.error }); continue; }
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
      campaign: c.name,
      name: c.name,
      spend: Number(c.spend.toFixed(2)),
      clicks: c.clicks,
      impressions: c.impressions,
      conversions: c.conversions,
      ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
      cpc: c.clicks > 0 ? c.spend / c.clicks : 0,
      roas: null,
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
      activate = true,
      timezone = 'Asia/Kolkata',
      linked_in_account_ids = [],
      sequence_mode = 'standard',
      first_message_template = '',
      followup_message_template = '',
    } = params;

    const validLeads = leads.filter(l => l.linkedin_url);
    if (!validLeads.length) return { status: 'error', error: 'No leads with linkedin_url provided' };

    const safeCampaignName = String(campaign_name || 'Marqq LinkedIn Outreach').trim().slice(0, 50);
    const normalizeTemplate = (value, lead) => String(value || '')
        .replace(/\{\{\s*first[_ ]name\s*\}\}|\{firstName\}/gi, lead.first_name || '')
        .replace(/\{\{\s*last[_ ]name\s*\}\}|\{lastName\}/gi, lead.last_name || '')
        .replace(/\{\{\s*company\s*\}\}|\{company\}/gi, lead.company || '')
        .replace(/\{\{\s*full[_ ]name\s*\}\}|\{fullName\}/gi, lead.full_name || '')
        .replace(/\s+/g, ' ')
        .trim();
    const mode = ['connect_only', 'conservative', 'standard'].includes(sequence_mode)
      ? sequence_mode
      : 'standard';
    const notes = validLeads.map((lead) => normalizeTemplate(
      lead.linkedin_message || lead.personalization || message_template,
      lead,
    ).slice(0, 300));
    const firstMessages = validLeads.map((lead) => normalizeTemplate(
      lead.linkedin_first_message || lead.first_message || first_message_template
        || 'Hi {firstName}, thanks for connecting. I would love to share a little context and see if this is relevant for you.',
      lead,
    ).slice(0, 8000));
    const followupMessages = validLeads.map((lead) => normalizeTemplate(
      lead.linkedin_followup_message || lead.followup_message || followup_message_template
        || 'Just following up here in case this is relevant to your priorities. Happy to share more context.',
      lead,
    ).slice(0, 8000));
    const connectionRequest = (index) => ({
      nodeType: 'CONNECTION_REQUEST',
      actionDelay: 24,
      actionDelayUnit: 'HOUR',
      payload: {
        messages: ['{note}'],
        fallbackMessage: 'Hi {firstName}, I would love to connect and learn more about your work.',
      },
      conditionalNode: messageSequence(index),
      unconditionalNode: { nodeType: 'END', actionDelay: 3, actionDelayUnit: 'HOUR' },
    });
    const messageSequence = (index) => ({
      nodeType: 'MESSAGE',
      actionDelay: 24,
      actionDelayUnit: 'HOUR',
      payload: {
        messages: ['{firstMessage}'],
        fallbackMessage: firstMessages[index],
      },
      unconditionalNode: {
        nodeType: 'MESSAGE',
        actionDelay: 72,
        actionDelayUnit: 'HOUR',
        payload: {
          messages: ['{followupMessage}'],
          fallbackMessage: followupMessages[index],
        },
        unconditionalNode: { nodeType: 'END', actionDelay: 3, actionDelayUnit: 'HOUR' },
      },
    });
    const warmupSequence = (index) => {
      const likePost = {
        nodeType: 'LIKE_POST',
        actionDelay: 24,
        actionDelayUnit: 'HOUR',
        payload: { reactionType: 'LIKE', reactBefore: 'WEEK1', skipDelayIfCannotLike: true },
        unconditionalNode: connectionRequest(index),
      };
      const follow = {
        nodeType: 'FOLLOW',
        actionDelay: 24,
        actionDelayUnit: 'HOUR',
        unconditionalNode: mode === 'standard' ? likePost : connectionRequest(index),
      };
      return {
        nodeType: 'VIEW_PROFILE',
        actionDelay: 3,
        actionDelayUnit: 'HOUR',
        unconditionalNode: follow,
      };
    };
    const sequenceForLead = (index) => {
      if (mode === 'connect_only') return connectionRequest(index);
      return {
        nodeType: 'CHECK_IS_CONNECTION',
        actionDelay: 0,
        actionDelayUnit: 'HOUR',
        conditionalNode: messageSequence(index),
        unconditionalNode: warmupSequence(index),
      };
    };
    // HeyReach stores one sequence template for the campaign. Per-lead copy is
    // carried by custom fields, so the tree references {note}/{firstMessage}.
    const sequence = sequenceForLead(0);

    const apiCall = (path, body) => directApiHandlers._heyreachRequest(companyId, path, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    let listId;
    let campaignId;
    let linkedInAccountIds = Array.isArray(linked_in_account_ids)
      ? linked_in_account_ids.map(Number).filter(Number.isFinite)
      : [];
    try {
      const accountData = await apiCall('/li_account/GetAll', {});
      const accounts = Array.isArray(accountData?.items)
        ? accountData.items
        : (Array.isArray(accountData?.data) ? accountData.data : []);
      if (!linkedInAccountIds.length) {
        linkedInAccountIds = accounts
          .filter((account) => account?.authIsValid === true || account?.isValid === true || account?.isValidNavigator === true)
          .map((account) => Number(account.id || account.accountId))
          .filter(Number.isFinite);
      }
      if (!linkedInAccountIds.length) {
        throw new Error('No authenticated HeyReach LinkedIn sender account is available. Reconnect a sender in HeyReach first.');
      }

      const listData = await apiCall('/list/CreateEmptyList', {
        name: `${safeCampaignName} · leads`.slice(0, 100),
        listType: 'USER_LIST',
      });
      listId = listData?.id || listData?.listId || listData?.data?.id || listData?.data?.listId;
      if (!listId) throw new Error('HeyReach did not return a lead-list ID');

      await apiCall('/list/AddLeadsToListV2', {
        listId: Number(listId),
        leads: validLeads.map((lead, index) => ({
          profileUrl: lead.linkedin_url,
          firstName: lead.first_name || '',
          lastName: lead.last_name || '',
          email: lead.email || '',
          companyName: lead.company || '',
          position: lead.title || lead.designation || '',
          customUserFields: [
            { name: 'note', value: notes[index] },
            { name: 'firstMessage', value: firstMessages[index] },
            { name: 'followupMessage', value: followupMessages[index] },
          ],
        })),
      });

      const campaignData = await apiCall('/campaign/Create', {
        name: safeCampaignName,
        linkedInUserListId: Number(listId),
        linkedInAccountIds,
        excludeContactedFromOtherCampaigns: true,
        excludeHasOtherAccConversations: true,
        schedule: {
          dailyStartTime: '09:00:00',
          dailyEndTime: '17:00:00',
          timeZoneId: timezone,
          enabledMonday: true,
          enabledTuesday: true,
          enabledWednesday: true,
          enabledThursday: true,
          enabledFriday: true,
          enabledSaturday: false,
          enabledSunday: false,
        },
        sequence,
      });
      campaignId = campaignData?.campaignId || campaignData?.id || campaignData?.data?.campaignId || campaignData?.data?.id;
      if (!campaignId) throw new Error('HeyReach did not return a campaign ID');

      if (activate) {
        await apiCall('/campaign/StartCampaign', { campaignId: Number(campaignId) });
      }
    } catch (err) {
      return {
        status: 'error',
        error: `HeyReach campaign setup failed: ${err.message}`,
        mode: 'isolated_campaign',
        list_id: listId || null,
        campaign_id: campaignId || null,
      };
    }

    // Best-effort: register Marqq reply webhook so LinkedIn replies draft in inbox
    let webhook = null;
    try {
      const { registerHeyReachReplyWebhook } = await import('../outreach-service.js');
      webhook = await registerHeyReachReplyWebhook(companyId, {
        webhookName: 'Marqq LI replies',
      });
    } catch (err) {
      webhook = { status: 'error', error: err?.message || String(err) };
    }

    return {
      status: 'completed',
      mode: 'isolated_campaign',
      campaign_id: String(campaignId),
      list_id: String(listId),
      campaign_name: safeCampaignName,
      leads_in_list: validLeads.length,
      message_template,
      sequence,
      sequence_mode: mode,
      sequence_steps: mode === 'connect_only' ? 1 : (mode === 'conservative' ? 5 : 6),
      linked_in_account_ids: linkedInAccountIds,
      activated: Boolean(activate),
      webhook,
      next_step: activate
        ? 'Campaign started in HeyReach and will send inside its weekday schedule.'
        : 'Campaign created in HeyReach as DRAFT. Start it only after reviewing the sequence.',
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
  // Flow: LIST_ACCOUNTS → CREATE_CAMPAIGN (sequences+schedule) → ADD_LEADS_BULK
  //       → optional CREATE_WEBHOOK + CREATE_SUBSEQUENCE → optional ACTIVATE

  async instantly_list_accounts(params, companyId) {
    const { accounts, error } = await instantlyListSenderAccounts(companyId, params);
    if (error) {
      return { status: "error", error: `Instantly list accounts failed: ${error}`, accounts: [], count: 0 };
    }
    return { status: "completed", accounts, count: accounts.length };
  },

  async instantly_create_campaign(params, companyId) {
    const {
      name = "Marqq Outreach Campaign",
      subject,
      body,
      sequence_emails,
      from_email,
      daily_limit = 50,
      timezone = "Asia/Kolkata",
      leads = [],
      verify_leads = false,
      register_webhook,
      create_interested_subsequence,
      activate = false,
      enrich_leads = false,
      enrich_mode = "supersearch",
    } = params;

    const sequenceEmails =
      Array.isArray(sequence_emails) && sequence_emails.length
        ? sequence_emails
        : subject && body
          ? [{ subject, body, delay_days: 0 }]
          : [];

    if (!sequenceEmails.length) {
      return { status: "error", error: "subject/body or sequence_emails are required" };
    }

    const sequences = instantlyBuildSequences(sequenceEmails);
    if (!sequences) {
      return { status: "error", error: "Could not build Instantly sequences from email copy" };
    }

    // Resolve sender accounts — required for activate; preferred on create
    const { accounts: senderAccounts, error: accountsError } =
      await instantlyListSenderAccounts(companyId, { limit: 25, status: 1 });
    if (accountsError) {
      console.warn("[instantly_create_campaign] list accounts:", accountsError);
    }

    let emailList = [];
    if (from_email) {
      const match = senderAccounts.find(
        (a) => String(a.email).toLowerCase() === String(from_email).toLowerCase()
      );
      if (!match && senderAccounts.length) {
        return {
          status: "error",
          error: `from_email "${from_email}" is not an Instantly sender account. Available: ${senderAccounts
            .map((a) => a.email)
            .join(", ")}`,
          sender_accounts: senderAccounts,
        };
      }
      emailList = [from_email];
    } else if (senderAccounts[0]?.email) {
      emailList = [senderAccounts[0].email];
    }

    const campaignPayload = {
      name,
      sequences,
      campaign_schedule: instantlyDefaultSchedule(timezone),
      daily_limit: Number(daily_limit) || 50,
      stop_on_reply: true,
      open_tracking: true,
      link_tracking: true,
      ...(emailList.length ? { email_list: emailList } : {}),
    };

    const campaignRes = await executeComposioAction(
      "INSTANTLY_CREATE_CAMPAIGN",
      campaignPayload,
      companyId
    );

    if (campaignRes.error) {
      return {
        status: "error",
        error: `Campaign creation failed: ${campaignRes.error}`,
        sender_accounts: senderAccounts,
      };
    }

    const campaignId =
      campaignRes.result?.id ||
      campaignRes.result?.campaign_id ||
      campaignRes.result?.data?.id ||
      null;

    // Bulk-add leads (fallback to per-lead CREATE_LEAD if bulk fails)
    const validLeads = (Array.isArray(leads) ? leads : [])
      .map((l) => ({
        email: l.email || l.email_norm,
        first_name: l.first_name || String(l.full_name || "").split(" ")[0] || "",
        last_name:
          l.last_name ||
          String(l.full_name || "").split(" ").slice(1).join(" ") ||
          "",
        company_name: l.company_name || l.company || "",
        personalization: l.personalization || "",
      }))
      .filter((l) => l.email);

    let leadsAdded = 0;
    let bulkError = null;
    if (campaignId && validLeads.length) {
      for (let i = 0; i < validLeads.length; i += 100) {
        const batch = validLeads.slice(i, i + 100);
        const bulkRes = await executeComposioAction(
          "INSTANTLY_ADD_LEADS_BULK",
          {
            campaign_id: campaignId,
            leads: batch,
            skip_if_in_campaign: true,
            skip_if_in_workspace: false,
            verify: Boolean(verify_leads),
          },
          companyId
        );
        if (bulkRes.error) {
          bulkError = bulkRes.error;
          for (const lead of batch) {
            const lr = await executeComposioAction(
              "INSTANTLY_CREATE_LEAD",
              {
                campaign_id: campaignId,
                email: lead.email,
                first_name: lead.first_name,
                last_name: lead.last_name,
                company_name: lead.company_name,
                personalization: lead.personalization,
              },
              companyId
            );
            if (!lr.error) leadsAdded++;
          }
        } else {
          const added =
            bulkRes.result?.leads_added ??
            bulkRes.result?.added ??
            bulkRes.result?.count ??
            bulkRes.result?.data?.leads_added ??
            batch.length;
          leadsAdded += Number(added) || batch.length;
        }
      }
    }

    // Reply webhook → Marqq
    let webhook = null;
    const shouldRegisterWebhook =
      register_webhook != null
        ? Boolean(register_webhook)
        : Boolean(instantlyPublicWebhookUrl());
    if (shouldRegisterWebhook && campaignId) {
      webhook = await directApiHandlers.instantly_register_webhook(
        { campaign_id: campaignId, event_type: "all_events" },
        companyId
      );
    }

    // Interested subsequence from remaining touches
    let subsequence = null;
    const shouldCreateSub =
      create_interested_subsequence != null
        ? Boolean(create_interested_subsequence)
        : sequenceEmails.length > 1;
    if (shouldCreateSub && campaignId && sequenceEmails.length > 1) {
      const follow = sequenceEmails[1];
      subsequence = await directApiHandlers.instantly_create_subsequence(
        {
          campaign_id: campaignId,
          name: `${name} — Interested follow-up`,
          subject: follow.subject,
          body: follow.body,
          crm_status: 1,
          timezone,
        },
        companyId
      );
    }

    // Optional Instantly SuperSearch / AI enrichment on the campaign after leads land
    let enrichment = null;
    if (campaignId && (enrich_leads || params.enrich)) {
      enrichment = await directApiHandlers.instantly_enrich_resource(
        {
          resource_id: campaignId,
          resource_type: "campaign",
          enrich_mode,
          run: true,
        },
        companyId
      );
    }

    let activation = null;
    if (activate && campaignId) {
      activation = await directApiHandlers.instantly_activate_campaign({ campaign_id: campaignId }, companyId);
    }

    return {
      status: "completed",
      campaign_id: campaignId,
      campaign_name: name,
      leads_added: leadsAdded,
      leads_requested: validLeads.length,
      sender_accounts: senderAccounts,
      email_list: emailList,
      webhook: webhook?.status === "completed" ? webhook : webhook,
      subsequence: subsequence?.status === "completed" ? subsequence : subsequence,
      enrichment,
      activation,
      bulk_fallback: Boolean(bulkError),
      message: `Campaign "${name}" created with ${leadsAdded}/${validLeads.length} leads${
        emailList[0] ? ` via ${emailList[0]}` : ""
      }${enrichment?.status === "completed" ? " · enrichment started" : ""}`,
    };
  },

  /**
   * Create + optionally run Instantly SuperSearch or AI enrichment on a campaign/list.
   */
  async instantly_enrich_resource(params, companyId) {
    const resourceId = String(params.resource_id || params.campaign_id || params.list_id || "").trim();
    if (!resourceId) {
      return { status: "error", error: "resource_id (campaign or list) is required" };
    }
    const resourceType = String(params.resource_type || "campaign").toLowerCase() === "list" ? "list" : "campaign";
    const mode = String(params.enrich_mode || params.mode || "supersearch").toLowerCase() === "ai"
      ? "ai"
      : "supersearch";
    const shouldRun = params.run !== false;

    const resourceKey = resourceType === "list" ? "list_id" : "campaign_id";
    const createSlug =
      mode === "ai" ? "INSTANTLY_CREATE_AI_ENRICHMENT" : "INSTANTLY_CREATE_SUPERSEARCH_ENRICHMENT";

    const createRes = await executeComposioAction(
      createSlug,
      {
        [resourceKey]: resourceId,
        resource_id: resourceId,
        resource_type: resourceType,
      },
      companyId
    );
    if (createRes.error) {
      return {
        status: "error",
        error: `Instantly ${mode} enrichment create failed: ${createRes.error}`,
        create: createRes,
      };
    }

    const enrichmentId =
      createRes.result?.id ||
      createRes.result?.enrichment_id ||
      createRes.result?.data?.id ||
      null;

    let settings = null;
    if (mode === "supersearch") {
      settings = await executeComposioAction(
        "INSTANTLY_PATCH_SUPERSEARCH_ENRICHMENT_SETTINGS",
        {
          [resourceKey]: resourceId,
          resource_id: resourceId,
          enrichment_id: enrichmentId,
          auto_update: true,
          skip_leads_without_email: false,
        },
        companyId
      );
    }

    let runResult = null;
    if (shouldRun) {
      runResult = await executeComposioAction(
        "INSTANTLY_SUPERSEARCH_ENRICHMENT_RUN_POST",
        {
          [resourceKey]: resourceId,
          resource_id: resourceId,
          enrichment_id: enrichmentId,
          run_for: params.run_for || "unenriched",
        },
        companyId
      );
    }

    const statusRes = await executeComposioAction(
      "INSTANTLY_GET_SUPERSEARCH_ENRICHMENT",
      {
        [resourceKey]: resourceId,
        resource_id: resourceId,
        enrichment_id: enrichmentId,
      },
      companyId
    );

    const runFailed = Boolean(runResult?.error);
    return {
      status: runFailed && !createRes.error ? "partial" : "completed",
      enrichment_id: enrichmentId,
      enrich_mode: mode,
      resource_type: resourceType,
      resource_id: resourceId,
      create: createRes.result || null,
      settings: settings?.error ? { error: settings.error } : settings?.result || null,
      run: runResult?.error ? { error: runResult.error } : runResult?.result || null,
      status_check: statusRes?.error ? { error: statusRes.error } : statusRes?.result || null,
      message: `Instantly ${mode} enrichment ${shouldRun ? "created and run" : "created"} on ${resourceType} ${resourceId}`,
    };
  },

  async instantly_list_campaigns(params, companyId) {
    const limit = Math.min(Math.max(Number(params.limit) || 25, 1), 100);
    const search = String(params.search || "").trim();
    const res = await executeComposioAction(
      "INSTANTLY_LIST_CAMPAIGNS",
      {
        limit,
        ...(search ? { search } : {}),
      },
      companyId
    );

    if (res.error) {
      return {
        status: "error",
        error: `Instantly list campaigns failed: ${res.error}`,
        campaigns: [],
        count: 0,
      };
    }

    const rawCampaigns =
      res.result?.items || res.result?.campaigns || res.result?.data || res.result || [];
    const campaigns = (Array.isArray(rawCampaigns) ? rawCampaigns : []).map((campaign) => ({
      id: campaign.id || campaign.campaign_id || campaign.campaignId || null,
      name: campaign.name || campaign.campaign_name || campaign.campaignName || "Untitled campaign",
      status: campaign.status || campaign.state || campaign.campaign_status || null,
      created_at: campaign.created_at || campaign.createdAt || null,
      updated_at: campaign.updated_at || campaign.updatedAt || null,
      raw: campaign,
    }));

    return {
      status: "completed",
      count: campaigns.length,
      campaigns,
    };
  },

  async instantly_get_campaign_analytics(params, companyId) {
    const campaignId = params.campaign_id || params.id;
    if (!campaignId) {
      return { status: "error", error: "campaign_id is required", analytics: null };
    }

    const res = await executeComposioAction(
      "INSTANTLY_GET_CAMPAIGN_ANALYTICS",
      {
        campaign_id: campaignId,
        id: campaignId,
      },
      companyId
    );

    if (res.error) {
      return {
        status: "error",
        error: `Instantly analytics failed: ${res.error}`,
        campaign_id: campaignId,
        analytics: null,
      };
    }

    const analytics = res.result?.analytics || res.result?.data || res.result || null;
    return {
      status: "completed",
      campaign_id: String(campaignId),
      analytics,
    };
  },

  async instantly_get_campaign_status(params, companyId) {
    const campaignId = params.campaign_id || params.id;
    if (!campaignId) {
      return { status: "error", error: "campaign_id is required", sending_status: null };
    }

    const res = await executeComposioAction(
      "INSTANTLY_GET_CAMPAIGN_SENDING_STATUS",
      {
        campaign_id: campaignId,
        id: campaignId,
      },
      companyId
    );

    if (res.error) {
      return {
        status: "error",
        error: `Instantly sending status failed: ${res.error}`,
        campaign_id: campaignId,
        sending_status: null,
      };
    }

    const sendingStatus = res.result?.status || res.result?.data || res.result || null;
    return {
      status: "completed",
      campaign_id: String(campaignId),
      sending_status: sendingStatus,
    };
  },

  async instantly_pause_campaign(params, companyId) {
    const campaignId = params.campaign_id || params.id;
    if (!campaignId) {
      return { status: "error", error: "campaign_id is required" };
    }

    const res = await executeComposioAction(
      "INSTANTLY_PAUSE_CAMPAIGN",
      {
        id: campaignId,
      },
      companyId
    );

    if (res.error) {
      return {
        status: "error",
        error: `Instantly pause failed: ${res.error}`,
        campaign_id: String(campaignId),
      };
    }

    return {
      status: "completed",
      campaign_id: String(campaignId),
      action: "paused",
      result: res.result || null,
    };
  },

  async instantly_activate_campaign(params, companyId) {
    const campaignId = params.campaign_id || params.id;
    if (!campaignId) {
      return { status: "error", error: "campaign_id is required" };
    }

    const { accounts, error: accountsError } = await instantlyListSenderAccounts(companyId, {
      limit: 25,
      status: 1,
    });
    if (accountsError) {
      return {
        status: "error",
        error: `Cannot activate — failed to list Instantly sender accounts: ${accountsError}`,
        campaign_id: String(campaignId),
      };
    }
    if (!accounts.length) {
      return {
        status: "error",
        error:
          "Cannot activate — no active Instantly sender accounts. Add a mailbox in Instantly, then retry.",
        campaign_id: String(campaignId),
        sender_accounts: [],
      };
    }

    const res = await executeComposioAction(
      "INSTANTLY_ACTIVATE_CAMPAIGN",
      {
        id: campaignId,
      },
      companyId
    );

    if (res.error) {
      return {
        status: "error",
        error: `Instantly activate failed: ${res.error}`,
        campaign_id: String(campaignId),
        sender_accounts: accounts,
      };
    }

    return {
      status: "completed",
      campaign_id: String(campaignId),
      action: "activated",
      sender_accounts: accounts,
      result: res.result || null,
    };
  },

  async instantly_count_unread_emails(_params, companyId) {
    const res = await executeComposioAction("INSTANTLY_COUNT_UNREAD_EMAILS", {}, companyId);

    if (res.error) {
      return {
        status: "error",
        error: `Instantly unread count failed: ${res.error}`,
        unread_count: null,
      };
    }

    const unreadCount =
      res.result?.count ??
      res.result?.unread_count ??
      res.result?.data?.count ??
      res.result?.data?.unread_count ??
      null;

    return {
      status: "completed",
      unread_count: unreadCount,
    };
  },

  async instantly_list_emails(params, companyId) {
    const limit = Math.min(Math.max(Number(params.limit) || 10, 1), 50);
    const payload = {
      limit,
      ...(params.campaign_id ? { campaign_id: params.campaign_id } : {}),
      ...(params.is_unread != null ? { is_unread: Boolean(params.is_unread) } : {}),
      sort_order: "desc",
    };

    const res = await executeComposioAction("INSTANTLY_LIST_EMAILS", payload, companyId);

    if (res.error) {
      return {
        status: "error",
        error: `Instantly list emails failed: ${res.error}`,
        emails: [],
        count: 0,
      };
    }

    const rawEmails = res.result?.items || res.result?.emails || res.result?.data || res.result || [];
    const emails = (Array.isArray(rawEmails) ? rawEmails : []).map((email) => ({
      id: email.id || null,
      thread_id: email.thread_id || null,
      subject: email.subject || email.email_subject || "",
      from_email: email.from_email || email.from || "",
      to_email: email.to_email || email.to || email.lead || "",
      is_unread: Boolean(email.is_unread),
      email_type: email.email_type || email.type || "",
      body_preview: email.body_preview || email.preview || email.snippet || "",
      created_at: email.created_at || email.createdAt || email.date || null,
      raw: email,
    }));

    return {
      status: "completed",
      count: emails.length,
      emails,
    };
  },

  async instantly_register_webhook(params, companyId) {
    const target =
      instantlyPublicWebhookUrl(params.target_hook_url) ||
      String(params.target_hook_url || "").trim();
    if (!target) {
      return {
        status: "error",
        error:
          "target_hook_url is required (set PUBLIC_BASE_URL so Marqq can register /api/webhooks/instantly)",
      };
    }

    const res = await executeComposioAction(
      "INSTANTLY_CREATE_WEBHOOK",
      {
        target_hook_url: target,
        event_type: params.event_type || "all_events",
        ...(params.campaign_id ? { campaign: params.campaign_id } : {}),
      },
      companyId
    );

    if (res.error) {
      return { status: "error", error: `Instantly webhook register failed: ${res.error}` };
    }

    const webhookId =
      res.result?.id || res.result?.webhook_id || res.result?.data?.id || null;

    return {
      status: "completed",
      webhook_id: webhookId,
      target_hook_url: target,
      event_type: params.event_type || "all_events",
      campaign_id: params.campaign_id || null,
      result: res.result || null,
    };
  },

  async instantly_create_subsequence(params, companyId) {
    const campaignId = params.campaign_id || params.parent_campaign;
    const subject = params.subject;
    const body = params.body;
    if (!campaignId) return { status: "error", error: "campaign_id is required" };
    if (!subject || !body) return { status: "error", error: "subject and body are required" };

    const timezone = params.timezone || "Asia/Kolkata";
    const crmStatus = params.crm_status != null ? Number(params.crm_status) : 1;

    const res = await executeComposioAction(
      "INSTANTLY_CREATE_SUBSEQUENCE",
      {
        name: params.name || "Interested follow-up",
        parent_campaign: campaignId,
        conditions: { crm_status: [crmStatus] },
        sequences: instantlyBuildSequences([
          { subject, body, delay_days: 0 },
        ]),
        subsequence_schedule: instantlyDefaultSchedule(timezone),
      },
      companyId
    );

    if (res.error) {
      return {
        status: "error",
        error: `Instantly subsequence create failed: ${res.error}`,
        campaign_id: String(campaignId),
      };
    }

    const subsequenceId =
      res.result?.id || res.result?.subsequence_id || res.result?.data?.id || null;

    return {
      status: "completed",
      subsequence_id: subsequenceId,
      campaign_id: String(campaignId),
      crm_status: crmStatus,
      result: res.result || null,
    };
  },

  async instantly_verify_email(params, companyId) {
    const email = String(params.email || "").trim();
    if (!email) return { status: "error", error: "email is required" };

    const res = await executeComposioAction("INSTANTLY_VERIFY_EMAIL", { email }, companyId);
    if (res.error) {
      return { status: "error", error: `Instantly verify failed: ${res.error}`, email };
    }
    return {
      status: "completed",
      email,
      verification: res.result?.data || res.result || null,
    };
  },

  async instantly_update_lead_interest(params, companyId) {
    const leadEmail = String(params.lead_email || params.email || "").trim();
    if (!leadEmail) return { status: "error", error: "lead_email is required" };
    if (params.interest_value == null || params.interest_value === "") {
      return { status: "error", error: "interest_value is required" };
    }

    const res = await executeComposioAction(
      "INSTANTLY_UPDATE_LEAD_INTEREST_STATUS",
      {
        lead_email: leadEmail,
        interest_value: String(params.interest_value),
        ...(params.campaign_id ? { campaign_id: params.campaign_id } : {}),
        ...(params.list_id ? { list_id: params.list_id } : {}),
      },
      companyId
    );

    if (res.error) {
      return {
        status: "error",
        error: `Instantly interest update failed: ${res.error}`,
        lead_email: leadEmail,
      };
    }

    return {
      status: "completed",
      lead_email: leadEmail,
      interest_value: params.interest_value,
      result: res.result || null,
    };
  },

  async instantly_mark_thread_read(params, companyId) {
    const threadId = params.thread_id || params.id;
    if (!threadId) return { status: "error", error: "thread_id is required" };

    const res = await executeComposioAction(
      "INSTANTLY_MARK_THREAD_AS_READ",
      { thread_id: threadId },
      companyId
    );

    if (res.error) {
      return {
        status: "error",
        error: `Instantly mark thread read failed: ${res.error}`,
        thread_id: String(threadId),
      };
    }

    return {
      status: "completed",
      thread_id: String(threadId),
      action: "marked_read",
      result: res.result || null,
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
      inbound_webhook_hint:
        'Point Meta WhatsApp webhook to PUBLIC_BASE_URL/api/webhooks/whatsapp (verify token: WHATSAPP_WEBHOOK_VERIFY_TOKEN)',
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
    const personalize = (template, lead) => {
      const fullName = String(lead.name || lead.full_name || '').trim();
      const firstName = String(lead.first_name || fullName.split(/\s+/)[0] || 'there').trim();
      const company = String(lead.company || lead.company_name || 'your company').trim();
      return String(template || '')
        .replace(/\{\{\s*first_name\s*\}\}/gi, firstName)
        .replace(/\{\{\s*full_name\s*\}\}/gi, fullName || firstName)
        .replace(/\{\{\s*company\s*\}\}/gi, company)
        .replace(/\{\{\s*company_name\s*\}\}/gi, company);
    };

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
        const openingLine = personalize(
          lead.opening_line || lead.openingLine || lead.script_hint || lead.script || script_hint,
          lead,
        );
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
            openingLine,
            // Prospect context for dialogue / KB grounding on the call
            leadCompany: lead.company || lead.company_name || '',
            leadTitle: lead.title || lead.designation || lead.personalization || '',
          }),
        });

        const json = await response.json().catch(() => null);
        if (!response.ok) {
          failedCount += 1;
          calls.push({
            phone: lead.phone,
            name: lead.name || lead.full_name || null,
            status: 'failed',
            error: json?.error || `Voicebot call failed with ${response.status}`,
          });
          continue;
        }

        queuedCount += 1;
        calls.push({
          phone: lead.phone,
          name: lead.name || lead.full_name || null,
          status: 'queued',
          sid: json?.sid || null,
          to: json?.to || lead.phone,
          opening_line: openingLine,
        });
      } catch (error) {
        failedCount += 1;
        calls.push({
          phone: lead.phone,
          name: lead.name || lead.full_name || null,
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
    return { status: "error", error: "No handler configured for: " + entry.id, automation_id: entry.id };
  }

  // n8n_webhook — POST to configured webhook URL
  const url = process.env[entry.endpoint];
  if (!url) {
    return {
      status: "error",
      error: "Endpoint not configured: " + entry.endpoint,
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
    // Missing runtime dependencies are configuration errors, not successful runs.
    if (err.message === "node-fetch not available") {
      return {
        status: "error",
        error: "node-fetch not available",
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

    collected.push({
      automation_id: trigger.automation_id,
      status,
      result,
      // Flatten for callers that read campaign_id / error on the top-level row
      ...(result && typeof result === 'object' ? result : {}),
    });
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
