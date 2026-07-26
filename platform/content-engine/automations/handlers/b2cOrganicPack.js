/**
 * B2C Organic Social Pack
 * =======================
 * Generates 3 image posts × Instagram / Facebook / LinkedIn / X (Twitter).
 * Captions via Groq; images via Gemini (generateSocialImage) with channel-native
 * aspect ratios and look-and-feel. Image posts only (no reels/video).
 *
 * B2C CTA flow (product):
 *   1. Connect social accounts (IG / FB / LI / X) — soft gate before generate,
 *      hard gate before Post Now.
 *   2. Generate pack → 12 outcome cards (channel-native preview).
 *   3. Per post: Post Now (go-live) OR Schedule (publish_at → calendar).
 *   4. Scheduled items appear on Marketing Calendar for that day/channel.
 */

import { generateSocialImage } from './contentCreation.js';
import {
  loadMarketingSkillsForTask,
  resolveSkillPack,
} from '../../lib/artifactMarketingSkills.js';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HUMANIZER_SKILL_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'crewai',
  'skill-library',
  'marketingskills',
  'skills',
  'humanizer',
  'SKILL.md',
);

/** Hard rules distilled from social-content + copywriting + marketing-psychology */
export const B2C_ORGANIC_SKILL_RULES = {
  skills: [
    'social-content',
    'copywriting',
    'humanizer',
    'marketing-psychology',
    'content-strategy',
    'copy-editing',
    'community-marketing',
    'ad-creative',
  ],
  // social-content / platform-limits.md
  hashtags: {
    instagram: { min: 3, max: 5 },
    facebook: { min: 1, max: 2 },
    linkedin: { min: 3, max: 5 },
    twitter: { min: 1, max: 2 },
  },
  caption_max: {
    instagram: 2200,
    facebook: 500,
    linkedin: 3000,
    twitter: 260,
  },
  // marketing-psychology levers for the 3 angles
  angles: {
    pain_hook: ['loss_aversion', 'problem_agitation', 'specificity'],
    social_proof: ['social_proof', 'authority', 'belonging'],
    offer_cta: ['clarity', 'one_cta', 'benefit_over_feature'],
  },
  // copywriting
  clarity_over_cleverness: true,
  benefits_over_features: true,
  // content-strategy pillars mix for B2C organic image posts
  pillars: ['educational', 'social_proof', 'promotional_light'],
  image_only: true,
  no_reels: true,
};

export const B2C_ORGANIC_CHANNELS = [
  {
    id: 'instagram',
    label: 'Instagram',
    connector: 'instagram',
    aspect_ratio: '4:5',
    dimensions: '1080×1350',
    look:
      'Instagram feed still — vertical 4:5, lifestyle product photography, soft natural light, mobile-native, clean negative space for caption overlay, no UI chrome, no watermarks',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    connector: 'facebook',
    aspect_ratio: '16:9',
    dimensions: '1200×630',
    look:
      'Facebook feed image — landscape 16:9, friendly consumer brand visual, clear subject, high contrast, shareable, no text-heavy overlays, no watermarks',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    connector: 'linkedin',
    aspect_ratio: '1:1',
    dimensions: '1080×1080',
    look:
      'LinkedIn organic image — square 1:1, polished professional-consumer hybrid, clean composition, trustworthy brand feel, subtle premium aesthetic, no watermarks',
  },
  {
    id: 'twitter',
    label: 'X',
    connector: 'twitter',
    aspect_ratio: '16:9',
    dimensions: '1600×900',
    look:
      'X/Twitter feed image — landscape 16:9, bold simple focal subject, high scroll-stop contrast, minimal clutter, meme-adjacent clarity without being meme, no watermarks',
  },
];

export const B2C_POST_ANGLES = [
  {
    id: 'pain_hook',
    label: 'Pain hook',
    brief: 'Call out a consumer pain or friction in the first line; empathetic, specific, scroll-stopping.',
  },
  {
    id: 'social_proof',
    label: 'Social proof',
    brief: 'Outcome or community proof — results, reviews vibe, “people like you”, without fake stats.',
  },
  {
    id: 'offer_cta',
    label: 'Offer + CTA',
    brief: 'Clear value prop + soft CTA (try / shop / learn / save). End with one action line.',
  },
];

