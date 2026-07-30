/**
 * Content Creation Automation Handlers
 * =====================================
 * Riya calls these to produce media assets and structured content.
 * Each handler returns a plain result object stored as artifact data.
 *
 * Handlers:
 *   generateSocialImage   — Gemini 3.1 Flash-Lite Image → Fal Nano Banana Pro → CDN
 *   generateEmailHtml     — Groq LLM → HTML newsletter (email-sequence + copywriting skills)
 *   generateFacelessVideo — Gemini Omni Flash → Cloudinary (Seedance 2.0 Fast fallback → Cloudinary)
 *   generateAvatarVideo   — HeyGen v2 API → Cloudinary when polled
 *   createSeoArticle      — Groq LLM → full HTML blog post with SEO meta
 *   createLandingPage     — Groq LLM → page_structure + HTML (page-cro + copywriting skills)
 */

import { getConnectedAccountApiKey } from '../../mcp-router.js';

const pendingVeoFallbacks = new Map();

// ── Cloudinary Upload ─────────────────────────────────────────────────────────

/**
 * Upload a local file path or remote URL to Cloudinary.
 * Returns the secure_url, or null if Cloudinary is not configured or upload fails.
 * Uses dynamic import() because this file is an ES module (package.json "type":"module").
 */
async function uploadToCloudinary(source, { folder = 'ai-content', resourceType = 'auto' } = {}) {
  if (!process.env.CLOUDINARY_URL) return null;
  try {
    const { v2 } = await import('cloudinary');
    // CLOUDINARY_URL is auto-read by the SDK when set in env
    v2.config({ secure: true });
    const result = await v2.uploader.upload(source, {
      resource_type: resourceType,
      folder,
      overwrite: false,
    });
    return result.secure_url ?? null;
  } catch (e) {
    console.warn('[cloudinary] Upload failed:', e.message);
    return null;
  }
}

/**
 * Upload raw base64 (no data: prefix) to Cloudinary. Fallback host for Gemini images.
 */
async function uploadBase64ToCloudinary(base64, {
  mimeType = 'image/png',
  folder = 'ai-images',
  resourceType = 'image',
} = {}) {
  if (!base64 || !process.env.CLOUDINARY_URL) return null;
  const dataUri = `data:${mimeType};base64,${base64}`;
  return uploadToCloudinary(dataUri, { folder, resourceType });
}

const SEEDANCE_IMAGE_TO_VIDEO = 'bytedance/seedance-2.0/fast/image-to-video';
const SEEDANCE_TEXT_TO_VIDEO = 'bytedance/seedance-2.0/fast/text-to-video';
const NANO_BANANA_PRO = 'fal-ai/nano-banana-pro';
const NANO_BANANA_PRO_EDIT = 'fal-ai/nano-banana-pro/edit';

function falResultData(result) {
  return result?.data || result;
}

function falImageUrl(result) {
  const data = falResultData(result);
  return data?.images?.[0]?.url || result?.images?.[0]?.url || null;
}

function falVideoUrl(result) {
  const data = falResultData(result);
  return data?.video?.url
    || data?.video_url
    || data?.output?.video?.url
    || result?.video?.url
    || result?.video_url
    || result?.output?.video?.url
    || null;
}

function normalizeAspectRatio(value) {
  return ['16:9', '9:16', '1:1', '4:5', '5:4', '4:3', '3:4', '3:2', '2:3', '21:9'].includes(value)
    ? value
    : '16:9';
}

async function generateFalReferenceFrame(fal, {
  prompt,
  aspectRatio,
  sourceImageUrl,
  companyId,
  edit = false,
}) {
  const model = edit && sourceImageUrl ? NANO_BANANA_PRO_EDIT : NANO_BANANA_PRO;
  const input = {
    prompt: String(prompt || '').trim(),
    aspect_ratio: aspectRatio,
    resolution: '1K',
  };
  if (edit && sourceImageUrl) input.image_urls = [sourceImageUrl];

  const result = await fal.subscribe(model, { input, logs: false });
  const sourceUrl = falImageUrl(result);
  if (!sourceUrl) throw new Error(`Fal.ai ${model} returned no image URL`);

  // Persist generated frames when Cloudinary is available, but keep the Fal URL
  // as a safe fallback because it is already public and accepted by Seedance.
  const cloudinaryUrl = await uploadToCloudinary(sourceUrl, {
    folder: 'ai-video-frames',
    resourceType: 'image',
  });
  return {
    url: cloudinaryUrl || sourceUrl,
    source_url: sourceUrl,
    model,
    company_id: companyId ?? null,
  };
}

async function ensureSeedanceReferenceFrames(fal, params, companyId) {
  const aspectRatio = normalizeAspectRatio(params.aspect_ratio);
  const prompt = String(params.prompt || '').trim();
  let firstImageUrl = String(
    params.first_image_url || params.start_image_url || params.image_url || '',
  ).trim() || null;
  let lastImageUrl = String(
    params.last_image_url || params.end_image_url || '',
  ).trim() || null;

  if (params.generate_reference_frames === false) {
    return { firstImageUrl, lastImageUrl, generated: [] };
  }

  const generated = [];
  if (!firstImageUrl) {
    const frame = await generateFalReferenceFrame(fal, {
      prompt: String(params.first_frame_prompt || params.start_frame_prompt || '')
        .trim() || `Opening frame for this video: ${prompt}. Show the subject clearly in a strong, stable composition.`,
      aspectRatio,
      companyId,
    });
    firstImageUrl = frame.url;
    generated.push({ position: 'first', ...frame });
  }

  if (!lastImageUrl) {
    const frame = await generateFalReferenceFrame(fal, {
      prompt: String(params.last_frame_prompt || params.end_frame_prompt || '')
        .trim() || `Closing frame for this video: ${prompt}. Resolve the action with the subject clearly visible and a composed final moment.`,
      aspectRatio,
      sourceImageUrl: firstImageUrl,
      companyId,
      edit: Boolean(firstImageUrl),
    });
    lastImageUrl = frame.url;
    generated.push({ position: 'last', ...frame });
  }

  return { firstImageUrl, lastImageUrl, generated };
}

