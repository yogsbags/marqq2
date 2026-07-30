/**
 * agenticLoop.js — Groq multi-tool agentic loop with Composio execution
 *
 * Streams 5 SSE event types to the Express response:
 *   data: {"text":"..."}             — prose token
 *   data: {"thinking":"..."}         — reasoning token (reasoning_format=parsed only)
 *   data: {"tool_call":{...}}        — tool invocation starting
 *   data: {"tool_result":{...}}      — tool execution result
 *   data: [DONE]                     — sent by caller after loop returns
 */

const COMPOSIO_V3 = "https://backend.composio.dev/api/v3";
const TOOLKIT_BY_TOOL_SLUG = new Map();
const CONNECTED_ACCOUNT_CACHE = new Map();
const CONNECTED_ACCOUNT_DETAIL_CACHE = new Map();

// Keep Semrush/Ahrefs/GSC allowlists in sync with live Composio catalogs
import {
  SEMRUSH_TOOL_SLUGS,
  AHREFS_TOOL_SLUGS,
  GSC_TOOL_SLUGS,
  GSC_TOOL_SLUG_ALIASES,
} from "../lib/seoToolkitCatalog.js";
import { WEBFLOW_TOOL_SLUGS } from "../lib/webflowToolkitCatalog.js";
import { MAILCHIMP_TOOL_SLUGS } from "../lib/mailchimpToolkitCatalog.js";
import { KLAVIYO_TOOL_SLUGS } from "../lib/klaviyoToolkitCatalog.js";
import { ZOHO_CRM_TOOL_SLUGS } from "../lib/zohoCrmToolkitCatalog.js";
import { HUBSPOT_TOOL_SLUGS } from "../lib/hubspotToolkitCatalog.js";
import { GOOGLEDRIVE_TOOL_SLUGS } from "../lib/googleDriveToolkitCatalog.js";
import { GOOGLESHEETS_TOOL_SLUGS } from "../lib/googleSheetsToolkitCatalog.js";