function asString(v, fallback = '') {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return fallback;
}

function clampHashtags(channelId, tags) {
  const limits = B2C_ORGANIC_SKILL_RULES.hashtags[channelId] || { min: 1, max: 5 };
  const cleaned = (Array.isArray(tags) ? tags : [])
    .map((t) => String(t || '').replace(/^#/, '').trim())
    .filter(Boolean);
  return cleaned.slice(0, limits.max);
}

function clampCaption(channelId, text) {
  const max = B2C_ORGANIC_SKILL_RULES.caption_max[channelId] || 500;
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1)).trim()}…`;
}

/** Enforce social-content platform limits + copywriting one-CTA after LLM output */
function normalizePostAgainstSkills(raw, channelId, angleId) {
  const psych = B2C_ORGANIC_SKILL_RULES.angles[angleId] || [];
  const caption = clampCaption(channelId, raw?.caption || '');
  const hook = clampCaption(channelId, raw?.hook || '');
  const hashtags = clampHashtags(channelId, raw?.hashtags);
  let cta = asString(raw?.cta, 'Learn more');
  // copywriting: one CTA — keep first sentence only
  cta = cta.split(/[.!?]/)[0]?.trim() || cta;
  return {
    channel: channelId,
    angle: angleId,
    hook,
    caption,
    hashtags,
    cta,
    visual_brief: asString(raw?.visual_brief, ''),
    psychology_levers: psych,
  };
}

async function generateCaptionsWithGroq({ brand, offer, audience, product, channels, angles, skillPlaybook }) {
  const apiKey = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
  if (!apiKey) return null;

  const channelList = channels.map((c) => c.id).join(', ');
  const angleList = angles
    .map((a) => {
      const levers = (B2C_ORGANIC_SKILL_RULES.angles[a.id] || []).join(', ');
      return `${a.id}: ${a.brief} (psychology: ${levers})`;
    })
    .join('\n');

  const limitLines = channels
    .map((c) => {
      const h = B2C_ORGANIC_SKILL_RULES.hashtags[c.id];
      const max = B2C_ORGANIC_SKILL_RULES.caption_max[c.id];
      return `- ${c.id}: caption ≤${max} chars; hashtags ${h.min}–${h.max} (social-content platform-limits)`;
    })
    .join('\n');

  // Keep skill playbook in budget for Groq context
  const skillExcerpt = String(skillPlaybook || '')
    .replace(/^## Required marketing skill playbook\n/, '')
    .slice(0, 12_000);

  const prompt = `You write B2C organic IMAGE POST captions (NOT reels / NOT video) using the marketing skill playbook below as the authoritative method.

## Skill playbook (social-content, copywriting, marketing-psychology, content-strategy, copy-editing)
${skillExcerpt || '(skill files unavailable — use rules below)'}

## Brief
Brand: ${brand || 'the brand'}
Product/offer: ${offer || product || 'the product'}
Audience: ${audience || 'everyday consumers'}
Market: B2C · Format: static image posts only
Content pillars mix: ${B2C_ORGANIC_SKILL_RULES.pillars.join(', ')}

Channels: ${channelList}
Angles (exactly one caption set per channel×angle):
${angleList}

## Hard rules (must obey)
${limitLines}
- copywriting: clarity over cleverness; benefits over features; customer language; ONE CTA line
- marketing-psychology: apply listed levers for each angle ethically (no fake scarcity/stats)
- social-content: platform-native voice (IG lifestyle, FB conversational, LI professional-human, X punchy)
- copy-editing: tight hooks; cut fluff; no buzzword salad
- ad-creative visual_brief: one concrete scene for Gemini still image (no reel/video frames)
- No "link in bio" spam walls; hashtags without #