async function generateFalVideoFallback(params = {}, companyId, reason = 'primary video provider failed') {
  const falKey = process.env.FAL_KEY || process.env.FAL_API_KEY;
  if (!falKey) return { status: 'error', error: `${reason}; FAL_KEY/FAL_API_KEY is not configured` };

  try {
    const mod = await import('@fal-ai/client');
    const fal = mod.fal || mod.default?.fal || mod.default || mod;
    if (typeof fal.config === 'function') fal.config({ credentials: falKey });

    const configuredModel = String(process.env.FAL_VIDEO_MODEL || '').trim() || null;
    const shouldUseReferenceFrames = !configuredModel
      || configuredModel === SEEDANCE_IMAGE_TO_VIDEO;
    const frames = shouldUseReferenceFrames
      ? await ensureSeedanceReferenceFrames(fal, params, companyId)
      : { firstImageUrl: null, lastImageUrl: null, generated: [] };
    const imageUrl = frames.firstImageUrl;
    const model = configuredModel || (
      imageUrl ? SEEDANCE_IMAGE_TO_VIDEO : SEEDANCE_TEXT_TO_VIDEO
    );
    const input = {
      prompt: String(params.prompt || '').trim(),
      aspect_ratio: normalizeAspectRatio(params.aspect_ratio),
      resolution: params.resolution === '480p' ? '480p' : '720p',
      duration: Math.min(Math.max(Number(params.duration) || 8, 4), 15),
      generate_audio: params.generate_audio !== false,
    };
    if (imageUrl) input.image_url = imageUrl;
    if (frames.lastImageUrl && model === SEEDANCE_IMAGE_TO_VIDEO) input.end_image_url = frames.lastImageUrl;
    if (params.end_user_id) input.end_user_id = String(params.end_user_id);

    const result = await fal.subscribe(model, { input, logs: false });
    const sourceUrl = falVideoUrl(result);
    if (!sourceUrl) return { status: 'error', error: 'Fal.ai returned no video URL', model };

    const cloudinaryUrl = await uploadToCloudinary(sourceUrl, { folder: 'ai-videos', resourceType: 'video' });
    if (!cloudinaryUrl) {
      return { status: 'error', error: 'Fal.ai generated a video but Cloudinary upload failed. Set CLOUDINARY_URL.', model };
    }
    return {
      status: 'completed',
      video_url: cloudinaryUrl,
      cloudinary_url: cloudinaryUrl,
      source_video_url: sourceUrl,
      host: 'cloudinary',
      model,
      provider: 'fal.ai',
      fallback_reason: reason,
      reference_frames: {
        first_image_url: frames.firstImageUrl,
        last_image_url: frames.lastImageUrl,
        generated: frames.generated,
      },
      company_id: companyId ?? null,
    };
  } catch (error) {
    return { status: 'error', error: `Fal.ai fallback failed: ${error.message}`, provider: 'fal.ai' };
  }
}

async function generateFalImageFallback(params = {}, companyId, reason = 'primary image provider failed') {
  const falKey = process.env.FAL_KEY || process.env.FAL_API_KEY;
  if (!falKey) return { status: 'error', error: `${reason}; FAL_KEY/FAL_API_KEY is not configured` };

  try {
    const mod = await import('@fal-ai/client');
    const fal = mod.fal || mod.default?.fal || mod.default || mod;
    if (typeof fal.config === 'function') fal.config({ credentials: falKey });

    const result = await fal.subscribe(NANO_BANANA_PRO, {
      input: {
        prompt: String(params.prompt || '').trim(),
        aspect_ratio: normalizeAspectRatio(params.aspect_ratio),
        resolution: '1K',
      },
      logs: false,
    });
    const sourceUrl = falImageUrl(result);
    if (!sourceUrl) return { status: 'error', error: 'Fal.ai Nano Banana Pro returned no image URL' };

    const cloudinaryUrl = await uploadToCloudinary(sourceUrl, {
      folder: 'ai-images',
      resourceType: 'image',
    });
    const imageUrl = cloudinaryUrl || sourceUrl;
    return {
      status: 'success',
      image_url: imageUrl,
      cdn_url: imageUrl,
      cloudinary_url: cloudinaryUrl,
      host: cloudinaryUrl ? 'cloudinary' : 'fal.ai',
      model: NANO_BANANA_PRO,
      provider: 'fal.ai',
      fallback_reason: reason,
      aspect_ratio: normalizeAspectRatio(params.aspect_ratio),
      company_id: companyId ?? null,
    };
  } catch (error) {
    return { status: 'error', error: `Fal.ai image fallback failed: ${error.message}`, provider: 'fal.ai' };
  }
}

// ── Fetch Helper ──────────────────────────────────────────────────────────────

