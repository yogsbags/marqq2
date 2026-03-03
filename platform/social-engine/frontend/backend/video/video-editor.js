/**
 * Video Editor
 *
 * Provides video editing and compositing capabilities:
 * - Combining avatar videos with generated b-roll
 * - Adding text overlays and captions
 * - Multi-platform rendering (16:9, 9:16, 1:1)
 * - Transitions, effects, and audio mixing
 */

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

class VideoEditor {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.SHOTSTACK_API_KEY;
    this.baseUrl = 'https://api.shotstack.io/v1';
    this.stage = options.stage || 'stage';  // 'stage' or 'production'
    this.simulate = options.simulate || false;
  }

  /**
   * Composite HeyGen avatar with Veo b-roll
   *
   * @param {Object} config - Composition configuration
   * @returns {Object} Render result
   */
  async compositeAvatarWithBroll(config) {
    const {
      avatarVideoUrl,
      brollVideoUrl,
      duration,
      textOverlays,
      aspectRatio
    } = config;

    console.log('\n🎬 Compositing Avatar + B-roll');
    console.log(`   Avatar: ${avatarVideoUrl}`);
    console.log(`   B-roll: ${brollVideoUrl}`);
    console.log(`   Duration: ${duration}s\n`);

    const timeline = this.buildCompositeTimeline({
      avatarVideoUrl,
      brollVideoUrl,
      duration,
      textOverlays,
      aspectRatio: aspectRatio || '16:9'
    });

    return await this.render(timeline);
  }

  /**
   * Build composite timeline
   */
  buildCompositeTimeline(config) {
    const tracks = [];

    // Track 1: B-roll background (full screen)
    if (config.brollVideoUrl) {
      tracks.push({
        clips: [{
          asset: {
            type: 'video',
            src: config.brollVideoUrl
          },
          start: 0,
          length: config.duration
        }]
      });
    }

    // Track 2: Avatar overlay (picture-in-picture or full)
    if (config.avatarVideoUrl) {
      tracks.push({
        clips: [{
          asset: {
            type: 'video',
            src: config.avatarVideoUrl
          },
          start: 0,
          length: config.duration,
          fit: 'crop',
          scale: config.avatarScale || 1.0,
          position: config.avatarPosition || 'center'
        }]
      });
    }

    // Track 3: Text overlays
    if (config.textOverlays && config.textOverlays.length > 0) {
      const textClips = config.textOverlays.map(overlay => ({
        asset: {
          type: 'title',
          text: overlay.text,
          style: overlay.style || 'minimal',
          color: overlay.color || '#FFFFFF',
          size: overlay.size || 'medium',
          background: overlay.background || 'none',
          position: overlay.position || 'bottom'
        },
        start: overlay.start || 0,
        length: overlay.duration || 5,
        transition: {
          in: 'fade',
          out: 'fade'
        }
      }));

      tracks.push({ clips: textClips });
    }

    return {
      tracks,
      background: '#000000'
    };
  }

  /**
   * Add captions to video
   *
   * @param {Object} config - Caption configuration
   * @returns {Object} Render result
   */
  async addCaptions(config) {
    const {
      videoUrl,
      captions,  // Array of { text, start, duration }
      style
    } = config;

    console.log('\n📝 Adding Captions');
    console.log(`   Video: ${videoUrl}`);
    console.log(`   Captions: ${captions.length} segments\n`);

    const timeline = {
      tracks: [
        // Track 1: Original video
        {
          clips: [{
            asset: {
              type: 'video',
              src: videoUrl
            },
            start: 0,
            length: 'end'
          }]
        },
        // Track 2: Captions
        {
          clips: captions.map(caption => ({
            asset: {
              type: 'title',
              text: caption.text,
              style: style || 'subtitle',
              color: '#FFFFFF',
              background: 'rgba(0,0,0,0.7)',
              position: 'bottom'
            },
            start: caption.start,
            length: caption.duration
          }))
        }
      ]
    };

    return await this.render(timeline);
  }

  /**
   * Create multi-platform renders
   *
   * @param {string} videoUrl - Source video URL
   * @returns {Object} Renders for all platforms
   */
  async createMultiPlatformRenders(videoUrl) {
    console.log('\n📺 Creating Multi-Platform Renders');
    console.log(`   Source: ${videoUrl}\n`);

    const renders = {};

    // LinkedIn (16:9)
    console.log('   Rendering LinkedIn (16:9)...');
    renders.linkedin = await this.renderForPlatform(videoUrl, {
      aspectRatio: '16:9',
      width: 1920,
      height: 1080,
      format: 'mp4',
      quality: 'high'
    });

    // Instagram Feed (1:1)
    console.log('   Rendering Instagram Feed (1:1)...');
    renders.instagramFeed = await this.renderForPlatform(videoUrl, {
      aspectRatio: '1:1',
      width: 1080,
      height: 1080,
      format: 'mp4',
      quality: 'high'
    });

    // Instagram Stories (9:16)
    console.log('   Rendering Instagram Stories (9:16)...');
    renders.instagramStories = await this.renderForPlatform(videoUrl, {
      aspectRatio: '9:16',
      width: 1080,
      height: 1920,
      format: 'mp4',
      quality: 'high'
    });

    // YouTube (16:9)
    console.log('   Rendering YouTube (16:9)...');
    renders.youtube = await this.renderForPlatform(videoUrl, {
      aspectRatio: '16:9',
      width: 1920,
      height: 1080,
      format: 'mp4',
      quality: 'high'
    });

    console.log('\n✅ All platform renders queued');
    return renders;
  }

  /**
   * Render for specific platform
   */
  async renderForPlatform(videoUrl, specs) {
    const timeline = {
      tracks: [{
        clips: [{
          asset: {
            type: 'video',
            src: videoUrl
          },
          start: 0,
          length: 'end',
          fit: 'crop'
        }]
      }]
    };

    const output = {
      format: specs.format || 'mp4',
      resolution: `${specs.width}x${specs.height}`,
      quality: specs.quality || 'high'
    };

    return await this.render(timeline, output);
  }

  /**
   * Render video edit
   *
   * @param {Object} timeline - Shotstack timeline
   * @param {Object} output - Output specifications
   * @returns {Object} Render result
   */
  async render(timeline, output = {}) {
    if (this.simulate) {
      return {
        renderId: `simulated-shotstack-${Date.now()}`,
        status: 'queued',
        url: null,
        simulated: true
      };
    }

    const payload = {
      timeline,
      output: {
        format: output.format || 'mp4',
        resolution: output.resolution || 'hd',
        ...output
      }
    };

    try {
      const response = await fetch(`${this.baseUrl}/render`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(`Shotstack API error: ${data.message || response.statusText}`);
      }

      console.log('✅ Render queued');
      console.log(`   Render ID: ${data.response.id}`);

      return {
        renderId: data.response.id,
        status: 'queued',
        url: null
      };

    } catch (error) {
      console.error('❌ Render failed:', error.message);
      throw error;
    }
  }

  /**
   * Check render status
   *
   * @param {string} renderId - Shotstack render ID
   * @returns {Object} Status information
   */
  async checkStatus(renderId) {
    if (this.simulate) {
      return {
        renderId,
        status: 'done',
        url: `https://simulated.shotstack.io/${renderId}.mp4`,
        duration: 90,
        size: 50000000,
        simulated: true
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/render/${renderId}`, {
        method: 'GET',
        headers: {
          'x-api-key': this.apiKey
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(`Shotstack API error: ${data.message || response.statusText}`);
      }

      return {
        renderId: data.response.id,
        status: data.response.status,  // 'queued', 'rendering', 'done', 'failed'
        url: data.response.url,
        duration: data.response.duration,
        size: data.response.size,
        error: data.response.error
      };

    } catch (error) {
      console.error(`❌ Status check failed for ${renderId}:`, error.message);
      throw error;
    }
  }

  /**
   * Wait for render completion
   *
   * @param {string} renderId - Shotstack render ID
   * @param {number} maxWaitTime - Maximum wait time in seconds
   * @returns {Object} Completed render info
   */
  async waitForCompletion(renderId, maxWaitTime = 600) {
    console.log(`⏳ Waiting for render completion (max ${maxWaitTime}s)...`);

    const startTime = Date.now();
    let attempts = 0;

    while (true) {
      attempts++;
      const status = await this.checkStatus(renderId);

      console.log(`   [${attempts}] Status: ${status.status}`);

      if (status.status === 'done') {
        console.log('✅ Render complete!');
        console.log(`   Download: ${status.url}`);
        return status;
      }

      if (status.status === 'failed') {
        throw new Error(`Render failed: ${status.error}`);
      }

      const elapsed = (Date.now() - startTime) / 1000;
      if (elapsed >= maxWaitTime) {
        throw new Error(`Render timeout after ${maxWaitTime}s`);
      }

      // Wait 10 seconds before next check
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
}

module.exports = VideoEditor;