const TOOLKIT_ALLOWED_TOOL_SLUGS = {
  semrush: new Set(SEMRUSH_TOOL_SLUGS),
  ahrefs: new Set(AHREFS_TOOL_SLUGS),
  // normalizeAppSlug("google_search_console") → googlesearchconsole
  googlesearchconsole: new Set(GSC_TOOL_SLUGS),
  canva: new Set([
    "CANVA_ACCESS_USER_SPECIFIC_BRAND_TEMPLATES_LIST",
    "CANVA_CREATE_ASSET_UPLOAD_JOB",
    "CANVA_CREATE_DESIGN_IMPORT_JOB",
    "CANVA_CREATE_DESIGN_RESIZE_JOB",
    "CANVA_CREATE_URL_ASSET_UPLOAD_JOB",
    "CANVA_FETCH_ASSET_UPLOAD_JOB_STATUS",
    "CANVA_FETCH_CURRENT_USER_DETAILS",
    "CANVA_FETCH_DESIGN_METADATA_AND_ACCESS_INFORMATION",
    "CANVA_GET_DESIGN_EXPORT_JOB_RESULT",
    "CANVA_GET_DESIGNS_DESIGNID_EXPORT_FORMATS",
    "CANVA_GET_URL_ASSET_UPLOADS_JOBID",
    "CANVA_GET_URL_IMPORTS_JOBID",
    "CANVA_GET_USERS_ME_CAPABILITIES",
    "CANVA_INITIATE_CANVA_DESIGN_AUTOFILL_JOB",
    "CANVA_LIST_DESIGN_PAGES_WITH_PAGINATION",
    "CANVA_LIST_USER_DESIGNS",
    "CANVA_POST_DESIGNS",
    "CANVA_POST_EXPORTS",
    "CANVA_POST_URL_IMPORTS",
    "CANVA_RETRIEVE_ASSET_METADATA_BY_ID",
    "CANVA_RETRIEVE_BRAND_TEMPLATE_DATASET_DEFINITION",
    "CANVA_RETRIEVE_CANVA_ENTERPRISE_BRAND_TEMPLATE_METADATA",
    "CANVA_RETRIEVE_DESIGN_AUTOFILL_JOB_STATUS",
    "CANVA_RETRIEVE_DESIGN_IMPORT_JOB_STATUS",
    "CANVA_RETRIEVE_DESIGN_RESIZE_JOB_STATUS",
    "CANVA_RETRIEVE_USER_PROFILE_DATA",
  ]),
  veo: new Set([
    "VEO_DOWNLOAD_VIDEO",
    "VEO_GENERATE_VIDEOS",
    "VEO_GET_VIDEOS_OPERATION",
    "VEO_LIST_MODELS",
    "VEO_WAIT_FOR_VIDEO",
  ]),
  fal_ai: new Set([
    "FAL_AI_CANCEL_QUEUE_REQUEST",
    "FAL_AI_ESTIMATE_PRICING",
    "FAL_AI_GET_JWKS",
    "FAL_AI_GET_MODELS",
    "FAL_AI_GET_PRICING",
    "FAL_AI_GET_QUEUE_REQUEST_RESULT",
    "FAL_AI_QUEUE_GET_STATUS",
    "FAL_AI_QUEUE_GET_STATUS_STREAM",
    "FAL_AI_RUN_MODEL_SYNC",
    "FAL_AI_SUBMIT_ASYNC_JOB",
    "FAL_AI_SUBSCRIBE_ASYNC_JOB",
    "FAL_AI_UPLOAD_FILE",
  ]),
  pexels: new Set([
    "PEXELS_COLLECTION_MEDIA",
    "PEXELS_CURATED_PHOTOS",
    "PEXELS_FEATURED_COLLECTIONS",
    "PEXELS_GET_PHOTO",
    "PEXELS_GET_VIDEO_BY_ID",
    "PEXELS_MY_COLLECTIONS",
    "PEXELS_POPULAR_VIDEOS",
    "PEXELS_SEARCH_PHOTOS",
    "PEXELS_SEARCH_VIDEOS",
  ]),
  gemini: new Set([
    "GEMINI_COUNT_TOKENS",
    "GEMINI_EMBED_CONTENT",
    "GEMINI_GENERATE_CONTENT",
    "GEMINI_GENERATE_IMAGE",
    "GEMINI_GENERATE_VIDEOS",
    "GEMINI_GET_VIDEOS_OPERATION",
    "GEMINI_LIST_MODELS",
    "GEMINI_WAIT_FOR_VIDEO",
  ]),
  instagram: new Set([
    "INSTAGRAM_CREATE_CAROUSEL_CONTAINER",
    "INSTAGRAM_CREATE_POST",
    "INSTAGRAM_GET_IG_MEDIA_INSIGHTS",
    "INSTAGRAM_GET_IG_USER_MEDIA",
    "INSTAGRAM_GET_IG_USER_STORIES",
    "INSTAGRAM_GET_IG_USER_CONTENT_PUBLISHING_LIMIT",
    "INSTAGRAM_GET_USER_INFO",
    "INSTAGRAM_GET_USER_INSIGHTS",
    "INSTAGRAM_POST_IG_USER_MEDIA",
    "INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH",
  ]),
  facebook: new Set([
    "FACEBOOK_CREATE_PHOTO_POST",
    "FACEBOOK_CREATE_POST",
    "FACEBOOK_CREATE_VIDEO_POST",
    "FACEBOOK_GET_PAGE_DETAILS",
    "FACEBOOK_GET_PAGE_INSIGHTS",
    "FACEBOOK_GET_PAGE_POSTS",
    "FACEBOOK_GET_PAGE_VIDEOS",
    "FACEBOOK_GET_POST",
    "FACEBOOK_GET_POST_INSIGHTS",
    "FACEBOOK_GET_POST_REACTIONS",
    "FACEBOOK_GET_SCHEDULED_POSTS",
    "FACEBOOK_LIST_MANAGED_PAGES",
    "FACEBOOK_PUBLISH_SCHEDULED_POST",
    "FACEBOOK_RESCHEDULE_POST",
    "FACEBOOK_UPDATE_POST",
  ]),
  linkedin: new Set([
    "LINKEDIN_CREATE_ARTICLE_OR_URL_SHARE",
    "LINKEDIN_CREATE_COMMENT_ON_POST",
    "LINKEDIN_CREATE_LINKED_IN_POST",
    "LINKEDIN_CREATE_TEXT_POST",
    "LINKEDIN_DELETE_LINKED_IN_POST",
    "LINKEDIN_DELETE_POST",
    "LINKEDIN_DELETE_UGC_POST",
    "LINKEDIN_GET_COMPANY_INFO",
    "LINKEDIN_GET_IMAGE",
    "LINKEDIN_GET_IMAGES",
    "LINKEDIN_GET_MY_INFO",
    "LINKEDIN_GET_NETWORK_SIZE",
    "LINKEDIN_GET_ORG_PAGE_STATS",
    "LINKEDIN_GET_PERSON",
    "LINKEDIN_GET_POST_CONTENT",
    "LINKEDIN_GET_SHARE_STATS",
    "LINKEDIN_GET_VIDEOS",
    "LINKEDIN_INITIALIZE_IMAGE_UPLOAD",
    "LINKEDIN_LIST_REACTIONS",
    "LINKEDIN_REGISTER_IMAGE_UPLOAD",
  ]),
  twitter: new Set([
    "TWITTER_CREATION_OF_A_POST",
    "TWITTER_CREATE_TWEET",
    "TWITTER_GET_POST_ANALYTICS",
    "TWITTER_GET_POST_USAGE",
    "TWITTER_POST_LOOKUP_BY_POST_ID",
    "TWITTER_USER_LOOKUP_ME",
  ]),
  gmail: new Set([
    "GMAIL_CREATE_EMAIL_DRAFT",
    "GMAIL_FETCH_EMAILS",
    "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID",
    "GMAIL_FETCH_MESSAGE_BY_THREAD_ID",
    "GMAIL_GET_CONTACTS",
    "GMAIL_GET_PROFILE",
    "GMAIL_LIST_DRAFTS",
    "GMAIL_LIST_HISTORY",
    "GMAIL_LIST_THREADS",
    "GMAIL_REPLY_TO_THREAD",
    "GMAIL_SEARCH_PEOPLE",
    "GMAIL_SEND_DRAFT",
    "GMAIL_SEND_EMAIL",
  ]),
  instantly: new Set([
    "INSTANTLY_CREATE_CAMPAIGN",
    "INSTANTLY_UPDATE_CAMPAIGN",
    "INSTANTLY_GET_CAMPAIGN",
    "INSTANTLY_LIST_CAMPAIGNS",
    "INSTANTLY_ADD_LEADS_BULK",
    "INSTANTLY_CREATE_LEAD",
    "INSTANTLY_LIST_LEADS",
    "INSTANTLY_LIST_ACCOUNTS",
    "INSTANTLY_GET_CAMPAIGN_ANALYTICS",
    "INSTANTLY_GET_CAMPAIGN_SENDING_STATUS",
    "INSTANTLY_GET_CAMPAIGN_STEPS_ANALYTICS",
    "INSTANTLY_CAMPAIGNS_ANALYTICS_OVERVIEW_GET",
    "INSTANTLY_GET_DAILY_CAMPAIGN_ANALYTICS",
    "INSTANTLY_PAUSE_CAMPAIGN",
    "INSTANTLY_ACTIVATE_CAMPAIGN",
    "INSTANTLY_COUNT_UNREAD_EMAILS",
    "INSTANTLY_LIST_EMAILS",
    "INSTANTLY_MARK_THREAD_AS_READ",
    "INSTANTLY_REPLY_TO_AN_EMAIL",
    "INSTANTLY_CREATE_SUBSEQUENCE",
    "INSTANTLY_UPDATE_SUBSEQUENCE",
    "INSTANTLY_PAUSE_SUBSEQUENCE",
    "INSTANTLY_RESUME_SUBSEQUENCE",
    "INSTANTLY_CREATE_WEBHOOK",
    "INSTANTLY_LIST_WEBHOOKS",
    "INSTANTLY_TEST_WEBHOOK",
    "INSTANTLY_VERIFY_EMAIL",
    "INSTANTLY_CHECK_EMAIL_VERIFICATION_STATUS",
    "INSTANTLY_UPDATE_LEAD_INTEREST_STATUS",
    "INSTANTLY_UPDATE_LEAD",
    "INSTANTLY_SEARCH_CAMPAIGNS_BY_LEAD_EMAIL",
    // Instantly SuperSearch / AI enrichment (list or campaign resource)
    "INSTANTLY_CREATE_AI_ENRICHMENT",
    "INSTANTLY_CREATE_SUPERSEARCH_ENRICHMENT",
    "INSTANTLY_GET_SUPERSEARCH_ENRICHMENT",
    "INSTANTLY_PATCH_SUPERSEARCH_ENRICHMENT_SETTINGS",
    "INSTANTLY_SUPERSEARCH_ENRICHMENT_RUN_POST",
  ]),
  heyreach: new Set([
    "HEYREACH_CHECK_API_KEY",
    "HEYREACH_GET_ALL_CAMPAIGNS",
    "HEYREACH_GET_ALL_LISTS",
    "HEYREACH_CREATE_EMPTY_LIST",
    "HEYREACH_ADD_LEADS_TO_LIST_V2",
    "HEYREACH_CREATE_CAMPAIGN",
    "HEYREACH_START_CAMPAIGN",
    "HEYREACH_GET_CAMPAIGN",
    "HEYREACH_GET_CAMPAIGN_SEQUENCE",
    "HEYREACH_UPDATE_CAMPAIGN_SEQUENCE",
    "HEYREACH_UPDATE_CAMPAIGN_SCHEDULE",
    "HEYREACH_STOP_LEAD_IN_CAMPAIGN",
    "HEYREACH_GET_ALL_LEADS",
    "HEYREACH_GET_LEAD",
    "HEYREACH_GET_LISTS_FOR_LEAD",
    "HEYREACH_GET_CONVERSATIONS_V2",
    "HEYREACH_GET_ALL_LINKEDIN_ACCOUNTS",
    "HEYREACH_GET_OVERALL_STATS",
    "HEYREACH_GET_MY_NETWORK_FOR_SENDER",
    "HEYREACH_GET_COMPANIES_FROM_LIST",
    "HEYREACH_CREATE_TAGS",
    "HEYREACH_CREATE_WEBHOOK",
    "HEYREACH_GET_ALL_WEBHOOKS",
    "HEYREACH_GET_WEBHOOK_BY_ID",
    "HEYREACH_UPDATE_WEBHOOK",
    "HEYREACH_DELETE_WEBHOOK",
    "HEYREACH_SEND_MESSAGE",
    "HEYREACH_INBOX_SEND_MESSAGE",
  ]),
  whatsapp: new Set([
    "WHATSAPP_GET_PHONE_NUMBERS",
    "WHATSAPP_SEND_MESSAGE",
    "WHATSAPP_SEND_TEMPLATE_MESSAGE",
  ]),
  outlook: new Set([
    "OUTLOOK_CREATE_DRAFT",
    "OUTLOOK_CREATE_DRAFT_REPLY",
    "OUTLOOK_CREATE_FORWARD_DRAFT",
    "OUTLOOK_GET_DRAFTS_MAIL_FOLDER",
    "OUTLOOK_GET_MAILBOX_SETTINGS",
    "OUTLOOK_GET_PROFILE",
    "OUTLOOK_LIST_CONTACTS",
    "OUTLOOK_LIST_MESSAGES",
    "OUTLOOK_LIST_USER_CONTACTS",
    "OUTLOOK_SEARCH_MESSAGES",
    "OUTLOOK_SEND_DRAFT",
    "OUTLOOK_SEND_EMAIL",
  ]),
  zohomail: new Set([
    // Reporting-safe Zoho Mail subset based on the documented Zoho Mail actions.
    "ZOHO_MAIL_LIST_ZOHO_MAIL_ACCOUNTS",
    "ZOHO_MAIL_CREATE_EMAIL_DRAFT",
    "ZOHO_MAIL_GET_MESSAGE_CONTENT",
    "ZOHO_MAIL_LIST_EMAILS",
    "ZOHO_MAIL_REPLY_TO_EMAIL",
    "ZOHO_MAIL_SEARCH_MESSAGES",
    "ZOHO_MAIL_SEND_EMAIL",
  ]),
  slack: new Set([
    "SLACK_FIND_CHANNELS",
    "SLACK_FIND_USERS",
    "SLACK_FIND_USER_BY_EMAIL_ADDRESS",
    "SLACK_RETRIEVE_CONVERSATION_INFORMATION",
    "SLACK_RETRIEVE_CONVERSATION_MEMBERS_LIST",
    "SLACK_RETRIEVE_DETAILED_USER_INFORMATION",
    "SLACK_RETRIEVE_MESSAGE_PERMALINK_URL",
    "SLACK_SEND_EPHEMERAL_MESSAGE",
    "SLACK_SEND_MESSAGE",
    "SLACK_SEND_ME_MESSAGE",
  ]),
  googledocs: new Set([
    "GOOGLEDOCS_COPY_DOCUMENT",
    "GOOGLEDOCS_CREATE_DOCUMENT",
    "GOOGLEDOCS_CREATE_DOCUMENT2",
    "GOOGLEDOCS_CREATE_DOCUMENT_MARKDOWN",
    "GOOGLEDOCS_EXPORT_DOCUMENT_AS_PDF",
    "GOOGLEDOCS_GET_DOCUMENT_BY_ID",
    "GOOGLEDOCS_GET_DOCUMENT_PLAINTEXT",
    "GOOGLEDOCS_SEARCH_DOCUMENTS",
    "GOOGLEDOCS_UPDATE_DOCUMENT_MARKDOWN",
    "GOOGLEDOCS_UPDATE_DOCUMENT_SECTION_MARKDOWN",
    "GOOGLEDOCS_UPDATE_EXISTING_DOCUMENT",
  ]),
  googledrive: new Set(GOOGLEDRIVE_TOOL_SLUGS),
  onedrive: new Set([
    // Reporting-safe OneDrive subset based on the documented OneDrive actions.
    "ONE_DRIVE_CREATE_SHARING_LINK",
    "ONE_DRIVE_DOWNLOAD_A_FILE",
    "ONE_DRIVE_DOWNLOAD_FILE_BY_PATH",
    "ONE_DRIVE_DOWNLOAD_ITEM_AS_FORMAT",
    "ONE_DRIVE_GET_DRIVE",
    "ONE_DRIVE_GET_ITEM_METADATA",
    "ONE_DRIVE_LIST_DRIVES",
    "ONE_DRIVE_LIST_FOLDER_CHILDREN",
    "ONE_DRIVE_CREATE_FOLDER",
    "ONE_DRIVE_CREATE_A_NEW_TEXT_FILE",
    "ONE_DRIVE_FIND_ITEM",
    "ONE_DRIVE_FIND_FOLDER",
    "ONE_DRIVE_LIST_ONEDRIVE_ITEMS",
    "ONE_DRIVE_UPLOAD_FILE",
    "ONE_DRIVE_SEARCH_ITEMS",
    "ONE_DRIVE_UPDATE_FILE_CONTENT",
  ]),
  youtube: new Set([
    "YOUTUBE_CREATE_PLAYLIST",
    "YOUTUBE_GET_CHANNEL_STATISTICS",
    "YOUTUBE_GET_VIDEO_DETAILS_BATCH",
    "YOUTUBE_LIST_CAPTION_TRACK",
    "YOUTUBE_LIST_CHANNEL_VIDEOS",
    "YOUTUBE_LIST_PLAYLIST_ITEMS",
    "YOUTUBE_LIST_USER_PLAYLISTS",
    "YOUTUBE_LOAD_CAPTIONS",
    "YOUTUBE_MULTIPART_UPLOAD_VIDEO",
    "YOUTUBE_UPDATE_CAPTION",
    "YOUTUBE_UPDATE_PLAYLIST",
    "YOUTUBE_UPDATE_PLAYLIST_ITEM",
    "YOUTUBE_UPDATE_THUMBNAIL",
    "YOUTUBE_UPDATE_VIDEO",
    "YOUTUBE_UPLOAD_VIDEO",
    "YOUTUBE_VIDEO_DETAILS",
  ]),
  zoho: new Set(ZOHO_CRM_TOOL_SLUGS),
  hubspot: new Set(HUBSPOT_TOOL_SLUGS),
  klaviyo: new Set(KLAVIYO_TOOL_SLUGS),
  mailchimp: new Set(MAILCHIMP_TOOL_SLUGS),
  google_analytics: new Set([
    "GOOGLE_ANALYTICS_BATCH_RUN_REPORTS",
    "GOOGLE_ANALYTICS_GET_ACCOUNT",
    "GOOGLE_ANALYTICS_GET_METADATA",
    "GOOGLE_ANALYTICS_GET_PROPERTY",
    "GOOGLE_ANALYTICS_GET_PROPERTY_QUOTAS_SNAPSHOT",
    "GOOGLE_ANALYTICS_LIST_ACCOUNTS",
    "GOOGLE_ANALYTICS_LIST_GOOGLE_ADS_LINKS",
    "GOOGLE_ANALYTICS_LIST_PROPERTIES_FILTERED",
    "GOOGLE_ANALYTICS_RUN_FUNNEL_REPORT",
    "GOOGLE_ANALYTICS_RUN_PIVOT_REPORT",
    "GOOGLE_ANALYTICS_RUN_REALTIME_REPORT",
    "GOOGLE_ANALYTICS_RUN_REPORT",
  ]),
  googlesheets: new Set(GOOGLESHEETS_TOOL_SLUGS),
  hunter: new Set([
    "HUNTER_ACCOUNT_INFORMATION",
    "HUNTER_COMBINED_ENRICHMENT",
    "HUNTER_COMPANY_ENRICHMENT",
    "HUNTER_DISCOVER_COMPANIES",
    "HUNTER_DOMAIN_SEARCH",
    "HUNTER_EMAIL_COUNT",
    "HUNTER_EMAIL_FINDER",
    "HUNTER_EMAIL_VERIFIER",
    "HUNTER_PEOPLE_ENRICHMENT",
  ]),
  reddit: new Set([
    "REDDIT_CREATE_REDDIT_POST",
    "REDDIT_EDIT_REDDIT_COMMENT_OR_POST",
    "REDDIT_DELETE_REDDIT_POST",
    "REDDIT_GET",
    "REDDIT_GET_CONTROVERSIAL_POSTS",
    "REDDIT_GET_ME_PREFS",
    "REDDIT_GET_REDDIT_USER_ABOUT",
    "REDDIT_GET_R_TOP",
    "REDDIT_GET_SUBREDDIT_RULES",
    "REDDIT_GET_SUBREDDITS_SEARCH",
    "REDDIT_LIST_SUBREDDIT_POST_FLAIRS",
    "REDDIT_POST_REDDIT_COMMENT",
    "REDDIT_RETRIEVE_POST_COMMENTS",
    "REDDIT_RETRIEVE_REDDIT_POST",
    "REDDIT_RETRIEVE_SPECIFIC_COMMENT",
    "REDDIT_SEARCH_ACROSS_SUBREDDITS",
    "REDDIT_TOGGLE_INBOX_REPLIES",
  ]),
  wordpress: new Set([
    "WORDPRESS_CREATE_POST",
    "WORDPRESS_GET_POST",
    "WORDPRESS_GET_POSTS",
    "WORDPRESS_UPDATE_POST",
    "WORDPRESS_GET_SITE_SETTINGS",
    "WORDPRESS_LIST_CATEGORIES",
  ]),
  webflow: new Set(WEBFLOW_TOOL_SLUGS),
  shopify: new Set([
    "SHOPIFY_COUNT_ARTICLES",
    "SHOPIFY_COUNT_BLOGS",
    "SHOPIFY_CREATE_ARTICLE",
    "SHOPIFY_CREATE_BLOG",
    "SHOPIFY_DELETE_ARTICLE",
    "SHOPIFY_GET_ARTICLE",
    "SHOPIFY_GET_BLOG",
    "SHOPIFY_LIST_ARTICLE_AUTHORS",
    "SHOPIFY_LIST_ARTICLE_TAGS",
    "SHOPIFY_LIST_BLOG_ARTICLES",
    "SHOPIFY_LIST_BLOGS",
    "SHOPIFY_UPDATE_ARTICLE",
    "SHOPIFY_UPDATE_BLOG",
  ]),
  wix: new Set([
    "WIX_CHECK_CONTENT",
    "WIX_GET_COLLECTION_BY_SLUG",
    "WIX_GET_SITE_PROPERTIES",
    "WIX_GENERATE_FILE_UPLOAD_URL",
    "WIX_IMPORT_FILE",
    "WIX_PUBLISH_DRAFT",
    "WIX_QUERY_FOLDERS",
    "WIX_UPDATE_CONTENT_BY_KEY_BULK",
  ]),
  hostinger: new Set([
    "HOSTINGER_GET_DNS_RECORDS",
    "HOSTINGER_LIST_DOMAINS",
    "HOSTINGER_LIST_ORDERS",
    "HOSTINGER_LIST_WEBSITES",
    "HOSTINGER_VALIDATE_DNS_RECORDS",
    "HOSTINGER_VERIFY_DOMAIN_OWNERSHIP",
  ]),
  firecrawl: new Set([
    "FIRECRAWL_BATCH_SCRAPE",
    "FIRECRAWL_CRAWL",
    "FIRECRAWL_CRAWL_GET",
    "FIRECRAWL_EXTRACT",
    "FIRECRAWL_LLMS_TXT_GENERATE",
    "FIRECRAWL_MAP_MULTIPLE_URLS_BASED_ON_OPTIONS",
    "FIRECRAWL_SCRAPE",
    "FIRECRAWL_SEARCH",
  ]),
  apify: new Set([
    "APIFY_GET_ACTOR_LAST_RUN_DATASET_ITEMS",
    "APIFY_GET_DATASET_ITEMS",
    "APIFY_GET_TASK_LAST_RUN_DATASET_ITEMS",
    "APIFY_RUN_ACTOR_SYNC_GET_DATASET_ITEMS",
    "APIFY_RUN_ACTOR_SYNC_GET_DATASET_ITEMS_POST",
    "APIFY_RUN_TASK_SYNC_GET_DATASET_ITEMS_GET",
    "APIFY_RUN_TASK_SYNC_GET_DATASET_ITEMS_POST",
  ]),
  github: new Set([
    "GITHUB_CREATE_A_PULL_REQUEST",
    "GITHUB_CREATE_A_REFERENCE",
    "GITHUB_CREATE_OR_UPDATE_FILE_CONTENTS",
    "GITHUB_GET_A_REPOSITORY",
    "GITHUB_GET_A_TREE",
    "GITHUB_GET_FILE_CONTENTS",
    "GITHUB_LIST_COMMITS",
    "GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER",
    "GITHUB_CREATE_A_WORKFLOW_DISPATCH_EVENT",
  ]),
  railway: new Set([
    "RAILWAY_GET_DEPLOYMENT_LOGS",
    "RAILWAY_GET_ENVIRONMENT",
    "RAILWAY_GET_GIT_HUB_PR_INFO",
    "RAILWAY_LIST_ENVIRONMENT_PATCHES",
    "RAILWAY_LIST_GIT_HUB_REPOS",
    "RAILWAY_UPDATE_PROJECT",
    "RAILWAY_UPDATE_SERVICE_INSTANCE",
  ]),
  cloudflare: new Set([
    "CLOUDFLARE_CREATE_DNS_RECORD",
    "CLOUDFLARE_GET_BOT_MANAGEMENT_SETTINGS",
    "CLOUDFLARE_LIST_DNS_RECORDS",
    "CLOUDFLARE_LIST_ZONES",
    "CLOUDFLARE_UPDATE_DNS_RECORD",
    "CLOUDFLARE_UPDATE_ZONE",
  ]),
  // Paid ads — curated operational subsets (Composio metaads / googleads / linkedinads)
  metaads: new Set([
    "METAADS_CREATE_AD",
    "METAADS_CREATE_AD_CREATIVE",
    "METAADS_CREATE_AD_SET",
    "METAADS_CREATE_CAMPAIGN",
    "METAADS_CREATE_CUSTOM_AUDIENCE",
    "METAADS_DELETE_CAMPAIGN",
    "METAADS_GET_AD_ACCOUNTS",
    "METAADS_GET_AD_CREATIVE",
    "METAADS_GET_INSIGHTS",
    "METAADS_GET_OBJECT",
    "METAADS_GET_PAGE_ACCOUNTS",
    "METAADS_GET_USER",
    "METAADS_GET_VIDEO",
    "METAADS_LIST_AD_CREATIVES",
    "METAADS_LIST_AD_NETWORK_ANALYTICS",
    "METAADS_LIST_AD_NETWORK_ANALYTICS_RESULTS",
    "METAADS_LIST_ADS",
    "METAADS_LIST_AGENCIES",
    "METAADS_LIST_ASSIGNED_PAGES",
    "METAADS_LIST_ASSIGNED_USERS",
    "METAADS_LIST_BUSINESS_AD_ACCOUNTS",
    "METAADS_LIST_BUSINESS_INVOICES",
    "METAADS_LIST_CLIENT_AD_ACCOUNTS",
    "METAADS_LIST_CLIENT_APPS",
    "METAADS_LIST_CLIENT_INSTAGRAM_ASSETS",
    "METAADS_LIST_CLIENT_OFFSITE_SIGNAL_CONTAINERS",
    "METAADS_LIST_CLIENT_PAGES",
    "METAADS_LIST_CLIENTS",
    "METAADS_LIST_COLLABORATIVE_ADS_COLLABORATION_REQUESTS",
    "METAADS_LIST_COLLABORATIVE_ADS_SUGGESTED_PARTNERS",
    "METAADS_LIST_INITIATED_AUDIENCE_SHARING_REQUESTS",
    "METAADS_LIST_MANAGED_PARTNER_ADS_FUNDING_SOURCE_DETAILS",
    "METAADS_LIST_OWNED_APPS",
    "METAADS_LIST_OWNED_BUSINESSES",
    "METAADS_LIST_OWNED_INSTAGRAM_ASSETS",
    "METAADS_LIST_OWNED_OFFSITE_SIGNAL_CONTAINER_BUSINESS_OBJECTS",
    "METAADS_LIST_OWNED_PAGES",
    "METAADS_LIST_PENDING_CLIENT_AD_ACCOUNTS",
    "METAADS_LIST_PENDING_CLIENT_APPS",
    "METAADS_LIST_PENDING_CLIENT_PAGES",
    "METAADS_LIST_PENDING_OFFSITE_SIGNAL_CONTAINERS",
    "METAADS_LIST_PENDING_OWNED_AD_ACCOUNTS",
    "METAADS_LIST_PENDING_OWNED_PAGES",
    "METAADS_LIST_PENDING_USERS",
    "METAADS_LIST_RECEIVED_AUDIENCE_SHARING_REQUESTS",
    "METAADS_LIST_SYSTEM_USERS",
    "METAADS_LIST_TARGETING_SEARCH",
    "METAADS_PREVIEW_AD_CREATIVE",
    "METAADS_READ_ADSETS",
    "METAADS_UPDATE_AD_CREATIVE",
    "METAADS_UPDATE_CAMPAIGN",
    "METAADS_UPLOAD_AD_IMAGE",
    // Legacy Facebook Ads toolkit aliases (analytics paths)
    "FACEBOOKADS_GET_AD_ACCOUNTS",
    "FACEBOOKADS_GET_AD_ACCOUNT_INSIGHTS",
  ]),
  googleads: new Set([
    "GOOGLEADS_ADD_OR_REMOVE_TO_CUSTOMER_LIST",
    "GOOGLEADS_CREATE_CUSTOMER_LIST",
    "GOOGLEADS_GET_CAMPAIGN_BY_ID",
    "GOOGLEADS_GET_CAMPAIGN_BY_NAME",
    "GOOGLEADS_GET_CUSTOMER_LISTS",
    "GOOGLEADS_LIST_ACCESSIBLE_CUSTOMERS",
    "GOOGLEADS_LIST_SUB_ACCOUNTS",
    "GOOGLEADS_MUTATE_AD_GROUP_ADS",
    "GOOGLEADS_MUTATE_AD_GROUP_ASSETS",
    "GOOGLEADS_MUTATE_AD_GROUP_BID_MODIFIERS",
    "GOOGLEADS_MUTATE_AD_GROUP_CRITERIA",
    "GOOGLEADS_MUTATE_AD_GROUPS",
    "GOOGLEADS_MUTATE_ASSETS",
    "GOOGLEADS_MUTATE_BIDDING_STRATEGIES",
    "GOOGLEADS_MUTATE_CAMPAIGN_ASSETS",
    "GOOGLEADS_MUTATE_CAMPAIGN_BUDGETS",
    "GOOGLEADS_MUTATE_CAMPAIGN_CRITERIA",
    "GOOGLEADS_MUTATE_CAMPAIGN_LABELS",
    "GOOGLEADS_MUTATE_CAMPAIGNS",
    "GOOGLEADS_MUTATE_CONVERSION_ACTIONS",
    "GOOGLEADS_MUTATE_LABELS",
    "GOOGLEADS_SEARCH_STREAM_GAQL",
    // Compat aliases used by older Marqq callers
    "GOOGLEADS_QUERY",
    "GOOGLEADS_LIST_CAMPAIGNS",
  ]),
  linkedinads: new Set([
    "LINKEDIN_ADS_CREATE_AD_ACCOUNT",
    "LINKEDIN_ADS_CREATE_LEAD_FORM",
    "LINKEDIN_ADS_GET_AD_ACCOUNT",
    "LINKEDIN_ADS_GET_AD_ANALYTICS",
    "LINKEDIN_ADS_GET_AUDIENCE_COUNTS",
    "LINKEDIN_ADS_GET_CAMPAIGN_GROUP",
    "LINKEDIN_ADS_GET_LEAD_FORM",
    "LINKEDIN_ADS_GET_NETWORK_SIZE",
    "LINKEDIN_ADS_GET_ORGANIZATION_ACLS",
    "LINKEDIN_ADS_GET_ORGANIZATION_PAGE_STATISTICS",
    "LINKEDIN_ADS_GET_ORG_FOLLOWER_STATISTICS",
    "LINKEDIN_ADS_GET_ORG_SHARE_STATISTICS",
    "LINKEDIN_ADS_GET_SUPPLY_FORECASTS",
    "LINKEDIN_ADS_GET_TARGETING_ENTITIES",
    "LINKEDIN_ADS_GET_TARGETING_FACETS",
    "LINKEDIN_ADS_LIST_CONVERSION_RULES",
    "LINKEDIN_ADS_LIST_DMP_SEGMENTS",
    "LINKEDIN_ADS_LIST_LEAD_FORMS",
    "LINKEDIN_ADS_LIST_ORGANIZATIONS",
    "LINKEDIN_ADS_LIST_POSTS",
    "LINKEDIN_ADS_LOOKUP_ORGANIZATIONS",
    "LINKEDIN_ADS_REGISTER_UPLOAD",
    "LINKEDIN_ADS_SEARCH_AD_ACCOUNTS",
    "LINKEDIN_ADS_SEARCH_CAMPAIGNS",
    "LINKEDIN_ADS_SEARCH_CREATIVES",
    "LINKEDIN_ADS_SEARCH_EVENTS",
    "LINKEDIN_ADS_UPDATE_LEAD_FORM",
    "LINKEDIN_ADS_UPDATE_ORGANIZATION_ACL",
  ]),
};
const BROKEN_TOOL_SLUGS = new Set([
  // Listed by v3 for Hunter, but execute endpoint returns Tool_ToolNotFound.
  "HUNTER_PEOPLE_ENRICHMENT",
]);