async function doFetch(url, options = {}) {
  let fetchFn;
  try { fetchFn = fetch; } catch { fetchFn = null; }
  if (!fetchFn) {
    const mod = await import('node-fetch').catch(() => null);
    fetchFn = mod?.default ?? null;
  }
  if (!fetchFn) throw new Error('fetch not available in this Node.js version');
  const resp = await fetchFn(url, options);
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status} ${resp.statusText}: ${text.slice(0, 300)}`);
  }
  return resp.json();
}

export async function listHeyGenAvatars(apiKey) {
  if (!apiKey) return [];
  try {
    const resp = await doFetch('https://api.heygen.com/v2/avatars', {
      method: 'GET',
      headers: { 'X-Api-Key': apiKey },
    });
    const avatars = Array.isArray(resp?.data?.avatars)
      ? resp.data.avatars
      : Array.isArray(resp?.avatars)
        ? resp.avatars
        : [];
    return avatars;
  } catch (e) {
    console.warn('[heygen] Failed to list avatars:', e.message);
    return [];
  }
}

export async function listHeyGenVoices(apiKey) {
  if (!apiKey) return [];
  try {
    const resp = await doFetch('https://api.heygen.com/v2/voices', {
      method: 'GET',
      headers: { 'X-Api-Key': apiKey },
    });
    const voices = Array.isArray(resp?.data?.voices)
      ? resp.data.voices
      : Array.isArray(resp?.voices)
        ? resp.voices
        : [];
    return voices;
  } catch (e) {
    console.warn('[heygen] Failed to list voices:', e.message);
    return [];
  }
}

function resolveHeyGenAvatarSelection(avatars, requestedAvatarId, fallbackAvatarId) {
  const available = Array.isArray(avatars) ? avatars : [];
  const byId = new Map(
    available
      .filter((avatar) => avatar?.avatar_id)
      .map((avatar) => [String(avatar.avatar_id), avatar])
  );

  if (requestedAvatarId && byId.has(String(requestedAvatarId))) {
    return byId.get(String(requestedAvatarId));
  }
  if (fallbackAvatarId && byId.has(String(fallbackAvatarId))) {
    return byId.get(String(fallbackAvatarId));
  }

  const preferred = available.find((avatar) => !avatar?.premium) || available[0] || null;
  return preferred;
}

function resolveHeyGenVoiceSelection(voices, requestedVoiceId, fallbackVoiceId) {
  const available = Array.isArray(voices) ? voices : [];
  const byId = new Map(
    available
      .filter((voice) => voice?.voice_id)
      .map((voice) => [String(voice.voice_id), voice])
  );

  if (requestedVoiceId && byId.has(String(requestedVoiceId))) {
    return byId.get(String(requestedVoiceId));
  }
  if (fallbackVoiceId && byId.has(String(fallbackVoiceId))) {
    return byId.get(String(fallbackVoiceId));
  }

  const preferred =
    available.find((voice) =>
      String(voice?.language || '').toLowerCase().includes('english') &&
      String(voice?.gender || '').toLowerCase() === 'female'
    ) ||
    available.find((voice) =>
      String(voice?.language || '').toLowerCase().includes('english')
    ) ||
    available[0] ||
    null;

  return preferred;
}

// ── Gemini Flash Image Generation ────────────────────────────────────────────

/**
 * params: { prompt, aspect_ratio, platform, brand_context, style, headline?, primary_text? }
 * Uses GEMINI_IMAGE_MODEL env var (default: gemini-3.1-flash-lite-image — Nano Banana 2 Lite)
 */
export async function generateSocialImage(params, companyId) {
  const {
    prompt,
    aspect_ratio = '1:1',
    platform = 'instagram',
    brand_context = '',
    style = 'professional, clean, modern, minimalist',
    headline = '',
    primary_text = '',
  } = params;

  if (!prompt) return { status: 'error', error: 'prompt is required' };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { status: 'error', error: 'GEMINI_API_KEY not configured' };

  const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-lite-image';

  const fullPrompt = [
    prompt,
    brand_context ? `Brand context: ${brand_context}` : null,
    headline ? `Ad headline context (do not render as large on-image text unless asked): ${headline}` : null,
    primary_text ? `Ad primary text context: ${primary_text}` : null,
    `Style: ${style}`,
    `Optimised for paid/social ads on ${platform}, aspect ratio ${aspect_ratio}.`,
    'Leave clean negative space for optional ad copy overlays.',
    'No watermarks. No unreadable micro-text. No logos unless brand context provides one.',
  ].filter(Boolean).join(' ');

  let base64Data, mimeType;
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });
    let response;
    try {
      response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        config: {
          responseModalities: ['IMAGE', 'TEXT'],
          imageConfig: { aspectRatio: aspect_ratio },
        },
      });
    } catch {
      // Some model revisions reject imageConfig — retry without it
      response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        config: { responseModalities: ['IMAGE', 'TEXT'] },
      });
    }

    const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (!imagePart?.inlineData?.data) {
      return generateFalImageFallback(params, companyId, 'Gemini returned no image data');
    }
    base64Data = imagePart.inlineData.data;
    mimeType   = imagePart.inlineData.mimeType ?? 'image/png';
  } catch (e) {
    return generateFalImageFallback(params, companyId, `Gemini image error: ${e.message}`);
  }

  // Host on imgbb (primary). Fall back to Cloudinary if imgbb is unavailable.
  const imgbbUrl = await uploadBase64ToImgbb(base64Data);
  const cloudinaryUrl = imgbbUrl
    ? null
    : await uploadBase64ToCloudinary(base64Data, {
        mimeType,
        folder: 'ai-images',
        resourceType: 'image',
      });
  const cdnUrl = imgbbUrl || cloudinaryUrl;

  return {
    status: cdnUrl ? 'success' : 'error',
    image_url: cdnUrl,
    cdn_url: cdnUrl,
    cloudinary_url: cloudinaryUrl,
    host: imgbbUrl ? 'imgbb' : cloudinaryUrl ? 'cloudinary' : null,
    mime_type: mimeType,
    platform,
    aspect_ratio,
    prompt_used: fullPrompt,
    model,
    company_id: companyId ?? null,
    error: cdnUrl
      ? undefined
      : 'Gemini produced an image but hosting failed. Set IMGBB_API_KEY (preferred) or CLOUDINARY_URL.',
  };
}

async function uploadBase64ToImgbb(base64) {
  const apiKey = process.env.IMGBB_API_KEY;
  if (!apiKey) return null;
  try {
    const body = new URLSearchParams({ key: apiKey, image: base64 });
    const resp = await doFetch('https://api.imgbb.com/1/upload', { method: 'POST', body });
    return resp.data?.url ?? null;
  } catch (e) {
    console.warn('[imgbb] Upload failed:', e.message);
    return null;
  }
}

// ── Email HTML Newsletter ─────────────────────────────────────────────────────

/**
 * params: { subject, content, tone, brand_name, primary_color, sections }
 * Uses email-sequence + copywriting + copy-editing skill playbooks.
 */
export async function generateEmailHtml(params, companyId) {
  const {
    subject = 'Newsletter',
    content = '',
    tone = 'professional',
    brand_name = 'Marqq',
    primary_color = '#f97316',
    sections = [],
  } = params;

  if (!content && !sections.length) {
    return { status: 'error', error: 'content or sections array required' };
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return { status: 'error', error: 'GROQ_API_KEY not configured' };

  const { loadMarketingSkillsForTask, resolveSkillPack } = await import(
    '../../lib/artifactMarketingSkills.js'
  );

  const skillKey = 'generate_email_html';
  const skillPack = resolveSkillPack(skillKey);
  const skillIds = [...(skillPack.primary || []), ...(skillPack.secondary || [])];
  const skillPlaybook = await loadMarketingSkillsForTask(skillKey);

  const sectionList = sections.length
    ? sections.map((s, i) => `${i + 1}. ${typeof s === 'string' ? s : JSON.stringify(s)}`).join('\n')
    : '';

  const userPrompt = `Create a complete HTML email newsletter using the marketing skill playbook.

Subject: ${subject}
Brand name: ${brand_name}
Primary color: ${primary_color}
Tone: ${tone}
Main content: ${content}
${sectionList ? `Sections to include:\n${sectionList}` : ''}

${skillPlaybook ? `Marketing skill playbook (authoritative — email-sequence, copywriting, copy-editing):\n${String(skillPlaybook).slice(0, 12_000)}\n` : ''}

Apply email-sequence principles:
- One email, one job — single primary CTA
- Value before ask; clear subject + preview text alignment
- Scannable sections with benefit-led headings
- Mobile-first readability

