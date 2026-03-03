/**
 * Video Generator
 *
 * Multi-provider video generation with automatic fallback support.
 * Supports multiple AI video generation APIs:
 * - Google Gemini (Primary) - High quality text/image-to-video
 * - Fal AI (Secondary) - Fast and reliable
 * - Replicate (Fallback) - Additional provider option
 *
 * Features:
 * - Scene extension for long-form videos (60s - 12+ minutes)
 * - Automatic provider fallback on errors
 * - Consistent API across all providers
 * - Progress tracking and error handling
 */

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

class VideoGenerator {
  constructor(options = {}) {
    // API credentials
    this.geminiApiKey = options.geminiApiKey || process.env.GEMINI_API_KEY;
    this.falApiKey = options.falApiKey || process.env.FAL_API_KEY;
    this.replicateApiKey = options.replicateApiKey || process.env.REPLICATE_API_TOKEN;

    // Provider priority
    this.providers = options.providers || ['gemini', 'fal', 'replicate'];
    this.currentProvider = null;

    // Configuration
    this.simulate = options.simulate || false;
    this.maxRetries = options.maxRetries || 3;

    // Gemini client (lazy loaded)
    this.geminiClient = null;

    // API endpoints
    this.falBaseUrl = 'https://queue.fal.run';
    this.replicateBaseUrl = 'https://api.replicate.com/v1';
  }

  /**
   * Initialize Gemini client
   */
  async initGeminiClient() {
    if (!this.geminiClient && this.geminiApiKey) {
      const { GoogleGenAI } = await import('@google/genai');
      this.geminiClient = new GoogleGenAI({ apiKey: this.geminiApiKey });
    }
    return this.geminiClient;
  }

  /**
   * Generate video using multi-provider fallback
   *
   * @param {Object} params - Video generation parameters
   * @returns {Object} Video result
   */
  async generateVideo(params) {
    const { prompt, videoInput = null, config = {} } = params;

    for (const provider of this.providers) {
      try {
        console.log(`🎬 Attempting video generation with ${provider.toUpperCase()}...`);

        let result;
        switch (provider) {
          case 'gemini':
            result = await this.generateWithGemini(prompt, videoInput, config);
            break;
          case 'fal':
            result = await this.generateWithFal(prompt, videoInput, config);
            break;
          case 'replicate':
            result = await this.generateWithReplicate(prompt, videoInput, config);
            break;
          default:
            throw new Error(`Unknown provider: ${provider}`);
        }

        this.currentProvider = provider;
        console.log(`✅ Video generated successfully with ${provider.toUpperCase()}`);
        return { ...result, provider };

      } catch (error) {
        console.warn(`⚠️  ${provider.toUpperCase()} failed: ${error.message}`);

        // If last provider, throw error
        if (provider === this.providers[this.providers.length - 1]) {
          throw new Error(`All providers failed. Last error: ${error.message}`);
        }

        console.log(`   Trying next provider...`);
      }
    }
  }

