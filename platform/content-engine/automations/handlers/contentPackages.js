/**
 * Platform-native content packages. These are deliberately JSON contracts so
 * the same package can feed Content Studio, the calendar, and repurposing.
 */

function text(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

async function askGroq(prompt, fallback) {
  const key = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
  if (!key) return { ...fallback, generation_status: 'needs_llm' };
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        temperature: 0.65,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are Marqq, a platform-native content strategist. Return valid JSON only. Never invent testimonials, metrics, personal experiences, or customer claims.' },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!response.ok) return { ...fallback, generation_status: 'llm_error' };
    const data = await response.json();
    return { ...JSON.parse(data?.choices?.[0]?.message?.content || '{}'), generation_status: 'generated' };
  } catch {
    return { ...fallback, generation_status: 'llm_error' };
  }
}

export async function generateYoutubeContentPackage(params = {}, companyId) {
  const topic = text(params.topic || params.subject || params.brief, 'the company’s core problem');
  const audience = text(params.audience || params.icp, 'the target audience');
  const objective = text(params.objective || params.goal, 'build qualified awareness');
  const format = text(params.format, 'long_form');
  const brand = text(params.brand || params.company, 'the brand');
  const fallback = {
    platform: 'youtube', format, company_id: companyId || null,
    topic, audience, objective,
    titles: [], hooks: [], script: { opening: '', sections: [], cta: '' },
    metadata: { description: '', tags: [], chapters: [] },
    thumbnail_briefs: [], repurpose_targets: ['youtube_short', 'linkedin', 'x', 'reddit'],
  };
  return askGroq(`Create a YouTube production package for ${brand}.
Topic: ${topic}
Audience: ${audience}
Objective: ${objective}
Format: ${format} (long_form or short)

Return exactly these useful fields:
{
  "platform":"youtube",
  "format":"long_form|short",
  "titles":[{"text":"...","angle":"..."}],
  "hooks":[{"text":"...","risk":"low|medium|high","why":"..."}],
  "script":{"opening":"...","sections":[{"time":"...","heading":"...","beats":["..."],"pattern_interrupt":"..."}],"cta":"..."},
  "metadata":{"description":"...","tags":["..."],"chapters":[{"time":"00:00","title":"..."}]},
  "thumbnail_briefs":[{"concept":"...","text_overlay":"...","composition":"..."}],
  "repurpose_targets":["youtube_short","linkedin","x","instagram","facebook","reddit"]
}
Use retention-oriented openings and clear viewer value. Keep the CTA aligned to ${objective}.`, fallback);
}

export async function repurposeContentPackage(params = {}, companyId) {
  const source = text(params.source || params.transcript || params.content, '');
  const topic = text(params.topic, 'the source content');
  const subreddit = text(params.subreddit, '');
  const fallback = {
    company_id: companyId || null, source_topic: topic,
    linkedin: { post: '', hashtags: [], cta: '' },
    x: { posts: [], thread: [] },
    instagram: { caption: '', carousel_slides: [] },
    facebook: { post: '' },
    reddit: { subreddit, title: '', body: '', rules_check: { required: true, passed: false, notes: [] } },
  };
  return askGroq(`Repurpose the following source into platform-native content.
Topic: ${topic}
Source:
${source.slice(0, 24000)}

Return JSON with exactly: linkedin {post,hashtags,cta}; x {posts,thread}; instagram {caption,carousel_slides}; facebook {post}; reddit {subreddit,title,body,rules_check}.
Rules: X posts must stand alone and be concise. LinkedIn should be insight-led. Instagram should be visual-caption friendly. Facebook should be conversational. Reddit must be genuinely useful, non-promotional, subreddit-aware, and must not invent a personal story or pretend to be a customer. Set reddit.rules_check.passed=false until the actual subreddit rules are fetched and reviewed.`, fallback);
}