STRICT HTML requirements:
- Full HTML document (<!DOCTYPE html>, <html>, <head>, <body>)
- ALL CSS must be inline style attributes — zero <style> blocks (Gmail strips them)
- Outer wrapper: max-width 600px centered table
- Header: brand name in white on primary color background
- Body sections: clean readable copy with headings
- Footer: "You're receiving this because you subscribed" + unsubscribe placeholder
- Font: Arial, Helvetica, sans-serif
- Tap targets >= 44px
- Output ONLY the HTML — no explanation, no markdown code fences`;

  let resp;
  try {
    resp = await doFetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert email marketer applying email-sequence, copywriting, and copy-editing skills. Output only valid, ESP-safe HTML. No explanations. No code fences.',
          },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.25,
        max_tokens: 4096,
      }),
    });
  } catch (e) {
    return { status: 'error', error: `Groq error: ${e.message}` };
  }

  let html = resp.choices?.[0]?.message?.content?.trim() ?? '';
  html = html.replace(/^```html?\n?/, '').replace(/\n?```$/, '').trim();

  if (!html) return { status: 'error', error: 'No HTML content generated' };

  const previewMatch = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const preview_text = previewMatch
    ? previewMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 150)
    : subject;

  return {
    status: 'success',
    html,
    subject,
    preview_text,
    brand_name,
    primary_color,
    char_count: html.length,
    skill_alignment: {
      skill_key: skillKey,
      skills: skillIds,
      playbook_loaded: Boolean(skillPlaybook),
    },
  };
}

/**
 * Skill-guided landing page copy + HTML.
 * params: { product, audience, offer, goal, cta, brand_context, pain_points?, sections? }
 */
export async function createLandingPage(params = {}, companyId) {
  const product = String(params.product || params.offer || params.title || '').trim();
  const audience = String(params.audience || params.target_audience || '').trim();
  const offer = String(params.offer || params.value_prop || product).trim();
  const goal = String(params.goal || params.primary_cta_goal || 'lead_gen').trim();
  const cta = String(params.cta || params.primary_cta || 'Get started').trim();
  const leadMagnet = String(params.lead_magnet || params.leadMagnet || '').trim();
  const captureDestination = String(params.capture_destination || params.captureDestination || '').trim().toLowerCase();
  const captureEndpoint = String(params.capture_endpoint || params.captureEndpoint || '/api/leads/capture').trim();
  const brand_context = String(params.brand_context || params.brandContext || '').trim();
  const painPoints = Array.isArray(params.pain_points)
    ? params.pain_points
    : Array.isArray(params.painPoints)
      ? params.painPoints
      : [];

  if (!product && !offer) {
    return { status: 'error', error: 'product or offer required' };
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return { status: 'error', error: 'GROQ_API_KEY not configured' };

  const { loadMarketingSkillsForTask, resolveSkillPack } = await import(
    '../../lib/artifactMarketingSkills.js'
  );
  const skillKey = 'create_landing_page';
  const skillPack = resolveSkillPack(skillKey);
  const skillPlaybook = await loadMarketingSkillsForTask(skillKey);

  const userPrompt = `Build a conversion-ready landing page using page-cro + copywriting skills.

Product: ${product || offer}
Offer / value prop: ${offer}
Audience: ${audience || 'n/a'}
Primary goal: ${goal}
Primary CTA: ${cta}
Brand context: ${brand_context || 'n/a'}
Pain points: ${painPoints.length ? painPoints.join('; ') : 'n/a'}

${skillPlaybook ? `Marketing skill playbook (authoritative — page-cro, copywriting, form-cro):\n${String(skillPlaybook).slice(0, 12_000)}\n` : ''}

Return ONLY JSON:
{
  "title": "page title",
  "slug": "url-slug",
  "meta_description": "≤155 chars",
  "page_structure": [
    {
      "label": "hero",
      "heading": "benefit-led headline",
      "content": "supporting copy",
      "cta": "button text"
    }
  ],
  "html": "<!DOCTYPE html>... full single-page HTML ...",
  "ab_tests": ["hero headline variant to test"]
}

Rules from page-cro / copywriting:
- 5-second clarity: visitor knows what it is and why care
- One primary CTA; benefit-led headlines; specificity over vagueness
- Sections: hero, problem/agitation or benefits, social proof, how it works, FAQ, closing CTA (min 6)
- Form/CTA copy communicates value (not "Submit")
- HTML: semantic, mobile-friendly, no invented stats/testimonials — use placeholders like [Customer logo] / [Quote]
- Never invent fake review scores or case-study numbers`;

  try {
    const resp = await doFetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        temperature: 0.35,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are an expert landing-page strategist applying page-cro, copywriting, and form-cro skills. Return JSON only. Never invent fake social proof metrics.',
          },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 6000,
      }),
    });

    const raw = resp.choices?.[0]?.message?.content?.trim() || '{}';
    const parsed = JSON.parse(raw);
    let html = String(parsed.html || '').trim();
    html = html.replace(/^```html?\n?/, '').replace(/\n?```$/, '').trim();
    const page_structure = Array.isArray(parsed.page_structure) ? parsed.page_structure : [];

    if (!html && !page_structure.length) {
      return { status: 'error', error: 'Landing page generation returned empty structure' };
    }

    // Lead-magnet pages get a real, platform-neutral capture form. The page
    // can be previewed locally and the same form works after publishing when
    // capture_endpoint points at the Marqq public API.
    if (leadMagnet && captureDestination === 'google_sheets' && html && !/<form\b/i.test(html)) {
      const attr = (value) => String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      // Normalize the model's hero CTA so it always targets the real form.
      // Models commonly return a bare <button>, which otherwise has no
      // destination and can lose the branded CTA treatment in a shell.
      const firstButtonStart = html.search(/<button\b[^>]*>/i);
      if (firstButtonStart >= 0) {
        const firstButtonEnd = html.indexOf('</button>', firstButtonStart);
        if (firstButtonEnd >= 0) {
          const buttonOpenEnd = html.indexOf('>', firstButtonStart);
          const buttonText = html.slice(buttonOpenEnd + 1, firstButtonEnd);
          html = `${html.slice(0, firstButtonStart)}<a href="#marqq-lead-magnet" class="marqq-primary-cta">${buttonText}</a>${html.slice(firstButtonEnd + '</button>'.length)}`;
        }
      }
      // Never publish model placeholders as if they were finished proof.
      // Use a truthful product-led statement when no approved testimonial or
      // customer logo exists in the brand context.
      html = html
        .replace(/\[Customer Logo\]\s*Trusted by\s*\[Number\]\s*of Indian Food Lovers/gi, 'Nutrition that fits Indian kitchens')
        .replace(/\[Quote from a satisfied customer about their experience with Nouriva AI\]/gi, 'Nouriva AI helps make healthier eating easier to plan around your preferences and routine.')
        .replace(/\[Quote from a satisfied customer\]/gi, 'Nouriva AI helps make healthier eating easier to plan around your preferences and routine.')
        .replace(/\[Customer Name\]/gi, 'Nouriva AI')
        .replace(/\[Customer logo\]/gi, 'Nouriva AI');
      // Carry the brand asset into the generated page even when the model
      // does not add one itself. Nouriva's favicon is the approved logo asset.
      if (!/favicon\.png/i.test(html)) {
        html = html.replace(/<header\b[^>]*>/i, '$&<img class="marqq-brand-mark" src="/favicon.png" alt="Nouriva AI" width="56" height="56">');
      }
      const form = `<section id="marqq-lead-magnet" aria-labelledby="marqq-lead-magnet-title"><h2 id="marqq-lead-magnet-title">Get your free ${attr(leadMagnet)}</h2><p>Enter your details and we’ll send it to you.</p><form data-marqq-lead-form><label>First name<input name="name" autocomplete="given-name" required></label><label>Email<input type="email" name="email" autocomplete="email" required></label><button type="submit">${attr(cta)}</button><p data-marqq-form-status role="status"></p></form><script>(function(){const form=document.querySelector('[data-marqq-lead-form]');if(!form)return;form.addEventListener('submit',async function(event){event.preventDefault();const status=form.querySelector('[data-marqq-form-status]');status.textContent='Saving…';try{const response=await fetch('${attr(captureEndpoint)}',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({companyId:'${attr(companyId)}',name:form.elements.name.value,email:form.elements.email.value,lead_magnet:'${attr(leadMagnet)}',source:window.location.href})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not save your details');status.textContent='You’re in — check your inbox for the download.';form.reset();}catch(error){status.textContent=error.message||'Could not save your details';}});})();</script></section>`;
      html = html.replace(/<\/body>/i, `${form}</body>`);
      const captureCss = `<style id="marqq-lead-capture-styles">.marqq-brand-mark{display:block;margin:0 auto 1.25rem;border-radius:16px}.marqq-primary-cta{display:inline-flex;align-items:center;justify-content:center;padding:.95rem 1.35rem;border-radius:999px;background:#E8A341;color:#0F3D2E;text-decoration:none;font-weight:700;cursor:pointer}.marqq-primary-cta:hover{filter:brightness(.96)}#marqq-lead-magnet{max-width:900px;margin:2rem auto 4rem;padding:2rem;border-radius:24px;background:#0F3D2E;color:#FAF7F0}#marqq-lead-magnet form{display:grid;gap:1rem;max-width:680px}#marqq-lead-magnet label{display:grid;gap:.4rem;color:#FAF7F0}#marqq-lead-magnet input{padding:.85rem 1rem;border-radius:10px;border:1px solid #A8C4B5;font:inherit}#marqq-lead-magnet button{width:max-content;padding:.9rem 1.25rem;border:0;border-radius:999px;background:#E8A341;color:#0F3D2E;font:inherit;font-weight:700;cursor:pointer}</style>`;
      html = html.replace(/<\/head>/i, `${captureCss}</head>`);
    }

    return {
      status: 'success',
      format: 'landing_page',
      title: parsed.title || `${product || offer} Landing Page`,
      slug: parsed.slug || null,
      meta_description: parsed.meta_description || null,
      page_structure,
      html: html || null,
      lead_capture: leadMagnet && captureDestination === 'google_sheets'
        ? { destination: 'google_sheets', endpoint: captureEndpoint, lead_magnet: leadMagnet }
        : null,
      ab_tests: Array.isArray(parsed.ab_tests) ? parsed.ab_tests : [],
      skill_alignment: {
        skill_key: skillKey,
        skills: [...(skillPack.primary || []), ...(skillPack.secondary || [])],
        playbook_loaded: Boolean(skillPlaybook),
      },
    };
  } catch (e) {
    return { status: 'error', error: `Landing page generation failed: ${e.message}` };
  }
}

// ── Gemini Omni Flash / Veo Faceless Video ───────────────────────────────────

/**
 * params: { prompt, duration, aspect_ratio, style, image_url?, source_video_url?, image_base64?, mime_type? }
 * Default model: gemini-omni-flash-preview via Interactions API (sync video bytes).
 * Set GEMINI_VIDEO_MODEL=veo-3.1-generate-preview to use legacy async Veo path.
 */
export async function generateFacelessVideo(params, companyId) {
  const {
    prompt,
    duration = 8,
    aspect_ratio = '16:9',
    style = 'cinematic, high quality, professional',
    image_url = '',
    source_video_url = '',
    stock_video_url = '',
    image_base64 = '',
    mime_type = 'image/jpeg',
  } = params;

  if (!prompt) return { status: 'error', error: 'prompt is required' };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return generateFalVideoFallback(params, companyId, 'GEMINI_API_KEY is not configured');

  const model = process.env.GEMINI_VIDEO_MODEL || 'gemini-omni-flash-preview';
  const ratio = aspect_ratio === '9:16' ? '9:16' : '16:9';
  const clippedDuration = Math.min(Math.max(Number(duration) || 8, 3), 10);
  const fullPrompt = [
    prompt,
    `Visual style: ${style}.`,
    `Duration about ${clippedDuration} seconds.`,
    'Paid-ad ready: clear subject, readable motion, no watermarks, no tiny unreadable text overlays.',
  ].join(' ');

  // Legacy Veo async path when explicitly configured
  if (String(model).toLowerCase().includes('veo')) {
    let operationName;
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });
      const operation = await ai.models.generateVideos({
        model,
        prompt: fullPrompt,
        config: {
          aspectRatio: ratio,
          durationSeconds: Math.min(clippedDuration, 8),
          resolution: '720p',
          personGeneration: 'allow_all',
        },
      });
      operationName = operation.name;
    } catch (e) {
      return generateFalVideoFallback(params, companyId, `Veo video error: ${e.message}`);
    }

    if (operationName) pendingVeoFallbacks.set(operationName, { params, companyId });

    return {
      status: 'queued',
      operation_name: operationName,
      model,
      prompt: fullPrompt,
      duration: clippedDuration,
      aspect_ratio: ratio,
      message: 'Veo video is generating. Poll /api/automations/video-poll with operation_name.',
    };
  }

  // Default: Gemini Omni Flash via Interactions API
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const { tmpdir } = await import('os');
    const { join } = await import('path');
    const { writeFile, unlink } = await import('fs/promises');

    const ai = new GoogleGenAI({ apiKey });

    const sourceVideoUrl = String(source_video_url || stock_video_url || '').trim();
    let referenceVideoBase64 = '';
    let referenceVideoMimeType = 'video/mp4';
    if (sourceVideoUrl && /^https?:\/\//i.test(sourceVideoUrl)) {
      try {
        const rawVideo = await fetch(sourceVideoUrl);
        if (rawVideo.ok) {
          referenceVideoMimeType = (rawVideo.headers.get('content-type') || 'video/mp4').split(';')[0];
          referenceVideoBase64 = Buffer.from(await rawVideo.arrayBuffer()).toString('base64');
        }
      } catch { /* optional stock-video reference */ }
    }

    let referenceBase64 = image_base64;
    if (!referenceBase64 && image_url && /^https?:\/\//i.test(image_url)) {
      try {
        const raw = await fetch(image_url);
        if (raw.ok) {
          const buf = Buffer.from(await raw.arrayBuffer());
          referenceBase64 = buf.toString('base64');
        }
      } catch { /* optional reference */ }
    }

    const input = referenceVideoBase64
      ? [
          { type: 'video', data: referenceVideoBase64, mime_type: referenceVideoMimeType },
          {
            type: 'text',
            text: `${fullPrompt} Edit this source video into the requested final ad. Preserve useful motion and subject detail, remove any stock-provider branding or visible watermarks when possible, and do not invent product claims.`,
          },
        ]
      : referenceBase64
      ? [
          { type: 'image', data: referenceBase64, mime_type: mime_type || 'image/jpeg' },
          {
            type: 'text',
            text: `${fullPrompt} Animate this reference image into a short ad video while preserving the subject.`,
          },
        ]
      : fullPrompt;

    const interaction = await ai.interactions.create({
      model,
      input,
      response_format: {
        type: 'video',
        aspect_ratio: ratio,
      },
    });

    const videoData =
      interaction?.output_video?.data ||
      (Array.isArray(interaction?.steps)
        ? interaction.steps
            .flatMap((s) => (Array.isArray(s?.content) ? s.content : []))
            .find((c) => c?.type === 'video' && c?.data)?.data
        : null);

    if (!videoData) {
      const fallback = await generateFalVideoFallback(params, companyId, 'Gemini Omni Flash returned no video data');
      if (fallback.status === 'completed') return fallback;
      return {
        status: 'error',
        error: 'Omni Flash returned no video data',
        interaction_id: interaction?.id || null,
        raw_status: interaction?.status || null,
      };
    }

    const tmpPath = join(tmpdir(), `omni-${Date.now()}.mp4`);
    await writeFile(tmpPath, Buffer.from(videoData, 'base64'));
    const cloudinaryUrl = await uploadToCloudinary(tmpPath, { folder: 'ai-videos', resourceType: 'video' });
    unlink(tmpPath).catch(() => {});

    if (!cloudinaryUrl) {
      return {
        status: 'error',
        error: 'Gemini Omni Flash produced a video but Cloudinary upload failed. Set CLOUDINARY_URL.',
        interaction_id: interaction?.id || null,
        model,
        prompt: fullPrompt,
        duration: clippedDuration,
        aspect_ratio: ratio,
      };
    }

    return {
      status: 'completed',
      video_url: cloudinaryUrl,
      cloudinary_url: cloudinaryUrl,
      host: 'cloudinary',
      interaction_id: interaction?.id || null,
      model,
      prompt: fullPrompt,
      duration: clippedDuration,
      aspect_ratio: ratio,
      image_to_video: Boolean(referenceBase64),
      video_editing: Boolean(referenceVideoBase64),
      source_video_url: sourceVideoUrl || null,
      company_id: companyId ?? null,
      message: 'Ad video generated with Gemini Omni Flash and hosted on Cloudinary.',
    };
  } catch (e) {
    return generateFalVideoFallback(params, companyId, `Gemini Omni Flash video error: ${e.message}`);
  }
}