const TOOL_SLUG_ALIASES = {
  GOOGLESHEETS_CREATE_DOCUMENT_MARKDOWN: "GOOGLEDOCS_CREATE_DOCUMENT_MARKDOWN",
  GOOGLESHEETS_UPDATE_DOCUMENT_MARKDOWN: "GOOGLEDOCS_UPDATE_DOCUMENT_MARKDOWN",
  GOOGLESHEETS_UPDATE_EXISTING_DOCUMENT: "GOOGLEDOCS_UPDATE_EXISTING_DOCUMENT",
  GOOGLEADS_QUERY: "GOOGLEADS_SEARCH_STREAM_GAQL",
  GOOGLEADS_LIST_CAMPAIGNS: "GOOGLEADS_SEARCH_STREAM_GAQL",
  ...GSC_TOOL_SLUG_ALIASES,
};

const REVERSE_TOOL_SLUG_ALIASES = Object.entries(TOOL_SLUG_ALIASES).reduce((acc, [alias, canonical]) => {
  if (!acc[canonical]) acc[canonical] = [];
  acc[canonical].push(alias);
  return acc;
}, {});

function normalizeAppSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function accountMatchesEntity(item, entityId) {
  return String(item?.user_id || "") === String(entityId || "");
}

function makeSchemaNullable(schema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return schema;
  if (schema.anyOf) return schema;

  const next = { ...schema };
  if (typeof next.type === "string" && next.type !== "null") {
    next.type = [next.type, "null"];
  }
  return next;
}

