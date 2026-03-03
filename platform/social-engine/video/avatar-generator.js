/**
 * Avatar Generator
 *
 * Generates AI avatar videos for talking head content.
 * Supports multiple avatar providers (HeyGen, D-ID, etc.)
 *
 * Use Cases:
 * - Client testimonials (30-90s)
 * - Educational talking head videos
 * - Brand spokesperson content
 * - AI-powered video presentations
 */

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

class AvatarGenerator {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.HEYGEN_API_KEY;
    this.baseUrl = 'https://api.heygen.com/v1';
    this.simulate = options.simulate || false;
  }

  /**
   * Generate AI avatar video
   *
   * @param {Object} config - Video configuration
   * @returns {Object} Video generation result
   */
  async generateVideo(config) {
    const {
      script,
      avatarId,
      voiceId,
      title,
      background,
      duration
    } = config;

    console.log('\n🎭 Generating HeyGen AI Avatar Video');
    console.log(`   Title: ${title}`);
    console.log(`   Avatar: ${avatarId}`);
    console.log(`   Voice: ${voiceId}`);
    console.log(`   Duration: ~${duration}s\n`);

    if (this.simulate) {
      console.log('[SIMULATED] Video generation request');
      return {
        videoId: `simulated-heygen-${Date.now()}`,
        status: 'processing',
        estimatedTime: 60,
        simulated: true
      };
    }

    const payload = {
      video_inputs: [{
        character: {
          type: 'avatar',
          avatar_id: avatarId,
          avatar_style: 'normal'
        },
        voice: {
          type: 'text',
          voice_id: voiceId,
          input_text: script
        },
        background: background || {
          type: 'color',
          value: '#FFFFFF'
        }
      }],
      dimension: {
        width: 1920,
        height: 1080
      },
      title: title || 'Social Media Campaign Video'
    };

    try {
      const response = await fetch(`${this.baseUrl}/video.generate`, {
        method: 'POST',
        headers: {
          'X-Api-Key': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(`HeyGen API error: ${data.message || response.statusText}`);
      }

      console.log('✅ Video generation started');
      console.log(`   Video ID: ${data.data.video_id}`);
      console.log(`   Status: ${data.data.status}`);

      return {
        videoId: data.data.video_id,
        status: data.data.status,
        estimatedTime: 120  // Typical 1-2 minutes
      };

    } catch (error) {
      console.error('❌ HeyGen generation failed:', error.message);
      throw error;
    }
  }

  /**
   * Check video generation status
   *
   * @param {string} videoId - HeyGen video ID
   * @returns {Object} Status information
   */
  async checkStatus(videoId) {
    if (this.simulate) {
      return {
        videoId,
        status: 'completed',
        downloadUrl: `https://simulated.heygen.com/${videoId}.mp4`,
        duration: 90,
        simulated: true
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/video_status.get?video_id=${videoId}`, {
        method: 'GET',
        headers: {
          'X-Api-Key': this.apiKey
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(`HeyGen API error: ${data.message || response.statusText}`);
      }

      return {
        videoId: data.data.video_id,
        status: data.data.status,  // 'processing', 'completed', 'failed'
        downloadUrl: data.data.video_url,
        duration: data.data.duration,
        thumbnailUrl: data.data.thumbnail_url,
        error: data.data.error
      };

    } catch (error) {
      console.error(`❌ Status check failed for ${videoId}:`, error.message);
      throw error;
    }
  }

  /**
   * Wait for video completion
   *
   * @param {string} videoId - HeyGen video ID
   * @param {number} maxWaitTime - Maximum wait time in seconds
   * @returns {Object} Completed video info
   */
  async waitForCompletion(videoId, maxWaitTime = 300) {
    console.log(`⏳ Waiting for video completion (max ${maxWaitTime}s)...`);

    const startTime = Date.now();
    let attempts = 0;

    while (true) {
      attempts++;
      const status = await this.checkStatus(videoId);

      console.log(`   [${attempts}] Status: ${status.status}`);

      if (status.status === 'completed') {
        console.log('✅ Video ready!');
        console.log(`   Download: ${status.downloadUrl}`);
        return status;
      }

      if (status.status === 'failed') {
        throw new Error(`Video generation failed: ${status.error}`);
      }

      const elapsed = (Date.now() - startTime) / 1000;
      if (elapsed >= maxWaitTime) {
        throw new Error(`Video generation timeout after ${maxWaitTime}s`);
      }

      // Wait 10 seconds before next check
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }

  /**
   * Generate 90-second testimonial video
   *
   * @param {Object} testimonialData - Client testimonial data
   * @returns {Object} Video result
   */
  async generate90sTestimonial(testimonialData, waitForCompletion = false) {
    const config = {
      script: this.buildTestimonialScript(testimonialData),
      avatarId: process.env.HEYGEN_AVATAR_ID || testimonialData.avatarId || 'default-avatar',
      voiceId: process.env.HEYGEN_VOICE_ID || testimonialData.voiceId || 'indian-english-neutral',
      title: `Testimonial: ${testimonialData.clientName || 'Client Story'}`,
      background: {
        type: 'color',
        value: '#F5F5F5'
      },
      duration: 90
    };

    const result = await this.generateVideo(config);

    if (waitForCompletion && !this.simulate) {
      const completed = await this.waitForCompletion(result.videoId);
      return completed;
    }

    return result;
  }

  /**
   * Build testimonial script from data
   *
   * @param {Object} data - Testimonial data
   * @returns {string} Formatted script
   */
  buildTestimonialScript(data) {
    return `
[0-10s] Hook:
${data.hook || `Five years ago, I was earning ${data.startIncome || '₹40L'} but had zero wealth.`}

[10-30s] Problem:
My money was scattered across:
${data.problems?.join('\n') || '- 8 mutual funds with no strategy\n- 3 insurance policies with wrong coverage\n- One rental property with negative cash flow'}

I was losing ${data.taxLoss || '₹3L'} per year to taxes alone.

[30-50s] Solution & Results:
Then I met PL Capital:
${data.solutions?.join('\n') || '✓ Built structured portfolio with 5 focused funds\n✓ Tax optimization saved ₹2L per year\n✓ Early IPO access gave 3X returns'}

Today: ${data.currentWealth || '₹1.8 Cr portfolio'}, on track to retire by ${data.retirementAge || '45'}.

[50-60s] Call to Action:
Want similar results? Book a free portfolio review at plcapital.com/consult
`.trim();
  }

  /**
   * Get available avatars
   *
   * @returns {Array} List of available avatars
   */
  async getAvatars() {
    if (this.simulate) {
      return [
        { id: 'avatar-1', name: 'Indian Professional Male 35', gender: 'male', age: '35' },
        { id: 'avatar-2', name: 'Indian Professional Female 32', gender: 'female', age: '32' }
      ];
    }

    try {
      const response = await fetch(`${this.baseUrl}/avatars`, {
        method: 'GET',
        headers: {
          'X-Api-Key': this.apiKey
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(`HeyGen API error: ${data.message || response.statusText}`);
      }

      return data.data.avatars;

    } catch (error) {
      console.error('❌ Failed to fetch avatars:', error.message);
      throw error;
    }
  }

  /**
   * Get available voices
   *
   * @returns {Array} List of available voices
   */
  async getVoices() {
    if (this.simulate) {
      return [
        { id: 'voice-1', name: 'Indian English Neutral', language: 'en-IN', gender: 'male' },
        { id: 'voice-2', name: 'Indian English Female', language: 'en-IN', gender: 'female' }
      ];
    }

    try {
      const response = await fetch(`${this.baseUrl}/voices`, {
        method: 'GET',
        headers: {
          'X-Api-Key': this.apiKey
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(`HeyGen API error: ${data.message || response.statusText}`);
      }

      return data.data.voices;

    } catch (error) {
      console.error('❌ Failed to fetch voices:', error.message);
      throw error;
    }
  }
}

module.exports = AvatarGenerator;