// ── Video Polling + Cloudinary Upload ─────────────────────────────────────────

/**
 * Poll a Veo 3.1 operation until done, download the video, upload to Cloudinary.
 * Called by the /api/automations/video-poll endpoint.
 *
 * @param {string} operationName  e.g. "models/veo-3.1-generate-preview/operations/abc123"
 * @returns {{ status, video_url?, cloudinary_url?, error? }}
 */
export async function pollVeoOperation(operationName) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { status: 'error', error: 'GEMINI_API_KEY not configured' };

  try {
    const { GoogleGenAI, GenerateVideosOperation } = await import('@google/genai');
    const { tmpdir } = await import('os');
    const { join } = await import('path');

    const ai = new GoogleGenAI({ apiKey });

    // GenerateVideosOperation must be instantiated properly so _fromAPIResponse exists
    const operationRef = new GenerateVideosOperation();
    operationRef.name = operationName;
    operationRef.done = false;
    let operation = await ai.operations.getVideosOperation({ operation: operationRef });

    if (!operation.done) {
      return { status: 'processing', operation_name: operationName, message: 'Still generating — try again in 30s' };
    }

    const videoFile = operation.response?.generatedVideos?.[0]?.video;
    if (!videoFile) {
      const fallbackContext = pendingVeoFallbacks.get(operationName);
      pendingVeoFallbacks.delete(operationName);
      if (fallbackContext) return generateFalVideoFallback(fallbackContext.params, fallbackContext.companyId, 'Veo completed without a video file');
      return { status: 'error', error: 'No video in completed operation' };
    }

    // Download to /tmp
    const tmpPath = join(tmpdir(), `veo-${Date.now()}.mp4`);
    await ai.files.download({ file: videoFile, downloadPath: tmpPath });

    // Upload to Cloudinary
    const cloudinaryUrl = await uploadToCloudinary(tmpPath, { folder: 'ai-videos', resourceType: 'video' });

    // Clean up tmp file (non-blocking)
    import('fs').then(fs => fs.unlink(tmpPath, () => {})).catch(() => {});

    pendingVeoFallbacks.delete(operationName);
    if (!cloudinaryUrl) {
      return {
        status: 'error',
        error: 'Veo video ready but Cloudinary upload failed. Set CLOUDINARY_URL.',
        operation_name: operationName,
      };
    }

    return {
      status: 'completed',
      video_url: cloudinaryUrl,
      cloudinary_url: cloudinaryUrl,
      host: 'cloudinary',
      operation_name: operationName,
    };
  } catch (e) {
    const fallbackContext = pendingVeoFallbacks.get(operationName);
    pendingVeoFallbacks.delete(operationName);
    if (fallbackContext) return generateFalVideoFallback(fallbackContext.params, fallbackContext.companyId, `Veo poll error: ${e.message}`);
    return { status: 'error', error: `Veo poll error: ${e.message}` };
  }
}

