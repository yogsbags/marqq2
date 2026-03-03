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
 * Primary Provider: Google Gemini Veo 3.1
 * Model: veo-3.1-generate-preview
 *
 * @see https://ai.google.dev/gemini-api/docs/video
 */

class VideoGenerator {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY;
    this.simulate = options.simulate || false;
    this.defaultModel = options.model || "veo-3.1-generate-preview";

    // Gemini client (lazy loaded)
    this.client = null;

    // Default configuration
    this.defaultConfig = {
      aspectRatio: "16:9",      // "16:9" or "9:16"
      resolution: "720p",        // "720p" or "1080p"
      duration: 8,               // 4, 6, or 8 seconds (API may support)
      // Veo 3.1 personGeneration values (per official docs):
      // - Text-to-video & Extension: "allow_all" only (REQUIRED)
      // - Image-to-video, Interpolation, Reference images: "allow_adult" only
      personGeneration: "allow_all", // Default for text-to-video mode
    };

    // Polling configuration
    this.pollingInterval = 10000; // 10 seconds
    this.maxPollingAttempts = 60; // 10 minutes max
  }

  /**
   * Initialize Gemini AI client
   */
  async initClient() {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is required. Set it with: export GEMINI_API_KEY="your-key"');
    }

    if (!this.client) {
      try {
        const { GoogleGenAI } = await import('@google/genai');
        this.client = new GoogleGenAI({ apiKey: this.apiKey });
        console.log('   ✅ Gemini AI client initialized');
      } catch (error) {
        console.error('   ❌ Failed to initialize Gemini AI client:', error.message);
        throw new Error(`Failed to initialize Gemini AI client: ${error.message}`);
      }
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

    const ai = await this.initClient();
    const finalConfig = { ...this.defaultConfig, ...config };

    console.log(`🎬 Text-to-Video Generation`);
    console.log(`   Prompt: ${prompt.substring(0, 60)}...`);
    console.log(`   Config: ${JSON.stringify(finalConfig)}`);

    if (!ai) {
      throw new Error('Gemini AI client not initialized');
    }

    if (!ai.models) {
      throw new Error('Gemini AI models API not available. Check API key and client initialization.');
    }

    let operation;
    try {
      operation = await ai.models.generateVideos({
        model: this.defaultModel,
        prompt: prompt,
        config: this._buildApiConfig(finalConfig)
      });
    } catch (error) {
      console.error('   ❌ Video generation API call failed:', error.message);
      console.error('   Error details:', error);

      // Provide helpful error messages
      if (error.message.includes('fetch failed') || error.message.includes('network')) {
        throw new Error(`Network error: Unable to connect to Gemini API. Check your internet connection and API key. Original error: ${error.message}`);
      }
      if (error.message.includes('401') || error.message.includes('unauthorized')) {
        throw new Error(`Authentication failed: Invalid GEMINI_API_KEY. Please check your API key.`);
      }
      if (error.message.includes('403') || error.message.includes('forbidden')) {
        throw new Error(`Access forbidden: GEMINI_API_KEY may not have access to Veo 3.1. Check API permissions.`);
      }

      throw error;
    }

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
      operation: operation
    };
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

    // For image-to-video with references, Veo 3.1 requires "allow_adult" only
    const imageToVideoConfig = {
      ...this._buildApiConfig(finalConfig),
      referenceImages: apiReferenceImages,
      personGeneration: "allow_adult"  // Required for reference images mode
    };

    let operation = await ai.models.generateVideos({
      model: this.defaultModel,
      prompt: prompt,
      config: imageToVideoConfig
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

    // For interpolation (first/last frame), Veo 3.1 requires "allow_adult" only
    const interpolationConfig = {
      ...this._buildApiConfig(finalConfig),
      lastFrame: {
        imageBytes: lastFrame.imageBytes,
        mimeType: lastFrame.mimeType || "image/png"
      },
      personGeneration: "allow_adult"  // Required for interpolation mode
    };

    let operation = await ai.models.generateVideos({
      model: this.defaultModel,
      prompt: prompt,
      image: {
        imageBytes: firstFrame.imageBytes,
        mimeType: firstFrame.mimeType || "image/png"
      },
      config: interpolationConfig
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
     *     personGeneration: "allow_adult"  // Note: API only supports "allow_adult". Omit for faceless videos.
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

    // Check for errors in operation
    if (operation.error) {
      console.error('   Operation error:', JSON.stringify(operation.error, null, 2));
      throw new Error(`Video generation failed: ${operation.error.message || JSON.stringify(operation.error)}`);
    }

    // Debug: Log full response structure
    console.log('   Operation response keys:', Object.keys(operation.response || {}));

    if (!operation.response?.generatedVideos?.[0]) {
      console.error('   Full operation response:', JSON.stringify(operation.response, null, 2));
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

    // Veo 3.1 personGeneration requirements (per official docs):
    // - Text-to-video & Extension: "allow_all" only (REQUIRED)
    // - Image-to-video, Interpolation, Reference images: "allow_adult" only
    // Always include personGeneration as it's required by the API
    // Note: personGeneration is set per-mode in the calling methods
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
   * @returns {Object} Image object with imageBytes (base64) and mimeType
   */
  async loadImageFromFile(imagePath) {
    const fs = await import('fs');
    const path = await import('path');

    const imageBuffer = await fs.promises.readFile(imagePath);
    const imageBytes = imageBuffer.toString('base64'); // Convert to base64 string
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
      imageBytes: imageBytes, // Base64 string
      mimeType: mimeType
    };
  }
}

module.exports = VideoGenerator;
