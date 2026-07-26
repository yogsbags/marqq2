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

async function goLiveWebflow(payload, entityIds, kind = "blog") {
  const { title, contentHtml, markdown } = articleMarkdown(payload);
  const slug = asString(payload.slug) || slugify(title) || `draft-${Date.now()}`;
  const html = contentHtml || markdown;
  if (!html) return { ok: false, error: "Article HTML/content is empty" };

  const resolved = await resolveWebflowSiteAndCollection(payload, entityIds, kind);
  if (!resolved.ok) return resolved;

  const fieldData = buildWebflowFieldData(resolved.fields, {
    title: title || (kind === "landing_page" ? "Landing page" : "Untitled"),
    slug,
    contentHtml: html,
    meta: asString(payload.meta_description || payload.excerpt),
  });

  const livePreferred = payload.publish_live !== false && payload.draft !== true;
  const createArgs = {
    collection_id: resolved.collectionId,
    collectionId: resolved.collectionId,
    fieldData,
    field_data: fieldData,
    isArchived: false,
    isDraft: !livePreferred,
  };

  let created = livePreferred
    ? await runTool("WEBFLOW_CREATE_LIVE_COLLECTION_ITEM", createArgs, entityIds)
    : await runTool("WEBFLOW_CREATE_COLLECTION_ITEM", createArgs, entityIds);

  if (!created.ok && livePreferred) {
    created = await runTool("WEBFLOW_CREATE_COLLECTION_ITEM", { ...createArgs, isDraft: false }, entityIds);
  }
  if (!created.ok) return created;

  const itemId =
    created.result?.id ||
    created.result?.itemId ||
    created.result?.data?.id ||
    created.result?._id ||
    null;

  if (itemId && livePreferred) {
    await runTool(
      "WEBFLOW_PUBLISH_COLLECTION_ITEMS",
      {
        collection_id: resolved.collectionId,
        collectionId: resolved.collectionId,
        itemIds: [itemId],
        item_ids: [itemId],
      },
      entityIds,
    );
    await runTool(
      "WEBFLOW_PUBLISH_SITE",
      { site_id: resolved.siteId, siteId: resolved.siteId },
      entityIds,
    ).catch(() => null);
  }

  const designerUrl = itemId
    ? `https://webflow.com/dashboard?workspace=` // soft fallback below
    : null;
  const cmsUrl =
    itemId && resolved.siteId
      ? `https://webflow.com/dashboard/sites/${resolved.siteId}/cms/${resolved.collectionId}/${itemId}`
      : `https://webflow.com/dashboard/sites/${resolved.siteId}/cms`;

  return {
    ok: true,
    tool: created.tool,
    url: extractUrl(created) || cmsUrl || designerUrl,
    result: {
      ...(created.result || {}),
      site_id: resolved.siteId,
      collection_id: resolved.collectionId,
      collection_name: resolved.collectionName,
      item_id: itemId,
      field_data_keys: Object.keys(fieldData),
    },
  };
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