/**
 * Poll a HeyGen video_id until done, then upload the download_url to Cloudinary.
 * Called by the /api/automations/video-poll endpoint.
 *
 * @param {string} videoId  HeyGen video_id
 * @returns {{ status, video_url?, cloudinary_url?, error? }}
 */
export async function pollHeyGenVideo(videoId, companyId) {
  const connectedHeyGen = companyId ? await getConnectedAccountApiKey('heygen', companyId) : { error: 'companyId required' };
  const apiKey = connectedHeyGen.api_key || process.env.HEYGEN_API_KEY;
  if (!apiKey) return { status: 'error', error: connectedHeyGen.error || 'HEYGEN_API_KEY not configured' };

  let resp;
  try {
    resp = await doFetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
      headers: { 'X-Api-Key': apiKey },
    });
  } catch (e) {
    return { status: 'error', error: `HeyGen poll error: ${e.message}` };
  }

  const data = resp.data ?? {};
  const heystatus = data.status ?? 'processing';

  if (heystatus !== 'completed') {
    return { status: heystatus === 'failed' ? 'error' : 'processing', video_id: videoId, message: `HeyGen status: ${heystatus}` };
  }

  const downloadUrl = data.video_url ?? data.download_url;
  if (!downloadUrl) return { status: 'error', error: 'No download URL in HeyGen response', raw: data };

  // Upload to Cloudinary (using remote URL — no local download needed)
  const cloudinaryUrl = await uploadToCloudinary(downloadUrl, { folder: 'ai-videos', resourceType: 'video' });

  return {
    status: 'completed',
    video_url: cloudinaryUrl ?? downloadUrl,
    cloudinary_url: cloudinaryUrl,
    heygen_url: downloadUrl,
    video_id: videoId,
    company_id: companyId ?? null,
  };
}

// ── HeyGen Avatar Video ───────────────────────────────────────────────────────

/**
 * params: { script, avatar_id, voice_id, background_color, width, height }
 * Returns a processing job — use check_url to poll for the final download_url.
 */