function normalizeToolParameters(parameters) {
  if (!parameters?.properties) {
    return { type: "object", properties: {}, required: [] };
  }

  const required = Array.isArray(parameters.required) ? parameters.required : [];
  const requiredSet = new Set(required);
  const normalizedProperties = Object.fromEntries(
    Object.entries(parameters.properties).map(([key, value]) => {
      const propertySchema = value && typeof value === "object" ? { ...value } : value;
      return [key, requiredSet.has(key) ? propertySchema : makeSchemaNullable(propertySchema)];
    })
  );

  return {
    type: "object",
    properties: normalizedProperties,
    required,
  };
}

function stripNullishValues(value) {
  if (Array.isArray(value)) {
    return value
      .map(stripNullishValues)
      .filter((item) => item !== undefined);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, entryValue]) => [key, stripNullishValues(entryValue)])
        .filter(([, entryValue]) => entryValue !== undefined)
    );
  }

  if (value === null || value === undefined) return undefined;
  return value;
}

function markdownToPlainDocumentText(value) {
  const text = String(value || "");
  if (!text.trim()) return text;

  return text
    .replace(/\r/g, "")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1 ($2)")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*]\s+/gm, "• ")
    .replace(/^\d+\.\s+/gm, (match) => match)
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/^\s*---+\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const APOLLO_MAX_RESULTS = 100;

function clampApolloSearchArgs(args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) return args;
  const next = { ...args };
  const clampInt = (value, fallback) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(Math.floor(n), 1), APOLLO_MAX_RESULTS);
  };

  if (next.per_page != null) next.per_page = clampInt(next.per_page, APOLLO_MAX_RESULTS);
  else if (next.page_size != null) next.page_size = clampInt(next.page_size, APOLLO_MAX_RESULTS);
  else if (next.limit != null) next.limit = clampInt(next.limit, APOLLO_MAX_RESULTS);
  else if (next.num_records != null) next.num_records = clampInt(next.num_records, APOLLO_MAX_RESULTS);
  else if (next.max_results != null) next.max_results = clampInt(next.max_results, APOLLO_MAX_RESULTS);
  else next.per_page = APOLLO_MAX_RESULTS;

  if (next.page_size != null) next.page_size = clampInt(next.page_size, APOLLO_MAX_RESULTS);
  if (next.limit != null) next.limit = clampInt(next.limit, APOLLO_MAX_RESULTS);
  if (next.num_records != null) next.num_records = clampInt(next.num_records, APOLLO_MAX_RESULTS);
  if (next.max_results != null) next.max_results = clampInt(next.max_results, APOLLO_MAX_RESULTS);

  return next;
}

