/**
 * Video Generation Coordinator
 * Routes video generation to appropriate provider based on duration and configuration
 *
 * Providers:
 * - VEO 3.1 (Google Gemini): 8s-148s, high quality scene-based generation
 * - LongCat (fal.ai): 149s-900s (15 minutes), long-form video generation
 * - HeyGen: AI avatar videos
 * - Shotstack: Video editing and compositing
 */

const VideoGenerator = require('./video-generator');
const LongCatGenerator = require('./longcat-generator');
const fs = require('fs').promises;
const path = require('path');

class VideoCoordinator {
  constructor(options = {}) {
    this.simulate = options.simulate || false;

    // Initialize generators
    this.veoGenerator = new VideoGenerator({
      apiKey: options.geminiApiKey || process.env.GEMINI_API_KEY,
      simulate: this.simulate
    });

    this.longCatGenerator = new LongCatGenerator({
      apiKey: options.falApiKey || process.env.FAL_KEY,
      simulate: this.simulate
    });

    this.outputDir = options.outputDir || path.join(process.cwd(), 'output', 'videos');
  }

  /**
   * Generate video using appropriate provider based on configuration
   *
   * @param {Object} config - Video generation configuration
   * @param {string} config.prompt - Text prompt for video generation
   * @param {number} config.duration - Video duration in seconds
   * @param {string} config.mode - Generation mode: 'text-to-video' or 'image-to-video'
   * @param {string|Buffer} config.referenceImage - Reference image for image-to-video (optional)
   * @param {string} config.aspectRatio - Aspect ratio (16:9, 9:16, 1:1)
   * @param {boolean} config.useLongCat - Force use of LongCat (optional)
   * @param {boolean} config.useVeo - Force use of VEO (optional)
   *
   * @returns {Promise<Object>} Video generation result
   */
  async generateVideo(config) {
    console.log('\n🎬 Video Generation Coordinator');
    console.log('================================');

    // Validate configuration
    const validation = this._validateConfig(config);
    if (!validation.valid) {
      throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
    }

    const { prompt, duration, mode, referenceImage, aspectRatio } = config;

    // Determine which provider to use
    const provider = this._selectProvider(config);

    console.log(`📋 Configuration:`);
    console.log(`   Prompt: ${prompt.substring(0, 80)}...`);
    console.log(`   Duration: ${duration}s`);
    console.log(`   Mode: ${mode}`);
    console.log(`   Provider: ${provider}`);
    console.log(`   Aspect Ratio: ${aspectRatio || '16:9'}`);

    let result;

    try {
      if (provider === 'longcat') {
        result = await this._generateWithLongCat(config);
      } else if (provider === 'veo') {
        result = await this._generateWithVeo(config);
      } else {
        throw new Error(`Unknown provider: ${provider}`);
      }

      // Normalize property names (video-generator uses videoUri, we need videoUrl and localPath)
      if (result.videoUri && !result.videoUrl) {
        result.videoUrl = result.videoUri;
      }
      if (result.videoUri && !result.localPath && provider === 'veo') {
        // VEO videos are already saved locally to /tmp
        result.localPath = result.videoUri;
      }

      // Download video if it's a remote URL (LongCat)
      if (result.videoUrl && result.videoUrl.startsWith('http') && !this.simulate) {
        await this._ensureOutputDir();
        const videoFileName = `video_${Date.now()}_${provider}.mp4`;
        const videoPath = path.join(this.outputDir, videoFileName);

        console.log(`📥 Downloading video to: ${videoPath}`);
        await this.longCatGenerator.downloadVideo(result.videoUrl, videoPath);
        result.localPath = videoPath;
      }

      console.log(`\n✅ Video generation completed successfully!`);
      console.log(`   Provider: ${provider}`);
      console.log(`   Duration: ${result.duration}s`);
      console.log(`   Video URL: ${result.videoUrl || 'N/A'}`);
      console.log(`   Local Path: ${result.localPath || 'N/A'}`);

      return result;

    } catch (error) {
      console.error(`\n❌ Video generation failed:`, error.message);
      throw error;
    }
  }

  /**
   * Select appropriate provider based on configuration
   */
  _selectProvider(config) {
    const { duration, useLongCat, useVeo } = config;

    // Explicit provider selection
    if (useLongCat) return 'longcat';
    if (useVeo) return 'veo';

    // Automatic selection based on duration
    if (duration > 148) {
      console.log(`⚠️  Duration ${duration}s exceeds VEO limit (148s). Using LongCat.`);
      return 'longcat';
    }

    // Default to VEO for shorter videos
    return 'veo';
  }

  /**
   * Generate video using LongCat
   */
  async _generateWithLongCat(config) {
    const { prompt, duration, mode, referenceImage, aspectRatio } = config;

    const longCatConfig = {
      duration: duration,
      aspectRatio: aspectRatio || '16:9',
      fps: 24,
      num_inference_steps: 40,
      guidance_scale: 7.5
    };

    if (mode === 'text-to-video') {
      return await this.longCatGenerator.textToVideo(prompt, longCatConfig);
    } else if (mode === 'image-to-video') {
      if (!referenceImage) {
        throw new Error('Reference image required for image-to-video mode');
      }
      return await this.longCatGenerator.imageToVideo(prompt, referenceImage, longCatConfig);
    } else {
      throw new Error(`Unknown mode: ${mode}`);
    }
  }

