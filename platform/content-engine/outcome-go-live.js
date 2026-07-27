/**
 * Outcome Go Live — user-click only.
 * Maps outcome kind → Composio tool + args. Never auto-publishes; callers
 * invoke this from OutcomeGoLiveCta after the user clicks.
 */

import {
  executeComposioActionForEntities,
  getConnectors,
} from "./mcp-router.js";
import {
  getPreferredWebflowSiteId,
  getPreferredWebflowBlogCollectionId,
  getPreferredWebflowLandingCollectionId,
  getPreferredMailchimpListId,
} from "./connector-preferences.js";

const KIND_CONNECTORS = {
  email: ["gmail", "instantly"],
  whatsapp: ["whatsapp"],
  linkedin: ["linkedin"],
  instagram: ["instagram"],
  facebook: ["facebook"],
  twitter: ["twitter"],
  social: ["linkedin", "instagram", "facebook", "twitter"],
  newsletter: ["mailchimp", "klaviyo", "gmail"],
  blog: ["webflow", "wordpress", "google_docs"],
  landing_page: ["webflow", "wordpress"],
  paid_ads: ["meta_ads", "google_ads", "linkedin_ads"],
  voicebot: [],
  /** Push scored voicebot call → HubSpot or Zoho CRM */
  crm_push: ["hubspot", "zoho_crm"],
  /** Create follow-up task on CRM contact */
  crm_task: ["hubspot", "zoho_crm"],
  /** Append / upsert rows into Google Sheets */
  sheets_push: ["google_sheets"],
  /** Save report / asset text file into Google Drive */
  drive_save: ["google_drive"],
  /** Create a shareable Google Drive link */
  drive_share: ["google_drive"],
};