function isApolloSearchTool(toolSlug) {
  const slug = String(toolSlug || "").toUpperCase();
  return slug.includes("APOLLO") && (
    slug.includes("SEARCH") ||
    slug.includes("PEOPLE") ||
    slug.includes("CONTACT") ||
    slug.includes("MIXED")
  );
}

function normalizeToolExecutionArgs(toolSlug, args, taskType = null) {
  if (!args || typeof args !== "object" || Array.isArray(args)) return args;

  if (isApolloSearchTool(toolSlug)) {
    return clampApolloSearchArgs(args);
  }

  if (taskType === "marketing_report") {
    if (toolSlug === "GOOGLEDOCS_CREATE_DOCUMENT") {
      return {
        ...args,
        text: markdownToPlainDocumentText(args.text),
      };
    }

    if (toolSlug === "GOOGLEDOCS_CREATE_DOCUMENT2") {
      return {
        ...args,
        content: markdownToPlainDocumentText(args.content ?? args.text),
        text: markdownToPlainDocumentText(args.text),
      };
    }
  }

  if (toolSlug === "GOOGLEDOCS_CREATE_DOCUMENT_MARKDOWN") {
    const markdownText =
      args.markdown_text ?? args.markdown ?? args.content ?? args.text ?? "";
    return {
      ...args,
      title: args.title,
      markdown_text: markdownText,
      content: args.content ?? markdownText,
    };
  }

  if (toolSlug === "GOOGLEDOCS_UPDATE_DOCUMENT_MARKDOWN") {
    return {
      ...args,
      document_id: args.document_id ?? args.id,
      new_markdown_text: args.new_markdown_text ?? args.markdown,
    };
  }

  if (toolSlug === "GOOGLEDOCS_UPDATE_EXISTING_DOCUMENT") {
    return {
      ...args,
      document_id: args.document_id ?? args.id,
      content:
        taskType === "marketing_report"
          ? markdownToPlainDocumentText(args.content ?? args.markdown ?? args.text)
          : (args.content ?? args.markdown ?? args.text),
    };
  }

  if (toolSlug === "GOOGLEDOCS_UPDATE_DOCUMENT_SECTION_MARKDOWN") {
    return {
      ...args,
      document_id: args.document_id ?? args.id,
      new_markdown_text: args.new_markdown_text ?? args.markdown,
    };
  }

  return args;
}

