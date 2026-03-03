/**
 * LongCat Video Generator
 * Uses fal.ai LongCat models for long-form video generation (up to 15 minutes)
 *
 * Supports:
 * - Text-to-Video: Generate videos from text prompts
 * - Image-to-Video: Animate static images into videos
 *
 * Suitable for videos exceeding VEO 3.1's 148-second limitation
 */

const fal = require('@fal-ai/client');
const fs = require('fs').promises;
const path = require('path');

class LongCatGenerator {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.FAL_KEY;
    this.simulate = options.simulate || false;

    // Model endpoints
    this.models = {
      textToVideo: 'fal-ai/longcat-video/text-to-video/720p',
      imageToVideo: 'fal-ai/longcat-video/image-to-video/720p'
    };

    // Note: @fal-ai/client v1.7+ automatically uses FAL_KEY environment variable
    // No explicit configuration needed

    // Default configuration
    this.defaultConfig = {
      aspectRatio: '16:9',
      resolution: '720p',
      fps: 24,
      num_inference_steps: 40,
      guidance_scale: 7.5
    };
  }

  /**
   * Generate video from text prompt
   *
   * @param {string} prompt - Text description of the video to generate
   * @param {Object} config - Generation configuration
   * @param {number} config.duration - Video duration in seconds
   * @param {string} config.aspectRatio - Aspect ratio (16:9, 9:16, 1:1)
   * @param {number} config.fps - Frames per second (24, 25, 30)
   * @param {number} config.num_inference_steps - Quality steps (20-50)
   * @param {number} config.guidance_scale - Prompt adherence (5.0-15.0)
   * @param {number} config.seed - Random seed for reproducibility
   *
   * @returns {Promise<Object>} Video generation result
   */
  async textToVideo(prompt, config = {}) {
    console.log('\n🎬 LongCat Text-to-Video Generation');
    console.log('📝 Prompt:', prompt);
    console.log('⏱️  Duration:', config.duration, 'seconds');

    if (this.simulate) {
      return this._simulateGeneration('text-to-video', prompt, config);
    }

    if (!this.apiKey) {
      throw new Error('FAL_KEY environment variable not set. Please configure your fal.ai API key.');
    }

    const finalConfig = { ...this.defaultConfig, ...config };

    // Calculate num_frames from duration and fps
    const numFrames = Math.round(finalConfig.duration * finalConfig.fps);

    try {
      console.log('🚀 Submitting to fal.ai LongCat...');

      const result = await fal.subscribe(this.models.textToVideo, {
        input: {
          prompt: prompt,
          num_frames: numFrames,
          fps: finalConfig.fps,
          aspect_ratio: this._convertAspectRatio(finalConfig.aspectRatio),
          num_inference_steps: finalConfig.num_inference_steps,
          guidance_scale: finalConfig.guidance_scale,
          seed: finalConfig.seed || Math.floor(Math.random() * 1000000)
        },
        logs: true,
        onQueueUpdate: (update) => {
          if (update.status === 'IN_PROGRESS') {
            console.log('⚙️  Processing:', update.logs);
          }
        }
      });

      console.log('✅ Video generated successfully!');
      console.log('🎥 Video URL:', result.video?.url);

      return {
        success: true,
        videoUrl: result.video?.url,
        duration: finalConfig.duration,
        fps: finalConfig.fps,
        aspectRatio: finalConfig.aspectRatio,
        metadata: {
          numFrames: numFrames,
          seed: result.seed,
          timings: result.timings
        }
      };

    } catch (error) {
      console.error('❌ LongCat text-to-video generation failed:', error.message);
      throw new Error(`LongCat text-to-video failed: ${error.message}`);
    }
  }

  /**
   * Generate video from reference image
   *
   * @param {string} prompt - Text description guiding the animation
   * @param {string|Buffer} image - Image file path or buffer
   * @param {Object} config - Generation configuration
   * @param {number} config.duration - Video duration in seconds
   * @param {string} config.aspectRatio - Aspect ratio (16:9, 9:16, 1:1)
   * @param {number} config.fps - Frames per second (24, 25, 30)
   * @param {number} config.num_inference_steps - Quality steps (20-50)
   * @param {number} config.guidance_scale - Prompt adherence (5.0-15.0)
   * @param {number} config.motion_bucket_id - Motion intensity (1-255, default: 127)
   * @param {number} config.seed - Random seed for reproducibility
   *
   * @returns {Promise<Object>} Video generation result
   */
  async imageToVideo(prompt, image, config = {}) {
    console.log('\n🎬 LongCat Image-to-Video Generation');
    console.log('📝 Prompt:', prompt);
    console.log('🖼️  Reference Image:', typeof image === 'string' ? image : 'Buffer');
    console.log('⏱️  Duration:', config.duration, 'seconds');

    if (this.simulate) {
      return this._simulateGeneration('image-to-video', prompt, config);
    }

    if (!this.apiKey) {
      throw new Error('FAL_KEY environment variable not set. Please configure your fal.ai API key.');
    }

    const finalConfig = { ...this.defaultConfig, ...config };

    // Calculate num_frames from duration and fps
    const numFrames = Math.round(finalConfig.duration * finalConfig.fps);

    try {
      // Upload image to fal.ai storage
      console.log('📤 Uploading reference image...');
      let imageUrl;

      if (typeof image === 'string' && image.startsWith('http')) {
        // Already a URL
        imageUrl = image;
      } else if (typeof image === 'string' && image.startsWith('data:')) {
        // Base64 data URL
        imageUrl = image;
      } else if (typeof image === 'string') {
        // File path
        const imageBuffer = await fs.readFile(image);
        imageUrl = await fal.storage.upload(imageBuffer);
      } else if (Buffer.isBuffer(image)) {
        // Buffer
        imageUrl = await fal.storage.upload(image);
      } else {
        throw new Error('Invalid image format. Must be URL, file path, or Buffer.');
      }

      console.log('🚀 Submitting to fal.ai LongCat...');

      const result = await fal.subscribe(this.models.imageToVideo, {
        input: {
          prompt: prompt,
          image_url: imageUrl,
          num_frames: numFrames,
          fps: finalConfig.fps,
          aspect_ratio: this._convertAspectRatio(finalConfig.aspectRatio),
          num_inference_steps: finalConfig.num_inference_steps,
          guidance_scale: finalConfig.guidance_scale,
          motion_bucket_id: finalConfig.motion_bucket_id || 127,
          seed: finalConfig.seed || Math.floor(Math.random() * 1000000)
        },
        logs: true,
        onQueueUpdate: (update) => {
          if (update.status === 'IN_PROGRESS') {
            console.log('⚙️  Processing:', update.logs);
          }
        }
      });

      console.log('✅ Video generated successfully!');
      console.log('🎥 Video URL:', result.video?.url);

      return {
        success: true,
        videoUrl: result.video?.url,
        duration: finalConfig.duration,
        fps: finalConfig.fps,
        aspectRatio: finalConfig.aspectRatio,
        metadata: {
          numFrames: numFrames,
          seed: result.seed,
          motionBucketId: finalConfig.motion_bucket_id || 127,
          timings: result.timings
        }
      };

    } catch (error) {
      console.error('❌ LongCat image-to-video generation failed:', error.message);
      throw new Error(`LongCat image-to-video failed: ${error.message}`);
    }
  }

  /**
   * Convert aspect ratio format from VEO style to LongCat style
   *
   * @param {string} aspectRatio - Aspect ratio (16:9, 9:16, 1:1)
   * @returns {string} LongCat format aspect ratio
   */
  _convertAspectRatio(aspectRatio) {
    const ratioMap = {
      '16:9': '16:9',
      '9:16': '9:16',
      '1:1': '1:1',
      '4:3': '4:3',
      '3:4': '3:4'
    };

    return ratioMap[aspectRatio] || '16:9';
  }

  /**
   * Simulate video generation (for testing without API calls)
   */
  _simulateGeneration(mode, prompt, config) {
    console.log(`🎭 SIMULATION MODE: ${mode}`);
    console.log('📝 Prompt:', prompt);
    console.log('⚙️  Config:', JSON.stringify(config, null, 2));

    return {
      success: true,
      videoUrl: `https://example.com/simulated-longcat-${mode}-${Date.now()}.mp4`,
      duration: config.duration || 180,
      fps: config.fps || 24,
      aspectRatio: config.aspectRatio || '16:9',
      metadata: {
        simulated: true,
        mode: mode,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Download generated video to local file
   *
   * @param {string} videoUrl - URL of the generated video
   * @param {string} outputPath - Local file path to save video
   */
  async downloadVideo(videoUrl, outputPath) {
    console.log('⬇️  Downloading video from:', videoUrl);

    try {
      const response = await fetch(videoUrl);
      if (!response.ok) {
        throw new Error(`Failed to download video: ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      await fs.writeFile(outputPath, Buffer.from(buffer));

      console.log('✅ Video saved to:', outputPath);
      return outputPath;

    } catch (error) {
      console.error('❌ Video download failed:', error.message);
      throw error;
    }
  }

  /**
   * Validate configuration parameters
   */
  validateConfig(config) {
    const errors = [];

    // Validate duration (max 900 seconds = 15 minutes)
    if (config.duration && (config.duration < 1 || config.duration > 900)) {
      errors.push('Duration must be between 1 and 900 seconds (15 minutes)');
    }

    // Validate FPS
    if (config.fps && ![24, 25, 30].includes(config.fps)) {
      errors.push('FPS must be 24, 25, or 30');
    }

    // Validate aspect ratio
    const validRatios = ['16:9', '9:16', '1:1', '4:3', '3:4'];
    if (config.aspectRatio && !validRatios.includes(config.aspectRatio)) {
      errors.push(`Aspect ratio must be one of: ${validRatios.join(', ')}`);
    }

    // Validate inference steps
    if (config.num_inference_steps && (config.num_inference_steps < 20 || config.num_inference_steps > 50)) {
      errors.push('Inference steps must be between 20 and 50');
    }

    // Validate guidance scale
    if (config.guidance_scale && (config.guidance_scale < 5.0 || config.guidance_scale > 15.0)) {
      errors.push('Guidance scale must be between 5.0 and 15.0');
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }
}

module.exports = LongCatGenerator;