Return ONLY JSON:
{
  "posts": [
    {
      "channel": "instagram|facebook|linkedin|twitter",
      "angle": "pain_hook|social_proof|offer_cta",
      "hook": "first line",
      "caption": "full caption body without hashtags",
      "hashtags": ["tag1","tag2"],
      "cta": "single action line",
      "visual_brief": "one sentence image scene for that channel look"
    }
  ]
}
Exactly ${channels.length * angles.length} posts. No markdown.`;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are a B2C social content strategist. Follow the marketing skill playbook. Return valid JSON only.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      console.warn('[b2cOrganicPack] Groq captions failed:', res.status, t.slice(0, 200));
      return null;
    }
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.posts) ? parsed.posts : null;
  } catch (err) {
    console.warn('[b2cOrganicPack] Groq captions error:', err.message);
    return null;
  }
}

function fallbackCaptions({ brand, offer, product, channels, angles }) {
  const name = brand || 'Our brand';
  const thing = offer || product || 'this';
  const posts = [];
  for (const channel of channels) {
    for (const angle of angles) {
      let hook = '';
      let caption = '';
      let cta = 'Learn more';
      if (angle.id === 'pain_hook') {
        hook = `Still stuck with the same old friction?`;
        caption = `${name} built ${thing} for people who want a simpler everyday fix — without the guesswork.`;
        cta = 'See how it works';
      } else if (angle.id === 'social_proof') {
        hook = `Real people. Real routines.`;
        caption = `Customers using ${thing} from ${name} say the difference shows up in the first week. Join them.`;
        cta = 'Join the community';
      } else {
        hook = `Ready when you are.`;
        caption = `${thing} from ${name} — made for busy days, clearer choices, and results you can feel.`;
        cta = 'Try it today';
      }
      const hashtags = clampHashtags(
        channel.id,
        channel.id === 'twitter'
          ? ['B2C', name.replace(/\s+/g, '')]
          : channel.id === 'instagram'
            ? ['lifestyle', 'everyday', 'b2c', name.replace(/\s+/g, ''), 'new']
            : channel.id === 'facebook'
              ? ['lifestyle', name.replace(/\s+/g, '')]
              : ['brand', 'lifestyle', name.replace(/\s+/g, '')],
      );
      posts.push(
        normalizePostAgainstSkills(
          {
            hook,
            caption: channel.id === 'twitter' ? `${hook} ${caption}` : caption,
            hashtags,
            cta,
            visual_brief: `${channel.look}. Scene for ${angle.label}: ${thing}.`,
          },
          channel.id,
          angle.id,
        ),
      );
    }
  }
  return posts;
}

function matchCaption(posts, channelId, angleId) {
  return (
    posts.find((p) => p.channel === channelId && p.angle === angleId) ||
    posts.find((p) => p.channel === channelId) ||
    null
  );
}

async function loadHumanizerSkillMd() {
  try {
    const raw = (await readFile(HUMANIZER_SKILL_PATH, 'utf-8')).trim();
    // Keep core patterns; truncate for Groq context
    if (raw.length <= 14_000) return raw;
    return `${raw.slice(0, 14_000)}\n\n[…humanizer skill truncated for context budget…]`;
  } catch (err) {
    console.warn('[b2cOrganicPack] humanizer SKILL.md missing:', err.message);
    return '';
  }
}

/**
 * Second pass: blader/humanizer — strip AI tells from hooks/captions/CTAs.
 * No fabrication; preserve claims; keep platform length limits.
 */
async function humanizeCaptionsPass(captions, { brand, channels }) {
  const apiKey = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
  const humanizerMd = await loadHumanizerSkillMd();
  if (!apiKey || !humanizerMd || !Array.isArray(captions) || !captions.length) {
    return { captions, humanized: false, reason: !apiKey ? 'no_groq' : !humanizerMd ? 'no_skill' : 'empty' };
  }

  const payload = captions.map((c, i) => ({
    i,
    channel: c.channel,
    angle: c.angle,
    hook: c.hook,
    caption: c.caption,
    cta: c.cta,
  }));

  const prompt = `Apply the humanizer skill (blader/humanizer) to these B2C social image-post captions.

## Humanizer skill
${humanizerMd}

## Rules for this pass
- Remove AI writing patterns (significance inflation, em dashes, rule of three, AI vocabulary, "It's not just X it's Y", chatbot closers, filler, promotional puff).
- Preserve every factual claim from the source. Do NOT invent stats, names, dates, or testimonials.
- Keep platform voice: Instagram lifestyle, Facebook conversational, LinkedIn professional-human, X punchy.
- Keep hashtags unchanged (not included here).
- CTA: one short plain action line, no hype.
- Brand context only for voice: ${brand || 'brand'}
- Channels in pack: ${(channels || []).map((c) => c.id).join(', ')}