// ── Composio REST helpers ─────────────────────────────────────────────────────

/**
 * Fetch available Composio actions for an entity, formatted as OpenAI tool schema.
 * @param {string} entityId
 * @param {string} apiKey
 * @param {{ toolkits?: string[], limit?: number }} options
 * @returns {Promise<Array>}
 */
async function getComposioTools(entityId, apiKey, { toolkits = [], limit = 100 } = {}) {
  const requestedToolkits = Array.from(new Set(toolkits.map(normalizeAppSlug).filter(Boolean)));
  const allTools = [];

  for (const toolkit of requestedToolkits) {
    const params = new URLSearchParams({
      toolkit_slug: toolkit,
      toolkit_versions: "latest",
      limit: String(limit),
    });

    const resp = await fetch(`${COMPOSIO_V3}/tools?${params}`, {
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`Composio v3 tools fetch failed for ${toolkit}: ${resp.status} ${body.slice(0, 200)}`);
    }

    const data = await resp.json();
    const items = data.items ?? [];
    for (const tool of items) {
      const toolkitSlug = normalizeAppSlug(tool.toolkit?.slug || toolkit);
      const toolSlug = String(tool.slug || "").trim();
      const allowedSlugs = TOOLKIT_ALLOWED_TOOL_SLUGS[toolkitSlug];
      if (allowedSlugs && !allowedSlugs.has(toolSlug)) continue;
      if (!toolSlug || BROKEN_TOOL_SLUGS.has(toolSlug)) continue;
      TOOLKIT_BY_TOOL_SLUG.set(toolSlug, toolkitSlug);
      allTools.push({
        type: "function",
        function: {
          name: toolSlug,
          description: tool.description || tool.name || toolSlug,
          parameters: normalizeToolParameters(tool.input_parameters),
        },
      });

      const aliases = REVERSE_TOOL_SLUG_ALIASES[toolSlug] || [];
      for (const alias of aliases) {
        TOOLKIT_BY_TOOL_SLUG.set(alias, toolkitSlug);
        allTools.push({
          type: "function",
          function: {
            name: alias,
            description: `${tool.description || tool.name || toolSlug} (compat alias)`,
            parameters: normalizeToolParameters(tool.input_parameters),
          },
        });
      }
    }
  }

  return allTools;
}

