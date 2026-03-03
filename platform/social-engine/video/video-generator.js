/**
 * Video Generator
 *
 * Comprehensive video generation supporting all modern AI video capabilities:
 * 1. Text-to-Video Generation
 * 2. Image-to-Video with Reference Images (up to 3 images)
 * 3. First and Last Frame Specification
 * 4. Video Extension (extend videos by 7 seconds)
 * 5. Async Operation Handling
 * 6. All API Parameters (aspectRatio, resolution, duration, etc.)
 *
 * Providers:
 * - Google Gemini Veo 3.1 (default)
 * - Fal AI Seedance (alternative)
 *
 * @see https://ai.google.dev/gemini-api/docs/video
 * @see https://fal.ai/models/fal-ai/bytedance/seedance
 */

// Fal AI client - use same pattern as longcat-generator
const fal = require('@fal-ai/client');

class VideoGenerator {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY;
    this.falApiKey = options.falApiKey || process.env.FAL_KEY;
    this.provider = options.provider || 'gemini'; // 'gemini' or 'fal'
    this.simulate = options.simulate || false;
    this.defaultModel = options.model || "veo-3.1-generate-preview";
    this.falModel = options.falModel || "fal-ai/bytedance/seedance/v1/pro/fast/text-to-video";

    // Gemini client (lazy loaded)
    this.client = null;

    // Configure Fal AI client if API key provided
    if (this.falApiKey && fal.fal) {
      fal.fal.config({
        credentials: this.falApiKey
      });
    }

    // Default configuration
    this.defaultConfig = {
      aspectRatio: "16:9",      // "16:9" or "9:16"
      resolution: "720p",        // "720p" or "1080p"
      duration: 8,               // 4, 6, or 8 seconds (API may support)
      personGeneration: "allow_all", // "allow_all" or "allow_adult"
    };

