const fs = require('fs');
const path = require('path');
const StateManager = require('./state-manager');
const ImageGenerator = require('../image/image-generator');
const VideoCoordinator = require('../video/video-coordinator');
const { getMoengageEmailPublisher } = require('../integrations/moengage-email-publisher');
const { getMoengageClient } = require('../integrations/moengage-client');

class SocialMediaOrchestrator {
  constructor(options = {}) {
    this.projectRoot = options.projectRoot || process.cwd();
    this.simulate = options.simulate || false;
    this.limit = options.limit || null;

    this.stateManager = new StateManager(path.join(this.projectRoot, 'data'));
  }

  _getLatestCampaignPlanningEntry(topic) {
    const campaigns = this.stateManager?.state?.campaigns || {};
    const entries = Object.values(campaigns).filter(Boolean);

    const planningEntries = entries.filter((entry) => {
      const stageId = entry?.stageId;
      const type = typeof entry?.type === 'string' ? entry.type : '';
      return stageId === 1 || type.includes('campaign-planning');
    });

    if (planningEntries.length === 0) return null;

    const byCompletedAtDesc = (a, b) => {
      const aTs = new Date(a?.completedAt || a?.updatedAt || a?.createdAt || 0).getTime();
      const bTs = new Date(b?.completedAt || b?.updatedAt || b?.createdAt || 0).getTime();
      return bTs - aTs;
    };

    const normalizedTopic = (topic || '').trim();
    if (normalizedTopic) {
      const match = planningEntries
        .filter((e) => (e?.topic || '').trim() === normalizedTopic)
        .sort(byCompletedAtDesc)[0];
      if (match) return match;
    }

    return planningEntries.sort(byCompletedAtDesc)[0];
  }