/**
 * Execute a Composio action via the REST API.
 * @param {string} entityId
 * @param {string} actionName
 * @param {object} args
 * @param {string} apiKey
 * @returns {Promise<{successful: boolean, data: any, error: string|null}>}
 */
async function resolveConnectedAccountId(entityId, toolkitSlug, apiKey, { bypassCache = false, excludeIds = [] } = {}) {
  const cacheKey = `${entityId}:${toolkitSlug}`;
  if (!bypassCache && !excludeIds.length && CONNECTED_ACCOUNT_CACHE.has(cacheKey)) {
    return CONNECTED_ACCOUNT_CACHE.get(cacheKey);
  }

  const res = await fetch(
    `${COMPOSIO_V3}/connected_accounts?user_id=${encodeURIComponent(entityId)}&toolkit_slug=${encodeURIComponent(toolkitSlug)}&limit=10`,
    { headers: { "x-api-key": apiKey } }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Connected account lookup failed for ${toolkitSlug}: ${res.status} ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const excluded = new Set((excludeIds || []).filter(Boolean).map(String));
  const accounts = (data.items || [])
    .filter((item) => {
      const slug = normalizeAppSlug(item.toolkit?.slug || item.toolkit_slug);
      return (
        accountMatchesEntity(item, entityId) &&
        slug === toolkitSlug &&
        item.status === "ACTIVE" &&
        item.id &&
        !excluded.has(String(item.id))
      );
    })
    .sort((a, b) => {
      const aMs = Date.parse(a.updated_at || a.created_at || "") || 0;
      const bMs = Date.parse(b.updated_at || b.created_at || "") || 0;
      return bMs - aMs;
    });
  const account = accounts[0];

  if (!account?.id) {
    throw new Error(`No active ${toolkitSlug} connection for user ${entityId}`);
  }

  CONNECTED_ACCOUNT_CACHE.set(cacheKey, account.id);
  return account.id;
}

async function getConnectedAccountDetail(entityId, toolkitSlug, apiKey) {
  const connectedAccountId = await resolveConnectedAccountId(entityId, toolkitSlug, apiKey);
  if (CONNECTED_ACCOUNT_DETAIL_CACHE.has(connectedAccountId)) {
    return CONNECTED_ACCOUNT_DETAIL_CACHE.get(connectedAccountId);
  }

  const res = await fetch(`${COMPOSIO_V3}/connected_accounts/${connectedAccountId}`, {
    headers: { "x-api-key": apiKey },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Connected account detail failed for ${toolkitSlug}: ${res.status} ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  CONNECTED_ACCOUNT_DETAIL_CACHE.set(connectedAccountId, data);
  return data;
}

function getGenericApiKey(detail) {
  return detail?.data?.generic_api_key
    || detail?.state?.val?.generic_api_key
    || detail?.params?.generic_api_key
    || detail?.data?.api_key
    || detail?.state?.val?.api_key
    || detail?.params?.api_key
    || null;
}

async function executeHunterDirect(entityId, toolSlug, args, apiKey) {
  const detail = await getConnectedAccountDetail(entityId, "hunter", apiKey);
  const hunterApiKey = getGenericApiKey(detail);
  if (!hunterApiKey) {
    return { successful: false, data: null, error: "No Hunter API key found in connected account details" };
  }

  let path = null;
  const params = new URLSearchParams();

  if (toolSlug === "HUNTER_DOMAIN_SEARCH") {
    path = "/domain-search";
    if (args.domain) params.set("domain", String(args.domain));
    if (args.company) params.set("company", String(args.company));
    if (args.type) params.set("type", String(args.type));
    if (args.limit != null) params.set("limit", String(args.limit));
    if (args.offset != null) params.set("offset", String(args.offset));
    if (Array.isArray(args.seniority) && args.seniority.length) params.set("seniority", args.seniority.join(","));
    if (Array.isArray(args.department) && args.department.length) params.set("department", args.department.join(","));
    if (Array.isArray(args.required_field) && args.required_field.length) params.set("required_field", args.required_field.join(","));
  } else if (toolSlug === "HUNTER_EMAIL_FINDER") {
    path = "/email-finder";
    if (args.domain) params.set("domain", String(args.domain));
    if (args.company) params.set("company", String(args.company));
    if (args.full_name) params.set("full_name", String(args.full_name));
    if (args.first_name) params.set("first_name", String(args.first_name));
    if (args.last_name) params.set("last_name", String(args.last_name));
    if (args.max_duration != null) params.set("max_duration", String(args.max_duration));
  } else {
    return null;
  }

  params.set("api_key", hunterApiKey);
  const res = await fetch(`https://api.hunter.io/v2${path}?${params.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      successful: false,
      data: null,
      error: data?.errors?.[0]?.details || data?.errors?.[0]?.id || data?.message || `Hunter API failed: ${res.status}`,
    };
  }

  return { successful: true, data, error: null };
}

async function executeComposioTool(entityId, toolSlug, args, apiKey) {
  const resolvedToolSlug = TOOL_SLUG_ALIASES[toolSlug] || toolSlug;
  const normalizedArgs = normalizeToolExecutionArgs(resolvedToolSlug, args);
  const toolkitSlug = TOOLKIT_BY_TOOL_SLUG.get(resolvedToolSlug);
  if (!toolkitSlug) {
    return { successful: false, data: null, error: `Unknown toolkit for tool ${toolSlug}` };
  }

  if (toolkitSlug === "hunter" && ["HUNTER_DOMAIN_SEARCH", "HUNTER_EMAIL_FINDER"].includes(resolvedToolSlug)) {
    try {
      const hunterResult = await executeHunterDirect(entityId, resolvedToolSlug, args, apiKey);
      if (hunterResult) return hunterResult;
    } catch (err) {
      return { successful: false, data: null, error: String(err.message || err) };
    }
  }

  let connectedAccountId;
  try {
    connectedAccountId = await resolveConnectedAccountId(entityId, toolkitSlug, apiKey);
  } catch (err) {
    return { successful: false, data: null, error: String(err.message || err) };
  }

  const executeOnce = async (accountId) => {
    let resp;
    try {
      resp = await fetch(`${COMPOSIO_V3}/tools/execute/${resolvedToolSlug}`, {
        method: "POST",
        headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          connected_account_id: accountId,
          user_id: entityId,
          arguments: normalizedArgs,
        }),
      });
    } catch (networkErr) {
      return { successful: false, data: null, error: String(networkErr.message) };
    }

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return {
        successful: false,
        data: null,
        error: `HTTP ${resp.status}: ${errText.slice(0, 200)}`,
      };
    }

    const result = await resp.json();
    return {
      successful: result.successful ?? true,
      data: result.data ?? result,
      error: result.error ?? result.data?.message ?? null,
    };
  };

  let payload = await executeOnce(connectedAccountId);
  const staleMsg = `${payload.error || ""} ${payload.data?.message || ""}`;
  const stale = /no connected account found with id|connected account .* not found|invalid connected.?account/i.test(staleMsg);
  if (stale) {
    CONNECTED_ACCOUNT_CACHE.delete(`${entityId}:${toolkitSlug}`);
    CONNECTED_ACCOUNT_DETAIL_CACHE.delete(connectedAccountId);
    try {
      connectedAccountId = await resolveConnectedAccountId(entityId, toolkitSlug, apiKey, {
        bypassCache: true,
        excludeIds: [connectedAccountId],
      });
      payload = await executeOnce(connectedAccountId);
    } catch (err) {
      return { successful: false, data: null, error: String(err.message || err) };
    }
  }

  if (isApolloSearchTool(resolvedToolSlug) && payload.data && typeof payload.data === "object") {
    payload.data = truncateApolloResultPayload(payload.data);
  }
  return payload;
}

function truncateApolloResultPayload(data) {
  if (!data || typeof data !== "object") return data;
  const next = { ...data };
  for (const key of ["people", "contacts", "matches", "accounts", "organizations"]) {
    if (Array.isArray(next[key])) next[key] = next[key].slice(0, APOLLO_MAX_RESULTS);
  }
  if (next.data && typeof next.data === "object") {
    next.data = truncateApolloResultPayload(next.data);
  }
  return next;
}

// ── Streaming tool-call accumulator ──────────────────────────────────────────

/**
 * Accumulates streamed tool_call delta chunks (by index) into complete tool calls.
 * Groq sends multiple delta chunks per tool call — each with partial function.arguments.
 */
function makeToolCallAccumulator() {
  const callsByIndex = {};

  return {
    update(deltaToolCalls) {
      if (!Array.isArray(deltaToolCalls)) return;
      for (const delta of deltaToolCalls) {
        const idx = delta.index ?? 0;
        if (!callsByIndex[idx]) {
          callsByIndex[idx] = {
            id: delta.id ?? `call_${idx}`,
            type: "function",
            function: { name: "", arguments: "" },
          };
        }
        const call = callsByIndex[idx];
        if (delta.id && !call.id.startsWith("call_")) call.id = delta.id;
        if (delta.function?.name) call.function.name += delta.function.name;
        if (delta.function?.arguments) call.function.arguments += delta.function.arguments;
      }
    },

    get() {
      return Object.values(callsByIndex);
    },

    clear() {
      for (const key of Object.keys(callsByIndex)) delete callsByIndex[key];
    },
  };
}

// ── Main agentic loop ─────────────────────────────────────────────────────────

/**
 * Run the multi-round Groq → tool_calls → execute → Groq loop.
 *
 * Streams SSE events directly to `res`. Caller must NOT write [DONE] — this
 * function returns the accumulated full text for downstream processing.
 *
 * @param {{
 *   groqClient: object,
 *   model: string,
 *   messages: Array,
 *   tools: Array,
 *   res: import('express').Response,
 *   entityId?: string,
 *   composioApiKey?: string|null,
 *   reasoningFormat?: 'parsed'|'hidden'|undefined,
 *   reasoningEffort?: 'default'|'turbo'|'none'|undefined,
 *   maxTokens?: number,
 *   temperature?: number,
 *   maxRounds?: number,
 * }} options
 * @returns {Promise<{fullText: string, toolExecutions: Array}>} accumulated prose text and executed tool metadata
 */
async function runAgenticLoop({
  groqClient,
  model,
  messages,
  tools = [],
  res,
  entityId,
  taskType = null,
  composioApiKey = null,
  reasoningFormat,
  reasoningEffort,
  maxTokens = 8192,
  temperature = 0.4,
  maxRounds = 6,
}) {
  let currentMessages = [...messages];
  let fullText = "";
  const toolExecutions = [];
  let round = 0;

  while (round < maxRounds) {
    round++;

    const requestParams = {
      model,
      messages: currentMessages,
      stream: true,
      max_tokens: maxTokens,
      temperature,
    };

    // Only send tools array when we have tools AND a key to execute them
    if (tools.length > 0 && composioApiKey) {
      requestParams.tools = tools;
      requestParams.tool_choice = "auto";
    }

    // Extended thinking / reasoning support
    if (model.includes("claude")) {
      // Claude: enable extended thinking
      const budgetTokens = reasoningEffort === 'high' ? 10000 : (reasoningEffort === 'medium' ? 5000 : 1000);
      requestParams.thinking = {
        type: 'enabled',
        budget_tokens: budgetTokens
      };
    } else {
      // Other providers: Groq/OpenAI reasoning models
      const isReasoningModel =
        model.includes("qwen-qwq") || model.includes("deepseek-r1");
      if (isReasoningModel) {
        if (reasoningFormat) requestParams.reasoning_format = reasoningFormat;
        if (reasoningEffort) requestParams.reasoning_effort = reasoningEffort;
      }
    }

    const stream = await groqClient.chat.completions.create(requestParams);
    const accumulator = makeToolCallAccumulator();
    let roundText = "";
    let finishReason = null;

    for await (const chunk of stream) {
      const choice = chunk.choices?.[0];
      if (!choice) continue;

      if (choice.finish_reason) finishReason = choice.finish_reason;
      const delta = choice.delta ?? {};

      // Reasoning token (streaming reasoning_format=parsed only)
      if (delta.reasoning) {
        res.write(`data: ${JSON.stringify({ thinking: delta.reasoning })}\n\n`);
      }

      // Regular prose token
      if (delta.content) {
        roundText += delta.content;
        fullText += delta.content;
        res.write(`data: ${JSON.stringify({ text: delta.content })}\n\n`);
      }

      // Accumulate tool call chunks
      if (delta.tool_calls) {
        accumulator.update(delta.tool_calls);
      }
    }

    const toolCalls = accumulator.get();

    // Exit loop if no tool calls or no key to execute
    if (finishReason !== "tool_calls" || toolCalls.length === 0 || !composioApiKey) {
      break;
    }

    // Append assistant turn with tool calls to conversation history
    currentMessages.push({
      role: "assistant",
      content: roundText || null,
      tool_calls: toolCalls,
    });

    // Execute each tool call via Composio
    for (const call of toolCalls) {
      const toolName = call.function.name;
      let toolArgs = {};
      try {
        toolArgs = JSON.parse(call.function.arguments || "{}");
      } catch {
        // malformed JSON — proceed with empty args
      }
      toolArgs = stripNullishValues(toolArgs) ?? {};
      toolArgs = normalizeToolExecutionArgs(toolName, toolArgs, taskType) ?? {};

      // Emit tool_call event → frontend shows chip
      res.write(
        `data: ${JSON.stringify({
          tool_call: { id: call.id, name: TOOL_SLUG_ALIASES[toolName] || toolName, args: toolArgs },
        })}\n\n`
      );

      // Execute
      const result = await executeComposioTool(
        entityId,
        toolName,
        toolArgs,
        composioApiKey
      );
      toolExecutions.push({
        id: call.id,
        requestedToolName: toolName,
        emittedToolName: TOOL_SLUG_ALIASES[toolName] || toolName,
        args: toolArgs,
        successful: result.successful,
        data: result.data,
        error: result.error,
      });

      // Build a short preview for the UI chip
      let preview = null;
      if (result.data != null) {
        preview =
          typeof result.data === "string"
            ? result.data.slice(0, 300)
            : JSON.stringify(result.data).slice(0, 300);
      }

      res.write(
        `data: ${JSON.stringify({
          tool_result: {
            id: call.id,
            name: toolName,
            successful: result.successful,
            preview,
            error: result.error,
          },
        })}\n\n`
      );

      // Append tool result for next round
      currentMessages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result.successful
          ? typeof result.data === "string"
            ? result.data
            : JSON.stringify(result.data)
          : `Error: ${result.error}`,
      });
    }

    // Continue → agent sees tool results and generates final prose
  }

  return { fullText, toolExecutions };
}

export { getComposioTools, executeComposioTool, runAgenticLoop };