  /**
   * Generate video using Google Gemini Veo 3.1
   *
   * @param {string} prompt - Video description
   * @param {string|null} videoInput - Input video for extension
   * @param {Object} config - Video configuration
   * @returns {Object} Video result
   */
  async generateWithGemini(prompt, videoInput, config) {
    if (this.simulate) {
      return {
        videoUri: `simulated://gemini-veo-${Date.now()}.mp4`,
        duration: config.duration || 8,
        status: 'completed'
      };
    }

    if (!this.geminiApiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    // Initialize Gemini client
    const ai = await this.initGeminiClient();

    // Generate video using Veo 3.1
    console.log(`   Generating with Veo 3.1...`);

    let operation = await ai.models.generateVideos({
      model: "veo-3.1-generate-preview",
      prompt: prompt,
      // Note: Scene extension would use the videoInput here
      // The API might support this via additional parameters
    });

    console.log(`   Operation started, polling for completion...`);

    // Poll the operation status until the video is ready
    let attempts = 0;
    const maxAttempts = 60; // 10 minutes max (10s intervals)

    while (!operation.done && attempts < maxAttempts) {
      console.log(`   [${attempts + 1}/${maxAttempts}] Waiting for video generation...`);
      await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10s

      operation = await ai.operations.getVideosOperation({
        operation: operation,
      });

      attempts++;
    }

    if (!operation.done) {
      throw new Error('Gemini video generation timeout after 10 minutes');
    }

    if (!operation.response?.generatedVideos?.[0]?.video) {
      throw new Error('No video in Gemini response');
    }

    const videoFile = operation.response.generatedVideos[0].video;

    // Download video to temporary location
    const tempPath = `/tmp/gemini-veo-${Date.now()}.mp4`;

    await ai.files.download({
      file: videoFile,
      downloadPath: tempPath,
    });

    console.log(`   ✅ Video downloaded to ${tempPath}`);

    return {
      videoUri: tempPath, // Local file path (would need upload to CDN in production)
      videoFile: videoFile, // Gemini file reference for scene extension
      duration: config.duration || 8,
      status: 'completed',
      metadata: {
        operationId: operation.name,
        mimeType: videoFile.mimeType
      }
    };
  }

  /**
   * Generate video using Fal AI
   *
   * @param {string} prompt - Video description
   * @param {string|null} videoInput - Input video for extension
   * @param {Object} config - Video configuration
   * @returns {Object} Video result
   */
  async generateWithFal(prompt, videoInput, config) {
    if (this.simulate) {
      return {
        videoUri: `simulated://fal-${Date.now()}.mp4`,
        duration: config.duration || 8,
        status: 'completed'
      };
    }

    if (!this.falApiKey) {
      throw new Error('FAL_API_KEY not configured');
    }

    // Fal AI video generation model
    const model = 'fal-ai/fast-svd'; // Stable Video Diffusion

    const payload = {
      prompt,
      aspect_ratio: config.aspect_ratio || '16:9',
      num_frames: Math.floor((config.duration || 8) * (config.fps || 30)),
      fps: config.fps || 30
    };

    // Add video input for extension
    if (videoInput) {
      payload.image_url = videoInput; // Fal uses image/video URL as input
    }

    // Submit job
    const submitResponse = await fetch(`${this.falBaseUrl}/${model}`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${this.falApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const submitData = await submitResponse.json();

    if (!submitResponse.ok) {
      throw new Error(`Fal API error: ${submitData.error || submitResponse.statusText}`);
    }

    const requestId = submitData.request_id;
    console.log(`   Fal job submitted: ${requestId}`);

    // Poll for completion
    const result = await this.pollFalStatus(requestId);

    return {
      videoUri: result.video?.url || result.output?.url,
      duration: config.duration || 8,
      status: 'completed',
      metadata: result
    };
  }

  /**
   * Poll Fal AI for job completion
   *
   * @param {string} requestId - Fal job ID
   * @returns {Object} Completion result
   */
  async pollFalStatus(requestId) {
    const maxAttempts = 60; // 5 minutes max (5s intervals)
    let attempts = 0;

    while (attempts < maxAttempts) {
      const response = await fetch(`${this.falBaseUrl}/requests/${requestId}/status`, {
        headers: {
          'Authorization': `Key ${this.falApiKey}`
        }
      });

      const data = await response.json();

      if (data.status === 'COMPLETED') {
        console.log(`   ✅ Fal job completed`);
        return data;
      }

      if (data.status === 'FAILED') {
        throw new Error(`Fal job failed: ${data.error}`);
      }

      console.log(`   [${attempts + 1}/${maxAttempts}] Fal status: ${data.status}`);

      // Wait 5 seconds before next poll
      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts++;
    }

    throw new Error('Fal job timeout after 5 minutes');
  }

  /**
   * Generate video using Replicate
   *
   * @param {string} prompt - Video description
   * @param {string|null} videoInput - Input video for extension
   * @param {Object} config - Video configuration
   * @returns {Object} Video result
   */
  async generateWithReplicate(prompt, videoInput, config) {
    if (this.simulate) {
      return {
        videoUri: `simulated://replicate-${Date.now()}.mp4`,
        duration: config.duration || 8,
        status: 'completed'
      };
    }

    if (!this.replicateApiKey) {
      throw new Error('REPLICATE_API_TOKEN not configured');
    }

    const model = 'stability-ai/stable-video-diffusion';

    const payload = {
      version: 'latest',
      input: {
        prompt,
        num_frames: Math.floor((config.duration || 8) * (config.fps || 8)),
        fps: config.fps || 8
      }
    };

    // Add video input for extension
    if (videoInput) {
      payload.input.image = videoInput;
    }

    // Submit prediction
    const submitResponse = await fetch(`${this.replicateBaseUrl}/predictions`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${this.replicateApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const submitData = await submitResponse.json();

    if (!submitResponse.ok) {
      throw new Error(`Replicate API error: ${submitData.detail || submitResponse.statusText}`);
    }

    const predictionId = submitData.id;
    console.log(`   Replicate prediction: ${predictionId}`);

    // Poll for completion
    const result = await this.pollReplicateStatus(predictionId);

    return {
      videoUri: result.output?.[0] || result.output,
      duration: config.duration || 8,
      status: 'completed',
      metadata: result
    };
  }

  /**
   * Poll Replicate for prediction completion
   *
   * @param {string} predictionId - Replicate prediction ID
   * @returns {Object} Completion result
   */
  async pollReplicateStatus(predictionId) {
    const maxAttempts = 60; // 5 minutes max
    let attempts = 0;

    while (attempts < maxAttempts) {
      const response = await fetch(`${this.replicateBaseUrl}/predictions/${predictionId}`, {
        headers: {
          'Authorization': `Token ${this.replicateApiKey}`
        }
      });

      const data = await response.json();

      if (data.status === 'succeeded') {
        console.log(`   ✅ Replicate prediction succeeded`);
        return data;
      }

      if (data.status === 'failed') {
        throw new Error(`Replicate prediction failed: ${data.error}`);
      }

      console.log(`   [${attempts + 1}/${maxAttempts}] Replicate status: ${data.status}`);

      // Wait 5 seconds before next poll
      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts++;
    }

    throw new Error('Replicate prediction timeout after 5 minutes');
  }

  /**
   * Generate long-form video using scene extension
   *
   * @param {Array} scriptSegments - Array of segment descriptions
   * @param {Object} config - Video configuration
   * @returns {Object} Video result with all clips
   */
  async generateLongVideo(scriptSegments, config = {}) {
    console.log(`\n🎬 Starting Multi-Provider Scene Extension`);
    console.log(`   Segments: ${scriptSegments.length}`);
    console.log(`   Total Duration: ~${scriptSegments.length * (config.duration || 8)}s`);
    console.log(`   Provider Priority: ${this.providers.join(' → ')}\n`);

    const defaultConfig = {
      aspect_ratio: '16:9',
      duration: 8,
      fps: 30,
      ...config
    };

    let lastVideoUri = null;
    let lastVideoFile = null; // For Gemini scene extension
    const clipResults = [];

    for (let i = 0; i < scriptSegments.length; i++) {
      const segment = scriptSegments[i];
      const isInitial = i === 0;

      console.log(`\n📹 Generating clip ${i + 1}/${scriptSegments.length}`);
      console.log(`   Time: ${segment.timeRange}`);
      console.log(`   Type: ${isInitial ? 'INITIAL' : 'EXTENSION'}`);

      try {
        // For scene extension, pass the previous video
        const result = await this.generateVideo({
          prompt: segment.prompt,
          videoInput: isInitial ? null : (lastVideoFile || lastVideoUri),
          config: defaultConfig
        });

        console.log(`   ✅ Clip ${i + 1} generated via ${result.provider.toUpperCase()}`);
        console.log(`   Duration: ${result.duration}s`);

        clipResults.push({
          clipNumber: i + 1,
          timeRange: segment.timeRange,
          status: 'completed',
          videoUri: result.videoUri,
          duration: result.duration,
          provider: result.provider
        });

        // Update for next iteration
        lastVideoUri = result.videoUri;
        lastVideoFile = result.videoFile; // Gemini file reference

      } catch (error) {
        console.error(`   ❌ Clip ${i + 1} failed: ${error.message}`);
        clipResults.push({
          clipNumber: i + 1,
          timeRange: segment.timeRange,
          status: 'failed',
          error: error.message
        });

        // Stop on error (can't continue extension chain)
        break;
      }
    }

    // Calculate total duration
    const totalDuration = clipResults
      .filter(c => c.status === 'completed')
      .reduce((sum, c) => sum + (c.duration || 8), 0);

    const result = {
      status: clipResults.every(c => c.status === 'completed') ? 'completed' : 'partial',
      totalClips: clipResults.length,
      completedClips: clipResults.filter(c => c.status === 'completed').length,
      failedClips: clipResults.filter(c => c.status === 'failed').length,
      totalDuration,
      finalVideoUri: lastVideoUri,
      clips: clipResults,
      providerUsage: this.getProviderStats(clipResults)
    };

    console.log('\n📊 Multi-Provider Generation Summary:');
    console.log(`   Status: ${result.status}`);
    console.log(`   Clips: ${result.completedClips}/${result.totalClips}`);
    console.log(`   Duration: ${result.totalDuration}s`);
    console.log(`   Provider Usage: ${JSON.stringify(result.providerUsage)}`);
    if (result.finalVideoUri) {
      console.log(`   Final Video: ${result.finalVideoUri}`);
    }

    return result;
  }

  /**
   * Get provider usage statistics
   *
   * @param {Array} clips - Clip results
   * @returns {Object} Provider stats
   */
  getProviderStats(clips) {
    const stats = {};
    clips.forEach(clip => {
      if (clip.provider) {
        stats[clip.provider] = (stats[clip.provider] || 0) + 1;
      }
    });
    return stats;
  }

  /**
   * Generate 90-second testimonial video
   *
   * @param {Object} testimonialData - Client testimonial data
   * @returns {Object} Video result
   */
  async generate90sTestimonial(testimonialData) {
    console.log('\n🎯 Generating 90s Testimonial (Multi-Provider)');
    console.log(`   Client: ${testimonialData.clientName || 'Anonymous'}`);
    console.log(`   Topic: ${testimonialData.topic}\n`);

    const segments = this.create90sSegments(testimonialData);

    const result = await this.generateLongVideo(segments, {
      aspect_ratio: '16:9',
      duration: 8,
      fps: 30
    });

    return {
      ...result,
      type: 'testimonial-90s',
      platform: 'linkedin',
      testimonialData
    };
  }

  /**
   * Create 12 script segments for 90s testimonial
   *
   * @param {Object} data - Testimonial data
   * @returns {Array} 12 segments
   */
  create90sSegments(data) {
    const basePrompt = `Indian ${data.clientAge || 55}-year-old professional, ${data.clientGender || 'male'}, business casual attire, modern office setting`;

    return [
      {
        timeRange: '0-8s',
        prompt: `${basePrompt}, speaking confidently to camera, introducing their success story`
      },
      {
        timeRange: '8-16s',
        prompt: `Continue scene, add B-roll visual: professional screen showing MADP portfolio dashboard with rising graph, clean UI design`
      },
      {
        timeRange: '16-24s',
        prompt: `Continue scene, transition to animated financial chart: valuation vs momentum comparison, corporate aesthetic with green/navy colors`
      },
      {
        timeRange: '24-32s',
        prompt: `Return to ${basePrompt}, explaining their investment strategy, confident body language`
      },
      {
        timeRange: '32-40s',
        prompt: `Continue scene, add B-roll: shield icon protecting portfolio graphic, professional animation style`
      },
      {
        timeRange: '40-48s',
        prompt: `Continue scene, show animated counter: portfolio value ticking up from ₹${data.startValue || '50L'} to ₹${data.endValue || '2Cr'}, dynamic numbers`
      },
      {
        timeRange: '48-56s',
        prompt: `Return to ${basePrompt}, discussing results achieved, proud expression`
      },
      {
        timeRange: '56-64s',
        prompt: `Continue scene, add B-roll: happy family photo frame on desk, emotional connection visual`
      },
      {
        timeRange: '64-72s',
        prompt: `Continue scene, show timeline graphic: investment journey 2020→2025, milestone markers`
      },
      {
        timeRange: '72-80s',
        prompt: `Return to ${basePrompt}, giving advice to viewers, warm and encouraging`
      },
      {
        timeRange: '80-88s',
        prompt: `Continue scene, add B-roll: professional handshake visual, partnership theme`
      },
      {
        timeRange: '88-96s',
        prompt: `Final continuation of ${basePrompt} with text overlay appearing in lower third: 'Book consultation: plcapital.com/consult' and '₹50L minimum investment'`
      }
    ];
  }

  /**
   * Generate YouTube Deep-Dive (12 minutes)
   *
   * @param {Object} scriptData - Full script with sections
   * @returns {Object} Video result
   */
  async generateYouTubeDeepDive(scriptData) {
    console.log('\n📺 Generating 12-minute YouTube Deep-Dive (Multi-Provider)');
    console.log(`   Topic: ${scriptData.topic}`);
    console.log(`   Sections: ${scriptData.sections?.length || 0}\n`);

    // 12 minutes = 720s ÷ 8s = 90 clips
    const segments = this.createYouTubeSegments(scriptData);

    const result = await this.generateLongVideo(segments, {
      aspect_ratio: '16:9',
      duration: 8,
      fps: 30
    });

    return {
      ...result,
      type: 'youtube-deep-dive',
      platform: 'youtube',
      scriptData
    };
  }

  /**
   * Create segments for YouTube deep-dive
   *
   * @param {Object} data - Script data with sections
   * @returns {Array} Segments for 12-minute video
   */
  createYouTubeSegments(data) {
    const segments = [];
    const avatarBase = 'Indian professional in 30s-40s, business casual, modern office with bookshelf background';

    // Hook (0-8s)
    segments.push({
      timeRange: '0-8s',
      prompt: `${avatarBase}, speaking directly to camera with enthusiasm, introducing ${data.topic}`
    });

    // Introduction (8-120s = 14 clips)
    for (let i = 0; i < 14; i++) {
      segments.push({
        timeRange: `${8 + i * 8}-${16 + i * 8}s`,
        prompt: `Continue scene, ${i % 2 === 0 ? avatarBase + ' explaining concepts' : 'B-roll: animated chart/graphic related to ' + data.topic}`
      });
    }

    // Main Content Sections (120-600s = 60 clips)
    const sectionsCount = data.sections?.length || 5;
    const clipsPerSection = Math.floor(60 / sectionsCount);

    for (let s = 0; s < sectionsCount; s++) {
      for (let i = 0; i < clipsPerSection; i++) {
        const time = 120 + s * clipsPerSection * 8 + i * 8;
        segments.push({
          timeRange: `${time}-${time + 8}s`,
          prompt: `Continue scene, ${i % 3 === 0 ? avatarBase + ' presenting section ' + (s + 1) : 'B-roll: visual example for section ' + (s + 1)}`
        });
      }
    }

    // Conclusion (600-720s = 15 clips)
    for (let i = 0; i < 15; i++) {
      const time = 600 + i * 8;
      segments.push({
        timeRange: `${time}-${time + 8}s`,
        prompt: `Continue scene, ${avatarBase} ${i < 10 ? 'summarizing key points' : 'giving call-to-action with text overlay'}`
      });
    }

    // Final CTA (712-720s)
    segments.push({
      timeRange: '712-720s',
      prompt: `Final continuation, ${avatarBase} with prominent text overlay: 'Book free consultation: [URL]', subscribe button animation`
    });

    return segments;
  }
}

module.exports = VideoGenerator;