  /**
   * Generate video using VEO 3.1
   */
  async _generateWithVeo(config) {
    const { prompt, duration, mode, referenceImage, firstFrameImage, lastFrameImage, aspectRatio } = config;

    const veoConfig = {
      aspectRatio: aspectRatio || '16:9',
      resolution: '720p',
      duration: Math.min(duration, 148), // Cap at VEO limit
      // Note: personGeneration will be set by orchestrator
      // Veo 3.1: Text-to-video requires "allow_all", Image-to-video requires "allow_adult"
      personGeneration: undefined  // Set by orchestrator based on mode
    };

    // Check for reference images from environment variables (set by frontend)
    const referenceImagePaths = process.env.REFERENCE_IMAGE_PATHS?.split(',').filter(Boolean) || [];

    if (referenceImagePaths.length > 0) {
      console.log(`   🖼️  Found ${referenceImagePaths.length} reference image(s) for video generation`);

      // Load reference images
      const referenceImages = [];
      for (const imagePath of referenceImagePaths) {
        try {
          console.log(`   📥 Loading reference image: ${imagePath}`);
          const imageData = await this.veoGenerator.loadImageFromFile(imagePath);
          referenceImages.push({
            imageBytes: imageData.imageBytes,
            mimeType: imageData.mimeType,
            referenceType: 'asset' // Preserve subject appearance (people, characters, products)
          });
        } catch (error) {
          console.log(`   ⚠️  Failed to load ${imagePath}: ${error.message}`);
        }
      }

      if (referenceImages.length > 0) {
        console.log(`   ✅ Using ${referenceImages.length} reference image(s) for Veo 3.1 generation`);
        return await this.veoGenerator.imageToVideoWithReferences(prompt, referenceImages, veoConfig);
      }
    }

    // Fallback to standard generation modes if no reference images
    if (mode === 'text-to-video') {
      return await this.veoGenerator.textToVideo(prompt, veoConfig);
    } else if (mode === 'image-to-video') {
      if (!referenceImage) {
        throw new Error('Reference image required for image-to-video mode');
      }
      return await this.veoGenerator.imageToVideo(prompt, referenceImage, veoConfig);
    } else if (mode === 'frame-to-video' && firstFrameImage) {
      return await this.veoGenerator.frameToVideo(
        prompt,
        firstFrameImage,
        lastFrameImage,
        veoConfig
      );
    } else {
      throw new Error(`Unsupported mode for VEO: ${mode}`);
    }
  }

  /**
   * Extend video beyond VEO's 148s limit using scene extensions
   * This is the old method for longer videos before LongCat integration
   */
  async extendVideoWithScenes(prompt, targetDuration, config = {}) {
    console.log('\n🎬 Video Extension (VEO Scene Chaining)');
    console.log(`   Target Duration: ${targetDuration}s`);

    if (targetDuration > 148) {
      console.log(`⚠️  Warning: Target duration ${targetDuration}s exceeds VEO limit.`);
      console.log(`⚠️  Consider using LongCat for videos > 148s instead.`);
    }

    const baseConfig = {
      ...config,
      aspectRatio: config.aspectRatio || '16:9',
      resolution: '720p'
    };

    // Generate base video (8s)
    console.log('\n📹 Generating base video (8s)...');
    const baseVideo = await this.veoGenerator.textToVideo(prompt, {
      ...baseConfig,
      duration: 8
    });

    // Calculate number of extensions needed
    const extensionsNeeded = Math.ceil((targetDuration - 8) / 7);
    console.log(`\n🔗 Extending video with ${extensionsNeeded} scenes...`);

    let currentVideo = baseVideo;
    for (let i = 0; i < extensionsNeeded && i < 20; i++) {
      console.log(`\n   Extension ${i + 1}/${extensionsNeeded}...`);
      currentVideo = await this.veoGenerator.extendVideo(currentVideo.name, prompt, baseConfig);
    }

    console.log(`\n✅ Extended video completed!`);
    console.log(`   Final duration: ~${8 + (extensionsNeeded * 7)}s`);

    return currentVideo;
  }

  /**
   * Validate configuration
   */
  _validateConfig(config) {
    const errors = [];

    if (!config.prompt) {
      errors.push('Prompt is required');
    }

    if (!config.duration || config.duration < 1) {
      errors.push('Duration must be at least 1 second');
    }

    if (config.duration > 900) {
      errors.push('Duration cannot exceed 900 seconds (15 minutes)');
    }

    if (!['text-to-video', 'image-to-video', 'frame-to-video'].includes(config.mode)) {
      errors.push('Mode must be text-to-video, image-to-video, or frame-to-video');
    }

    if (config.mode === 'image-to-video' && !config.referenceImage) {
      errors.push('Reference image required for image-to-video mode');
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * Ensure output directory exists
   */
  async _ensureOutputDir() {
    try {
      await fs.access(this.outputDir);
    } catch {
      await fs.mkdir(this.outputDir, { recursive: true });
    }
  }

  /**
   * Get provider capabilities
   */
  getProviderInfo() {
    return {
      veo: {
        name: 'VEO 3.1 (Google Gemini)',
        maxDuration: 148,
        minDuration: 8,
        baseDuration: 8,
        extensionDuration: 7,
        maxExtensions: 20,
        features: [
          'High quality scene generation',
          'Image-to-video',
          'Frame conditioning',
          'Scene extensions'
        ],
        aspectRatios: ['16:9', '9:16', '1:1']
      },
      longcat: {
        name: 'LongCat (fal.ai)',
        maxDuration: 900, // 15 minutes
        minDuration: 1,
        features: [
          'Long-form video generation',
          'Text-to-video',
          'Image-to-video',
          'Up to 15 minutes'
        ],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4']
      }
    };
  }
}

module.exports = VideoCoordinator;