    // Polling configuration
    this.pollingInterval = 10000; // 10 seconds
    this.maxPollingAttempts = 60; // 10 minutes max
  }

  /**
   * Initialize Gemini AI client
   */
  async initClient() {
    if (!this.client && this.apiKey) {
      const { GoogleGenAI } = await import('@google/genai');
      this.client = new GoogleGenAI({ apiKey: this.apiKey });
    }
    return this.client;
  }

  /**
   * 1. TEXT-TO-VIDEO GENERATION
   *
   * Generate video from text prompt only
   *
   * @param {string} prompt - Video description
   * @param {Object} config - Video configuration
   * @returns {Object} Video result
   *
   * @example
   * const result = await producer.textToVideo(
   *   "A close up of two people staring at a cryptic drawing on a wall",
   *   { aspectRatio: "16:9", resolution: "1080p" }
   * );
   */
  async textToVideo(prompt, config = {}) {
    if (this.simulate) {
      return this._simulateResult("text-to-video");
    }

    // Use Fal AI Seedance if provider is 'fal' or if Gemini API key not available
    const useFal = this.provider === 'fal' || (!this.apiKey && this.falApiKey);

    if (useFal) {
      return await this._textToVideoFal(prompt, config);
    }

    // Default to Gemini Veo
    const ai = await this.initClient();
    const finalConfig = { ...this.defaultConfig, ...config };

    console.log(`🎬 Text-to-Video Generation (Gemini Veo)`);
    console.log(`   Prompt: ${prompt.substring(0, 60)}...`);
    console.log(`   Config: ${JSON.stringify(finalConfig)}`);

    let operation = await ai.models.generateVideos({
      model: this.defaultModel,
      prompt: prompt,
      config: this._buildApiConfig(finalConfig)
    });

    const result = await this._pollOperation(operation);
    const downloadPath = `/tmp/veo-text-${Date.now()}.mp4`;

    await ai.files.download({
      file: result.generatedVideos[0].video,
      downloadPath: downloadPath
    });

    console.log(`   ✅ Video saved to ${downloadPath}`);

    return {
      type: "text-to-video",
      videoUri: downloadPath,
      videoFile: result.generatedVideos[0].video,
      duration: finalConfig.duration || 8,
      config: finalConfig,
      operation: operation,
      provider: 'gemini'
    };
  }


  /**
   * Generate video using Fal AI Seedance
   * @private
   */
  async _textToVideoFal(prompt, config = {}) {
    if (!this.falApiKey) {
      throw new Error('FAL_KEY environment variable not set. Please configure your fal.ai API key.');
    }

    const finalConfig = { ...this.defaultConfig, ...config };
    const duration = finalConfig.duration || 8;

    console.log(`🎬 Text-to-Video Generation (Fal AI Seedance)`);
    console.log(`   Prompt: ${prompt.substring(0, 60)}...`);
    console.log(`   Model: ${this.falModel}`);
    console.log(`   Duration: ${duration}s`);
    console.log(`   Config: ${JSON.stringify(finalConfig)}`);

    try {
      const result = await fal.fal.subscribe(this.falModel, {
        input: {
          prompt: prompt,
          duration: duration,
          aspect_ratio: finalConfig.aspectRatio || '16:9',
          ...(finalConfig.seed && { seed: finalConfig.seed })
        },
        logs: true,
        onQueueUpdate: (update) => {
          if (update.status === 'IN_PROGRESS') {
            console.log(`   ⚙️  Processing: ${update.logs || 'Generating video...'}`);
          }
        }
      });

      // Fal AI Seedance response structure: { data: { video: { url: ... } } }
      const videoUrl = result.data?.video?.url || result.video?.url || result.video_url || result.url;
      if (!videoUrl) {
        console.error('Fal AI Response:', JSON.stringify(result, null, 2));
        throw new Error('No video URL in Fal AI response');
      }

      // Download video to local file
      const downloadPath = `/tmp/fal-seedance-${Date.now()}.mp4`;
      const response = await fetch(videoUrl);
      if (!response.ok) {
        throw new Error(`Failed to download video: ${response.statusText}`);
      }
      const buffer = await response.arrayBuffer();
      const fs = await import('fs');
      await fs.promises.writeFile(downloadPath, Buffer.from(buffer));

      console.log(`   ✅ Video saved to ${downloadPath}`);

      return {
        type: "text-to-video",
        videoUri: downloadPath,
        videoUrl: videoUrl,
        duration: duration,
        config: finalConfig,
        provider: 'fal-seedance'
      };

    } catch (error) {
      console.error(`   ❌ Fal AI Seedance generation failed: ${error.message}`);
      throw new Error(`Fal AI Seedance text-to-video failed: ${error.message}`);
    }
  }

  /**
   * 2. IMAGE-TO-VIDEO WITH REFERENCE IMAGES
   *
   * Generate video using up to 3 reference images
   * Preserves subject appearance (people, characters, products)
   *
   * @param {string} prompt - Video description
   * @param {Array<Object>} referenceImages - Array of reference image objects
   * @param {Object} config - Video configuration
   * @returns {Object} Video result
   *
   * @example
   * const result = await producer.imageToVideoWithReferences(
   *   "A woman wearing a high-fashion dress",
   *   [
   *     { imageBytes: dressImageData, mimeType: "image/png", referenceType: "asset" },
   *     { imageBytes: womanImageData, mimeType: "image/png", referenceType: "asset" }
   *   ]
   * );
   */
  async imageToVideoWithReferences(prompt, referenceImages, config = {}) {
    if (this.simulate) {
      return this._simulateResult("image-to-video-references");
    }

    if (!referenceImages || referenceImages.length === 0) {
      throw new Error("At least one reference image required");
    }

    if (referenceImages.length > 3) {
      throw new Error("Maximum 3 reference images allowed");
    }

    const ai = await this.initClient();
    const finalConfig = { ...this.defaultConfig, ...config };

    console.log(`🎬 Image-to-Video with References`);
    console.log(`   Prompt: ${prompt.substring(0, 60)}...`);
    console.log(`   Reference Images: ${referenceImages.length}`);

    // Build reference image config
    const apiReferenceImages = referenceImages.map(ref => ({
      image: {
        imageBytes: ref.imageBytes,
        mimeType: ref.mimeType || "image/png"
      },
      referenceType: ref.referenceType || "asset"
    }));

    let operation = await ai.models.generateVideos({
      model: this.defaultModel,
      prompt: prompt,
      config: {
        ...this._buildApiConfig(finalConfig),
        referenceImages: apiReferenceImages
      }
    });

    const result = await this._pollOperation(operation);
    const downloadPath = `/tmp/veo-ref-${Date.now()}.mp4`;

    await ai.files.download({
      file: result.generatedVideos[0].video,
      downloadPath: downloadPath
    });

    console.log(`   ✅ Video saved to ${downloadPath}`);

    return {
      type: "image-to-video-references",
      videoUri: downloadPath,
      videoFile: result.generatedVideos[0].video,
      referenceCount: referenceImages.length,
      duration: finalConfig.duration || 8,
      config: finalConfig
    };
  }

  /**
   * 3. FIRST AND LAST FRAME SPECIFICATION
   *
   * Generate video with specified first and last frames
   * Interpolates between the two frames
   *
   * @param {string} prompt - Video description
   * @param {Object} firstFrame - First frame image
   * @param {Object} lastFrame - Last frame image
   * @param {Object} config - Video configuration
   * @returns {Object} Video result
   *
   * @example
   * const result = await producer.firstLastFrameVideo(
   *   "A cat driving a car from start to cliff jump",
   *   { imageBytes: firstFrameData, mimeType: "image/png" },
   *   { imageBytes: lastFrameData, mimeType: "image/png" }
   * );
   */
  async firstLastFrameVideo(prompt, firstFrame, lastFrame, config = {}) {
    if (this.simulate) {
      return this._simulateResult("first-last-frame");
    }

    if (!firstFrame || !lastFrame) {
      throw new Error("Both first and last frames required");
    }

    const ai = await this.initClient();
    const finalConfig = { ...this.defaultConfig, ...config };

    console.log(`🎬 First/Last Frame Video Generation`);
    console.log(`   Prompt: ${prompt.substring(0, 60)}...`);

    let operation = await ai.models.generateVideos({
      model: this.defaultModel,
      prompt: prompt,
      image: {
        imageBytes: firstFrame.imageBytes,
        mimeType: firstFrame.mimeType || "image/png"
      },
      config: {
        ...this._buildApiConfig(finalConfig),
        lastFrame: {
          imageBytes: lastFrame.imageBytes,
          mimeType: lastFrame.mimeType || "image/png"
        }
      }
    });

    const result = await this._pollOperation(operation);
    const downloadPath = `/tmp/veo-frames-${Date.now()}.mp4`;

    await ai.files.download({
      file: result.generatedVideos[0].video,
      downloadPath: downloadPath
    });

    console.log(`   ✅ Video saved to ${downloadPath}`);

    return {
      type: "first-last-frame",
      videoUri: downloadPath,
      videoFile: result.generatedVideos[0].video,
      duration: finalConfig.duration || 8,
      config: finalConfig
    };
  }

  /**
   * 4. VIDEO EXTENSION
   *
   * Extend a Veo-generated video by 7 seconds
   * Can extend up to 20 times (max 141s input)
   *
   * @param {Object} videoFile - Previous Veo video file reference
   * @param {string} extensionPrompt - Description of extension
   * @param {Object} config - Video configuration (must match original)
   * @returns {Object} Extended video result
   *
   * @example
   * // First generate base video
   * const base = await producer.textToVideo("Cat starts walking");
   *
   * // Then extend it
   * const extended = await producer.extendVideo(
   *   base.videoFile,
   *   "Cat continues walking and sits down"
   * );
   */
  async extendVideo(videoFile, extensionPrompt, config = {}) {
    if (this.simulate) {
      return this._simulateResult("video-extension");
    }

    if (!videoFile) {
      throw new Error("Video file reference required for extension");
    }

    const ai = await this.initClient();
    const finalConfig = { ...this.defaultConfig, ...config };

    console.log(`🎬 Video Extension`);
    console.log(`   Extension Prompt: ${extensionPrompt.substring(0, 60)}...`);

    let operation = await ai.models.generateVideos({
      model: this.defaultModel,
      video: videoFile,
      prompt: extensionPrompt,
      config: this._buildApiConfig(finalConfig)
    });

    const result = await this._pollOperation(operation);
    const downloadPath = `/tmp/veo-extended-${Date.now()}.mp4`;

    await ai.files.download({
      file: result.generatedVideos[0].video,
      downloadPath: downloadPath
    });

    console.log(`   ✅ Extended video saved to ${downloadPath}`);

    return {
      type: "video-extension",
      videoUri: downloadPath,
      videoFile: result.generatedVideos[0].video,
      duration: 7, // Extensions are 7 seconds
      config: finalConfig,
      isExtension: true
    };
  }

  /**
   * 5. GENERATE LONG VIDEO WITH NATIVE EXTENSION
   *
   * Generate long-form video using native Veo extension
   * Each extension adds 7 seconds
   *
   * @param {string} basePrompt - Initial video prompt
   * @param {Array<string>} extensionPrompts - Array of extension prompts
   * @param {Object} config - Video configuration
   * @returns {Object} Complete video result with all clips
   *
   * @example
   * const result = await producer.generateLongVideo(
   *   "Indian professional introducing financial topic",
   *   [
   *     "Shows portfolio dashboard on screen",
   *     "Explains investment strategy",
   *     "Reviews performance metrics"
   *   ]
   * );
   */
  async generateLongVideo(basePrompt, extensionPrompts, config = {}) {
    console.log(`\n🎬 Long Video Generation with Native Extension`);
    console.log(`   Base + ${extensionPrompts.length} extensions`);
    console.log(`   Total Duration: ~${8 + extensionPrompts.length * 7}s\n`);

    const clips = [];

    // Generate base video
    console.log(`📹 Clip 1/${extensionPrompts.length + 1} (BASE - 8s)`);
    const baseVideo = await this.textToVideo(basePrompt, config);
    clips.push(baseVideo);

    let currentVideoFile = baseVideo.videoFile;

    // Generate extensions
    for (let i = 0; i < extensionPrompts.length; i++) {
      console.log(`\n📹 Clip ${i + 2}/${extensionPrompts.length + 1} (EXTENSION - 7s)`);

      const extension = await this.extendVideo(
        currentVideoFile,
        extensionPrompts[i],
        config
      );

      clips.push(extension);
      currentVideoFile = extension.videoFile;
    }

    const totalDuration = 8 + (extensionPrompts.length * 7);

    console.log(`\n✅ Long Video Complete`);
    console.log(`   Total Clips: ${clips.length}`);
    console.log(`   Total Duration: ${totalDuration}s`);

    return {
      type: "long-video",
      clips: clips,
      totalClips: clips.length,
      totalDuration: totalDuration,
      finalVideoUri: clips[clips.length - 1].videoUri,
      finalVideoFile: clips[clips.length - 1].videoFile
    };
  }

  /**
   * 6. ADVANCED: GENERATE WITH ALL OPTIONS
   *
   * Generate video with full control over all parameters
   *
   * @param {Object} options - Complete generation options
   * @returns {Object} Video result
   *
   * @example
   * const result = await producer.generateAdvanced({
   *   prompt: "Cinematic shot of a lion",
   *   type: "text-to-video", // or "image-to-video", "first-last-frame", "extension"
   *   firstFrame: { imageBytes, mimeType },
   *   lastFrame: { imageBytes, mimeType },
   *   referenceImages: [{ imageBytes, mimeType, referenceType }],
   *   videoFile: previousVideoFile,
   *   config: {
   *     aspectRatio: "16:9",
   *     resolution: "1080p",
   *     negativePrompt: "blurry, low quality",
   *     personGeneration: "allow_all"
   *   }
   * });
   */
  async generateAdvanced(options) {
    const {
      prompt,
      type = "text-to-video",
      firstFrame = null,
      lastFrame = null,
      referenceImages = null,
      videoFile = null,
      config = {}
    } = options;

    // Route to appropriate method
    if (type === "extension" && videoFile) {
      return this.extendVideo(videoFile, prompt, config);
    }

    if (type === "first-last-frame" && firstFrame && lastFrame) {
      return this.firstLastFrameVideo(prompt, firstFrame, lastFrame, config);
    }

    if (type === "image-to-video" && referenceImages) {
      return this.imageToVideoWithReferences(prompt, referenceImages, config);
    }

    // Default to text-to-video
    return this.textToVideo(prompt, config);
  }

  /**
   * Poll operation until complete
   * @private
   */
  async _pollOperation(operation) {
    const ai = await this.initClient();
    let attempts = 0;

    while (!operation.done && attempts < this.maxPollingAttempts) {
      console.log(`   [${attempts + 1}/${this.maxPollingAttempts}] Polling operation...`);

      await new Promise(resolve => setTimeout(resolve, this.pollingInterval));

      operation = await ai.operations.getVideosOperation({ operation });
      attempts++;
    }

    if (!operation.done) {
      throw new Error(`Operation timeout after ${this.maxPollingAttempts * this.pollingInterval / 1000}s`);
    }

    if (!operation.response?.generatedVideos?.[0]) {
      throw new Error("No video in operation response");
    }

    return operation.response;
  }

  /**
   * Build API config from simplified config
   * @private
   */
  _buildApiConfig(config) {
    const apiConfig = {};

    if (config.aspectRatio) {
      apiConfig.aspectRatio = config.aspectRatio;
    }

    if (config.resolution) {
      apiConfig.resolution = config.resolution;
    }

    if (config.negativePrompt) {
      apiConfig.negativePrompt = config.negativePrompt;
    }

    if (config.personGeneration) {
      apiConfig.personGeneration = config.personGeneration;
    }

    return apiConfig;
  }

  /**
   * Simulate result for testing
   * @private
   */
  _simulateResult(type) {
    return {
      type: type,
      videoUri: `simulated://${type}-${Date.now()}.mp4`,
      videoFile: { name: `simulated-${type}`, mimeType: "video/mp4" },
      duration: 8,
      simulated: true
    };
  }

  /**
   * Upload image file and get image data
   * Helper method for loading images from file paths
   *
   * @param {string} imagePath - Path to image file
   * @returns {Object} Image object with imageBytes and mimeType
   */
  async loadImageFromFile(imagePath) {
    const fs = await import('fs');
    const path = await import('path');

    const imageBytes = await fs.promises.readFile(imagePath);
    const ext = path.extname(imagePath).toLowerCase();

    const mimeTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };

    const mimeType = mimeTypes[ext] || 'image/png';

    return {
      imageBytes: imageBytes,
      mimeType: mimeType
    };
  }
}

module.exports = VideoGenerator;