export async function generateAvatarVideo(params, companyId) {
  const {
    script,
    avatar_id   = process.env.HEYGEN_AVATAR_ID,
    voice_id    = process.env.HEYGEN_VOICE_ID,
    background_color = '#ffffff',
    width  = 1280,
    height = 720,
  } = params;

  if (!script) return { status: 'error', error: 'script is required' };

  const connectedHeyGen = companyId ? await getConnectedAccountApiKey('heygen', companyId) : { error: 'companyId required' };
  const apiKey = connectedHeyGen.api_key || process.env.HEYGEN_API_KEY;
  if (!apiKey) return { status: 'error', error: connectedHeyGen.error || 'HEYGEN_API_KEY not configured' };

  const availableAvatars = await listHeyGenAvatars(apiKey);
  const availableVoices = await listHeyGenVoices(apiKey);
  const resolvedAvatar = resolveHeyGenAvatarSelection(
    availableAvatars,
    params?.avatar_id,
    avatar_id,
  );
  const resolvedVoice = resolveHeyGenVoiceSelection(
    availableVoices,
    params?.voice_id,
    voice_id,
  );
  const resolvedAvatarId = resolvedAvatar?.avatar_id || avatar_id || null;
  const resolvedVoiceId =
    resolvedVoice?.voice_id ||
    resolvedAvatar?.default_voice_id ||
    voice_id ||
    null;

  if (!resolvedAvatarId) {
    return {
      status: 'error',
      error: availableAvatars.length
        ? 'No usable HeyGen avatar found in the connected workspace'
        : 'No HeyGen avatars available in the connected workspace',
    };
  }
  if (!resolvedVoiceId) return { status: 'error', error: 'HEYGEN_VOICE_ID not configured' };

  const payload = {
    video_inputs: [
      {
        character: { type: 'avatar', avatar_id: resolvedAvatarId, avatar_style: 'normal' },
        voice:     { type: 'text', input_text: script, voice_id: resolvedVoiceId },
        background: { type: 'color', value: background_color },
      },
    ],
    dimension: { width, height },
  };

  let resp;
  try {
    resp = await doFetch('https://api.heygen.com/v2/video/generate', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return { status: 'error', error: `HeyGen error: ${e.message}` };
  }

  const videoId = resp.data?.video_id;
  if (!videoId) return { status: 'error', error: 'No video_id returned from HeyGen', raw: resp };

  return {
    status: 'processing',
    video_id: videoId,
    avatar_id: resolvedAvatarId,
    avatar_name: resolvedAvatar?.avatar_name || null,
    voice_id: resolvedVoiceId,
    voice_name: resolvedVoice?.name || null,
    company_id: companyId ?? null,
    script_word_count: script.split(/\s+/).length,
    dimensions: `${width}x${height}`,
    check_url: `https://api.heygen.com/v1/video_status.get?video_id=${videoId}`,
    message: 'HeyGen avatar video is rendering. Poll check_url for status and download_url when ready (~1-3 min).',
  };
}

// ── SEO Article HTML ──────────────────────────────────────────────────────────

/**
 * params: {
 *   keyword | primary_keyword, secondary_keywords?, topic, word_count_target,
 *   target_audience, brand_context, market_type?, humanize?,
 *   site_url?, brand_name?, faq_questions?
 * }
 * B2C: humanizer playbook + post-pass.
 * Always: natural primary/secondary keyword spray + FAQ HTML + JSON-LD (BlogPosting, FAQPage, BreadcrumbList).
 */
export async function createSeoArticle(params, companyId) {
  const {
    keyword,
    primary_keyword,
    primaryKeyword,
    secondary_keywords,
    secondaryKeywords,
    topic,
    word_count_target = 1200,
    target_audience   = 'B2B decision makers',
    brand_context     = '',
    market_type,
    market,
    marketType,
    humanize,
    site_url,
    siteUrl,
    brand_name,
    brandName,
    faq_questions,
    faqQuestions,
    generate_image = true,
    image_url,
  } = params;

  if (!keyword && !primary_keyword && !primaryKeyword && !topic) {
    return { status: 'error', error: 'keyword or topic is required' };
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return { status: 'error', error: 'GROQ_API_KEY not configured' };

  const {
    normalizeKeywordSet,
    buildKeywordAndSchemaPromptBlock,
    buildSeoRichArticleChecklist,
    ensureFaqSection,
    ensureKeyTakeaway,
    extractFaqPairs,
    buildArticleJsonLd,
    injectJsonLd,
    stripJsonLdScripts,
    auditKeywordPlacement,
    scoreSeoRichness,
  } = await import('../../lib/seoArticleStructure.js');

  const { primary: primaryKeywordResolved, secondary } = normalizeKeywordSet({
    keyword,
    primary_keyword: primary_keyword || primaryKeyword,
    secondary_keywords: secondary_keywords || secondaryKeywords,
    topic,
  });
  const primaryTopic = topic ?? primaryKeywordResolved;
  const primaryKeywordFinal = primaryKeywordResolved;

  const { isB2cMarket, humanizeBlogArticleHtml, loadHumanizerSkillMd, HUMANIZER_UPSTREAM } =
    await import('../../lib/humanizerPass.js');
  const { loadMarketingSkillsForTask, resolveSkillPack } =
    await import('../../lib/artifactMarketingSkills.js');

  const b2c = isB2cMarket({
    market_type: market_type || marketType || market,
    market: market || market_type || marketType,
    marketType: marketType || market_type || market,
    target_audience,
    audience: target_audience,
  });
  const shouldHumanize =
    humanize === true ||
    humanize === 'true' ||
    (humanize !== false && humanize !== 'false' && b2c);

  const skillKey = b2c ? 'seo_article_b2c' : 'seo_article';
  const skillPack = resolveSkillPack(skillKey);
  const skillPlaybook = await loadMarketingSkillsForTask(skillKey);
  const skillIds = [...(skillPack.primary || []), ...(skillPack.secondary || [])];

  let humanizerExcerpt = '';
  if (shouldHumanize) {
    humanizerExcerpt = await loadHumanizerSkillMd(10_000);
  }

  const audienceLine = b2c
    ? `Target audience: ${target_audience || 'everyday consumers'} (B2C — write for people, not procurement committees)`
    : `Target audience: ${target_audience}`;

  const b2cVoice = b2c
    ? `
B2C voice (required):
- Write like a helpful human expert talking to consumers — concrete, specific, slightly uneven rhythm
- Benefits over features; customer language over company jargon
- Avoid AI tells: significance inflation, "it's not just X, it's Y", em-dash stacks, rule of three, "landscape/testament/delve", chatbot closers
- Personality is OK (mixed feelings, asides) but NEVER invent stats, studies, quotes, or testimonials
${humanizerExcerpt ? `\nFollow this humanizer playbook while drafting:\n${humanizerExcerpt.slice(0, 5000)}\n` : ''}`
    : '';

  const seedFaqs = Array.isArray(faq_questions || faqQuestions)
    ? (faq_questions || faqQuestions).map(String).filter(Boolean).slice(0, 6)
    : [];

  const keywordSchemaBlock = buildKeywordAndSchemaPromptBlock({
    primary: primaryKeywordFinal,
    secondary,
    wordCount: word_count_target,
    seedFaqs,
  });

  const seoRichChecklist = buildSeoRichArticleChecklist({
    primary: primaryKeywordFinal,
    secondary,
    wordCount: word_count_target,
  });

  const userPrompt = `Write a comprehensive, SEO-rich blog post designed to rank on page 1 and be citable in AI Overviews.

Topic: ${primaryTopic}
Primary keyword: ${primaryKeywordFinal}
Secondary keywords: ${secondary.join(', ') || 'derive closely related phrases'}
Target word count: ${word_count_target}
${audienceLine}
Market: ${b2c ? 'B2C' : 'B2B'}
${brand_context ? `Company context: ${brand_context}` : ''}
${b2cVoice}

${keywordSchemaBlock}

${seoRichChecklist}

${skillPlaybook ? `Marketing skill playbook (authoritative method — ai-seo, schema-markup, seo-audit, content-strategy, copywriting):\n${String(skillPlaybook).slice(0, 12_000)}\n` : ''}

STRICT output rules:
- Output ONLY the HTML article (start with <article>, end with </article>)
- No <!DOCTYPE>, no <html>, no <head>, no <body> wrapper — the caller embeds this
- First line must be: <!-- META: your 150-char meta description here (include primary keyword once, naturally) -->
- Second line must be: <!-- SLUG: url-friendly-slug-here -->
- Use semantic HTML: <h1>, <h2>, <h3>, <p>, <ul>/<ol>/<li>, <table> when comparing, <aside id="key-takeaway">, <figure>
- Minimum ${word_count_target} words of actual prose in the <p> tags
- Must include: key-takeaway aside, 4+ H2s covering secondaries, list OR table, 2–4 internal <a href="/…"> links, 1 figure with alt, <section id="faq"> with 4–6 details/summary Q&As, takeaways H2, CTA close
- No inline styles or class attributes
- Do not include <script> tags (JSON-LD is injected after)
- Never invent statistics, reviews, or fake citations`;

  let resp;
  try {
    resp = await doFetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: b2c
              ? 'You are an expert B2C SEO + AEO content writer applying ai-seo, schema-markup, and seo-audit skills. Produce SEO-rich HTML: answer-first, topical depth, FAQ-ready, natural keywords only. Sound human. Never invent facts. Output HTML only.'
              : 'You are an expert SEO + AEO content writer applying ai-seo, schema-markup, seo-audit, and content-strategy skills. Produce page-1-ready, SEO-rich HTML with topical completeness, FAQ structure, and natural keyword use. Never invent facts. Output HTML only.',
          },
          { role: 'user', content: userPrompt },
        ],
        temperature: b2c ? 0.4 : 0.32,
        max_tokens: 8000,
      }),
    });
  } catch (e) {
    return { status: 'error', error: `Groq error: ${e.message}` };
  }

  let html = resp.choices?.[0]?.message?.content?.trim() ?? '';
  html = html.replace(/^```html?\n?/, '').replace(/\n?```$/, '').trim();

  if (!html) return { status: 'error', error: 'No HTML content generated' };

  html = stripJsonLdScripts(html);
  html = ensureKeyTakeaway(html, { primary: primaryKeywordFinal });
  html = ensureFaqSection(html, {
    primary: primaryKeywordFinal,
    secondary,
    seedQuestions: seedFaqs,
  });

  let humanizerMeta = {
    skill: 'humanizer',
    upstream: HUMANIZER_UPSTREAM,
    requested: shouldHumanize,
    market: b2c ? 'b2c' : 'b2b',
    applied: false,
    reason: shouldHumanize ? 'pending' : 'skipped_not_b2c',
  };

  if (shouldHumanize) {
    const pass = await humanizeBlogArticleHtml(html, {
      title: primaryTopic,
      keyword: primaryKeywordFinal,
      target_audience,
      brand_context,
    });
    if (pass.applied && pass.html) {
      html = stripJsonLdScripts(pass.html);
      html = ensureKeyTakeaway(html, { primary: primaryKeywordFinal });
      html = ensureFaqSection(html, {
        primary: primaryKeywordFinal,
        secondary,
        seedQuestions: seedFaqs,
      });
      humanizerMeta = {
        ...humanizerMeta,
        applied: true,
        reason: pass.reason || 'ok',
      };
    } else {
      humanizerMeta = {
        ...humanizerMeta,
        applied: false,
        reason: pass.reason || 'pass_failed',
      };
    }
  }

  const metaMatch  = html.match(/<!--\s*META:\s*(.+?)\s*-->/i);
  const slugMatch  = html.match(/<!--\s*SLUG:\s*(.+?)\s*-->/i);
  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);

  const meta_description = metaMatch?.[1]?.trim()
    ?? `${primaryTopic} — complete guide for ${target_audience}`;
  const slug = slugMatch?.[1]?.trim()
    ?? primaryKeywordFinal.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const title = titleMatch?.[1]?.replace(/<[^>]+>/g, '').trim() ?? primaryTopic;

  const faq = extractFaqPairs(html);
  const jsonLd = buildArticleJsonLd({
    title,
    description: meta_description,
    slug,
    primaryKeyword: primaryKeywordFinal,
    secondaryKeywords: secondary,
    faq,
    brandName: brand_name || brandName || 'Brand',
    siteUrl: site_url || siteUrl || 'https://example.com',
  });
  let featuredImage = image_url || null;
  let imageGeneration = { requested: generate_image !== false, generated: false, skipped: generate_image === false };
  if (!featuredImage && generate_image !== false) {
    const imageResult = await generateSocialImage({
      prompt: `Editorial hero image for a blog article titled "${title}" about ${primaryKeywordFinal}. Show the concrete problem and desired outcome; no text, no logos, no fake people, clean premium editorial style.`,
      aspect_ratio: '16:9',
      platform: 'website',
      brand_context,
      style: 'editorial website hero, natural lighting, premium, clear focal subject',
    }, companyId);
    featuredImage = imageResult?.image_url || null;
    imageGeneration = {
      requested: true,
      generated: Boolean(featuredImage),
      skipped: false,
      model: imageResult?.model || null,
      host: imageResult?.host || null,
      error: imageResult?.error || null,
    };
  }
  if (featuredImage && !/<img\b[^>]+src=/i.test(html)) {
    const figure = `<figure><img src="${String(featuredImage).replace(/"/g, '&quot;')}" alt="${String(title).replace(/"/g, '&quot;')}" loading="lazy"><figcaption>${String(title).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</figcaption></figure>`;
    html = /<\/h1>/i.test(html) ? html.replace(/<\/h1>/i, (match) => `${match}\n${figure}`) : `${figure}\n${html}`;
  }
  html = injectJsonLd(html, jsonLd);

  const keyword_audit = auditKeywordPlacement(html, {
    primary: primaryKeywordFinal,
    secondary,
  });
  const seo_richness = scoreSeoRichness(html, {
    primary: primaryKeywordFinal,
    secondary,
  });
  const word_count = keyword_audit.word_count;

  return {
    status: 'success',
    html,
    title,
    meta_description,
    slug,
    keyword: primaryKeywordFinal,
    primary_keyword: primaryKeywordFinal,
    secondary_keywords: secondary,
    faq,
    json_ld: jsonLd,
    schemas: ['BlogPosting', 'BreadcrumbList', ...(faq.length >= 2 ? ['FAQPage'] : [])],
    keyword_audit,
    seo_richness,
    word_count,
    featured_image_url: featuredImage,
    image_generation: imageGeneration,
    target_audience,
    market: b2c ? 'b2c' : 'b2b',
    skill_alignment: {
      pack: skillKey,
      skills: skillIds,
      humanizer: humanizerMeta,
      schema_markup: {
        applied: true,
        types: ['BlogPosting', 'BreadcrumbList', ...(faq.length >= 2 ? ['FAQPage'] : [])],
      },
      seo_richness,
    },
  };
}
