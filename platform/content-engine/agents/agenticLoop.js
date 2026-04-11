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
const TOOLKIT_ALLOWED_TOOL_SLUGS = {
  semrush: new Set([
    "SEMRUSH_DOMAIN_ORGANIC_SEARCH_KEYWORDS",
    "SEMRUSH_DOMAIN_ORGANIC_SEARCH_PAGES",
    "SEMRUSH_DOMAIN_ORGANIC_SEARCH_COMPETITORS",
    "SEMRUSH_DOMAIN_VS_DOMAIN",
    "SEMRUSH_KEYWORD_OVERVIEW",
    "SEMRUSH_KEYWORD_OVERVIEW_ALL_DATABASES",
    "SEMRUSH_KEYWORD_BY_INTENT",
    "SEMRUSH_KEYWORD_PHRASE_THIS",
    "SEMRUSH_KEYWORD_RELATED",
    "SEMRUSH_KEYWORD_DIFFICULTY",
    "SEMRUSH_KEYWORD_MAGIC",
    "SEMRUSH_KEYWORD_GAP",
    "SEMRUSH_BULK_TRAFFIC_ANALYSIS",
    "SEMRUSH_TRAFFIC_ANALYTICS_OVERVIEW",
    "SEMRUSH_TRAFFIC_ANALYTICS_TOP_PAGES",
    "SEMRUSH_TRAFFIC_ANALYTICS_SUBFOLDERS",
    "SEMRUSH_TRAFFIC_ANALYTICS_SUBDOMAINS",
    "SEMRUSH_ORGANIC_RESULTS",
  ]),
  ahrefs: new Set([
    "AHREFS_EXPLORE_KEYWORDS_OVERVIEW",
    "AHREFS_EXPLORE_KEYWORD_VOLUME_BY_COUNTRY",
    "AHREFS_EXPLORE_MATCHING_TERMS_FOR_KEYWORDS",
    "AHREFS_FETCH_COMPETITORS_OVERVIEW",
    "AHREFS_GET_SERP_OVERVIEW",
    "AHREFS_PAGES_BY_TRAFFIC_OVERVIEW",
    "AHREFS_RETRIEVE_ORGANIC_COMPETITORS",
    "AHREFS_RETRIEVE_ORGANIC_KEYWORDS",
    "AHREFS_RETRIEVE_RELATED_TERMS",
    "AHREFS_RETRIEVE_SITE_EXPLORER_KEYWORDS_HISTORY",
    "AHREFS_RETRIEVE_SITE_EXPLORER_METRICS",
    "AHREFS_RETRIEVE_SITE_EXPLORER_METRICS_HISTORY",
    "AHREFS_RETRIEVE_SITE_EXPLORER_PAGES_HISTORY",
    "AHREFS_RETRIEVE_TOP_PAGES_FROM_SITE_EXPLORER",
    "AHREFS_RETRIEVE_VOLUME_HISTORY",
    "AHREFS_SEARCH_SUGGESTIONS_EXPLORER",
  ]),
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
    "LINKEDIN_CREATE_LINKED_IN_POST",
    "LINKEDIN_GET_COMPANY_INFO",
    "LINKEDIN_GET_MY_INFO",
    "LINKEDIN_GET_NETWORK_SIZE",
    "LINKEDIN_GET_ORG_PAGE_STATS",
    "LINKEDIN_GET_POST_CONTENT",
    "LINKEDIN_GET_SHARE_STATS",
    "LINKEDIN_INITIALIZE_IMAGE_UPLOAD",
    "LINKEDIN_LIST_REACTIONS",
    "LINKEDIN_REGISTER_IMAGE_UPLOAD",
  ]),
  gmail: new Set([
    "GMAIL_CREATE_EMAIL_DRAFT",
    "GMAIL_GET_CONTACTS",
    "GMAIL_GET_PROFILE",
    "GMAIL_LIST_DRAFTS",
    "GMAIL_SEARCH_PEOPLE",
    "GMAIL_SEND_DRAFT",
    "GMAIL_SEND_EMAIL",
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
  googledrive: new Set([
    "GOOGLEDRIVE_CREATE_FILE",
    "GOOGLEDRIVE_CREATE_FILE_FROM_TEXT",
    "GOOGLEDRIVE_CREATE_FOLDER",
    "GOOGLEDRIVE_CREATE_PERMISSION",
    "GOOGLEDRIVE_DOWNLOAD_FILE",
    "GOOGLEDRIVE_EXPORT_GOOGLE_WORKSPACE_FILE",
    "GOOGLEDRIVE_FIND_FILE",
    "GOOGLEDRIVE_FIND_FOLDER",
    "GOOGLEDRIVE_GET_FILE_METADATA",
    "GOOGLEDRIVE_GET_PERMISSION_ID_FOR_EMAIL",
    "GOOGLEDRIVE_LIST_FILES",
    "GOOGLEDRIVE_UPLOAD_FILE",
    "GOOGLEDRIVE_UPLOAD_FROM_URL",
  ]),
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
  zoho: new Set([
    "ZOHO_GET_MODULE_FIELDS",
    "ZOHO_GET_RELATED_LISTS",
    "ZOHO_GET_ZOHO_RECORDS",
    "ZOHO_GET_ZOHO_USERS",
    "ZOHO_LIST_MODULES",
    "ZOHO_SEARCH_ZOHO_RECORDS",
  ]),
  klaviyo: new Set([
    "KLAVIYO_ADD_PROFILE_TO_LIST",
    "KLAVIYO_CREATE_CAMPAIGN",
    "KLAVIYO_CREATE_CAMPAIGN_SEND_JOB",
    "KLAVIYO_CREATE_LIST",
    "KLAVIYO_CREATE_OR_UPDATE_CLIENT_PROFILE",
    "KLAVIYO_CREATE_OR_UPDATE_PROFILE",
    "KLAVIYO_CREATE_PROFILE",
    "KLAVIYO_CREATE_SEGMENT",
    "KLAVIYO_CREATE_TEMPLATE",
    "KLAVIYO_GET_CAMPAIGN",
    "KLAVIYO_GET_CAMPAIGNS",
    "KLAVIYO_GET_FLOW",
    "KLAVIYO_GET_FLOWS",
    "KLAVIYO_GET_LIST",
    "KLAVIYO_GET_LISTS",
    "KLAVIYO_GET_LIST_PROFILES",
    "KLAVIYO_GET_METRIC",
    "KLAVIYO_GET_METRICS",
    "KLAVIYO_GET_PROFILE",
    "KLAVIYO_GET_PROFILES",
    "KLAVIYO_GET_PROFILE_SEGMENTS",
    "KLAVIYO_GET_SEGMENT",
    "KLAVIYO_GET_SEGMENTS",
    "KLAVIYO_QUERY_FLOW_SERIES",
    "KLAVIYO_QUERY_FLOW_VALUES",
    "KLAVIYO_QUERY_METRIC_AGGREGATES",
    "KLAVIYO_SUBSCRIBE_PROFILES",
    "KLAVIYO_UNSUBSCRIBE_PROFILES",
    "KLAVIYO_UNSUBSCRIBE_PROFILES_BULK",
    "KLAVIYO_UPDATE_CAMPAIGN",
    "KLAVIYO_UPDATE_FLOW_STATUS",
    "KLAVIYO_UPDATE_PROFILE",
  ]),
  mailchimp: new Set([
    "MAILCHIMP_ADD_SUBSCRIBER_TO_WORKFLOW_EMAIL",
    "MAILCHIMP_BATCH_ADD_OR_REMOVE_MEMBERS",
    "MAILCHIMP_BATCH_SUBSCRIBE_OR_UNSUBSCRIBE",
    "MAILCHIMP_CANCEL_CAMPAIGN",
    "MAILCHIMP_CREATE_A_SURVEY_CAMPAIGN",
    "MAILCHIMP_CUSTOMER_JOURNEYS_API_TRIGGER_FOR_A_CONTACT",
    "MAILCHIMP_GET_SUBSCRIBER_EMAIL_ACTIVITY",
    "MAILCHIMP_GET_WORKFLOW_EMAIL_INFO",
    "MAILCHIMP_LIST_AUTOMATED_EMAILS",
    "MAILCHIMP_LIST_AUTOMATED_EMAIL_SUBSCRIBERS",
    "MAILCHIMP_LIST_AUTOMATIONS",
    "MAILCHIMP_LIST_CAMPAIGN_REPORTS",
    "MAILCHIMP_LIST_CAMPAIGNS",
    "MAILCHIMP_LIST_EMAIL_ACTIVITY",
    "MAILCHIMP_LIST_GROWTH_HISTORY_DATA",
    "MAILCHIMP_LIST_MEMBERS_INFO",
    "MAILCHIMP_LIST_MEMBERS_IN_SEGMENT",
    "MAILCHIMP_LIST_MEMBER_EVENTS",
    "MAILCHIMP_LIST_MEMBER_GOAL_EVENTS",
    "MAILCHIMP_LIST_SEGMENTS",
    "MAILCHIMP_LIST_SUBSCRIBERS_REMOVED_FROM_WORKFLOW",
    "MAILCHIMP_LIST_UNSUBSCRIBED_MEMBERS",
    "MAILCHIMP_PAUSE_AUTOMATED_EMAIL",
    "MAILCHIMP_PAUSE_AUTOMATION_EMAILS",
    "MAILCHIMP_REMOVE_SUBSCRIBER_FROM_WORKFLOW",
    "MAILCHIMP_SCHEDULE_CAMPAIGN",
    "MAILCHIMP_SEARCH_CAMPAIGNS",
    "MAILCHIMP_SEARCH_MEMBERS",
    "MAILCHIMP_SEND_CAMPAIGN",
    "MAILCHIMP_SEND_TEST_EMAIL",
    "MAILCHIMP_SET_CAMPAIGN_CONTENT",
    "MAILCHIMP_START_AUTOMATED_EMAIL",
    "MAILCHIMP_START_AUTOMATION_EMAILS",
    "MAILCHIMP_UNSCHEDULE_CAMPAIGN",
    "MAILCHIMP_UPDATE_AUDIENCES_CONTACTS",
    "MAILCHIMP_UPDATE_CAMPAIGN_SETTINGS",
    "MAILCHIMP_UPDATE_LIST_MEMBER",
    "MAILCHIMP_UPDATE_LISTS_SEGMENTS",
  ]),
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
  googlesheets: new Set([
    "GOOGLESHEETS_BATCH_GET",
    "GOOGLESHEETS_EXECUTE_SQL",
    "GOOGLESHEETS_GET_SPREADSHEET_INFO",
    "GOOGLESHEETS_GET_TABLE_SCHEMA",
    "GOOGLESHEETS_LIST_TABLES",
    "GOOGLESHEETS_LOOKUP_SPREADSHEET_ROW",
    "GOOGLESHEETS_QUERY_TABLE",
    "GOOGLESHEETS_SEARCH_SPREADSHEETS",
    "GOOGLESHEETS_VALUES_GET",
  ]),
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
    "REDDIT_GET_R_TOP",
    "REDDIT_GET_SUBREDDIT_RULES",
    "REDDIT_GET_SUBREDDITS_SEARCH",
    "REDDIT_LIST_SUBREDDIT_POST_FLAIRS",
    "REDDIT_POST_REDDIT_COMMENT",
    "REDDIT_RETRIEVE_POST_COMMENTS",
    "REDDIT_RETRIEVE_REDDIT_POST",
    "REDDIT_SEARCH_ACROSS_SUBREDDITS",
    "REDDIT_TOGGLE_INBOX_REPLIES",
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

function normalizeToolExecutionArgs(toolSlug, args, taskType = null) {
  if (!args || typeof args !== "object" || Array.isArray(args)) return args;

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
async function getComposioTools(entityId, apiKey, { toolkits = [], limit = 20 } = {}) {
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
async function resolveConnectedAccountId(entityId, toolkitSlug, apiKey) {
  const cacheKey = `${entityId}:${toolkitSlug}`;
  if (CONNECTED_ACCOUNT_CACHE.has(cacheKey)) return CONNECTED_ACCOUNT_CACHE.get(cacheKey);

  const res = await fetch(
    `${COMPOSIO_V3}/connected_accounts?user_id=${encodeURIComponent(entityId)}&toolkit_slug=${encodeURIComponent(toolkitSlug)}&limit=10`,
    { headers: { "x-api-key": apiKey } }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Connected account lookup failed for ${toolkitSlug}: ${res.status} ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const account = (data.items || []).find((item) => {
    const slug = normalizeAppSlug(item.toolkit?.slug || item.toolkit_slug);
    return accountMatchesEntity(item, entityId) && slug === toolkitSlug && item.status === "ACTIVE";
  });

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

  let resp;
  try {
    resp = await fetch(`${COMPOSIO_V3}/tools/execute/${resolvedToolSlug}`, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ connected_account_id: connectedAccountId, arguments: normalizedArgs }),
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