## Source posts (JSON)
${JSON.stringify(payload)}

Return ONLY JSON:
{ "posts": [ { "i": 0, "hook": "...", "caption": "...", "cta": "..." } ] }
One entry per input index. No markdown.`;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        temperature: 0.55,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are the humanizer skill. Rewrite to sound human. Never invent facts. Return JSON only.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      console.warn('[b2cOrganicPack] humanizer pass failed:', res.status, t.slice(0, 200));
      return { captions, humanized: false, reason: `http_${res.status}` };
    }
    const data = await res.json();
    const parsed = JSON.parse(data?.choices?.[0]?.message?.content || '{}');
    const rows = Array.isArray(parsed.posts) ? parsed.posts : [];
    const byIndex = new Map(rows.map((r) => [Number(r.i), r]));

    const next = captions.map((c, i) => {
      const h = byIndex.get(i);
      if (!h) return c;
      return normalizePostAgainstSkills(
        {
          hook: h.hook ?? c.hook,
          caption: h.caption ?? c.caption,
          hashtags: c.hashtags,
          cta: h.cta ?? c.cta,
          visual_brief: c.visual_brief,
        },
        c.channel,
        c.angle,
      );
    });
    return { captions: next, humanized: true, reason: 'ok' };
  } catch (err) {
    console.warn('[b2cOrganicPack] humanizer pass error:', err.message);
    return { captions, humanized: false, reason: err.message };
  }
}

/**
 * @param {{ brand?: string, offer?: string, product?: string, audience?: string, brand_context?: string, style?: string, channels?: string[] }} params
 * @param {string} companyId
 */
export async function generateB2cOrganicPack(params = {}, companyId) {
  const brand = asString(params.brand || params.brand_name, 'Your Brand');
  const offer = asString(params.offer || params.product || params.topic, '');
  const audience = asString(params.audience || params.icp, 'B2C consumers');
  const brandContext = asString(params.brand_context, brand);
  const style = asString(params.style, 'clean modern consumer brand photography');

  const wanted = Array.isArray(params.channels) && params.channels.length
    ? params.channels.map((c) => String(c).toLowerCase())
    : B2C_ORGANIC_CHANNELS.map((c) => c.id);
  const channels = B2C_ORGANIC_CHANNELS.filter((c) => wanted.includes(c.id));
  if (!channels.length) {
    return { status: 'error', error: 'No valid channels. Use instagram, facebook, linkedin, twitter.' };
  }

  const skillPack = resolveSkillPack('generate_b2c_organic_pack');
  const skillPlaybook = await loadMarketingSkillsForTask('generate_b2c_organic_pack');
  const skillIds = [
    ...(skillPack.primary || []),
    ...(skillPack.secondary || []),
  ];

  const rawCaptions =
    (await generateCaptionsWithGroq({
      brand,
      offer,
      audience,
      product: offer,
      channels,
      angles: B2C_POST_ANGLES,
      skillPlaybook,
    })) ||
    fallbackCaptions({ brand, offer, product: offer, channels, angles: B2C_POST_ANGLES });

  // Normalize every caption against social-content / copywriting skill rules
  let captions = [];
  for (const channel of channels) {
    for (const angle of B2C_POST_ANGLES) {
      const raw = matchCaption(rawCaptions, channel.id, angle.id) || {
        hook: angle.label,
        caption: `${brand} — ${offer || 'our product'}`,
        hashtags: [],
        cta: 'Learn more',
        visual_brief: channel.look,
      };
      captions.push(normalizePostAgainstSkills(raw, channel.id, angle.id));
    }
  }

  // blader/humanizer second pass — strip AI tells, no fabrication
  const humanizeResult = await humanizeCaptionsPass(captions, { brand, channels });
  captions = humanizeResult.captions;

  const posts = [];
  const errors = [];

  // Generate images with limited concurrency (2 at a time) to avoid Gemini rate limits
  const jobs = [];
  for (const channel of channels) {
    for (const angle of B2C_POST_ANGLES) {
      jobs.push({ channel, angle });
    }
  }

  const CONCURRENCY = 2;
  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const batch = jobs.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async ({ channel, angle }) => {
        const cap = matchCaption(captions, channel.id, angle.id) || {
          hook: angle.label,
          caption: `${brand} — ${offer || 'our product'}`,
          hashtags: [],
          cta: 'Learn more',
          visual_brief: channel.look,
          psychology_levers: B2C_ORGANIC_SKILL_RULES.angles[angle.id] || [],
        };
        const levers = (cap.psychology_levers || B2C_ORGANIC_SKILL_RULES.angles[angle.id] || []).join(', ');
        const prompt = [
          `B2C organic social IMAGE POST for ${channel.label} (${channel.dimensions}, ${channel.aspect_ratio}).`,
          `Follow ad-creative + social-content visual craft: single strong subject, platform-native look, still image only (no reel/video frames).`,
          channel.look,
          `Angle: ${angle.label}. ${angle.brief}`,
          `Psychology levers (marketing-psychology): ${levers}`,
          `Visual brief: ${cap.visual_brief || ''}`,
          `Brand: ${brand}. Offer/product: ${offer || 'hero product'}. Audience: ${audience}.`,
          'Photoreal or high-end brand photography. Benefits-led scene (not feature dump). No fake UI. No watermark. No unreadable micro-text.',
        ].join(' ');

        const img = await generateSocialImage(
          {
            prompt,
            aspect_ratio: channel.aspect_ratio,
            platform: channel.id === 'twitter' ? 'twitter' : channel.id,
            brand_context: brandContext,
            style,
            headline: cap.hook,
            primary_text: cap.caption,
          },
          companyId,
        );

        const imageUrl = img?.cdn_url || img?.image_url || img?.url || null;
        if (!imageUrl) {
          errors.push({
            channel: channel.id,
            angle: angle.id,
            error: img?.error || 'Image generation failed',
          });
        }

        return {
          id: `${channel.id}_${angle.id}_${Date.now()}`,
          channel: channel.id,
          channel_label: channel.label,
          connector: channel.connector,
          angle: angle.id,
          angle_label: angle.label,
          aspect_ratio: channel.aspect_ratio,
          dimensions: channel.dimensions,
          hook: cap.hook || '',
          caption: cap.caption || '',
          hashtags: Array.isArray(cap.hashtags) ? cap.hashtags.map(String) : [],
          cta: cap.cta || '',
          psychology_levers: cap.psychology_levers || [],
          image_url: imageUrl,
          cdn_url: imageUrl,
          post: [cap.hook, cap.caption].filter(Boolean).join('\n\n'),
          status: imageUrl ? 'ready' : 'image_failed',
          model: img?.model || process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-lite-image',
          skills: skillIds,
        };
      }),
    );
    posts.push(...results);
  }

  return {
    status: posts.some((p) => p.image_url) ? 'completed' : 'error',
    market: 'b2c',
    format: 'image_post',
    channels: channels.map((c) => c.id),
    posts_per_channel: B2C_POST_ANGLES.length,
    total_posts: posts.length,
    ready_count: posts.filter((p) => p.image_url).length,
    posts,
    errors,
    skill_alignment: {
      pack: 'generate_b2c_organic_pack',
      skills: skillIds,
      rules: B2C_ORGANIC_SKILL_RULES,
      playbook_loaded: Boolean(skillPlaybook),
      humanizer: {
        skill: 'humanizer',
        upstream: 'https://github.com/blader/humanizer',
        applied: humanizeResult.humanized,
        reason: humanizeResult.reason,
      },
    },
    cta_flow: {
      steps: [
        'Connect Instagram, Facebook, LinkedIn, and X for live posting',
        'Generate captions with social-content + copywriting + marketing-psychology',
        'Humanize with blader/humanizer (strip AI tells, no invented facts)',
        'Review each outcome card — Post Now or Schedule',
        'Scheduled posts appear on the Marketing Calendar',
      ],
      connectors: channels.map((c) => c.connector),
      skills: skillIds,
    },
    message:
      posts.filter((p) => p.image_url).length === posts.length
        ? `Generated ${posts.length} B2C image posts across ${channels.length} channels (skills: ${skillIds.slice(0, 4).join(', ')}…).`
        : `Generated ${posts.filter((p) => p.image_url).length}/${posts.length} posts (some images failed).`,
  };
}