  async _generateHeyGenScript(options) {
    const topic = options.topic || 'PL Capital investing insights';
    const platform = options.platform || 'instagram';
    const format = options.format || 'reel';
    const duration = Number(options.duration || 8);
    const language = options.language || 'english';

    const wordsTarget = Math.max(12, Math.round(duration * 2.2)); // ~2.2 wps for clear speech
    const groqKey = process.env.GROQ_API_KEY;

    const planning = this._getLatestCampaignPlanningEntry(topic);
    const planningText = (planning?.creativePrompt || planning?.output || '').trim();

    if (!groqKey) {
      const needsDisclaimer = /(english|hinglish)/i.test(language);
      const disclaimer = needsDisclaimer ? 'Market risks apply.' : '';
      const hook = platform === 'instagram' ? 'Stop scrolling—quick money tip.' : 'Quick update.';
      return `${hook} ${topic}. Want a simple plan? Talk to PL Capital today. ${disclaimer}`.trim();
    }

    const systemPrompt = `You write short, natural spoken scripts for a financial services video avatar.
Return ONLY the spoken script as plain text. No bullet points. No headings. No stage directions. No meta-instructions.`;

    const languageName = this._getLanguageName(language);
    const isInstagramReel = platform === 'instagram' || /reel/i.test(format || '');
    const needsDisclaimer = /(english|hinglish)/i.test(language);
    const styleGuidance = isInstagramReel
      ? `Style (Instagram Reels, Indian audience):
- Hook in the first sentence (pattern interrupt).
- Short punchy sentences, spoken like a credible Indian finfluencer (not cheesy).
- Use everyday India cues where relevant (₹, SIP, tax, salary day) without giving personalized advice.
- Close with a strong CTA: "Save this", "Share", "Follow", or "Comment 'PLAN'".`
      : '';
    const userPrompt = `Write a single spoken script for an AI avatar video.

Constraints:
- Platform: ${platform}
- Format: ${format}
- Topic: ${topic}
- Duration: ${duration} seconds
- Language: ${languageName}
- Tone: confident, warm, professional, Indian business style.
- Length: about ${wordsTarget} words (max ${wordsTarget + 6}).
- Compliance: no guaranteed returns, no exaggerated claims, no personalized investment advice.
- If language is English or Hinglish, end with the exact disclaimer: "Market risks apply." (exactly once).

${styleGuidance ? styleGuidance : ''}

Optional context from Stage 1 planning (may include purpose/audience/tone):
${planningText ? planningText.slice(0, 2000) : '(none)'}

Output rules:
- Output ONLY the script text the avatar should speak.
- Do NOT include quotation marks or labels like "Script:".`;

    const model = process.env.GROQ_HEYGEN_SCRIPT_MODEL || 'llama-3.3-70b-versatile';

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.6,
        max_tokens: 400
      })
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || `Groq API error: ${response.status}`);
    }

    const data = await response.json();
    let script = (data.choices?.[0]?.message?.content || '').trim();

    // Sanitize common failure modes (headings/labels/quotes)
    script = script.replace(/^```[\s\S]*?$/gm, '').trim();
    script = script.replace(/^\s*script\s*:\s*/i, '').trim();
    script = script.replace(/^["']|["']$/g, '').trim();

    // Hard cap by words so we don't exceed HeyGen TTS timing too much
    const words = script.split(/\s+/).filter(Boolean);
    if (words.length > wordsTarget + 12) {
      script = words.slice(0, wordsTarget + 12).join(' ').trim();
    }

    // Ensure disclaimer for English/Hinglish
    if (needsDisclaimer && !/market risks apply\.?$/i.test(script)) {
      script = `${script.replace(/\.*\s*$/, '')}. Market risks apply.`;
    }

    return script;
  }

  /**
   * Initialize the workflow system
   */
  async initialize() {
    console.log('📦 Initializing workflow state...');
    await this.stateManager.initialize();
    console.log('✅ Workflow state loaded');
  }

  /**
   * Display ASCII banner
   */
  displayBanner() {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════════╗');
    console.log('║                                                                   ║');
    console.log('║   🚀 SOCIAL MEDIA CAMPAIGN AUTOMATION                             ║');
    console.log('║   AI-Powered Multi-Platform Content & Video Production            ║');
    console.log('║                                                                   ║');
    console.log('║   Platforms: LinkedIn │ Instagram │ YouTube │ Facebook │ Twitter  ║');
    console.log('║   Video: Veo 3.1 │ HeyGen │ Shotstack │ Flux                      ║');
    console.log('║                                                                   ║');
    console.log('╚═══════════════════════════════════════════════════════════════════╝');
    console.log('');
  }

  /**
   * Show workflow status
   */
  async showStatus() {
    console.log('\n' + '='.repeat(72));
    console.log('📊 SOCIAL MEDIA CAMPAIGN STATUS');
    console.log('='.repeat(72) + '\n');

    const state = this.stateManager.state;

    // Campaigns
    const campaigns = Object.values(state.campaigns || {});
    console.log('📋 CAMPAIGNS:');
    console.log(`   Total: ${campaigns.length}`);

    const byPlatform = {};
    campaigns.forEach(c => {
      byPlatform[c.platform] = (byPlatform[c.platform] || 0) + 1;
    });

    console.log('\n   By Platform:');
    Object.entries(byPlatform).forEach(([platform, count]) => {
      console.log(`   - ${platform.padEnd(15)}: ${count}`);
    });

    // Content pieces
    const content = Object.values(state.content || {});
    console.log(`\n📝 CONTENT PIECES: ${content.length}`);

    const byStatus = {
      draft: content.filter(c => c.status === 'draft').length,
      'ready-for-visual': content.filter(c => c.status === 'ready-for-visual').length,
      'visual-ready': content.filter(c => c.status === 'visual-ready').length,
      'video-ready': content.filter(c => c.status === 'video-ready').length,
      'ready-to-publish': content.filter(c => c.status === 'ready-to-publish').length,
      published: content.filter(c => c.status === 'published').length
    };

    console.log('\n   By Status:');
    Object.entries(byStatus).forEach(([status, count]) => {
      if (count > 0) {
        console.log(`   - ${status.padEnd(20)}: ${count}`);
      }
    });

    // API Configuration
    console.log('\n🔑 API CONFIGURATION:');
    console.log(`   Groq (Content):    ${process.env.GROQ_API_KEY ? '✅' : '❌'}`);
    console.log(`   HeyGen (Avatar):   ${process.env.HEYGEN_API_KEY ? '✅' : '❌'}`);
    console.log(`   Gemini (VEO):      ${process.env.GEMINI_API_KEY ? '✅' : '❌'}`);
    console.log(`   fal.ai (LongCat):  ${process.env.FAL_KEY ? '✅' : '⚠️  Optional (for videos >148s)'}`);
    console.log(`   Replicate (Flux):  ${process.env.REPLICATE_API_TOKEN ? '✅' : '⚠️  Optional'}`);
    console.log(`   Shotstack (Edit):  ${process.env.SHOTSTACK_API_KEY ? '✅' : '⚠️  Optional'}`);
    console.log(`   ImgBB (Host):      ${process.env.IMGBB_API_KEY ? '✅' : '⚠️  Optional'}`);

    console.log('\n' + '='.repeat(72) + '\n');
  }

  /**
   * Run specific campaign type
   */
  async runCampaign(campaignType, options = {}) {
    const campaignHandlers = {
      'linkedin-carousel': this.runLinkedInCarousel.bind(this),
      'linkedin-testimonial': this.runLinkedInTestimonial.bind(this),
      'linkedin-data-viz': this.runLinkedInDataViz.bind(this),
      'instagram-reel': this.runInstagramReel.bind(this),
      'instagram-carousel': this.runInstagramCarousel.bind(this),
      'youtube-explainer': this.runYouTubeExplainer.bind(this),
      'youtube-short': this.runYouTubeShort.bind(this),
      'facebook-community': this.runFacebookCommunity.bind(this),
      'twitter-thread': this.runTwitterThread.bind(this),
      'email-newsletter': this.runEmailNewsletter.bind(this)
    };

    const handler = campaignHandlers[campaignType];
    if (!handler) {
      throw new Error(`Unknown campaign type: ${campaignType}`);
    }

    return await handler(options);
  }

  /**
   * Run specific workflow stage
   */
  async runStage(stageName, options = {}) {
    const stageHandlers = {
      planning: this.stagePlanning.bind(this),
      content: this.stageContent.bind(this),
      visuals: this.stageVisuals.bind(this),
      video: this.stageVideo.bind(this),
      publishing: this.stagePublishing.bind(this),
      tracking: this.stageTracking.bind(this)
    };

    const handler = stageHandlers[stageName];
    if (!handler) {
      throw new Error(`Unknown stage: ${stageName}`);
    }

    return await handler(options);
  }

  /**
   * CAMPAIGN HANDLERS
   */

  async runLinkedInCarousel(options) {
    console.log('📊 LinkedIn Carousel Campaign');
    console.log(`   Topic: ${options.topic}`);
    console.log(`   Type: ${options.type || 'myth-busting'}\n`);

    // Stage 1: Generate content
    await this.stageContent({
      platform: 'linkedin',
      format: 'carousel',
      topic: options.topic,
      type: options.type,
      language: options.language
    });

    // Stage 2: Generate images
    await this.stageVisuals({
      platform: 'linkedin',
      format: 'carousel',
      language: options.language
    });

    // Stage 3: Auto-publish if requested
    if (options.autoPublish) {
      await this.stagePublishing({ platform: 'linkedin' });
    }

    console.log('\n✅ LinkedIn carousel ready!');
  }

  async runLinkedInTestimonial(options) {
    console.log('🎥 LinkedIn Video Testimonial Campaign');
    console.log(`   Topic: ${options.topic}`);
    console.log(`   Duration: ${options.duration}s\n`);

    // Stage 1: Generate script
    await this.stageContent({
      platform: 'linkedin',
      format: 'video-testimonial',
      topic: options.topic,
      duration: options.duration,
      language: options.language
    });

    // Stage 2: Generate video
    await this.stageVideo({
      platform: 'linkedin',
      format: 'testimonial',
      duration: options.duration,
      useVeo: options.useVeo,
      useAvatar: options.useAvatar,
      waitForCompletion: options.waitForCompletion,
      language: options.language,
      aspectRatio: options.aspectRatio
    });

    // Stage 3: Auto-publish if requested
    if (options.autoPublish) {
      await this.stagePublishing({ platform: 'linkedin' });
    }

    console.log('\n✅ LinkedIn video testimonial ready!');
  }

  async runInstagramReel(options) {
    console.log('📱 Instagram Reel Campaign');
    console.log(`   Topic: ${options.topic}`);
    console.log(`   Duration: ${options.duration}s\n`);

    // Generate short-form vertical video
    await this.stageContent({
      platform: 'instagram',
      format: 'reel',
      topic: options.topic,
      duration: options.duration,
      language: options.language
    });

    await this.stageVideo({
      platform: 'instagram',
      format: 'reel',
      aspectRatio: options.aspectRatio || '9:16',
      duration: options.duration,
      useVeo: options.useVeo,
      useAvatar: options.useAvatar,
      language: options.language,
      waitForCompletion: options.waitForCompletion
    });

    if (options.autoPublish) {
      await this.stagePublishing({ platform: 'instagram' });
    }

    console.log('\n✅ Instagram reel ready!');
  }

  async runYouTubeExplainer(options) {
    console.log('📺 YouTube Explainer Campaign');
    console.log(`   Topic: ${options.topic}`);
    console.log(`   Duration: ${options.duration}s (${Math.floor(options.duration / 60)} min)\n`);

    // Generate long-form educational content
    await this.stageContent({
      platform: 'youtube',
      format: 'explainer',
      topic: options.topic,
      duration: options.duration
    });

    await this.stageVideo({
      platform: 'youtube',
      format: 'explainer',
      aspectRatio: '16:9',
      duration: options.duration,
      useVeo: options.useVeo || (options.duration > 60), // Auto-use Veo for 60s+
      useAvatar: options.useAvatar,
      waitForCompletion: options.waitForCompletion
    });

    if (options.autoPublish) {
      await this.stagePublishing({ platform: 'youtube' });
    }

    console.log('\n✅ YouTube explainer ready!');
  }

  /**
   * WORKFLOW STAGE IMPLEMENTATIONS
   */

  async stagePlanning(options) {
    console.log('📋 Stage 1: Campaign Planning');
    console.log('   - Selecting campaign type');
    console.log('   - Defining target platforms');
    console.log('   - Setting success metrics\n');

    // Placeholder for planning logic
    if (this.simulate) {
      console.log('   [SIMULATED] Planning completed');
    }
  }

  async stageContent(options) {
    console.log('✍️  Stage 2: Content Generation');
    console.log(`   Platform: ${options.platform}`);
    console.log(`   Format: ${options.format}`);
    console.log(`   Topic: ${options.topic}`);
    if (options.language) {
      console.log(`   Language: ${this._getLanguageName(options.language)}`);
    }
    console.log('');

    // Placeholder for content generation
    if (this.simulate) {
      console.log('   [SIMULATED] Content generated');
      return;
    }

    // Check if this is a video format
    const isVideoFormat = options.format && (
      options.format.includes('video') ||
      options.format.includes('testimonial') ||
      options.format.includes('reel') ||
      options.format.includes('explainer') ||
      options.format.includes('short')
    );

    // For video campaigns, Stage 2 content is optional (creative prompt from Stage 1 is used)
    if (isVideoFormat) {
      console.log('   🎬 Video content format detected');
      console.log('   ℹ️  Using creative prompt from Stage 1 for video generation');
      console.log('   ✅ Proceeding to video production stage');
      return {
        success: true,
        contentType: 'video-script',
        message: 'Video format - using creative prompt for generation'
      };
    }

    // For WhatsApp static creative, delegate to visual generation now
    // IMPORTANT: only route to WhatsApp creative generation when explicitly requested.
    // Generic image formats (e.g. LinkedIn static image) should NOT be forced to WhatsApp.
    const isWhatsAppImage = (options.platform && options.platform.includes('whatsapp')) ||
      (options.type && options.type.includes('whatsapp')) ||
      options.format === 'whatsapp';

    if (isWhatsAppImage) {
      console.log('   📷 Generating WhatsApp static creative with Gemini 3 Pro Image Preview...');
      // If Stage 2 content pack created a WhatsApp headline/body/cta, allow it to drive the image prompt
      const waHeadline = options.whatsappHeadline || options.headline;
      const waBody = options.whatsappBody || options.body;
      const waCta = options.whatsappCta || options.ctaText || options.cta;

      const prompt = options.prompt || this._buildVisualPrompt({
        platform: 'whatsapp',
        format: 'image',
        topic: options.topic,
        type: options.type,
        brandSettings: options.brandSettings,
        whatsapp: {
          headline: waHeadline,
          body: waBody,
          cta: waCta
        }
      });

      // If a reference image path is provided (via env), use edit mode
      const referenceImagePath = process.env.REFERENCE_IMAGE_PATH;
      const referenceImageUrl = process.env.VISUAL_REFERENCE_URL;
      if (referenceImagePath || referenceImageUrl) {
        console.log(`   🖼️  Applying reference image: ${referenceImagePath || referenceImageUrl}`);
      }

      const visualsOptions = {
        platform: 'whatsapp',
        format: 'image',
        topic: options.topic,
        type: options.type,
        prompt,
        aspectRatio: options.aspectRatio,  // Pass aspectRatio from options
        language: options.language  // Pass language from options
      };

      let result;
      if (referenceImagePath || referenceImageUrl) {
        // Use editImage to guide generation with reference
        const generator = new ImageGenerator({
          apiKey: process.env.GEMINI_API_KEY,
          provider: 'gemini'
        });

        const refInput = referenceImagePath || referenceImageUrl;

        const editResult = await generator.editImage(prompt, refInput, {
          aspectRatio: options.aspectRatio || this._getAspectRatioForFormat('story'), // Use provided aspectRatio or default to 9:16 for WhatsApp
          language: options.language  // Pass language for text generation
        });
        result = {
          success: true,
          images: editResult.images || editResult.result || []
        };
      } else {
        result = await this.stageVisuals(visualsOptions);
      }

      if (result?.success) {
        let hostedUrl = null;

        // Attempt to upload the first generated image to ImgBB for a shareable URL
        if (process.env.IMGBB_API_KEY && result.images && result.images.length > 0) {
          const firstImage = result.images[0];
          const imagePath = firstImage.path || firstImage.url;

          if (imagePath && fs.existsSync(imagePath)) {
            try {
              console.log('   ☁️  Uploading WhatsApp creative to ImgBB...');
              const imgBuffer = fs.readFileSync(imagePath);
              const b64 = imgBuffer.toString('base64');
              const payload = new URLSearchParams();
              payload.append('key', process.env.IMGBB_API_KEY);
              payload.append('image', b64);

              const uploadResp = await fetch('https://api.imgbb.com/1/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: payload
              });

              if (uploadResp.ok) {
                const json = await uploadResp.json();
                hostedUrl = json?.data?.url || null;
                if (hostedUrl) {
                  console.log(`   ✅ Uploaded to ImgBB: ${hostedUrl}`);
                  // persist URL back into result
                  result.images[0].hostedUrl = hostedUrl;
                }
              } else {
                const text = await uploadResp.text();
                console.log(`   ⚠️ ImgBB upload failed: ${uploadResp.status} ${text}`);
              }
            } catch (err) {
              console.log(`   ⚠️ ImgBB upload error: ${err instanceof Error ? err.message : 'unknown'}`);
            }
          }
        } else {
          console.log('   ℹ️  ImgBB upload skipped (no API key or image path missing)');
        }

        console.log('   ✅ WhatsApp creative generated');
        return result;
      }

      console.log('   ⚠️ WhatsApp creative generation failed or returned no result');
      return;
    }

    // TODO: Implement other AI content generation
    console.log('   ⚠️  Content generation not yet implemented for this platform');
  }

  async stageVisuals(options) {
    console.log('🎨 Stage 3: Visual Asset Production');
    console.log(`   Platform: ${options.platform}`);
    if (options.language) {
      console.log(`   Language: ${this._getLanguageName(options.language)}`);
    }
    console.log(`   Format: ${options.format}`);

    // Check if this is a video-only format (skip image generation for faceless videos)
    const isVideoOnlyFormat = options.format && (
      options.format.includes('video') ||
      options.format.includes('testimonial') ||
      options.format.includes('reel') ||
      options.format.includes('explainer') ||
      options.format.includes('short')
    );

    if (isVideoOnlyFormat) {
      console.log('   🎬 Video-only format detected (faceless video)');
      console.log('   ⏭️  Skipping image generation - proceeding directly to video production');
      return {
        success: true,
        skipped: true,
        reason: 'Video-only campaign - no static images needed'
      };
    }

    console.log(`   Model: Gemini 3 Pro Image Preview (4K, Grounded)\n`);

    // Placeholder for visual generation
    if (this.simulate) {
      console.log('   [SIMULATED] Visuals generated');
      return { success: true, simulated: true };
    }

    // Check for API key
    if (!process.env.GEMINI_API_KEY) {
      console.log('   ⚠️  GEMINI_API_KEY not set. Set it with: export GEMINI_API_KEY="your-key"');
      return { success: false, error: 'Missing GEMINI_API_KEY' };
    }

	    try {
	      // Initialize ImageGenerator with Gemini 3 Pro as primary
	      const generator = new ImageGenerator({
	        apiKey: process.env.GEMINI_API_KEY,
	        provider: 'gemini'
	      });

	      const uploadToImgBB = async (imagePath) => {
	        if (!process.env.IMGBB_API_KEY) return null;
	        if (!imagePath || !fs.existsSync(imagePath)) return null;

	        try {
	          const imgBuffer = fs.readFileSync(imagePath);
	          const b64 = imgBuffer.toString('base64');
	          const payload = new URLSearchParams();
	          payload.append('key', process.env.IMGBB_API_KEY);
	          payload.append('image', b64);

	          const uploadResp = await fetch('https://api.imgbb.com/1/upload', {
	            method: 'POST',
	            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
	            body: payload
	          });

	          if (!uploadResp.ok) {
	            const text = await uploadResp.text().catch(() => '');
	            console.log(`   ⚠️ ImgBB upload failed: ${uploadResp.status} ${text}`);
	            return null;
	          }

	          const json = await uploadResp.json();
	          return json?.data?.url || null;
	        } catch (err) {
	          console.log(`   ⚠️ ImgBB upload error: ${err instanceof Error ? err.message : 'unknown'}`);
	          return null;
	        }
	      };

      // Carousel (LinkedIn/Instagram): generate one image per slide
      const isCarousel = options.format === 'carousel' && (options.platform === 'linkedin' || options.platform === 'instagram');
      if (isCarousel) {
        const carouselPlatform = options.platform;
        const platformLabel = carouselPlatform === 'instagram' ? 'Instagram' : 'LinkedIn';
        console.log(`   🧩 ${platformLabel} carousel detected — generating slide images...`);

	        const contentEntries = Object.values(this.stateManager?.state?.content || {}).filter(Boolean);
	        const byCompletedAtDesc = (a, b) => {
	          const aTs = new Date(a?.completedAt || a?.updatedAt || a?.createdAt || 0).getTime();
	          const bTs = new Date(b?.completedAt || b?.updatedAt || b?.createdAt || 0).getTime();
	          return bTs - aTs;
	        };

	        const topic = (options.topic || '').trim();
	        const latestContent =
	          (topic
	            ? contentEntries.filter((e) => (e?.topic || '').trim() === topic).sort(byCompletedAtDesc)[0]
	            : null) || contentEntries.sort(byCompletedAtDesc)[0] || null;

        const carousel = latestContent?.contentPack?.platforms?.[carouselPlatform]?.carousel || null;
        const slideCount = Math.min(12, Math.max(5, Number(carousel?.slideCount || 7)));
        const coverText = carousel?.coverText || options.topic || 'Quick Investing Checklist';
        const slides = Array.isArray(carousel?.slides) ? carousel.slides : [];
        const finalSlideCta = carousel?.finalSlideCta || 'Save this checklist • Follow PL Capital';

	        const resolvedSlides = Array.from({ length: slideCount }).map((_, idx) => {
	          const s = slides[idx] || {};
	          const isCover = idx === 0;
	          const isFinal = idx === slideCount - 1;

	          if (isCover) {
	            return {
	              title: coverText,
	              body: s.body || 'Swipe →',
	              highlight: s.highlight || 'Checklist',
	              visualCue: s.visualCue || 'Bold cover headline, minimal icons'
	            };
	          }

	          if (isFinal) {
	            return {
	              title: s.title || 'Quick recap',
	              body: s.body || finalSlideCta,
	              highlight: s.highlight || 'Save',
	              visualCue: s.visualCue || 'Checklist icons + CTA button look'
	            };
	          }

	          return {
	            title: s.title || `Point ${idx}`,
	            body: s.body || 'One clear takeaway.\nOne actionable step.',
	            highlight: s.highlight || 'Key idea',
	            visualCue: s.visualCue || 'Simple icon + mini chart'
	          };
	        });

	        const generatedImages = [];

	        for (let i = 0; i < resolvedSlides.length; i++) {
	          const slide = resolvedSlides[i];
	          const slideNumber = i + 1;
	          const total = resolvedSlides.length;

          const slidePrompt = carouselPlatform === 'instagram'
            ? `Design ONE Instagram carousel slide (1:1 square) for PL Capital (India, finance).
Slide ${slideNumber}/${total}.
Goal: swipe-stopping and saveable, but still premium and compliant.
Layout: bold headline, very short body lines, strong hierarchy, consistent template across slides.
Typography: big, clean, high-contrast; subtle decorative elements; avoid clutter.
Colors: PL palette (navy/blue accents, green highlight). Modern IG aesthetic.
Text to render on slide (exact words):
Heading: ${slide.title}
Body: ${slide.body}
Highlight: ${slide.highlight}
Visual cue: ${slide.visualCue}
Constraints: no guaranteed returns, no “sure-shot” claims. Professional finance tone.`
            : `Design ONE LinkedIn carousel slide (1:1 square) for PL Capital (India, finance).
Slide ${slideNumber}/${total}.
Layout: clean, high-contrast, generous padding, consistent template across slides.
Typography: large bold heading, 1–2 short body lines, small footer.
Colors: PL palette (navy/blue accents, green highlight). Avoid clutter.
Text to render on slide (exact words):
Heading: ${slide.title}
Body: ${slide.body}
Highlight: ${slide.highlight}
Visual cue: ${slide.visualCue}
Constraints: no guaranteed returns, no “sure-shot” claims. Professional LinkedIn look.`;

          console.log(`   ⏳ Generating carousel slide ${slideNumber}/${total}...`);
          const slideResult = await generator.generateSocialGraphic(slidePrompt, carouselPlatform, {
            imageSize: '4K',
            useGrounding: false,
            aspectRatio: '1:1',
            language: options.language,
            numberOfImages: 1
          });

	          const first = slideResult?.images?.[0];
	          if (first) {
	            generatedImages.push(first);
	            console.log(`   ✅ Slide ${slideNumber} generated: ${first.path || first.url || 'success'}`);
	          }
	        }

	        if (process.env.IMGBB_API_KEY && generatedImages.length > 0) {
	          console.log('   ☁️  Uploading carousel slides to ImgBB...');
	          for (const img of generatedImages) {
	            const imagePath = img.path || img.url;
	            const hostedUrl = await uploadToImgBB(imagePath);
	            if (hostedUrl) {
	              img.hostedUrl = hostedUrl;
	              console.log(`   ✅ Uploaded to ImgBB: ${hostedUrl}`);
	            }
	          }
	        } else {
	          console.log('   ℹ️  ImgBB upload skipped (no API key or no images)');
	        }

	        return {
	          success: true,
	          images: generatedImages,
	          features: ['carousel', 'multi-slide']
	        };
	      }

	      // Generate platform-specific graphics using Gemini 3 Pro
	      const prompt = options.prompt || this._buildVisualPrompt(options);
	      console.log(`   Prompt: ${prompt.substring(0, 80)}...`);
	      console.log('   ⏳ Generating image (Gemini 3 Pro, 4K)...\n');

      const result = await generator.generateSocialGraphic(prompt, options.platform, {
        imageSize: '4K',
        useGrounding: true,
        aspectRatio: options.aspectRatio || this._getAspectRatioForFormat(options.format),
        language: options.language  // Pass language for text generation
      });

      console.log(`   ✅ Visual generated: ${result.images[0]?.path || 'success'}`);
      console.log(`   Features: ${result.features?.join(', ') || 'N/A'}`);

	      // Attempt to upload generated images to ImgBB for shareable URLs
	      if (process.env.IMGBB_API_KEY && result.images && result.images.length > 0) {
	        console.log('   ☁️  Uploading visual(s) to ImgBB...');
	        for (const img of result.images) {
	          const imagePath = img.path || img.url;
	          const hostedUrl = await uploadToImgBB(imagePath);
	          if (hostedUrl) {
	            img.hostedUrl = hostedUrl;
	            console.log(`   ✅ Uploaded to ImgBB: ${hostedUrl}`);
	          }
	        }
	      } else {
	        console.log('   ℹ️  ImgBB upload skipped (no API key or no images)');
	      }

      return {
        success: true,
        images: result.images,
        features: result.features
      };
    } catch (error) {
      console.error(`   ❌ Visual generation failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get language name from language code
   */
  _getLanguageName(languageCode) {
    const languageMap = {
      'english': 'English',
      'hinglish': 'Hinglish (Hindi in Latin script)',
      'hindi': 'Hindi',
      'bengali': 'Bengali',
      'telugu': 'Telugu',
      'marathi': 'Marathi',
      'tamil': 'Tamil',
      'gujarati': 'Gujarati',
      'kannada': 'Kannada',
      'malayalam': 'Malayalam',
      'punjabi': 'Punjabi',
      'urdu': 'Urdu',
      'odia': 'Odia',
      'assamese': 'Assamese'
    };
    return languageMap[languageCode] || 'English';
  }

  /**
   * Build visual prompt based on options
   */
  _buildVisualPrompt(options) {
    const { platform, format, topic, type, brandSettings, language = 'english', whatsapp } = options;
    const languageName = this._getLanguageName(language);

    const defaultBrand = 'PL Capital brand palette: Navy (#0e0e6a), Blue (#3c3cf8), Teal (#00d084), Green (#66e766); typography: Figtree; tone: professional, trustworthy, data-driven.';
    const customBrandColors = brandSettings?.customColors
      ? `Brand colors: ${brandSettings.customColors}.`
      : '';
    const brandTone = brandSettings?.customTone
      ? `Tone: ${brandSettings.customTone}.`
      : '';
    const brandInstructions = brandSettings?.customInstructions
      ? `Additional guidance: ${brandSettings.customInstructions}.`
      : '';
    const brandGuidance = brandSettings
      ? `${customBrandColors} ${brandTone} ${brandInstructions}`.trim() || defaultBrand
      : defaultBrand;

    const safeFormat = format || 'image';

    const languageInstruction = language !== 'english'
      ? ` All text, labels, and content must be in ${languageName}.`
      : '';

    const basePrompts = {
      linkedin: `Professional ${safeFormat} graphic for LinkedIn about ${topic || 'financial investment'}. Corporate blue and green color scheme, clean modern design, trust-building aesthetic.${languageInstruction}`,
      instagram: `Eye-catching ${safeFormat} visual for Instagram about ${topic || 'investment growth'}. Vibrant colors, modern gradient background, engaging social media aesthetic.${languageInstruction}`,
      youtube: `High-quality ${safeFormat} thumbnail/graphic for YouTube about ${topic || 'wealth building'}. Bold text, high contrast, attention-grabbing design.${languageInstruction}`,
      facebook: `Engaging ${safeFormat} post graphic for Facebook about ${topic || 'financial planning'}. Community-focused, accessible design, clear messaging.${languageInstruction}`,
      twitter: `Concise ${safeFormat} visual for Twitter about ${topic || 'market insights'}. Clean, minimal design optimized for quick engagement.${languageInstruction}`,
      whatsapp: (() => {
        const headline = whatsapp?.headline ? String(whatsapp.headline).trim() : '';
        const body = whatsapp?.body ? String(whatsapp.body).trim() : '';
        const cta = whatsapp?.cta ? String(whatsapp.cta).trim() : '';
        const contentSpec = (headline || body || cta)
          ? `Text to render (exact):
Headline: ${headline || (topic || 'Your offer')}
Body: ${body || 'One clear benefit.\nOne clear next step.'}
CTA: ${cta || 'Learn more'}`
          : `Text-forward layout with a bold headline and a single CTA.`;

        return `High-contrast, text-forward static image for WhatsApp. 1080x1920 portrait-friendly layout, bold headline, single CTA, clear brand colors.
${contentSpec}
Design: clean, high readability on small screens, minimal elements, strong hierarchy.
Constraints: no guaranteed returns, no exaggerated claims.${languageInstruction} ${brandGuidance}`;
      })()
    };

    return basePrompts[platform] || basePrompts.linkedin;
  }

  /**
   * Get optimal aspect ratio for content format
   */
  _getAspectRatioForFormat(format) {
    const aspectRatios = {
      'carousel': '1:1',
      'post': '1:1',
      'story': '9:16',
      'reel': '9:16',
      'thumbnail': '16:9',
      'explainer': '16:9',
      'cover': '16:9'
    };

    return aspectRatios[format] || '1:1';
  }

  async stageVideo(options) {
    console.log('🎥 Stage 4: Video Production');
    console.log(`   Platform: ${options.platform}`);
    console.log(`   Duration: ${options.duration}s`);
    console.log(`   Aspect Ratio: ${options.aspectRatio || '16:9'}`);
    if (options.language) {
      console.log(`   Language: ${this._getLanguageName(options.language)}`);
    }
    console.log(`   Method: ${options.useVeo ? 'Veo 3.1' : 'Auto-detect'} ${options.useAvatar ? '+ Avatar' : ''}\n`);

    if (this.simulate) {
      console.log('   [SIMULATED] Video generated');
      return { success: true, simulated: true };
    }

    // Check for LongCat configuration from environment variables
    const useLongCat = process.env.LONGCAT_ENABLED === 'true';
    const longCatMode = process.env.LONGCAT_MODE || 'text-to-video';
    const longCatPrompt = process.env.LONGCAT_PROMPT || '';

    try {
      // Initialize video coordinator
      const coordinator = new VideoCoordinator({
        simulate: this.simulate,
        outputDir: path.join(this.projectRoot, 'output', 'videos')
      });

      // Check for custom JSON prompt from environment or options
      const customPromptJson = process.env.VIDEO_PROMPT_JSON || options.videoPromptJson;
      let prompt;
      let scenePrompts = null;
      let promptData = null;

      if (customPromptJson) {
        try {
          promptData = typeof customPromptJson === 'string'
            ? JSON.parse(customPromptJson)
            : customPromptJson;

          // Extract scene prompts if motion timeline exists
          if (promptData.motion && typeof promptData.motion === 'object') {
            scenePrompts = this._extractScenePromptsFromJson(promptData);
            console.log(`   🎬 Detected ${scenePrompts.length} scene prompts from motion timeline`);
          }

          prompt = this._buildPromptFromJson(promptData);
          console.log('   📋 Using custom JSON prompt structure');
        } catch (error) {
          console.log(`   ⚠️  Invalid JSON prompt, falling back to default: ${error.message}`);
          prompt = longCatPrompt || this._buildVideoPrompt(options);
        }
      } else {
        prompt = longCatPrompt || this._buildVideoPrompt(options);
      }

      const requestedDuration = options.duration || 90;

      // Check if this is avatar mode (VEO-based avatar generation)
      const isAvatarMode = options.useAvatar === true;
      const looksLikeHeyGenAvatarId = (value) =>
        typeof value === 'string' && /^[a-f0-9]{32}$/i.test(value.trim());

      const isHeyGenAvatar =
        options.avatarId === 'siddharth-vora' ||
        looksLikeHeyGenAvatarId(options.avatarId) ||
        Boolean(options.heygenAvatarGroupId) ||
        Boolean(options.heygenAvatarId);

      // For avatar mode (non-HeyGen), augment prompt with avatar and voice descriptions
      if (isAvatarMode && !isHeyGenAvatar) {
        console.log('   🎭 Avatar mode detected (VEO-based)');

        const avatarDescription = options.avatarDescription || 'Indian male professional in formal business attire, confident posture, warm expression';
        const voiceDescription = options.voiceDescription || 'Deep, confident Indian male voice with slight accent, clear articulation';

        // Auto-generate script instruction if not provided
        let scriptInstruction;
        if (options.scriptText) {
          scriptInstruction = `speaking the following script: "${options.scriptText}"`;
          console.log(`   📝 Script: ${options.scriptText.substring(0, 60)}...`);
        } else {
          // Generate script instruction based on platform and topic
          const topic = options.topic || 'financial services and investment opportunities';
          const platform = options.platform || 'linkedin';
          const format = options.format || 'testimonial';

          const languageName = this._getLanguageName(options.language || 'english');
          const languageInstruction = options.language && options.language !== 'english'
            ? ` All speech and dialogue must be in ${languageName}.`
            : '';
          scriptInstruction = `delivering a professional ${format} about ${topic} for ${platform}. Generate natural, engaging speech that is informative, trustworthy, and appropriate for the platform. Include key points, benefits, and a clear message. Speech should be conversational yet professional, matching Indian business communication style.${languageInstruction}`;

          console.log(`   📝 Script: [Auto-generated for ${topic}]`);
        }

        console.log(`   👤 Avatar: ${avatarDescription}`);
        console.log(`   🎙️  Voice: ${voiceDescription}`);

        // Augment prompt with avatar and voice context
        const avatarPrompt = `Professional video featuring ${avatarDescription}. ${voiceDescription} ${scriptInstruction}. Camera: Medium shot, professional framing, slight depth of field. Lighting: Soft key light, professional studio setup with subtle rim lighting. Background: Elegant office environment with soft bokeh, professional corporate setting. ${prompt}`;

        prompt = avatarPrompt;
        console.log('   ✅ Avatar prompt constructed\n');
      }

      // HeyGen avatar routing for Siddharth Vora
      if (isAvatarMode && isHeyGenAvatar) {
        const prettyAvatarId = (value) => {
          if (!value) return '';
          const s = String(value).trim();
          return s.length > 12 ? `${s.slice(0, 8)}…` : s;
        };

        const avatarDisplayName =
          options.avatarId === 'siddharth-vora'
            ? 'Siddharth Vora (Custom)'
            : `HeyGen Avatar (${prettyAvatarId(options.avatarId || options.heygenAvatarId)})`;

        console.log('\n🎬 HeyGen Avatar Mode');
        console.log(`   Provider: HeyGen`);
        console.log(`   Avatar: ${avatarDisplayName}`);
        console.log(`   Duration: ${requestedDuration}s\n`);

        // Check for HeyGen API key
        if (!process.env.HEYGEN_API_KEY) {
          throw new Error('HEYGEN_API_KEY environment variable is required for HeyGen avatar generation');
        }

        // Generate or use script
        let scriptText;
        if (options.scriptText) {
          scriptText = options.scriptText;
          console.log(`   📝 Script: ${scriptText.substring(0, 60)}...`);
        } else {
          // Generate a REAL spoken script (not meta-instructions)
          try {
            scriptText = await this._generateHeyGenScript({
              topic: options.topic,
              platform: options.platform,
              format: options.format,
              duration: requestedDuration,
              language: options.language
            });
          } catch (error) {
            console.log(`   ⚠️  Script generation failed; using fallback: ${error.message}`);
            const topic = options.topic || 'PL Capital investing insights';
            scriptText = `Hi, quick update from PL Capital. ${topic}. If you want a portfolio review or a plan, talk to us today. Market risks apply.`;
          }

          console.log(`   📝 Script: ${scriptText.substring(0, 60)}...`);
        }

        // Get HeyGen avatar and voice IDs from options or use defaults
        const heygenAvatarId =
          options.heygenAvatarId ||
          (looksLikeHeyGenAvatarId(options.avatarId) ? options.avatarId : null) ||
          process.env.HEYGEN_AVATAR_ID_SIDDHARTH;

        const heygenVoiceId =
          options.heygenVoiceId ||
          options.avatarVoiceId ||
          process.env.HEYGEN_VOICE_ID_SIDDHARTH;

        if (!heygenAvatarId) {
          throw new Error('HeyGen avatar ID not configured. Set HEYGEN_AVATAR_ID_SIDDHARTH or pass heygenAvatarId');
        }
        if (!heygenVoiceId) {
          throw new Error('HeyGen voice ID not configured. Set HEYGEN_VOICE_ID_SIDDHARTH or pass heygenVoiceId');
        }

        console.log(`   👤 HeyGen Avatar ID: ${heygenAvatarId}`);
        console.log(`   🎙️  HeyGen Voice ID: ${heygenVoiceId}`);

        let heygenResult; // Declare result variable for HeyGen section

        try {
          // Generate HeyGen video using MCP tool
          const apiResult = await this._callMcpTool('mcp__heygen__generate_avatar_video', {
            avatar_id: heygenAvatarId,
            voice_id: heygenVoiceId,
            input_text: scriptText,
            title: options.title || `Avatar Video - ${options.topic || 'Content'}`,
            aspect_ratio: options.aspectRatio || '16:9'
          });

          console.log(`   ✅ HeyGen video generation started`);
          console.log(`   Video ID: ${apiResult.video_id}`);

          // Build result object
          heygenResult = {
            videoUrl: null,
            localPath: null,
            duration: requestedDuration,
            metadata: {
              type: 'heygen-avatar',
              videoId: apiResult.video_id,
              status: 'pending',
              avatar: options.avatarId || 'heygen',
              message: 'Video generation started. Check status with video ID or at https://app.heygen.com/home'
            }
          };

          const shouldWaitForCompletion =
            options.waitForCompletion === true ||
            process.env.HEYGEN_FORCE_WAIT === 'true' ||
            Boolean(process.env.RAILWAY_ENVIRONMENT) ||
            Boolean(process.env.PORT);

          // Wait for completion (required for a playable URL in the UI)
          if (shouldWaitForCompletion) {
            console.log(`   ⏳ Waiting for HeyGen video to complete...`);

            let status = 'pending';
            let attempts = 0;
            const maxAttempts = 120; // 10 minutes max wait (5s intervals)

            while ((status === 'pending' || status === 'processing' || status === 'queued') && attempts < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s

              const statusResult = await this._callMcpTool('mcp__heygen__get_avatar_video_status', {
                video_id: heygenResult.metadata.videoId
              });

              status = statusResult.status;
              console.log(`   Status: ${status} (${attempts + 1}/${maxAttempts})`);

              attempts++;
            }

            if (status === 'completed') {
              const finalStatus = await this._callMcpTool('mcp__heygen__get_avatar_video_status', {
                video_id: heygenResult.metadata.videoId
              });

              heygenResult = {
                videoUrl: finalStatus.video_url,
                localPath: null, // HeyGen videos are cloud-hosted
                duration: requestedDuration,
                metadata: {
                  type: 'heygen-avatar',
                  videoId: heygenResult.metadata.videoId,
                  avatar: 'siddharth-vora'
                }
              };

              console.log(`   ✅ HeyGen video completed: ${finalStatus.video_url}`);
            } else {
              console.log(`   ⚠️  HeyGen video still processing. Check status later at https://app.heygen.com/home`);
              heygenResult.metadata.status = status;
              heygenResult.metadata.message = 'Video is still processing. Check HeyGen dashboard for status.';
            }
          } else {
            console.log(`   ℹ️  HeyGen video generation started (async mode)`);
            console.log(`   Video ID: ${heygenResult.metadata.videoId}`);
          }
        } catch (error) {
          throw new Error(`HeyGen avatar video generation failed: ${error.message}`);
        }

        // Skip to final return
        console.log(`\n✅ HeyGen avatar video generation completed!`);
        if (heygenResult.videoUrl) {
          console.log(`   Video URL: ${heygenResult.videoUrl}`);
        }
        console.log(`   Duration: ${heygenResult.duration}s`);

        return {
          success: true,
          videoUrl: heygenResult.videoUrl,
          localPath: heygenResult.localPath,
          hostedUrl: heygenResult.videoUrl, // HeyGen videos are already hosted
          duration: heygenResult.duration,
          metadata: heygenResult.metadata
        };
      }

      // Determine if we should use scene extension (for VEO videos > 8s)
      const shouldUseSceneExtension = !useLongCat &&
                                       options.useVeo !== false &&
                                       requestedDuration > 8 &&
                                       requestedDuration <= 148;

      let result;

      if (shouldUseSceneExtension && scenePrompts && scenePrompts.length > 1) {
        // Use scene-based generation with motion timeline
        console.log(`\n📹 Generating video with scene extension...`);
        console.log(`   Provider: VEO 3.1 (Scene Extension)`);
        console.log(`   Total Scenes: ${scenePrompts.length}`);
        console.log(`   Target Duration: ${requestedDuration}s`);
        console.log(`   Estimated Duration: ${8 + (scenePrompts.length - 1) * 7}s\n`);

        // Initialize VEO generator
        const VideoGenerator = require('../video/video-generator');
        const veoGenerator = new VideoGenerator({
          apiKey: process.env.GEMINI_API_KEY,
          simulate: this.simulate
        });

        const veoConfig = {
          aspectRatio: options.aspectRatio || '16:9',
          resolution: '720p',
          // According to Veo 3.1 docs: Text-to-video & Extension require "allow_all" only
          // For faceless videos, we use "allow_all" but rely on prompt constraints ("NO PEOPLE, NO FACES, NO HUMANS")
          // For avatar videos, we also use "allow_all" (text-to-video mode)
          personGeneration: 'allow_all'  // Required for text-to-video mode (Veo 3.1)
        };

        result = await veoGenerator.generateLongVideo(
          scenePrompts[0],  // Base prompt (8s)
          scenePrompts.slice(1),  // Extension prompts (7s each)
          veoConfig
        );

        // Normalize result to match coordinator format
        result = {
          videoUrl: result.finalVideoUri,
          localPath: result.finalVideoUri,
          duration: result.totalDuration,
          metadata: {
            type: 'long-video',
            totalClips: result.totalClips,
            sceneCount: scenePrompts.length
          }
        };

      } else if (shouldUseSceneExtension && !scenePrompts) {
        // Auto-generate scene variations for default prompts
        console.log(`\n📹 Generating video with auto scene extension...`);
        console.log(`   Provider: VEO 3.1 (Scene Extension)`);
        console.log(`   Target Duration: ${requestedDuration}s`);
        console.log(`   Mode: ${isAvatarMode ? 'Avatar' : 'Faceless'}`);

        const autoScenePrompts = this._generateAutoScenePrompts(prompt, requestedDuration, isAvatarMode);
        console.log(`   Auto Scenes: ${autoScenePrompts.length}\n`);

        // Initialize VEO generator
        const VideoGenerator = require('../video/video-generator');
        const veoGenerator = new VideoGenerator({
          apiKey: process.env.GEMINI_API_KEY,
          simulate: this.simulate
        });

        const veoConfig = {
          aspectRatio: options.aspectRatio || '16:9',
          resolution: '720p',
          // According to Veo 3.1 docs: Text-to-video & Extension require "allow_all" only
          // For faceless videos, we use "allow_all" but rely on prompt constraints ("NO PEOPLE, NO FACES, NO HUMANS")
          // For avatar videos, we also use "allow_all" (text-to-video mode)
          personGeneration: 'allow_all'  // Required for text-to-video mode (Veo 3.1)
        };

        result = await veoGenerator.generateLongVideo(
          autoScenePrompts[0],
          autoScenePrompts.slice(1),
          veoConfig
        );

        result = {
          videoUrl: result.finalVideoUri,
          localPath: result.finalVideoUri,
          duration: result.totalDuration,
          metadata: {
            type: 'long-video',
            totalClips: result.totalClips,
            sceneCount: autoScenePrompts.length
          }
        };

      } else {
        // Standard single-prompt generation (LongCat or short VEO)
        const videoConfig = {
          prompt: prompt,
          duration: requestedDuration,
          mode: longCatMode,
          aspectRatio: options.aspectRatio || '16:9',
          useLongCat: useLongCat,
          useVeo: options.useVeo && !useLongCat
        };

        console.log(`\n📹 Generating video...`);
        console.log(`   Provider: ${useLongCat ? 'LongCat (fal.ai)' : options.useVeo ? 'VEO 3.1' : 'Auto'}`);
        console.log(`   Mode: ${videoConfig.mode}`);

        result = await coordinator.generateVideo(videoConfig);
      }

      console.log(`\n✅ Video generation completed!`);
      console.log(`   Video path: ${result.localPath || result.videoUrl}`);
      console.log(`   Duration: ${result.duration}s`);

      // NEW: Upload video to Cloudinary for hosting
      let hostedVideoUrl = null;

      if (result.localPath && fs.existsSync(result.localPath)) {
        hostedVideoUrl = await this._uploadVideoToCloudinary(result.localPath);

        if (hostedVideoUrl) {
          result.hostedUrl = hostedVideoUrl;
        }
      } else if (result.videoUrl && result.videoUrl.startsWith('http')) {
        // If video is already hosted (e.g., HeyGen), use that URL
        hostedVideoUrl = result.videoUrl;
        console.log(`   ℹ️  Video already hosted: ${hostedVideoUrl}`);
      }

      return {
        success: true,
        videoUrl: result.videoUrl,
        localPath: result.localPath,
        hostedUrl: hostedVideoUrl,  // Add hosted URL for WhatsApp
        duration: result.duration,
        metadata: result.metadata
      };

    } catch (error) {
      console.error(`\n❌ Video production failed: ${error.message}`);

      // Check for missing API keys
      if (error.message.includes('FAL_KEY')) {
        console.error('   Set FAL_KEY environment variable for LongCat video generation');
      }
      if (error.message.includes('GEMINI_API_KEY')) {
        console.error('   Set GEMINI_API_KEY environment variable for VEO video generation');
      }

      return { success: false, error: error.message };
    }
  }

  /**
   * Build video generation prompt based on options
   * Updated to generate faceless videos by default with explicit constraints
   */
  _buildVideoPrompt(options) {
    const { platform, format, topic, type, language = 'english' } = options;
    const languageName = this._getLanguageName(language);

    // Language instruction for video content
    const languageInstruction = language !== 'english'
      ? ` All on-screen text, labels, captions, and any spoken content must be in ${languageName}.`
      : '';

    // Faceless video prompts with explicit "no people" constraints
    const basePrompts = {
      linkedin: `Faceless professional ${format || 'business'} video about ${topic || 'financial services'}. NO PEOPLE, NO FACES, NO HUMANS. Abstract data visualizations, animated charts and graphs, geometric shapes, motion graphics only. Corporate blue and teal color palette with navy accents. Dynamic camera movements orbiting around 3D data elements. Volumetric lighting with soft glows. Modern, clean, premium aesthetic. Cinematic quality. 16:9 aspect ratio.${languageInstruction}`,

      instagram: `Instagram Reels-style faceless ${format || 'reel'} about ${topic || 'money tips'} for an Indian audience. NO PEOPLE, NO FACES, NO HUMANS.
Editing & format: 9:16 vertical, 0.5–1.2s fast cuts, strong hook in first 1–2 seconds, loopable ending, bold subtitles throughout, high contrast, trending finfluencer pacing.
Visual style: clean motion graphics + relatable India cues (₹ symbol, SIP, tax calendar, salary-day motif, Indian market charts) WITHOUT giving personalized advice. Use modern gradients, kinetic typography, animated charts, icons, quick zooms, whip transitions.
On-screen text: short punchy lines (max ~36 chars/line), 6–8 lines across the video; emphasize 1–2 key numbers (e.g., “₹100 SIP”, “3-step checklist”) without promises.
Audio note: suggest energetic background beat (no copyrighted lyrics). End with a clear CTA on screen like “Save this” / “Follow for more”.${languageInstruction}`,

      youtube: (() => {
        const isShort = /short/i.test(format || '') || /youtube-short/i.test(type || '');
        if (isShort) {
          return `YouTube Shorts-style faceless video about ${topic || 'money tips'} for an Indian audience. NO PEOPLE, NO FACES, NO HUMANS.
Format: 9:16 vertical, 20–35s, ultra-fast pacing, hook in first 1s, pattern interrupts every ~2s, loopable ending.
Visuals: kinetic typography + bold subtitles, animated charts (Nifty/Sensex style), ₹ symbol, SIP/tax calendar motifs. Clean, high-contrast, modern finance look.
On-screen text: 7–10 short lines, max ~32 chars/line; highlight 1–2 key numbers/terms without promises.
Editing: jump cuts, zooms, whip transitions, whoosh SFX (no copyrighted music/lyrics). End screen CTA: “Save + Follow for more”.${languageInstruction}`;
        }
        return `Faceless educational ${format || 'explainer'} video about ${topic || 'wealth building'}. NO PEOPLE, NO FACES, NO HUMANS. Animated educational graphics, step-by-step visual diagrams, 3D charts and statistics, icon animations, timeline visualizations. Clear visual hierarchy. Professional presentation with smooth transitions. Clean modern design with focus on information delivery. 16:9 landscape format.${languageInstruction}`;
      })(),

      facebook: `Faceless community-focused ${format || 'post'} video about ${topic || 'financial planning'}. NO PEOPLE, NO FACES, NO HUMANS. Friendly animated graphics, simple infographics, icon-based storytelling, warm color palette, accessible visual language. Relatable abstract symbols and metaphors. Clear messaging through visuals and text overlays. 1:1 or 16:9 format.${languageInstruction}`,

      twitter: `Faceless concise ${format || 'update'} video about ${topic || 'market insights'}. NO PEOPLE, NO FACES, NO HUMANS. Quick-cut motion graphics, animated statistics, bold data visualizations, minimal design. High contrast colors for attention. Fast-paced transitions. Optimized for quick engagement and shareability. Clean professional look. 16:9 format.${languageInstruction}`,

      whatsapp: `High-contrast, text-forward static image for WhatsApp about ${topic || 'your offer'}. 1080x1920 portrait-friendly layout, bold headline, single CTA, clear brand colors.${languageInstruction}`
    };

    return basePrompts[platform] || basePrompts.linkedin;
  }

  /**
   * Build video prompt from structured JSON format
   * Converts detailed JSON prompt structure into comprehensive text prompt for Veo
   * @private
   * @param {object} promptData - Structured prompt data
   * @returns {string} Formatted text prompt
   */
  _buildPromptFromJson(promptData) {
    const parts = [];

    // Product/Brand context
    if (promptData.brand) {
      parts.push(`${promptData.brand} brand video`);
    }
    if (promptData.product) {
      parts.push(`showcasing ${promptData.product}`);
    }

    // Description
    if (promptData.description) {
      parts.push(`- ${promptData.description}`);
    }

    // Style attributes
    if (promptData.style) {
      const styleDesc = Array.isArray(promptData.style)
        ? promptData.style.join(', ')
        : promptData.style;
      parts.push(`Style: ${styleDesc}.`);
    }

    // Camera work
    if (promptData.camera) {
      const cameraDesc = Array.isArray(promptData.camera)
        ? promptData.camera.join(', ')
        : promptData.camera;
      parts.push(`Camera: ${cameraDesc}.`);
    }

    // Lighting
    if (promptData.lighting) {
      const lightingDesc = Array.isArray(promptData.lighting)
        ? promptData.lighting.join(', ')
        : promptData.lighting;
      parts.push(`Lighting: ${lightingDesc}.`);
    }

    // Environment
    if (promptData.environment) {
      parts.push(`Environment: ${promptData.environment}.`);
    }

    // Color palette
    if (promptData.color_palette && promptData.color_palette.length > 0) {
      parts.push(`Colors: ${promptData.color_palette.join(', ')}.`);
    }

    // Visual elements
    if (promptData.elements && promptData.elements.length > 0) {
      parts.push(`Elements: ${promptData.elements.join(', ')}.`);
    }

    // Motion timeline (convert object to narrative)
    if (promptData.motion && typeof promptData.motion === 'object') {
      parts.push('\nMotion sequence:');
      Object.entries(promptData.motion).forEach(([timeRange, action]) => {
        parts.push(`${timeRange}: ${action}`);
      });
    }

    // Ending
    if (promptData.ending) {
      parts.push(`\nEnding: ${promptData.ending}.`);
    }

    // Explicit constraints
    const constraints = [];
    if (promptData.text !== undefined) {
      if (promptData.text === 'none' || promptData.text === null) {
        constraints.push('No text on screen');
      } else if (promptData.text) {
        constraints.push(`Text: "${promptData.text}"`);
      }
    }
    if (promptData.audio !== undefined) {
      if (promptData.audio === 'none' || promptData.audio === null) {
        constraints.push('No audio');
      } else if (promptData.audio) {
        constraints.push(`Audio: ${promptData.audio}`);
      }
    }
    if (constraints.length > 0) {
      parts.push(`\nConstraints: ${constraints.join(', ')}.`);
    }

    // Keywords for emphasis
    if (promptData.keywords && promptData.keywords.length > 0) {
      parts.push(`\nKeywords: ${promptData.keywords.join(', ')}.`);
    }

    // Duration
    if (promptData.duration) {
      parts.push(`\nDuration: ${promptData.duration} seconds.`);
    }

    return parts.join(' ');
  }

  /**
   * Upload video to Cloudinary for hosting
   * @private
   * @param {string} videoPath - Local path to video file
   * @returns {Promise<string|null>} Hosted video URL or null on failure
   */
  async _uploadVideoToCloudinary(videoPath) {
    // Parse Cloudinary URL: cloudinary://API_KEY:API_SECRET@CLOUD_NAME
    const cloudinaryUrl = process.env.CLOUDINARY_URL;

    if (!cloudinaryUrl) {
      console.log('   ⚠️  CLOUDINARY_URL not configured. Set it to upload videos.');
      return null;
    }

    try {
      // Parse credentials from URL
      const urlMatch = cloudinaryUrl.match(/cloudinary:\/\/(\d+):([^@]+)@(.+)/);
      if (!urlMatch) {
        console.log('   ⚠️  Invalid CLOUDINARY_URL format');
        return null;
      }

      const [, apiKey, apiSecret, cloudName] = urlMatch;

      console.log('   ☁️  Uploading video to Cloudinary...');

      // Use official Cloudinary SDK for reliable uploads
      const cloudinary = require('cloudinary').v2;
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret
      });

      const result = await cloudinary.uploader.upload(videoPath, {
        resource_type: 'video',
        folder: 'social-media'
      });

      const hostedUrl = result.secure_url;

      if (hostedUrl) {
        console.log(`   ✅ Video uploaded to Cloudinary: ${hostedUrl}`);
        console.log(`      Public ID: ${result.public_id}`);
        console.log(`      Duration: ${result.duration}s`);
        console.log(`      Size: ${(result.bytes / 1024 / 1024).toFixed(2)} MB`);
        return hostedUrl;
      }

      return null;
    } catch (error) {
      console.log(`   ⚠️  Cloudinary upload error: ${error.message}`);
      return null;
    }
  }

  async stagePublishing(options) {
    console.log('📤 Stage 5: Multi-Platform Publishing');
    console.log(`   Platform: ${options.platform || 'all'}\n`);

    if (this.simulate) {
      console.log('   [SIMULATED] Content published');
      return;
    }

    // Email newsletter publishing via MoEngage
    const isEmailNewsletter = (options.platform && options.platform.includes('email')) ||
      (options.type && options.type.includes('email'));

    const isWhatsApp = options.platform && options.platform.includes('whatsapp');

    try {
      const publisher = getMoengageEmailPublisher();
      const newsletter = publisher.loadLatestNewsletter(options.topic);

      if (isEmailNewsletter || newsletter) {
        if (!newsletter) {
          console.log('   ⚠️  No email newsletter content found in workflow-state.json');
          return;
        }

        console.log(`   📧 Publishing newsletter via MoEngage (subject: ${newsletter.subject})...`);
        await publisher.publishNewsletter({
          ...newsletter,
          topic: newsletter.topic || options.topic
        });
        console.log('   ✅ Newsletter push sent to MoEngage (SendGrid-backed campaign)');
        return;
      }

      if (isWhatsApp) {
        const creativeUrl = options.creativeUrl || options.whatsappImageUrl || options.whatsappVideoUrl;
        const cta = options.cta || options.whatsappCta;

        if (!creativeUrl) {
          console.log('   ⚠️  No WhatsApp creative URL provided; skipping WhatsApp push.');
          console.log('   💡 Tip: For images, pass options.whatsappImageUrl (from stageContent result)');
          console.log('   💡 Tip: For videos, pass options.whatsappVideoUrl (from stageVideo hostedUrl)');
          console.log('   💡 Example: await stagePublishing({ platform: "whatsapp", whatsappVideoUrl: videoResult.hostedUrl })');
          return;
        }

        const isVideo = creativeUrl.includes('.mp4') || creativeUrl.includes('video') || options.whatsappVideoUrl;
        const mediaType = isVideo ? 'video' : 'image';

        console.log(`   💬 Publishing WhatsApp ${mediaType} via MoEngage (event: WhatsAppCreativeReady)...`);
        console.log(`   🔗 Creative URL: ${creativeUrl.substring(0, 60)}...`);

        await publisher.publishWhatsAppCreative({
          topic: options.topic,
          creativeUrl,
          cta
        });
        console.log(`   ✅ WhatsApp ${mediaType} push sent to MoEngage (Interakt-backed campaign expected)`);
        return;
      }
    } catch (error) {
      console.error(`   ❌ MoEngage publish failed: ${error.message}`);
      return;
    }

    // TODO: Implement other platform publishing integrations
    console.log('   ⚠️  Publishing not yet implemented for non-email platforms');
  }

  async stageTracking(options) {
    console.log('📊 Stage 6: Performance Tracking');

    if (this.simulate) {
      console.log('   [SIMULATED] Metrics tracked');
      return;
    }

    // MoEngage reporting for WhatsApp/Email (requires MOENGAGE_* env)
    const isWhatsApp = options.platform && options.platform.includes('whatsapp');
    const isEmail = options.platform && options.platform.includes('email');

    if (isWhatsApp || isEmail) {
      try {
        const client = getMoengageClient();
        const now = Date.now();
        const fromTs = now - 24 * 60 * 60 * 1000;
        const params = {
          event_name: isWhatsApp ? 'WhatsAppCreativeReady' : 'EmailNewsletterReady',
          from: fromTs,
          to: now,
          limit: 50
        };

        console.log('   📡 Fetching MoEngage business events for last 24h...');
        const data = await client.getBusinessEvents(params);
        console.log(`   ✅ Retrieved ${Array.isArray(data?.data) ? data.data.length : 0} events`);
        if (Array.isArray(data?.data) && data.data.length) {
          const recent = data.data.slice(0, 5);
          recent.forEach((item, idx) => {
            console.log(`     [${idx + 1}] ${item.event_name || 'event'} :: ${item.event_timestamp || ''}`);
          });
        }
      } catch (error) {
        console.error(`   ❌ MoEngage tracking fetch failed: ${error.message}`);
      }
    } else {
      console.log('   ⚠️  Tracking not yet implemented for this platform');
    }
  }

  /**
   * Placeholder campaign handlers
   */

  async runLinkedInDataViz(options) {
    console.log('📊 LinkedIn Data Viz - Not yet implemented');
  }

  async runInstagramCarousel(options) {
    console.log('📸 Instagram Carousel - Not yet implemented');
  }

  async runYouTubeShort(options) {
    console.log('📱 YouTube Short - Not yet implemented');
  }

  async runFacebookCommunity(options) {
    console.log('👥 Facebook Community - Not yet implemented');
  }

  async runTwitterThread(options) {
    console.log('🐦 Twitter Thread - Not yet implemented');
  }

  async runEmailNewsletter(options) {
    console.log('📧 Email Newsletter Campaign');
    console.log(`   Topic: ${options.topic}\n`);

    await this.stageContent({
      platform: 'email',
      format: 'newsletter',
      topic: options.topic,
      type: 'email-newsletter',
      language: options.language
    });

    await this.stagePublishing({
      platform: 'email',
      type: 'email-newsletter',
      topic: options.topic
    });

    console.log('\n✅ Email newsletter publishing trigger sent!\n');
  }

  /**
   * Extract scene-specific prompts from JSON motion timeline
   * Converts motion timeline object into array of scene prompts for VEO extension
   * @private
   * @param {object} promptData - Full JSON prompt data
   * @returns {Array<string>} Array of scene prompts [base, extension1, extension2...]
   */
  _extractScenePromptsFromJson(promptData) {
    const scenePrompts = [];

    // Build base context (brand, product, style, etc.) to apply to all scenes
    const baseContext = [];
    if (promptData.brand) baseContext.push(`${promptData.brand} brand video`);
    if (promptData.product) baseContext.push(`showcasing ${promptData.product}`);
    if (promptData.description) baseContext.push(promptData.description);

    const styleElements = [];
    if (promptData.style) {
      const styleDesc = Array.isArray(promptData.style) ? promptData.style.join(', ') : promptData.style;
      styleElements.push(`Style: ${styleDesc}`);
    }
    if (promptData.lighting) {
      const lightingDesc = Array.isArray(promptData.lighting) ? promptData.lighting.join(', ') : promptData.lighting;
      styleElements.push(`Lighting: ${lightingDesc}`);
    }
    if (promptData.environment) {
      styleElements.push(`Environment: ${promptData.environment}`);
    }
    if (promptData.color_palette && promptData.color_palette.length > 0) {
      styleElements.push(`Colors: ${promptData.color_palette.join(', ')}`);
    }
    if (promptData.elements && promptData.elements.length > 0) {
      styleElements.push(`Elements: ${promptData.elements.join(', ')}`);
    }

    const constraints = [];
    if (promptData.text === 'none' || promptData.text === null) {
      constraints.push('No text on screen');
    }
    if (promptData.keywords && promptData.keywords.length > 0) {
      constraints.push(`Keywords: ${promptData.keywords.join(', ')}`);
    }

    // Sort motion timeline entries by time (e.g., "0-1s", "1-3s", "3-5s")
    const motionEntries = Object.entries(promptData.motion).sort((a, b) => {
      const aStart = parseInt(a[0].split('-')[0]);
      const bStart = parseInt(b[0].split('-')[0]);
      return aStart - bStart;
    });

    // Group timeline entries into scenes (base = first ~8s of motion, extensions = ~7s each)
    const baseMotion = [];
    const extensionMotions = [];

    motionEntries.forEach(([timeRange, action], index) => {
      if (index === 0 || index === 1) {
        // First 2 entries = base scene (8s)
        baseMotion.push(`${timeRange}: ${action}`);
      } else {
        // Subsequent entries = extensions (7s each)
        extensionMotions.push({ timeRange, action });
      }
    });

    // Build base scene prompt (8s)
    const basePrompt = [
      ...baseContext,
      ...styleElements,
      `Motion: ${baseMotion.map(m => m).join('; ')}`,
      constraints.join(', ')
    ].filter(Boolean).join('. ') + '.';

    scenePrompts.push(basePrompt);

    // Build extension prompts (7s each)
    extensionMotions.forEach(({ timeRange, action }) => {
      const extensionPrompt = [
        ...baseContext,
        ...styleElements,
        `${timeRange}: ${action}`,
        constraints.join(', ')
      ].filter(Boolean).join('. ') + '.';

      scenePrompts.push(extensionPrompt);
    });

    return scenePrompts;
  }

  /**
   * Auto-generate scene variations from a single prompt
   * Creates base + extension prompts for scene extension without JSON timeline
   * @private
   * @param {string} basePrompt - The original video prompt
   * @param {number} targetDuration - Desired video duration in seconds
   * @param {boolean} isAvatarMode - Whether this is avatar video (vs faceless)
   * @returns {Array<string>} Array of scene prompts [base, variations...]
   */
  _generateAutoScenePrompts(basePrompt, targetDuration, isAvatarMode = false) {
    // Calculate number of extensions needed
    // Base = 8s, each extension = 7s
    const extensionsNeeded = Math.max(0, Math.ceil((targetDuration - 8) / 7));
    const scenePrompts = [basePrompt]; // Base scene

    // Scene variation phrases based on mode
    const facelessVariations = [
      'Camera orbits around the visual elements with dynamic lighting transitions',
      'Zoom into key data points revealing intricate details and patterns',
      'Visual elements reorganize and transform with smooth animated transitions',
      'Camera pulls back to reveal full scene with enhanced lighting effects',
      'Data elements pulse and animate with synchronized motion',
      'Cinematic rotation showcasing different angles and perspectives',
      'Volumetric lighting reveals hidden layers and depth',
      'Elements coalesce and disperse in fluid choreographed motion'
    ];

    const avatarVariations = [
      'Camera slowly pushes in to medium close-up, maintaining eye contact and professional framing',
      'Subtle camera dolly right revealing more of the background environment',
      'Camera pulls back to medium wide shot showing full upper body and gestures',
      'Slight camera tilt up with natural subject movement and confident delivery',
      'Camera slowly pans left while subject maintains engagement with viewer',
      'Gentle camera push in to close-up emphasizing facial expressions and sincerity',
      'Camera arc right to slightly off-center angle adding dynamic visual interest',
      'Slow zoom out revealing professional office setting with subject centered'
    ];

    const variations = isAvatarMode ? avatarVariations : facelessVariations;

    // Generate extension prompts with variations
    for (let i = 0; i < extensionsNeeded && i < 20; i++) {
      const variation = variations[i % variations.length];
      const extensionPrompt = `${basePrompt} ${variation}.`;
      scenePrompts.push(extensionPrompt);
    }

    return scenePrompts;
  }

  /**
   * Call HeyGen API for avatar video generation and status checking
   * Routes to HeyGen's REST API based on tool name
   * @private
   * @param {string} toolName - Name of the tool to call
   * @param {object} params - Parameters to pass to the tool
   * @returns {Promise<object>} Tool result
   */
  async _callMcpTool(toolName, params) {
    const apiKey = process.env.HEYGEN_API_KEY;

    if (!apiKey) {
      throw new Error('HEYGEN_API_KEY environment variable is required');
    }

    // Route to appropriate HeyGen API endpoint
    if (toolName === 'mcp__heygen__generate_avatar_video') {
      return await this._heygenGenerateVideo(apiKey, params);
    } else if (toolName === 'mcp__heygen__get_avatar_video_status') {
      return await this._heygenGetVideoStatus(apiKey, params);
    } else {
      throw new Error(`Unknown MCP tool: ${toolName}`);
    }
  }

  /**
   * Generate HeyGen avatar video
   * @private
   */
  async _heygenGenerateVideo(apiKey, params) {
    const { avatar_id, voice_id, input_text, title, aspect_ratio } = params;

    const resolvedAspectRatio = typeof aspect_ratio === 'string' ? aspect_ratio : '16:9';
    const dimension =
      resolvedAspectRatio === '9:16' || resolvedAspectRatio === 'portrait'
        ? { width: 720, height: 1280 }
        : resolvedAspectRatio === '1:1'
          ? { width: 1080, height: 1080 }
          : { width: 1280, height: 720 };

    const requestBody = {
      video_inputs: [{
        character: {
          type: 'avatar',
          avatar_id: avatar_id,
          avatar_style: 'normal'
        },
        voice: {
          type: 'text',
          input_text: input_text,
          voice_id: voice_id
        }
      }],
      dimension,
      title: title || 'Avatar Video'
    };

    console.log(`   🔍 HeyGen API Request:`);
    console.log(`      Endpoint: POST https://api.heygen.com/v2/video/generate`);
    console.log(`      Body: ${JSON.stringify(requestBody, null, 2).substring(0, 200)}...`);

    const response = await fetch('https://api.heygen.com/v2/video/generate', {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const responseText = await response.text();
    console.log(`   📡 HeyGen API Response (${response.status}): ${responseText.substring(0, 200)}...`);

    if (!response.ok) {
      throw new Error(`HeyGen API error: ${response.status} ${responseText}`);
    }

    const result = JSON.parse(responseText);

    // HeyGen API returns { error: null, data: { video_id: "..." } } on success
    // or { error: { code: "...", message: "..." }, data: null } on failure
    if (result.error) {
      throw new Error(`HeyGen video generation failed: ${result.error.message || JSON.stringify(result.error)}`);
    }

    if (!result.data?.video_id) {
      throw new Error(`HeyGen video generation failed: No video_id in response`);
    }

    console.log(`   ✅ HeyGen video initiated: ${result.data.video_id}`);

    return {
      video_id: result.data.video_id
    };
  }

  /**
   * Get HeyGen video status
   * @private
   */
  async _heygenGetVideoStatus(apiKey, params) {
    const { video_id } = params;

    const response = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${video_id}`, {
      method: 'GET',
      headers: {
        'X-Api-Key': apiKey
      }
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(`HeyGen API error: ${response.status} ${responseText}`);
    }

    const result = JSON.parse(responseText);

    // HeyGen API returns { error: null, data: { status: "pending|completed|failed", video_url: "..." } }
    if (result.error) {
      throw new Error(`HeyGen status check failed: ${result.error.message || JSON.stringify(result.error)}`);
    }

    const status = result.data?.status || 'unknown';
    const videoUrl = result.data?.video_url || null;

    return {
      status: status,
      video_url: videoUrl
    };
  }
}

module.exports = SocialMediaOrchestrator;
