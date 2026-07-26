/**
 * Content Creation Automation Handlers
 * =====================================
 * Riya calls these to produce media assets and structured content.
 * Each handler returns a plain result object stored as artifact data.
 *
 * Handlers:
 *   generateSocialImage   — Gemini 3.1 Flash-Lite Image → imgbb (Cloudinary fallback)
 *   generateEmailHtml     — Groq LLM → full inline-styled HTML email
 *   generateFacelessVideo — Gemini Omni Flash → Cloudinary (Veo fallback path also → Cloudinary)
 *   generateAvatarVideo   — HeyGen v2 API → Cloudinary when polled
 *   createSeoArticle      — Groq LLM → full HTML blog post with SEO meta
 */

import { getConnectedAccountApiKey } from '../../mcp-router.js';

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
      return { status: 'error', error: 'No image data returned from Gemini' };
    }
    base64Data = imagePart.inlineData.data;
    mimeType   = imagePart.inlineData.mimeType ?? 'image/png';
  } catch (e) {
    return { status: 'error', error: `Gemini image error: ${e.message}` };
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

  const sectionList = sections.length
    ? sections.map((s, i) => `${i + 1}. ${s}`).join('\n')
    : '';

  const userPrompt = `Create a complete HTML email newsletter.

Subject: ${subject}
Brand name: ${brand_name}
Primary color: ${primary_color}
Tone: ${tone}
Main content: ${content}
${sectionList ? `Sections to include:\n${sectionList}` : ''}

STRICT requirements:
- Full HTML document (<!DOCTYPE html>, <html>, <head>, <body>)
- ALL CSS must be inline style attributes — zero <style> blocks (Gmail strips them)
- Outer wrapper: max-width 600px centered table
- Header: brand name in white on primary color background
- Body sections: clean readable copy with headings
- Footer: "You're receiving this because you subscribed" + unsubscribe placeholder
- Font: Arial, Helvetica, sans-serif
- Mobile-readable (no tiny text, tap targets >= 44px)
- Output ONLY the HTML — no explanation, no markdown code fences`;

  let resp;
  try {
    resp = await doFetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are an expert email HTML designer. Output only valid HTML. No explanations. No code fences.' },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 4096,
      }),
    });
  } catch (e) {
    return { status: 'error', error: `Groq error: ${e.message}` };
  }

  let html = resp.choices?.[0]?.message?.content?.trim() ?? '';
  // Strip any accidental markdown code fences
  html = html.replace(/^```html?\n?/, '').replace(/\n?```$/, '').trim();

  if (!html) return { status: 'error', error: 'No HTML content generated' };

  // Derive preview text from first <p> tag
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
  };
}

// ── Gemini Omni Flash / Veo Faceless Video ───────────────────────────────────

/**
 * params: { prompt, duration, aspect_ratio, style, image_url?, image_base64?, mime_type? }
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
    image_base64 = '',
    mime_type = 'image/jpeg',
  } = params;

  if (!prompt) return { status: 'error', error: 'prompt is required' };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { status: 'error', error: 'GEMINI_API_KEY not configured' };

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
      return { status: 'error', error: `Veo video error: ${e.message}` };
    }

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

    const input = referenceBase64
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
      company_id: companyId ?? null,
      message: 'Ad video generated with Gemini Omni Flash and hosted on Cloudinary.',
    };
  } catch (e) {
    return { status: 'error', error: `Omni Flash video error: ${e.message}` };
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
    if (!videoFile) return { status: 'error', error: 'No video in completed operation' };

    // Download to /tmp
    const tmpPath = join(tmpdir(), `veo-${Date.now()}.mp4`);
    await ai.files.download({ file: videoFile, downloadPath: tmpPath });

    // Upload to Cloudinary
    const cloudinaryUrl = await uploadToCloudinary(tmpPath, { folder: 'ai-videos', resourceType: 'video' });

    // Clean up tmp file (non-blocking)
    import('fs').then(fs => fs.unlink(tmpPath, () => {})).catch(() => {});

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
 * params: { keyword, topic, word_count_target, target_audience, brand_context }
 * Returns a complete HTML blog post with meta description and SEO slug.
 */
export async function createSeoArticle(params, companyId) {
  const {
    keyword,
    topic,
    word_count_target = 1200,
    target_audience   = 'B2B decision makers',
    brand_context     = '',
  } = params;

  if (!keyword && !topic) return { status: 'error', error: 'keyword or topic is required' };

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return { status: 'error', error: 'GROQ_API_KEY not configured' };

  const primaryTopic   = topic ?? keyword;
  const primaryKeyword = keyword ?? topic;

  const userPrompt = `Write a comprehensive, SEO-optimised blog post.

Topic: ${primaryTopic}
Target keyword: ${primaryKeyword}
Target word count: ${word_count_target}
Target audience: ${target_audience}
${brand_context ? `Company context: ${brand_context}` : ''}

STRICT output rules:
- Output ONLY the HTML article (start with <article>, end with </article>)
- No <!DOCTYPE>, no <html>, no <head>, no <body> wrapper — the caller embeds this
- First line must be: <!-- META: your 150-char meta description here -->
- Second line must be: <!-- SLUG: url-friendly-slug-here -->
- Use semantic HTML: <h1> for title, <h2> for sections, <p> for body, <ul><li> for lists
- Minimum ${word_count_target} words of actual prose in the <p> tags
- Include target keyword naturally 4-6 times
- No inline styles or class attributes
- Sections: compelling intro, 4-6 substantive H2 sections, practical takeaways, CTA conclusion`;

  let resp;
  try {
    resp = await doFetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are an expert SEO content writer. Output only valid HTML. No markdown code fences. No explanations.' },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.35,
        max_tokens: 6000,
      }),
    });
  } catch (e) {
    return { status: 'error', error: `Groq error: ${e.message}` };
  }

  let html = resp.choices?.[0]?.message?.content?.trim() ?? '';
  html = html.replace(/^```html?\n?/, '').replace(/\n?```$/, '').trim();

  if (!html) return { status: 'error', error: 'No HTML content generated' };

  const metaMatch  = html.match(/<!--\s*META:\s*(.+?)\s*-->/i);
  const slugMatch  = html.match(/<!--\s*SLUG:\s*(.+?)\s*-->/i);
  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);

  const meta_description = metaMatch?.[1]?.trim()
    ?? `${primaryTopic} — complete guide for ${target_audience}`;
  const slug = slugMatch?.[1]?.trim()
    ?? primaryKeyword.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const title = titleMatch?.[1]?.replace(/<[^>]+>/g, '').trim() ?? primaryTopic;
  const word_count = html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;

  return {
    status: 'success',
    html,
    title,
    meta_description,
    slug,
    keyword: primaryKeyword,
    word_count,
    target_audience,
  };
}