function asString(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function pickPayloadText(payload = {}) {
  const post = asString(payload.post);
  const body = asString(payload.body);
  const html = asString(payload.html);
  const commentary = asString(payload.commentary);
  const text = asString(payload.text);
  const message = asString(payload.message);
  return post || body || commentary || text || message || html || "";
}

function articleMarkdown(payload = {}) {
  const title = asString(payload.title, "Untitled");
  const meta = asString(payload.meta_description || payload.excerpt);
  const sections = Array.isArray(payload.sections) ? payload.sections : [];
  const html = asString(payload.html);
  if (html) {
    return { title, contentHtml: html, markdown: html };
  }
  const parts = [`# ${title}`, meta ? `\n>${meta}\n` : ""];
  for (const s of sections) {
    if (!s || typeof s !== "object") continue;
    const heading = asString(s.heading || s.title);
    const content = asString(s.content || s.body || s.copy);
    if (heading) parts.push(`\n## ${heading}\n`);
    if (content) parts.push(`\n${content}\n`);
  }
  const pageStructure = Array.isArray(payload.page_structure) ? payload.page_structure : [];
  for (const s of pageStructure) {
    if (!s || typeof s !== "object") continue;
    const heading = asString(s.heading || s.title || s.label);
    const content = asString(s.content || s.copy || s.body);
    const cta = asString(s.cta);
    if (heading) parts.push(`\n## ${heading}\n`);
    if (content) parts.push(`\n${content}\n`);
    if (cta) parts.push(`\n**CTA:** ${cta}\n`);
  }
  const markdown = parts.filter(Boolean).join("\n").trim() || pickPayloadText(payload);
  const contentHtml = markdown
    .split(/\n{2,}/)
    .map((block) => {
      const t = block.trim();
      if (t.startsWith("## ")) return `<h2>${escapeHtml(t.slice(3))}</h2>`;
      if (t.startsWith("# ")) return `<h1>${escapeHtml(t.slice(2))}</h1>`;
      return `<p>${escapeHtml(t).replace(/\n/g, "<br/>")}</p>`;
    })
    .join("\n");
  return { title, contentHtml, markdown };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function extractUrl(result) {
  const r = result?.result || result?.data || result || {};
  return (
    r.url ||
    r.link ||
    r.permalink ||
    r.webViewLink ||
    r.documentUrl ||
    r.post_url ||
    r.shareUrl ||
    r.publishedPath ||
    r.publishedUrl ||
    r.cmsLocaleId ||
    (r.id && String(r.id).includes("http") ? r.id : null) ||
    (r.document_id || r.documentId || r.id
      ? `https://docs.google.com/document/d/${r.document_id || r.documentId || r.id}/edit`
      : null) ||
    null
  );
}

function extractList(payload, ...keys) {
  for (const key of keys) {
    const v = payload?.[key];
    if (Array.isArray(v)) return v;
    if (Array.isArray(v?.items)) return v.items;
    if (Array.isArray(v?.sites)) return v.sites;
    if (Array.isArray(v?.collections)) return v.collections;
  }
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function collectionScore(name, kind) {
  const n = String(name || "").toLowerCase();
  if (kind === "landing_page") {
    if (/landing|lp\b|squeeze|sales.?page|marketing.?page/.test(n)) return 100;
    if (/page/.test(n) && !/blog|post|article|news/.test(n)) return 70;
    if (/blog|post|article/.test(n)) return 20;
    return 10;
  }
  if (/blog|post|article|news|insight|story/.test(n)) return 100;
  if (/content/.test(n)) return 50;
  return 10;
}

function pickCollection(collections, kind, preferredId) {
  const list = (collections || []).filter(Boolean);
  if (preferredId) {
    const hit = list.find((c) => String(c.id || c._id) === String(preferredId));
    if (hit) return hit;
  }
  return [...list].sort(
    (a, b) =>
      collectionScore(b.displayName || b.name || b.slug, kind) -
      collectionScore(a.displayName || a.name || a.slug, kind),
  )[0] || null;
}

function fieldSlug(field) {
  return String(field?.slug || field?.id || field?.name || "").trim();
}

function buildWebflowFieldData(fields, { title, slug, contentHtml, meta }) {
  const list = Array.isArray(fields) ? fields : [];
  const data = {};
  const used = new Set();

  const assign = (candidates, value) => {
    if (value == null || value === "") return;
    for (const cand of candidates) {
      const match = list.find((f) => {
        const s = fieldSlug(f).toLowerCase();
        const type = String(f?.type || f?.fieldType || "").toLowerCase();
        if (used.has(s)) return false;
        if (s === cand || s.includes(cand)) return true;
        if (cand === "name" && (type.includes("plain") || s === "name")) return true;
        return false;
      });
      if (match) {
        const key = fieldSlug(match);
        data[key] = value;
        used.add(key.toLowerCase());
        return true;
      }
    }
    return false;
  };

  assign(["name", "title", "headline"], title);
  assign(["slug", "post-slug", "url"], slug);
  assign(
    ["post-body", "body", "content", "main-content", "article-body", "rich-text", "post-content"],
    contentHtml,
  );
  assign(["summary", "excerpt", "meta-description", "seo-description", "description"], meta);

  // Webflow often requires `name` even when schema listing is incomplete
  if (!Object.keys(data).some((k) => k.toLowerCase() === "name")) {
    data.name = title;
  }
  if (slug && !Object.keys(data).some((k) => k.toLowerCase().includes("slug"))) {
    data.slug = slug;
  }

  return data;
}

async function resolveWebflowSiteAndCollection(payload, entityIds, kind) {
  const companyId = entityIds[0];
  const preferredSite =
    asString(payload.webflow_site_id || payload.site_id || payload.siteId) ||
    (companyId ? getPreferredWebflowSiteId(companyId) : null);
  const preferredCollection =
    asString(payload.webflow_collection_id || payload.collection_id || payload.collectionId) ||
    (companyId
      ? kind === "landing_page"
        ? getPreferredWebflowLandingCollectionId(companyId)
        : getPreferredWebflowBlogCollectionId(companyId)
      : null);

  const sitesRes = await runTool("WEBFLOW_LIST_WEBFLOW_SITES", {}, entityIds);
  if (!sitesRes.ok) return { ok: false, error: sitesRes.error || "Could not list Webflow sites", sitesRes };

  const sites = extractList(sitesRes.result, "sites", "data");
  let site =
    (preferredSite && sites.find((s) => String(s.id || s._id) === String(preferredSite))) ||
    sites[0] ||
    null;
  if (!site && preferredSite) {
    site = { id: preferredSite };
  }
  const siteId = site?.id || site?._id || preferredSite;
  if (!siteId) {
    return { ok: false, error: "No Webflow site found — connect Webflow and select a site in Settings" };
  }

  const colsRes = await runTool(
    "WEBFLOW_LIST_COLLECTIONS",
    { site_id: siteId, siteId },
    entityIds,
  );
  if (!colsRes.ok) {
    return { ok: false, error: colsRes.error || "Could not list Webflow collections", siteId };
  }
  const collections = extractList(colsRes.result, "collections", "data");
  const collection = pickCollection(collections, kind, preferredCollection);
  const collectionId = collection?.id || collection?._id || preferredCollection;
  if (!collectionId) {
    return {
      ok: false,
      error:
        kind === "landing_page"
          ? "No Webflow CMS collection found for landing pages — create a Landing Pages collection or set it in Settings"
          : "No Webflow CMS Blog/Posts collection found — create one or set it in Settings",
      siteId,
    };
  }

  const detail = await runTool(
    "WEBFLOW_GET_COLLECTION",
    { collection_id: collectionId, collectionId },
    entityIds,
  );
  const fields =
    detail.result?.fields ||
    detail.result?.data?.fields ||
    collection?.fields ||
    [];

  return {
    ok: true,
    siteId,
    collectionId,
    collectionName: collection?.displayName || collection?.name || null,
    fields,
    siteName: site?.displayName || site?.name || null,
  };
}

async function resolveWebflowPublicBase(siteId, entityIds) {
  if (!siteId) return null;
  const domainsRes = await runTool(
    "WEBFLOW_LIST_CUSTOM_DOMAINS",
    { site_id: siteId, siteId },
    entityIds,
  );
  let domains = extractList(domainsRes.result, "customDomains", "domains", "data");
  if (!domains.length && Array.isArray(domainsRes.result?.customDomains)) {
    domains = domainsRes.result.customDomains;
  }
  if (!domains.length && Array.isArray(domainsRes.result?.data?.customDomains)) {
    domains = domainsRes.result.data.customDomains;
  }
  const customHost = domains
    .map((d) => asString(d?.url || d?.name || d?.hostname || d?.domain))
    .map((h) => h.replace(/^https?:\/\//, "").replace(/\/$/, ""))
    .find(Boolean);
  if (customHost) return `https://${customHost}`;

  // Fallback: GET_CUSTOM_DOMAINS
  const alt = await runTool(
    "WEBFLOW_GET_CUSTOM_DOMAINS",
    { site_id: siteId, siteId },
    entityIds,
  );
  const altDomains = extractList(alt.result, "customDomains", "domains", "data");
  const altHost = altDomains
    .map((d) => asString(d?.url || d?.name || d?.hostname || d?.domain))
    .map((h) => h.replace(/^https?:\/\//, "").replace(/\/$/, ""))
    .find(Boolean);
  if (altHost) return `https://${altHost}`;

  const siteRes = await runTool(
    "WEBFLOW_GET_SITE_INFO",
    { site_id: siteId, siteId },
    entityIds,
  );
  const site = siteRes.result?.site || siteRes.result?.data || siteRes.result || {};
  const shortName = asString(site.shortName || site.short_name);
  if (shortName) return `https://${shortName}.webflow.io`;
  const preview = asString(site.previewUrl || site.preview_url || site.defaultDomain);
  if (preview) return preview.replace(/\/$/, "").replace(/^(?!https?:\/\/)/, "https://");
  return null;
}

async function maybeUploadWebflowAsset(payload, siteId, entityIds) {
  const imageUrl =
    asString(payload.image_url) ||
    asString(payload.hero_image_url) ||
    asString(payload.cover_image) ||
    asString(payload.og_image);
  if (!imageUrl || !siteId) return null;

  let uploaded = await runTool(
    "WEBFLOW_UPLOAD_ASSET",
    {
      site_id: siteId,
      siteId,
      fileUrl: imageUrl,
      file_url: imageUrl,
      url: imageUrl,
      fileName: asString(payload.image_filename, `marqq-${Date.now()}.jpg`),
      file_name: asString(payload.image_filename, `marqq-${Date.now()}.jpg`),
    },
    entityIds,
  );
  if (!uploaded.ok) {
    uploaded = await runTool(
      "WEBFLOW_CREATE_ASSET",
      {
        site_id: siteId,
        siteId,
        fileUrl: imageUrl,
        file_url: imageUrl,
        url: imageUrl,
        fileName: asString(payload.image_filename, `marqq-${Date.now()}.jpg`),
      },
      entityIds,
    );
  }
  if (!uploaded.ok) return null;
  return (
    uploaded.result?.id ||
    uploaded.result?.assetId ||
    uploaded.result?.data?.id ||
    uploaded.result?._id ||
    null
  );
}

async function goLiveWebflow(payload, entityIds, kind = "blog") {
  const { title, contentHtml, markdown } = articleMarkdown(payload);
  const slug = asString(payload.slug) || slugify(title) || `draft-${Date.now()}`;
  const html = contentHtml || markdown;
  if (!html) return { ok: false, error: "Article HTML/content is empty" };

  const resolved = await resolveWebflowSiteAndCollection(payload, entityIds, kind);
  if (!resolved.ok) return resolved;

  const assetId = await maybeUploadWebflowAsset(payload, resolved.siteId, entityIds);
  const fieldData = buildWebflowFieldData(resolved.fields, {
    title: title || (kind === "landing_page" ? "Landing page" : "Untitled"),
    slug,
    contentHtml: html,
    meta: asString(payload.meta_description || payload.excerpt),
  });
  if (assetId) {
    assignOnto(fieldData, ["main-image", "thumbnail", "cover-image", "hero-image", "image", "og-image"], assetId);
  }

  const livePreferred = payload.publish_live !== false && payload.draft !== true;
  const existingItemId = asString(payload.webflow_item_id || payload.item_id || payload.itemId);
  const createArgs = {
    collection_id: resolved.collectionId,
    collectionId: resolved.collectionId,
    fieldData,
    field_data: fieldData,
    isArchived: false,
    isDraft: !livePreferred,
  };

  let created;
  if (existingItemId) {
    const updateArgs = {
      ...createArgs,
      item_id: existingItemId,
      itemId: existingItemId,
      id: existingItemId,
    };
    created = livePreferred
      ? await runTool("WEBFLOW_UPDATE_LIVE_COLLECTION_ITEM", updateArgs, entityIds)
      : await runTool("WEBFLOW_UPDATE_COLLECTION_ITEM_V2", updateArgs, entityIds);
    if (!created.ok) {
      created = await runTool("WEBFLOW_UPDATE_COLLECTION_ITEM_V2", updateArgs, entityIds);
    }
    if (created.ok) {
      created = {
        ...created,
        result: { ...(created.result || {}), id: existingItemId },
      };
    }
  } else {
    created = livePreferred
      ? await runTool("WEBFLOW_CREATE_LIVE_COLLECTION_ITEM", createArgs, entityIds)
      : await runTool("WEBFLOW_CREATE_COLLECTION_ITEM", createArgs, entityIds);

    if (!created.ok && livePreferred) {
      created = await runTool(
        "WEBFLOW_CREATE_COLLECTION_ITEM",
        { ...createArgs, isDraft: false },
        entityIds,
      );
    }
  }
  if (!created.ok) return created;

  const itemId =
    existingItemId ||
    created.result?.id ||
    created.result?.itemId ||
    created.result?.data?.id ||
    created.result?._id ||
    null;

  let publishItems = null;
  let publishSite = null;
  if (itemId && livePreferred) {
    publishItems = await runTool(
      "WEBFLOW_PUBLISH_COLLECTION_ITEMS",
      {
        collection_id: resolved.collectionId,
        collectionId: resolved.collectionId,
        itemIds: [itemId],
        item_ids: [itemId],
      },
      entityIds,
    );
    publishSite = await runTool(
      "WEBFLOW_PUBLISH_SITE",
      {
        site_id: resolved.siteId,
        siteId: resolved.siteId,
        domains: [],
      },
      entityIds,
    );
  }

  const publicBase = await resolveWebflowPublicBase(resolved.siteId, entityIds);
  const publicUrl = publicBase && slug ? `${publicBase}/${slug}` : null;
  const cmsUrl =
    itemId && resolved.siteId
      ? `https://webflow.com/dashboard/sites/${resolved.siteId}/cms/${resolved.collectionId}/${itemId}`
      : `https://webflow.com/dashboard/sites/${resolved.siteId}/cms`;

  return {
    ok: true,
    tool: created.tool,
    url: publicUrl || extractUrl(created) || cmsUrl,
    result: {
      ...(created.result || {}),
      site_id: resolved.siteId,
      collection_id: resolved.collectionId,
      collection_name: resolved.collectionName,
      item_id: itemId,
      asset_id: assetId,
      field_data_keys: Object.keys(fieldData),
      published_items: publishItems?.ok !== false,
      published_site: publishSite?.ok === true,
      public_url: publicUrl,
      cms_url: cmsUrl,
    },
  };
}

function assignOnto(data, keys, value) {
  if (value == null || value === "") return;
  for (const key of keys) {
    if (Object.keys(data).some((k) => k.toLowerCase() === key.toLowerCase())) {
      const existing = Object.keys(data).find((k) => k.toLowerCase() === key.toLowerCase());
      if (existing) data[existing] = value;
      return;
    }
  }
  data[keys[0]] = value;
}

async function goLiveBlog(payload, entityIds, connected, preferredConnector) {
  const order = [];
  if (preferredConnector) order.push(preferredConnector);
  for (const id of ["webflow", "wordpress", "google_docs"]) {
    if (!order.includes(id)) order.push(id);
  }

  for (const id of order) {
    if (!connected.has(id)) continue;
    if (id === "webflow") {
      const res = await goLiveWebflow(payload, entityIds, "blog");
      if (res.ok) return { ...res, connector: "webflow" };
      // fall through to next if Webflow site/collection not configured
      if (!/collection|site/i.test(String(res.error || ""))) return res;
      continue;
    }
    if (id === "wordpress") {
      const { title, contentHtml, markdown } = articleMarkdown(payload);
      return {
        ...(await runTool(
          "WORDPRESS_CREATE_POST",
          {
            title,
            content: contentHtml || markdown,
            status: "publish",
            excerpt: asString(payload.meta_description || payload.excerpt),
            slug: asString(payload.slug),
          },
          entityIds,
        )),
        connector: "wordpress",
      };
    }
    if (id === "google_docs") {
      const { title, markdown } = articleMarkdown(payload);
      return {
        ...(await runTool(
          "GOOGLEDOCS_CREATE_DOCUMENT_MARKDOWN",
          {
            title,
            markdown_text: markdown,
            content: markdown,
          },
          entityIds,
        )),
        connector: "google_docs",
      };
    }
  }
  return { ok: false, error: "Connect Webflow, WordPress, or Google Docs first" };
}

async function goLiveLanding(payload, entityIds, connected, preferredConnector) {
  const order = [];
  if (preferredConnector) order.push(preferredConnector);
  for (const id of ["webflow", "wordpress"]) {
    if (!order.includes(id)) order.push(id);
  }

  for (const id of order) {
    if (!connected.has(id)) continue;
    if (id === "webflow") {
      const res = await goLiveWebflow(payload, entityIds, "landing_page");
      if (res.ok) return { ...res, connector: "webflow" };
      if (!/collection|site/i.test(String(res.error || ""))) return res;
      continue;
    }
    if (id === "wordpress") {
      const { title, contentHtml, markdown } = articleMarkdown(payload);
      return {
        ...(await runTool(
          "WORDPRESS_CREATE_POST",
          {
            title: title || "Landing page",
            content: contentHtml || markdown,
            status: "publish",
            slug: asString(payload.slug),
          },
          entityIds,
        )),
        connector: "wordpress",
      };
    }
  }
  return { ok: false, error: "Connect Webflow or WordPress first" };
}

async function connectedSet(entityId) {
  const list = await getConnectors(entityId);
  return new Set(
    (list || [])
      .filter((c) => c?.connected || c?.status === "active")
      .map((c) => c.id)
  );
}

function chooseConnector(kind, connected, preferred) {
  const candidates = KIND_CONNECTORS[kind] || [];
  if (preferred && candidates.includes(preferred) && connected.has(preferred)) {
    return preferred;
  }
  return candidates.find((id) => connected.has(id)) || null;
}

function preferredPaidConnectorFromPayload(payload = {}, preferred) {
  if (preferred) return preferred;
  const channel = asString(payload.channel || payload.paid_channel || payload.platform).toLowerCase();
  if (["facebook", "instagram", "facebook_instagram", "meta", "fb+insta", "fb_instagram"].includes(channel)) {
    return "meta_ads";
  }
  if (channel === "google" || channel === "google_ads") return "google_ads";
  if (channel === "linkedin" || channel === "linkedin_ads") return "linkedin_ads";
  return null;
}

async function runTool(slug, args, entityIds) {
  const result = await executeComposioActionForEntities(slug, args, entityIds);
  if (result?.error) {
    return { ok: false, error: result.error, tool: slug, raw: result };
  }
  return {
    ok: true,
    tool: slug,
    url: extractUrl(result),
    result: result?.result || result?.data || result,
  };
}

async function goLiveLinkedIn(payload, entityIds) {
  const text = pickPayloadText(payload);
  if (!text) return { ok: false, error: "Post text is empty" };
  const hashtags = Array.isArray(payload.hashtags)
    ? payload.hashtags.map((h) => String(h).replace(/^#/, "")).filter(Boolean)
    : [];
  const cta = asString(payload.cta);
  const full = [text, hashtags.length ? hashtags.map((h) => `#${h}`).join(" ") : "", cta]
    .filter(Boolean)
    .join("\n\n");

  // Prefer allowlisted slug; fall back to text-post alias used by CrewAI Zara.
  let res = await runTool(
    "LINKEDIN_CREATE_LINKED_IN_POST",
    { commentary: full, text: full, visibility: "PUBLIC" },
    entityIds
  );
  if (!res.ok) {
    res = await runTool(
      "LINKEDIN_CREATE_TEXT_POST",
      { text: full, visibility: "PUBLIC" },
      entityIds
    );
  }
  return res;
}

async function goLiveFacebook(payload, entityIds) {
  const message = pickPayloadText(payload);
  if (!message) return { ok: false, error: "Post text is empty" };
  const hashtags = Array.isArray(payload.hashtags)
    ? payload.hashtags.map((h) => `#${String(h).replace(/^#/, "")}`).join(" ")
    : "";
  const full = [message, hashtags, asString(payload.cta)].filter(Boolean).join("\n\n");
  const imageUrl =
    asString(payload.image_url) ||
    asString(payload.cdn_url) ||
    asString(payload.media_url) ||
    asString(payload.image);

  if (imageUrl) {
    const photo = await runTool(
      "FACEBOOK_CREATE_PHOTO_POST",
      { message: full, url: imageUrl, image_url: imageUrl, caption: full },
      entityIds
    );
    if (photo.ok) return photo;
    const photoAlt = await runTool(
      "FACEBOOK_CREATE_POST",
      { message: full, message_text: full, url: imageUrl, link: imageUrl, image_url: imageUrl },
      entityIds
    );
    if (photoAlt.ok) return photoAlt;
  }

  return runTool("FACEBOOK_CREATE_POST", { message: full, message_text: full }, entityIds);
}

async function goLiveTwitter(payload, entityIds) {
  const text = pickPayloadText(payload);
  if (!text) return { ok: false, error: "Post text is empty" };
  const hashtags = Array.isArray(payload.hashtags)
    ? payload.hashtags.map((h) => `#${String(h).replace(/^#/, "")}`).join(" ")
    : "";
  const full = [text, hashtags, asString(payload.cta)].filter(Boolean).join("\n\n").slice(0, 280);
  const imageUrl =
    asString(payload.image_url) ||
    asString(payload.cdn_url) ||
    asString(payload.media_url) ||
    asString(payload.image);

  const args = { text: full, tweet_text: full, status: full };
  if (imageUrl) {
    args.media_url = imageUrl;
    args.image_url = imageUrl;
  }

  let res = await runTool("TWITTER_CREATION_OF_A_POST", args, entityIds);
  if (!res.ok) res = await runTool("TWITTER_CREATE_TWEET", args, entityIds);
  if (!res.ok) res = await runTool("X_CREATE_TWEET", args, entityIds);
  return res;
}

async function goLiveInstagram(payload, entityIds) {
  const caption = pickPayloadText(payload);
  const imageUrl =
    asString(payload.image_url) ||
    asString(payload.cdn_url) ||
    asString(payload.media_url) ||
    asString(payload.image);
  if (!imageUrl) {
    return {
      ok: false,
      error: "Instagram publish needs an image_url on the artifact. Generate or attach an image first.",
      tool: "INSTAGRAM_POST_IG_USER_MEDIA",
    };
  }
  const create = await runTool(
    "INSTAGRAM_POST_IG_USER_MEDIA",
    {
      image_url: imageUrl,
      caption: caption || undefined,
      media_type: "IMAGE",
    },
    entityIds
  );
  if (!create.ok) {
    const alt = await runTool(
      "INSTAGRAM_CREATE_POST",
      { image_url: imageUrl, caption, media_type: "IMAGE" },
      entityIds
    );
    if (!alt.ok) return create;
    return alt;
  }
  const creationId =
    create.result?.id ||
    create.result?.creation_id ||
    create.result?.container_id ||
    null;
  if (creationId) {
    const pub = await runTool(
      "INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH",
      { creation_id: creationId, media_container_id: creationId },
      entityIds
    );
    if (pub.ok) return { ...pub, tool: "INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH" };
  }
  return create;
}

async function goLiveEmail(payload, entityIds, connected) {
  const subject = asString(payload.subject, "Untitled");
  const body = asString(payload.body) || asString(payload.html) || asString(payload.text);
  if (!body) return { ok: false, error: "Email body is empty" };
  const to =
    asString(payload.to) ||
    asString(payload.to_email) ||
    asString(payload.recipient_email);

  if (connected.has("gmail")) {
    if (to) {
      // User clicked Go Live with a recipient → send
      return runTool(
        "GMAIL_SEND_EMAIL",
        {
          recipient_email: to,
          to,
          subject,
          body,
          message_body: body,
        },
        entityIds
      );
    }
    // No recipient → save as Gmail draft (still only on CTA click)
    return runTool(
      "GMAIL_CREATE_EMAIL_DRAFT",
      {
        subject,
        body,
        message_body: body,
        recipient_email: asString(payload.from) || undefined,
      },
      entityIds
    );
  }

  if (connected.has("instantly")) {
    const campaign = await runTool(
      "INSTANTLY_CREATE_CAMPAIGN",
      {
        name: asString(payload.campaign_name, `Marqq · ${subject}`.slice(0, 80)),
        subject,
        body,
        sequences: [
          {
            steps: [{ type: "email", delay: 0, variants: [{ subject, body }] }],
          },
        ],
      },
      entityIds
    );
    return campaign;
  }

  return { ok: false, error: "Connect Gmail or Instantly first" };
}

async function goLiveWhatsApp(payload, entityIds) {
  const text = pickPayloadText(payload);
  const phone =
    asString(payload.phone) ||
    asString(payload.to) ||
    asString(payload.phone_number) ||
    asString(payload.wa_id);
  if (!phone) {
    return { ok: false, error: "WhatsApp send needs a phone number on the payload" };
  }
  if (!text && !asString(payload.template_name)) {
    return { ok: false, error: "WhatsApp message text is empty" };
  }
  if (asString(payload.template_name)) {
    return runTool(
      "WHATSAPP_SEND_TEMPLATE_MESSAGE",
      {
        to: phone,
        phone_number: phone,
        template_name: payload.template_name,
        language: asString(payload.language, "en"),
      },
      entityIds
    );
  }
  return runTool(
    "WHATSAPP_SEND_MESSAGE",
    { to: phone, phone_number: phone, text, message: text },
    entityIds
  );
}

async function goLiveMailchimpNewsletter(payload, entityIds, html, subject, companyId) {
  const fromName = asString(payload.from_name || payload.fromName, "Newsletter");
  const replyTo = asString(payload.reply_to || payload.replyTo || payload.from);
  const listId =
    asString(payload.list_id || payload.listId || payload.audience_id) ||
    (companyId ? getPreferredMailchimpListId(companyId) : null);

  const createArgs = {
    type: "regular",
    recipients: listId ? { list_id: listId } : undefined,
    settings: {
      subject_line: subject,
      title: subject,
      from_name: fromName,
      reply_to: replyTo || undefined,
    },
  };

  let created = await runTool("MAILCHIMP_ADD_CAMPAIGN", createArgs, entityIds);
  if (!created.ok) {
    created = await runTool("MAILCHIMP_CREATE_CAMPAIGN", createArgs, entityIds);
  }
  if (!created.ok) {
    created = await runTool("MAILCHIMP_CREATE_A_SURVEY_CAMPAIGN", createArgs, entityIds);
  }
  if (!created.ok) return { ...created, connector: "mailchimp" };

  const campaignId =
    created.result?.id ||
    created.result?.campaign_id ||
    created.result?.data?.id ||
    asString(payload.campaign_id);
  if (!campaignId) {
    return {
      ok: true,
      tool: created.tool,
      connector: "mailchimp",
      url: extractUrl(created),
      result: {
        ...(created.result || {}),
        message: "Mailchimp campaign created — open Mailchimp to set HTML content if content API needs campaign id.",
      },
    };
  }

  const set = await runTool(
    "MAILCHIMP_SET_CAMPAIGN_CONTENT",
    { campaign_id: campaignId, campaignId, html, content: { html } },
    entityIds,
  );
  if (!set.ok) return { ...set, connector: "mailchimp" };

  // Best-effort: watch audience for subscribe/unsubscribe/campaign events
  if (listId && companyId) {
    try {
      const { ensureMailchimpTriggers } = await import("./mailchimpTriggers.js");
      void ensureMailchimpTriggers(companyId, { listId }).catch((err) => {
        console.warn("[go-live/mailchimp] ensure triggers:", err?.message || err);
      });
    } catch (err) {
      console.warn("[go-live/mailchimp] trigger import:", err?.message || err);
    }
  }

  const sendNow = payload.send === true || payload.send_now === true;
  if (sendNow) {
    const sent = await runTool(
      "MAILCHIMP_SEND_CAMPAIGN",
      { campaign_id: campaignId, campaignId },
      entityIds,
    );
    return { ...sent, connector: "mailchimp" };
  }

  return {
    ok: true,
    tool: set.tool || created.tool,
    connector: "mailchimp",
    url: extractUrl(set) || extractUrl(created) || `https://admin.mailchimp.com/campaigns/show?id=${campaignId}`,
    result: {
      campaign_id: campaignId,
      list_id: listId || null,
      status: "draft_ready",
      message: "Campaign created in Mailchimp with HTML content — review & send in Mailchimp (or pass send:true).",
    },
  };
}

async function goLiveKlaviyoNewsletter(payload, entityIds, html, subject) {
  const fromEmail = asString(payload.from_email || payload.fromEmail || payload.from, "hello@example.com");
  const fromName = asString(payload.from_name || payload.fromName, "Newsletter");
  const listIds = Array.isArray(payload.list_ids)
    ? payload.list_ids
    : Array.isArray(payload.listIds)
      ? payload.listIds
      : asString(payload.list_id || payload.listId)
        ? [asString(payload.list_id || payload.listId)]
        : [];

  let templateId = asString(payload.template_id || payload.templateId) || null;
  const template = await runTool(
    "KLAVIYO_CREATE_TEMPLATE",
    {
      name: `${subject} — ${new Date().toISOString().slice(0, 10)}`,
      html,
      html_part: html,
      editor_type: "CODE",
    },
    entityIds,
  );
  if (template.ok) {
    templateId =
      template.result?.id ||
      template.result?.data?.id ||
      template.result?.template_id ||
      templateId;
  }

  const created = await runTool(
    "KLAVIYO_CREATE_CAMPAIGN",
    {
      name: subject,
      subject,
      from_email: fromEmail,
      from_name: fromName,
      list_ids: listIds,
      template_id: templateId,
      html,
      content: html,
    },
    entityIds,
  );
  if (!created.ok) return { ...created, connector: "klaviyo" };

  const campaignId =
    created.result?.id ||
    created.result?.campaign_id ||
    created.result?.data?.id ||
    null;

  if ((payload.send === true || payload.send_now === true) && campaignId) {
    const job = await runTool(
      "KLAVIYO_CREATE_CAMPAIGN_SEND_JOB",
      { campaign_id: campaignId, campaignId },
      entityIds,
    );
    if (job.ok) return { ...job, connector: "klaviyo" };
  }

  return {
    ...created,
    connector: "klaviyo",
    url: extractUrl(created) || (campaignId ? `https://www.klaviyo.com/campaign/${campaignId}/wizard` : null),
    result: {
      ...(created.result || {}),
      campaign_id: campaignId,
      template_id: templateId,
      status: "draft_ready",
      message: "Campaign created in Klaviyo — review audience & send in Klaviyo (or pass send:true).",
    },
  };
}

async function goLiveGmailNewsletter(payload, entityIds, html, subject) {
  const to = asString(payload.to || payload.to_email || payload.recipient);
  const sendNow = payload.send === true || payload.send_now === true;

  if (sendNow && to) {
    const sent = await runTool(
      "GMAIL_SEND_EMAIL",
      {
        to,
        recipient_email: to,
        subject,
        body: html,
        message_body: html,
        is_html: true,
        html,
      },
      entityIds,
    );
    return { ...sent, connector: "gmail" };
  }

  const draft = await runTool(
    "GMAIL_CREATE_EMAIL_DRAFT",
    {
      to: to || undefined,
      recipient_email: to || undefined,
      subject,
      body: html,
      message_body: html,
      is_html: true,
      html,
    },
    entityIds,
  );
  return {
    ...draft,
    connector: "gmail",
    url: extractUrl(draft) || "https://mail.google.com/mail/#drafts",
    result: {
      ...(draft.result || {}),
      status: "draft_ready",
      message: to
        ? "Gmail draft created — open Drafts to review & send."
        : "Gmail draft created — add a recipient in Gmail Drafts to send.",
    },
  };
}

async function goLiveNewsletter(payload, entityIds, connected, preferredConnector) {
  const subject = asString(payload.subject, "Newsletter");
  const html = asString(payload.html) || asString(payload.body);
  if (!html) return { ok: false, error: "Newsletter HTML/body is empty" };
  const companyId = entityIds[0];

  const order = [];
  if (preferredConnector) order.push(preferredConnector);
  for (const id of ["mailchimp", "klaviyo", "gmail"]) {
    if (!order.includes(id)) order.push(id);
  }

  let lastError = null;
  for (const id of order) {
    if (!connected.has(id)) continue;
    if (id === "mailchimp") {
      const res = await goLiveMailchimpNewsletter(payload, entityIds, html, subject, companyId);
      if (res.ok) return res;
      lastError = res;
      continue;
    }
    if (id === "klaviyo") {
      const res = await goLiveKlaviyoNewsletter(payload, entityIds, html, subject);
      if (res.ok) return res;
      lastError = res;
      continue;
    }
    if (id === "gmail") {
      const res = await goLiveGmailNewsletter(payload, entityIds, html, subject);
      if (res.ok) return res;
      lastError = res;
    }
  }

  if (lastError) return lastError;
  return { ok: false, error: "Connect Mailchimp, Klaviyo, or Gmail first" };
}

function normalizeMetaObjective(raw) {
  const v = String(raw || "").toUpperCase().replace(/\s+/g, "_");
  const map = {
    LEADS: "OUTCOME_LEADS",
    TRAFFIC: "OUTCOME_TRAFFIC",
    SALES: "OUTCOME_SALES",
    CONVERSIONS: "OUTCOME_SALES",
    AWARENESS: "OUTCOME_AWARENESS",
    ENGAGEMENT: "OUTCOME_ENGAGEMENT",
    OUTCOME_LEADS: "OUTCOME_LEADS",
    OUTCOME_TRAFFIC: "OUTCOME_TRAFFIC",
    OUTCOME_SALES: "OUTCOME_SALES",
    OUTCOME_AWARENESS: "OUTCOME_AWARENESS",
    OUTCOME_ENGAGEMENT: "OUTCOME_ENGAGEMENT",
    WEBSITE_VISITS: "OUTCOME_TRAFFIC",
    LEAD_GENERATION: "OUTCOME_LEADS",
    WEBSITE_CONVERSIONS: "OUTCOME_SALES",
    BRAND_AWARENESS: "OUTCOME_AWARENESS",
    SEARCH: "OUTCOME_TRAFFIC",
    DISPLAY: "OUTCOME_AWARENESS",
  };
  return map[v] || "OUTCOME_TRAFFIC";
}

function normalizeLinkedInObjective(raw) {
  const v = String(raw || "").toUpperCase().replace(/\s+/g, "_");
  const map = {
    OUTCOME_LEADS: "LEAD_GENERATION",
    LEADS: "LEAD_GENERATION",
    LEAD_GENERATION: "LEAD_GENERATION",
    OUTCOME_TRAFFIC: "WEBSITE_VISITS",
    TRAFFIC: "WEBSITE_VISITS",
    WEBSITE_VISITS: "WEBSITE_VISITS",
    OUTCOME_SALES: "WEBSITE_CONVERSIONS",
    SALES: "WEBSITE_CONVERSIONS",
    CONVERSIONS: "WEBSITE_CONVERSIONS",
    WEBSITE_CONVERSIONS: "WEBSITE_CONVERSIONS",
    OUTCOME_AWARENESS: "BRAND_AWARENESS",
    AWARENESS: "BRAND_AWARENESS",
    BRAND_AWARENESS: "BRAND_AWARENESS",
    OUTCOME_ENGAGEMENT: "BRAND_AWARENESS",
    ENGAGEMENT: "BRAND_AWARENESS",
    SEARCH: "WEBSITE_VISITS",
    DISPLAY: "BRAND_AWARENESS",
  };
  return map[v] || "WEBSITE_VISITS";
}

function normalizeGoogleChannelType(raw) {
  const v = String(raw || "").toUpperCase().replace(/\s+/g, "_");
  if (
    v === "DISPLAY" ||
    v === "OUTCOME_AWARENESS" ||
    v === "AWARENESS" ||
    v === "BRAND_AWARENESS"
  ) {
    return "DISPLAY";
  }
  return "SEARCH";
}

function normalizeDailyBudgetMinor(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Values under 1000 are treated as major currency units (e.g. ₹500 → 50000).
  if (n < 1000) return Math.round(n * 100);
  return Math.round(n);
}

/**
 * Create a PAUSED paid campaign via channel-specific automations.
 * User-click only — never auto-invoked from agent generation.
 */
async function goLivePaidAds(payload, entityIds) {
  const channel = asString(payload.channel || payload.paid_channel || payload.platform).toLowerCase();
  const isGoogle = channel === "google" || channel === "google_ads";
  const isLinkedIn = channel === "linkedin" || channel === "linkedin_ads";

  const campaignName =
    asString(payload.campaign_name) ||
    asString(payload.name) ||
    asString(payload.title) ||
    "Marqq paid campaign";
  const headline =
    asString(payload.headline) ||
    asString(payload.ad_headline) ||
    asString(payload.primary_headline);
  const primaryText =
    asString(payload.primary_text) ||
    asString(payload.body) ||
    asString(payload.ad_copy) ||
    asString(payload.copy) ||
    pickPayloadText(payload);
  const linkUrl =
    asString(payload.link_url) ||
    asString(payload.url) ||
    asString(payload.destination_url) ||
    asString(payload.landing_page);
  const dailyBudgetRaw = payload.daily_budget ?? payload.budget ?? payload.daily_budget_rupees;
  const dailyBudgetMeta = normalizeDailyBudgetMinor(dailyBudgetRaw);

  if (!headline) return { ok: false, error: "Ad headline is required" };
  if (!primaryText) return { ok: false, error: "Ad primary text is required" };
  if (!linkUrl) return { ok: false, error: "Destination link_url is required" };
  if (!dailyBudgetRaw && !dailyBudgetMeta) {
    return { ok: false, error: "daily_budget is required (e.g. 500 for ₹500/day)" };
  }

  const companyId = entityIds[0];
  const { executeAutomationTriggers } = await import("./automations/registry.js");

  if (isGoogle) {
    const params = {
      campaign_name: campaignName,
      daily_budget: dailyBudgetRaw ?? dailyBudgetMeta,
      headline,
      primary_text: primaryText,
      link_url: linkUrl,
      status: asString(payload.status, "PAUSED").toUpperCase() === "ENABLED" ? "ENABLED" : "PAUSED",
      advertising_channel_type: normalizeGoogleChannelType(
        payload.advertising_channel_type || payload.objective || payload.goal
      ),
      objective: asString(payload.objective || payload.goal, "SEARCH"),
    };
    if (asString(payload.customer_id || payload.google_ads_customer_id)) {
      params.customer_id = asString(payload.customer_id || payload.google_ads_customer_id);
    }
    const results = await executeAutomationTriggers(
      { automation_triggers: [{ automation_id: "create_google_ads_campaign", params }] },
      companyId
    );
    const row = results?.[0] || {};
    if (row.status !== "completed" && row.status !== "ok") {
      return {
        ok: false,
        error: row.error || row.message || "Google Ads campaign creation failed",
        tool: "create_google_ads_campaign",
        raw: row,
      };
    }
    return {
      ok: true,
      tool: "create_google_ads_campaign",
      url: row.ads_url || `https://ads.google.com/aw/campaigns?ocid=${row.customer_id || ""}`,
      result: {
        customer_id: row.customer_id,
        campaign_id: row.campaign_id,
        campaign_resource_name: row.campaign_resource_name,
        ad_group_resource_name: row.ad_group_resource_name,
        ad_resource_name: row.ad_resource_name,
        campaign_status: row.campaign_status || params.status,
        message: row.message || "Google Ads campaign created in PAUSED state.",
      },
    };
  }

  if (isLinkedIn) {
    const params = {
      campaign_name: campaignName,
      daily_budget: dailyBudgetRaw ?? dailyBudgetMeta,
      headline,
      primary_text: primaryText,
      link_url: linkUrl,
      currency_code: asString(payload.currency_code || payload.currency, "USD"),
      objective: normalizeLinkedInObjective(payload.objective || payload.goal),
      status: asString(payload.status, "PAUSED").toUpperCase() === "ACTIVE" ? "ACTIVE" : "PAUSED",
    };
    if (asString(payload.ad_account_id)) params.ad_account_id = asString(payload.ad_account_id);
    if (payload.targeting && typeof payload.targeting === "object") params.targeting = payload.targeting;

    const results = await executeAutomationTriggers(
      { automation_triggers: [{ automation_id: "create_linkedin_ads_campaign", params }] },
      companyId
    );
    const row = results?.[0] || {};
    if (row.status !== "completed" && row.status !== "ok") {
      return {
        ok: false,
        error: row.error || row.message || "LinkedIn Ads campaign creation failed",
        tool: "create_linkedin_ads_campaign",
        raw: row,
      };
    }
    return {
      ok: true,
      tool: "create_linkedin_ads_campaign",
      url: row.campaign_manager_url || "https://www.linkedin.com/campaignmanager/",
      result: {
        ad_account_id: row.ad_account_id,
        campaign_group_id: row.campaign_group_id,
        campaign_id: row.campaign_id,
        campaign_status: row.campaign_status || params.status,
        message: row.message || "LinkedIn campaign created in PAUSED state.",
      },
    };
  }

  // Meta (facebook / instagram / facebook_instagram / default)
  if (!dailyBudgetMeta) {
    return { ok: false, error: "daily_budget is required (e.g. 500 for ₹500/day)" };
  }

  const params = {
    campaign_name: campaignName,
    objective: normalizeMetaObjective(payload.objective),
    daily_budget: dailyBudgetMeta,
    headline,
    primary_text: primaryText,
    link_url: linkUrl,
    cta_type: asString(payload.cta_type || payload.cta, "LEARN_MORE").toUpperCase().replace(/\s+/g, "_"),
    status: asString(payload.status, "PAUSED").toUpperCase() === "ACTIVE" ? "ACTIVE" : "PAUSED",
  };
  if (asString(payload.image_url || payload.cdn_url || payload.image)) {
    params.image_url = asString(payload.image_url || payload.cdn_url || payload.image);
  }
  if (asString(payload.ad_account_id)) params.ad_account_id = asString(payload.ad_account_id);
  if (asString(payload.page_id)) params.page_id = asString(payload.page_id);
  if (payload.targeting && typeof payload.targeting === "object") params.targeting = payload.targeting;
  if (channel) params.channel = channel;
  if (Array.isArray(payload.publisher_platforms) && payload.publisher_platforms.length) {
    params.publisher_platforms = payload.publisher_platforms;
  }

  const results = await executeAutomationTriggers(
    { automation_triggers: [{ automation_id: "create_meta_campaign", params }] },
    companyId
  );
  const row = results?.[0] || {};
  if (row.status !== "completed" && row.status !== "ok") {
    return {
      ok: false,
      error: row.error || row.message || "Meta campaign creation failed",
      tool: "create_meta_campaign",
      raw: row,
    };
  }

  const act = String(row.ad_account_id || "").replace(/^act_/, "");
  const adsManagerUrl = act
    ? `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${act}`
    : row.preview_url || null;

  return {
    ok: true,
    tool: "create_meta_campaign",
    url: adsManagerUrl,
    result: {
      campaign_id: row.campaign_id,
      adset_id: row.adset_id,
      creative_id: row.creative_id,
      ad_id: row.ad_id,
      campaign_status: row.campaign_status || params.status,
      ad_account_id: row.ad_account_id,
      message: row.message || "Campaign created in PAUSED state — review in Ads Manager before enabling.",
    },
  };
}

function buildCrmNoteBody(payload = {}) {
  const scorecard =
    payload.scorecard && typeof payload.scorecard === "object" ? payload.scorecard : payload;
  const summary = asString(payload.summary || scorecard.summary);
  const leadName = asString(payload.lead_name || payload.leadName || scorecard.leadName, "Unknown");
  const leadPhone = asString(payload.lead_phone || payload.leadPhone || payload.phone);
  const leadEmail = asString(payload.lead_email || payload.leadEmail || payload.email);
  const company = asString(payload.company || payload.company_name || scorecard.companyName);
  const callSid = asString(payload.call_sid || payload.callSid);
  const status = asString(scorecard.status || payload.lead_status || payload.leadStatus);
  const temperature = asString(
    scorecard.leadTemperature || payload.lead_temperature || payload.leadTemperature,
  );
  const overall =
    scorecard.overallScore ?? payload.lead_score ?? payload.leadScore ?? payload.overallScore;
  const nextAction = asString(scorecard.nextAction || payload.next_action);
  const brief = asString(scorecard.humanCloserBrief || payload.human_closer_brief);
  const keyMoments = Array.isArray(scorecard.keyMoments)
    ? scorecard.keyMoments.map((m) => String(m)).filter(Boolean)
    : [];
  const signals = Array.isArray(scorecard.detectedSignals)
    ? scorecard.detectedSignals.map((m) => String(m)).filter(Boolean)
    : [];
  const objections = Array.isArray(scorecard.objections)
    ? scorecard.objections.map((m) => String(m)).filter(Boolean)
    : [];
  const turns = Array.isArray(payload.turns) ? payload.turns : [];
  const transcript = turns
    .map((t) => `${t?.role === "assistant" ? "Salesbot" : "Lead"}: ${asString(t?.text)}`)
    .filter((line) => line.length > 10)
    .join("\n");

  return [
    `Marqq voicebot qualification call`,
    company ? `Company context: ${company}` : "",
    `Lead: ${leadName}`,
    leadPhone ? `Phone: ${leadPhone}` : "",
    leadEmail ? `Email: ${leadEmail}` : "",
    callSid ? `Call SID: ${callSid}` : "",
    status ? `Disposition: ${status}` : "",
    temperature ? `Temperature: ${temperature}` : "",
    overall != null && overall !== "" ? `Overall score: ${overall}/100` : "",
    summary ? `AI summary:\n${summary}` : "",
    keyMoments.length ? `Key moments:\n- ${keyMoments.join("\n- ")}` : "",
    signals.length ? `Signals: ${signals.join(", ")}` : "",
    objections.length ? `Objections: ${objections.join(", ")}` : "",
    nextAction ? `Recommended next action: ${nextAction}` : "",
    brief ? `Closer brief: ${brief}` : "",
    transcript ? `Transcript:\n${transcript}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function splitLeadName(fullName) {
  const parts = asString(fullName).split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: "Unknown", last: "Lead" };
  if (parts.length === 1) return { first: parts[0], last: "Lead" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

async function goLiveCrmPushHubspot(payload, entityIds) {
  const noteBody = buildCrmNoteBody(payload);
  const leadName = asString(payload.lead_name || payload.leadName, "Unknown");
  const { first, last } = splitLeadName(leadName);
  const phone = asString(payload.lead_phone || payload.leadPhone || payload.phone);
  const email = asString(payload.lead_email || payload.leadEmail || payload.email);
  const company = asString(payload.company || payload.company_name);

  let contactId = asString(payload.hubspot_contact_id || payload.contact_id);
  if (!contactId && (email || phone)) {
    const searchRes = await runTool(
      "HUBSPOT_SEARCH_CONTACTS_BY_CRITERIA",
      {
        query: email || phone,
        filterGroups: [
          {
            filters: email
              ? [{ propertyName: "email", operator: "EQ", value: email }]
              : [{ propertyName: "phone", operator: "CONTAINS_TOKEN", value: phone }],
          },
        ],
        properties: ["email", "firstname", "lastname", "phone", "company"],
        limit: 1,
      },
      entityIds,
    );
    let results =
      searchRes.result?.results ||
      searchRes.result?.data?.results ||
      searchRes.result?.objects ||
      [];
    if ((!Array.isArray(results) || !results.length) && !searchRes.ok) {
      const alt = await runTool(
        "HUBSPOT_SEARCH_CRM_OBJECTS_BY_CRITERIA",
        {
          objectType: "contacts",
          query: email || phone,
          filterGroups: [
            {
              filters: email
                ? [{ propertyName: "email", operator: "EQ", value: email }]
                : [{ propertyName: "phone", operator: "CONTAINS_TOKEN", value: phone }],
            },
          ],
          properties: ["email", "firstname", "lastname", "phone"],
          limit: 1,
        },
        entityIds,
      );
      results = alt.result?.results || alt.result?.data?.results || [];
    }
    if (Array.isArray(results) && results[0]?.id) {
      contactId = String(results[0].id);
    }
  }

  if (!contactId) {
    const createRes = await runTool(
      "HUBSPOT_CREATE_CONTACT",
      {
        email,
        firstname: first,
        lastname: last,
        phone,
        company,
        lifecyclestage: asString(payload.lifecycle_stage, "lead"),
      },
      entityIds,
    );
    if (!createRes.ok) return createRes;
    contactId =
      asString(createRes.result?.id) ||
      asString(createRes.result?.data?.id) ||
      asString(createRes.result?.contact?.id) ||
      asString(createRes.result?.vid) ||
      null;
  }

  // Prefer CREATE_NOTE (current Composio HubSpot toolkit); fall back to engagement.
  let noteRes = await runTool(
    "HUBSPOT_CREATE_NOTE",
    {
      hs_note_body: noteBody,
      hs_timestamp: new Date().toISOString(),
      associations: contactId
        ? [
            {
              to: { id: String(contactId) },
              types: [
                {
                  associationCategory: "HUBSPOT_DEFINED",
                  associationTypeId: 202,
                },
              ],
            },
          ]
        : [],
    },
    entityIds,
  );
  if (!noteRes.ok) {
    noteRes = await runTool(
      "HUBSPOT_CREATE_ENGAGEMENT",
      {
        engagement: { type: "NOTE", active: true, timestamp: Date.now() },
        metadata: { body: noteBody },
        associations: contactId
          ? { contactIds: [Number(contactId) || contactId] }
          : undefined,
        contactId,
      },
      entityIds,
    );
  }

  if (!noteRes.ok) return noteRes;
  return {
    ok: true,
    tool: noteRes.tool || "HUBSPOT_CREATE_NOTE",
    connector: "hubspot",
    url: contactId ? `https://app.hubspot.com/contacts/${contactId}` : null,
    result: {
      contactId,
      note: noteRes.result,
      notePreview: noteBody.slice(0, 240),
    },
  };
}

async function goLiveCrmTask(payload, entityIds, connector) {
  const subject = asString(
    payload.task_subject || payload.subject || payload.next_action || payload.scorecard?.nextAction,
    "Follow up from Marqq",
  );
  const body = asString(
    payload.task_body || payload.body || payload.summary || payload.scorecard?.summary,
    subject,
  );
  const due =
    asString(payload.due_at) ||
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const contactId = asString(payload.hubspot_contact_id || payload.contact_id || payload.id);
  const leadName = asString(payload.lead_name || payload.leadName || payload.name);
  const phone = asString(payload.lead_phone || payload.phone);
  const email = asString(payload.lead_email || payload.email);

  if (connector === "zoho_crm") {
    // Zoho: create a note as follow-up when dedicated task tool isn't required
    return goLiveCrmPushZoho(
      {
        ...payload,
        summary: `Task: ${subject}\n\n${body}`,
        lead_name: leadName,
        lead_phone: phone,
        lead_email: email,
      },
      entityIds,
    );
  }

  let resolvedContactId = contactId;
  if (!resolvedContactId && (email || phone)) {
    const searchRes = await runTool(
      "HUBSPOT_SEARCH_CONTACTS_BY_CRITERIA",
      {
        query: email || phone,
        limit: 1,
        properties: ["email", "firstname", "lastname"],
      },
      entityIds,
    );
    const results = searchRes.result?.results || searchRes.result?.data?.results || [];
    if (results[0]?.id) resolvedContactId = String(results[0].id);
  }

  const taskRes = await runTool(
    "HUBSPOT_CREATE_TASK",
    {
      hs_task_subject: subject,
      hs_task_body: body,
      hs_task_type: asString(payload.task_type, "CALL"),
      hs_task_status: "NOT_STARTED",
      hs_task_priority: asString(payload.priority, "HIGH"),
      hs_timestamp: due,
      associations: resolvedContactId
        ? [
            {
              to: { id: String(resolvedContactId) },
              types: [
                {
                  associationCategory: "HUBSPOT_DEFINED",
                  associationTypeId: 204,
                },
              ],
            },
          ]
        : [],
    },
    entityIds,
  );
  if (!taskRes.ok) return taskRes;
  return {
    ok: true,
    tool: "HUBSPOT_CREATE_TASK",
    connector: "hubspot",
    url: resolvedContactId ? `https://app.hubspot.com/contacts/${resolvedContactId}` : null,
    result: { contactId: resolvedContactId, task: taskRes.result },
  };
}

async function goLiveCrmPushZoho(payload, entityIds) {
  const noteBody = buildCrmNoteBody(payload);
  const leadName = asString(payload.lead_name || payload.leadName, "Unknown");
  const { first, last } = splitLeadName(leadName);
  const phone = asString(payload.lead_phone || payload.leadPhone || payload.phone);
  const email = asString(payload.lead_email || payload.leadEmail || payload.email);
  const company = asString(payload.company || payload.company_name, "Unknown");

  let leadId = asString(payload.zoho_lead_id || payload.lead_id);
  if (!leadId && (email || phone)) {
    const searchRes = await runTool(
      "ZOHO_SEARCH_LEADS",
      {
        criteria: email ? `(Email:equals:${email})` : `(Phone:equals:${phone})`,
        email,
        phone,
      },
      entityIds,
    );
    const data =
      searchRes.result?.data ||
      searchRes.result?.leads ||
      searchRes.result?.records ||
      [];
    if (Array.isArray(data) && data[0]?.id) leadId = String(data[0].id);
  }

  if (!leadId) {
    const createRes = await runTool(
      "ZOHO_CREATE_LEAD",
      {
        Last_Name: last,
        First_Name: first,
        Company: company,
        ...(phone ? { Phone: phone } : {}),
        ...(email ? { Email: email } : {}),
        Description: noteBody.slice(0, 3000),
        Lead_Source: "Marqq Voicebot",
      },
      entityIds,
    );
    if (!createRes.ok) {
      // Fallback: create as contact
      const contactRes = await runTool(
        "ZOHO_CREATE_CONTACT",
        {
          Last_Name: last,
          First_Name: first,
          ...(phone ? { Phone: phone } : {}),
          ...(email ? { Email: email } : {}),
          Description: noteBody.slice(0, 3000),
        },
        entityIds,
      );
      if (!contactRes.ok) return createRes.ok === false ? createRes : contactRes;
      leadId =
        asString(contactRes.result?.data?.[0]?.details?.id) ||
        asString(contactRes.result?.id) ||
        null;
      const noteRes = await runTool(
        "ZOHO_CREATE_NOTE",
        {
          Note_Title: "Voicebot call summary",
          Note_Content: noteBody,
          Parent_Id: leadId,
          se_module: "Contacts",
        },
        entityIds,
      );
      return {
        ok: true,
        tool: "ZOHO_CREATE_CONTACT",
        connector: "zoho_crm",
        result: { contactId: leadId, note: noteRes.result, notePreview: noteBody.slice(0, 240) },
      };
    }
    leadId =
      asString(createRes.result?.data?.[0]?.details?.id) ||
      asString(createRes.result?.id) ||
      null;
  }

  const noteRes = await runTool(
    "ZOHO_CREATE_NOTE",
    {
      Note_Title: "Voicebot call summary",
      Note_Content: noteBody,
      Parent_Id: leadId,
      se_module: "Leads",
    },
    entityIds,
  );

  return {
    ok: noteRes.ok !== false,
    tool: "ZOHO_CREATE_NOTE",
    connector: "zoho_crm",
    error: noteRes.ok === false ? noteRes.error : null,
    result: {
      leadId,
      note: noteRes.result,
      notePreview: noteBody.slice(0, 240),
    },
  };
}

async function goLiveCrmPush(payload, entityIds, connector) {
  if (connector === "zoho_crm") return goLiveCrmPushZoho(payload, entityIds);
  return goLiveCrmPushHubspot(payload, entityIds);
}

const SHEET_HEADERS = [
  "Name",
  "Email",
  "Phone",
  "Company",
  "Status",
  "Score",
  "Summary",
  "Next Action",
  "Call SID",
  "Source",
  "Updated At",
];

function sheetRowFromPayload(payload = {}) {
  const scorecard =
    payload.scorecard && typeof payload.scorecard === "object" ? payload.scorecard : {};
  return [
    asString(payload.lead_name || payload.leadName || payload.name),
    asString(payload.lead_email || payload.leadEmail || payload.email),
    asString(payload.lead_phone || payload.leadPhone || payload.phone),
    asString(payload.company || payload.company_name),
    asString(payload.lead_status || payload.leadStatus || scorecard.status || payload.status),
    String(
      payload.lead_score ??
        payload.leadScore ??
        scorecard.overallScore ??
        payload.overallScore ??
        "",
    ),
    asString(payload.summary || scorecard.summary).slice(0, 2000),
    asString(payload.next_action || scorecard.nextAction).slice(0, 500),
    asString(payload.call_sid || payload.callSid),
    asString(payload.source, "marqq"),
    asString(payload.updated_at || payload.updatedAt, new Date().toISOString()),
  ];
}

function extractSpreadsheetId(result) {
  const r = result?.result || result?.data || result || {};
  return (
    asString(r.spreadsheetId) ||
    asString(r.spreadsheet_id) ||
    asString(r.id) ||
    asString(r.data?.spreadsheetId) ||
    asString(r.response_data?.spreadsheetId) ||
    null
  );
}

function spreadsheetUrl(id) {
  return id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : null;
}

async function resolveOrCreateSpreadsheet(payload, entityIds) {
  const existingId = asString(
    payload.spreadsheet_id || payload.spreadsheetId || payload.sheet_id || payload.sheetId,
  );
  if (existingId) {
    return { ok: true, spreadsheetId: existingId, created: false };
  }

  const title = asString(
    payload.spreadsheet_title || payload.sheet_title || payload.title,
    "Marqq CRM Export",
  );

  // Try find by title first
  const search = await runTool(
    "GOOGLESHEETS_SEARCH_SPREADSHEETS",
    { query: title, name: title },
    entityIds,
  );
  const hits = extractList(search.result, "files", "spreadsheets", "data", "results");
  const match = hits.find(
    (f) =>
      String(f.name || f.title || "").toLowerCase() === title.toLowerCase() ||
      String(f.name || f.title || "").toLowerCase().includes(title.toLowerCase()),
  );
  if (match?.id || match?.spreadsheetId) {
    return {
      ok: true,
      spreadsheetId: String(match.id || match.spreadsheetId),
      created: false,
    };
  }

  // Create with header row via sheet-from-json, fall back to create + append headers
  const fromJson = await runTool(
    "GOOGLESHEETS_SHEET_FROM_JSON",
    {
      title,
      sheet_name: asString(payload.worksheet_name || payload.sheet_name, "Marqq"),
      data: [Object.fromEntries(SHEET_HEADERS.map((h, i) => [h, SHEET_HEADERS[i]]))],
      json_data: [Object.fromEntries(SHEET_HEADERS.map((h) => [h, ""]))],
    },
    entityIds,
  );
  let spreadsheetId = extractSpreadsheetId(fromJson);
  if (!spreadsheetId) {
    const created = await runTool(
      "GOOGLESHEETS_CREATE_GOOGLE_SHEET1",
      { title, sheet_name: asString(payload.worksheet_name, "Marqq") },
      entityIds,
    );
    if (!created.ok) return created;
    spreadsheetId = extractSpreadsheetId(created);
    if (!spreadsheetId) {
      return { ok: false, error: "Could not create Google Sheet", raw: created };
    }
    await runTool(
      "GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND",
      {
        spreadsheet_id: spreadsheetId,
        spreadsheetId,
        range: "A1",
        values: [SHEET_HEADERS],
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
      },
      entityIds,
    );
  }

  return { ok: true, spreadsheetId, created: true, title };
}

async function goLiveSheetsPush(payload, entityIds) {
  const resolved = await resolveOrCreateSpreadsheet(payload, entityIds);
  if (!resolved.ok) return resolved;

  const spreadsheetId = resolved.spreadsheetId;
  const worksheet = asString(payload.worksheet_name || payload.sheet_name, "Sheet1");
  const rowsInput = Array.isArray(payload.rows) ? payload.rows : null;
  const values = rowsInput
    ? rowsInput.map((row) =>
        Array.isArray(row) ? row : sheetRowFromPayload(row && typeof row === "object" ? row : {}),
      )
    : [sheetRowFromPayload(payload)];

  if (!values.length) {
    return { ok: false, error: "No rows to push to Google Sheets" };
  }

  // Prefer upsert when a key column is present; otherwise append
  const upsertKey = asString(payload.upsert_key);
  let write;
  if (upsertKey) {
    write = await runTool(
      "GOOGLESHEETS_UPSERT_ROWS",
      {
        spreadsheet_id: spreadsheetId,
        spreadsheetId,
        sheet_name: worksheet,
        key_column: upsertKey,
        rows: values.map((row) =>
          Object.fromEntries(SHEET_HEADERS.map((h, i) => [h, row[i] ?? ""])),
        ),
      },
      entityIds,
    );
  }

  if (!write?.ok) {
    write = await runTool(
      "GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND",
      {
        spreadsheet_id: spreadsheetId,
        spreadsheetId,
        range: `${worksheet}!A:K`,
        values,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
      },
      entityIds,
    );
  }

  if (!write.ok) return write;

  return {
    ok: true,
    tool: write.tool,
    connector: "google_sheets",
    url: spreadsheetUrl(spreadsheetId),
    result: {
      spreadsheetId,
      worksheet,
      rows_pushed: values.length,
      created: resolved.created === true,
      append: write.result,
    },
  };
}

function extractDriveFileId(result) {
  const r = result?.result || result?.data || result || {};
  return (
    asString(r.id) ||
    asString(r.file_id) ||
    asString(r.fileId) ||
    asString(r.data?.id) ||
    asString(r.response_data?.id) ||
    null
  );
}

function driveFileUrl(id) {
  return id ? `https://drive.google.com/file/d/${id}/view` : null;
}

async function ensureMarqqDriveFolder(entityIds, folderName = "Marqq Exports") {
  const found = await runTool(
    "GOOGLEDRIVE_FIND_FOLDER",
    { name: folderName, folder_name: folderName, query: folderName },
    entityIds,
  );
  const folders = extractList(found.result, "files", "folders", "data", "results");
  const hit = folders.find(
    (f) => String(f.name || "").toLowerCase() === folderName.toLowerCase(),
  );
  if (hit?.id) return String(hit.id);

  const created = await runTool(
    "GOOGLEDRIVE_CREATE_FOLDER",
    { name: folderName, folder_name: folderName },
    entityIds,
  );
  return extractDriveFileId(created);
}

async function goLiveDriveSave(payload, entityIds) {
  const title = asString(
    payload.file_name || payload.filename || payload.title || payload.report_title,
    `Marqq export ${new Date().toISOString().slice(0, 10)}`,
  );
  const content =
    asString(payload.content) ||
    asString(payload.report_markdown) ||
    asString(payload.summary) ||
    asString(payload.body) ||
    asString(payload.text) ||
    (payload.scorecard ? JSON.stringify(payload.scorecard, null, 2) : "") ||
    JSON.stringify(
      {
        lead_name: payload.lead_name || payload.leadName,
        lead_email: payload.lead_email || payload.email,
        lead_phone: payload.lead_phone || payload.phone,
        company: payload.company,
        summary: payload.summary,
        score: payload.lead_score ?? payload.scorecard?.overallScore,
        status: payload.lead_status || payload.scorecard?.status,
        call_sid: payload.call_sid || payload.callSid,
        exported_at: new Date().toISOString(),
      },
      null,
      2,
    );

  const folderId =
    asString(payload.folder_id || payload.parent_id) ||
    (await ensureMarqqDriveFolder(entityIds, asString(payload.folder_name, "Marqq Exports")));

  const fileUrl = asString(payload.file_url || payload.asset_url || payload.image_url);
  let saved;
  if (fileUrl) {
    saved = await runTool(
      "GOOGLEDRIVE_UPLOAD_FROM_URL",
      {
        url: fileUrl,
        file_url: fileUrl,
        name: title,
        file_name: title,
        folder_id: folderId,
        parent_id: folderId,
        folder_to_upload_to: folderId,
      },
      entityIds,
    );
  }

  if (!saved?.ok) {
    saved = await runTool(
      "GOOGLEDRIVE_CREATE_FILE_FROM_TEXT",
      {
        name: title.endsWith(".md") || title.endsWith(".txt") || title.endsWith(".json")
          ? title
          : `${title}.md`,
        text: content,
        content,
        parent_id: folderId,
        folder_id: folderId,
        mime_type: "text/plain",
      },
      entityIds,
    );
  }

  if (!saved.ok) {
    saved = await runTool(
      "GOOGLEDRIVE_CREATE_FILE",
      {
        name: title,
        parents: folderId ? [folderId] : undefined,
        parent_id: folderId,
      },
      entityIds,
    );
  }
  if (!saved.ok) return saved;

  const fileId = extractDriveFileId(saved);
  if (folderId && fileId) {
    await runTool(
      "GOOGLEDRIVE_MOVE_FILE",
      { file_id: fileId, fileId, addParents: folderId, new_parent_id: folderId },
      entityIds,
    );
  }

  return {
    ok: true,
    tool: saved.tool,
    connector: "google_drive",
    url: driveFileUrl(fileId),
    result: {
      fileId,
      folderId,
      file_url: driveFileUrl(fileId),
      raw: saved.result,
    },
  };
}

async function goLiveDriveShare(payload, entityIds) {
  let fileId = asString(payload.file_id || payload.fileId || payload.drive_file_id);
  if (!fileId) {
    // Save first, then share
    const saved = await goLiveDriveSave(payload, entityIds);
    if (!saved.ok) return saved;
    fileId = asString(saved.result?.fileId);
    if (!fileId) return { ok: false, error: "Drive file was saved but no file id returned" };
  }

  const email = asString(payload.share_email || payload.email || payload.recipient);
  const role = asString(payload.role, "reader");
  const type = email ? "user" : asString(payload.share_type, "anyone");

  const perm = await runTool(
    "GOOGLEDRIVE_CREATE_PERMISSION",
    {
      file_id: fileId,
      fileId,
      role,
      type,
      email_address: email || undefined,
      emailAddress: email || undefined,
    },
    entityIds,
  );
  if (!perm.ok) return perm;

  const shareUrl =
    type === "anyone"
      ? `https://drive.google.com/file/d/${fileId}/view?usp=sharing`
      : driveFileUrl(fileId);

  return {
    ok: true,
    tool: "GOOGLEDRIVE_CREATE_PERMISSION",
    connector: "google_drive",
    url: shareUrl,
    result: {
      fileId,
      share_url: shareUrl,
      permission: perm.result,
      shared_with: email || "anyone with the link",
      role,
    },
  };
}

/**
 * @param {{ kind: string, workspaceId?: string, companyId?: string, preferredConnector?: string, payload?: object }} opts
 */
export async function executeOutcomeGoLive(opts = {}) {
  const kind = String(opts.kind || "").toLowerCase();
  if (!KIND_CONNECTORS[kind]) {
    return { ok: false, error: `Unknown outcome kind: ${kind}` };
  }
  const entityIds = [opts.workspaceId, opts.companyId].filter(Boolean);
  if (!entityIds.length) {
    return { ok: false, error: "workspaceId is required" };
  }

  const primaryEntity = entityIds[0];
  const connected = await connectedSet(primaryEntity);
  // Also merge company entity connections if different
  if (entityIds[1] && entityIds[1] !== primaryEntity) {
    const extra = await connectedSet(entityIds[1]);
    for (const id of extra) connected.add(id);
  }

  const payload = opts.payload && typeof opts.payload === "object" ? opts.payload : {};
  const preferredConnector =
    kind === "paid_ads"
      ? preferredPaidConnectorFromPayload(payload, opts.preferredConnector)
      : opts.preferredConnector;
  const connector = chooseConnector(kind, connected, preferredConnector);
  if (kind === "voicebot") {
    // Twilio/Sarvam are env-backed — go-live via automation, not Composio OAuth.
    const { executeAutomationTriggers } = await import("./automations/registry.js");
    const leads = Array.isArray(payload.leads) ? payload.leads : [];
    const results = await executeAutomationTriggers(
      {
        automation_triggers: [
          {
            automation_id: "voicebot_campaign_launch",
            params: {
              campaign_name: asString(payload.campaign_name || payload.subject, "Voice outreach"),
              script_hint: asString(payload.script || payload.script_hint || payload.body || payload.opening_line),
              language: asString(payload.language, "en"),
              gender: asString(payload.gender, "female"),
              leads,
            },
          },
        ],
      },
      primaryEntity,
    );
    const result = results?.[0] || {};
    return {
      ok: result.status !== "error",
      connector: "voicebot",
      tool: "voicebot_campaign_launch",
      result,
      error: result.error || null,
      url: null,
    };
  }
  if (!connector) {
    return {
      ok: false,
      error: `Connect ${KIND_CONNECTORS[kind].join(" or ")} first`,
      missing: KIND_CONNECTORS[kind].filter((id) => !connected.has(id)),
    };
  }

  let result;
  switch (kind) {
    case "linkedin":
      result = await goLiveLinkedIn(payload, entityIds);
      break;
    case "facebook":
      result = await goLiveFacebook(payload, entityIds);
      break;
    case "instagram":
      result = await goLiveInstagram(payload, entityIds);
      break;
    case "twitter":
      result = await goLiveTwitter(payload, entityIds);
      break;
    case "social": {
      if (connector === "linkedin") result = await goLiveLinkedIn(payload, entityIds);
      else if (connector === "facebook") result = await goLiveFacebook(payload, entityIds);
      else if (connector === "twitter") result = await goLiveTwitter(payload, entityIds);
      else result = await goLiveInstagram(payload, entityIds);
      break;
    }
    case "email":
      result = await goLiveEmail(payload, entityIds, connected);
      break;
    case "whatsapp":
      result = await goLiveWhatsApp(payload, entityIds);
      break;
    case "blog":
      result = await goLiveBlog(payload, entityIds, connected, preferredConnector);
      break;
    case "landing_page":
      result = await goLiveLanding(payload, entityIds, connected, preferredConnector);
      break;
    case "newsletter":
      result = await goLiveNewsletter(payload, entityIds, connected, preferredConnector);
      break;
    case "paid_ads":
      result = await goLivePaidAds(payload, entityIds);
      break;
    case "crm_push":
      result = await goLiveCrmPush(payload, entityIds, connector);
      break;
    case "crm_task":
      result = await goLiveCrmTask(payload, entityIds, connector);
      break;
    case "sheets_push":
      result = await goLiveSheetsPush(payload, entityIds);
      break;
    case "drive_save":
      result = await goLiveDriveSave(payload, entityIds);
      break;
    case "drive_share":
      result = await goLiveDriveShare(payload, entityIds);
      break;
    default:
      result = { ok: false, error: `Unsupported kind: ${kind}` };
  }

  return {
    ...result,
    kind,
    connector,
  };
}

export { KIND_CONNECTORS };
