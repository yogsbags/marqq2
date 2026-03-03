/**
 * HeyGen Photo Avatar Workflow
 *
 * Creates photo avatars and generates videos with ElevenLabs voices
 *
 * Workflow:
 * 1. Create photo avatar group
 * 2. Add looks (photos) to the group
 * 3. Train the photo avatar
 * 4. Generate video with ElevenLabs voice
 */

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const elevenlabsConfig = require('../config/elevenlabs-voice-config');

class HeyGenPhotoAvatar {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.HEYGEN_API_KEY;
    this.baseUrl = 'https://api.heygen.com';
    this.simulate = options.simulate || false;
  }

  /**
   * Step 1: Create a photo avatar group
   * @param {string} name - Name for the avatar group
   * @returns {Object} Group creation response
   */
  async createPhotoAvatarGroup(name) {
    console.log('\n📸 Creating Photo Avatar Group...');
    console.log(`   Name: ${name}`);

    if (this.simulate) {
      return {
        group_id: `simulated-group-${Date.now()}`,
        name,
        status: 'created',
        simulated: true
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/v2/photo_avatar/photo_avatar_group`, {
        method: 'POST',
        headers: {
          'X-Api-Key': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(`HeyGen API error: ${data.message || response.statusText}`);
      }

      console.log('✅ Photo Avatar Group created');
      console.log(`   Group ID: ${data.data?.group_id || data.group_id}`);

      return data.data || data;
    } catch (error) {
      console.error('❌ Failed to create photo avatar group:', error.message);
      throw error;
    }
  }

  /**
   * Step 2: Add photo looks to the avatar group
   * @param {string} groupId - The group ID
   * @param {Array} looks - Array of photo URLs or base64 images
   * @returns {Object} Add looks response
   */
  async addPhotoAvatarLooks(groupId, looks) {
    console.log('\n🖼️ Adding Photo Avatar Looks...');
    console.log(`   Group ID: ${groupId}`);
    console.log(`   Number of looks: ${looks.length}`);

    if (this.simulate) {
      return {
        group_id: groupId,
        looks_added: looks.length,
        status: 'added',
        simulated: true
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/v2/photo_avatar/add_photo_avatar_looks`, {
        method: 'POST',
        headers: {
          'X-Api-Key': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          group_id: groupId,
          looks: looks.map(look => ({
            image: look.image || look,
            name: look.name || 'default'
          }))
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(`HeyGen API error: ${data.message || response.statusText}`);
      }

      console.log('✅ Photo looks added successfully');
      return data.data || data;
    } catch (error) {
      console.error('❌ Failed to add photo looks:', error.message);
      throw error;
    }
  }

  /**
   * Step 3: Train the photo avatar group
   * @param {string} groupId - The group ID to train
   * @returns {Object} Training response
   */
  async trainPhotoAvatar(groupId) {
    console.log('\n🎓 Training Photo Avatar...');
    console.log(`   Group ID: ${groupId}`);

    if (this.simulate) {
      return {
        group_id: groupId,
        status: 'training',
        estimated_time: 300,
        simulated: true
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/v2/photo_avatar/train`, {
        method: 'POST',
        headers: {
          'X-Api-Key': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ group_id: groupId })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(`HeyGen API error: ${data.message || response.statusText}`);
      }

      console.log('✅ Training started');
      console.log(`   Status: ${data.data?.status || data.status}`);

      return data.data || data;
    } catch (error) {
      console.error('❌ Failed to start training:', error.message);
      throw error;
    }
  }

  /**
   * Check training status
   * @param {string} groupId - The group ID
   * @returns {Object} Training status
   */
  async getTrainingStatus(groupId) {
    console.log(`\n⏳ Checking training status for group: ${groupId}`);

    if (this.simulate) {
      return {
        group_id: groupId,
        status: 'completed',
        simulated: true
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/v2/photo_avatar/training_status?group_id=${groupId}`, {
        method: 'GET',
        headers: {
          'X-Api-Key': this.apiKey
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(`HeyGen API error: ${data.message || response.statusText}`);
      }

      console.log(`   Status: ${data.data?.status || data.status}`);
      return data.data || data;
    } catch (error) {
      console.error('❌ Failed to get training status:', error.message);
      throw error;
    }
  }

  /**
   * Wait for training completion
   * @param {string} groupId - The group ID
   * @param {number} maxWaitTime - Max wait time in seconds
   * @returns {Object} Completed training info
   */
  async waitForTrainingCompletion(groupId, maxWaitTime = 600) {
    console.log(`\n⏳ Waiting for training completion (max ${maxWaitTime}s)...`);

    const startTime = Date.now();
    let attempts = 0;

    while (true) {
      attempts++;
      const status = await this.getTrainingStatus(groupId);

      if (status.status === 'completed' || status.status === 'success') {
        console.log('✅ Training completed!');
        return status;
      }

      if (status.status === 'failed') {
        throw new Error(`Training failed: ${status.error || 'Unknown error'}`);
      }

      const elapsed = (Date.now() - startTime) / 1000;
      if (elapsed >= maxWaitTime) {
        throw new Error(`Training timeout after ${maxWaitTime}s`);
      }

      // Wait 30 seconds before next check
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  }

  /**
   * Generate video with photo avatar and ElevenLabs voice
   * @param {Object} config - Video configuration
   * @returns {Object} Video generation response
   */
  async generateVideoWithElevenLabsVoice(config) {
    const {
      avatarId,        // HeyGen avatar ID (photo avatar or public avatar)
      script,          // Text script for the video
      elevenLabsVoiceId, // ElevenLabs voice ID
      title,
      background,
      dimension
    } = config;

    console.log('\n🎬 Generating Video with ElevenLabs Voice...');
    console.log(`   Avatar: ${avatarId}`);
    console.log(`   Voice (ElevenLabs): ${elevenLabsVoiceId}`);
    console.log(`   Title: ${title}`);

    if (this.simulate) {
      return {
        video_id: `simulated-video-${Date.now()}`,
        status: 'processing',
        estimated_time: 120,
        simulated: true
      };
    }

    // HeyGen V2 API payload with ElevenLabs voice
    const payload = {
      video_inputs: [{
        character: {
          type: 'avatar',
          avatar_id: avatarId,
          avatar_style: 'normal'
        },
        voice: {
          type: 'elevenlabs',  // Use ElevenLabs as voice provider
          voice_id: elevenLabsVoiceId,
          input_text: script
        },
        background: background || {
          type: 'color',
          value: '#FFFFFF'
        }
      }],
      dimension: dimension || {
        width: 1920,
        height: 1080
      },
      title: title || 'AI Avatar Video'
    };

    try {
      const response = await fetch(`${this.baseUrl}/v2/video/generate`, {
        method: 'POST',
        headers: {
          'X-Api-Key': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(`HeyGen API error: ${data.message || JSON.stringify(data)}`);
      }

      console.log('✅ Video generation started');
      console.log(`   Video ID: ${data.data?.video_id}`);

      return data.data || data;
    } catch (error) {
      console.error('❌ Video generation failed:', error.message);
      throw error;
    }
  }

  /**
   * Check video generation status
   * @param {string} videoId - The video ID
   * @returns {Object} Video status
   */
  async getVideoStatus(videoId) {
    if (this.simulate) {
      return {
        video_id: videoId,
        status: 'completed',
        video_url: `https://simulated.heygen.com/${videoId}.mp4`,
        simulated: true
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/video_status.get?video_id=${videoId}`, {
        method: 'GET',
        headers: {
          'X-Api-Key': this.apiKey
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(`HeyGen API error: ${data.message || response.statusText}`);
      }

      return data.data || data;
    } catch (error) {
      console.error(`❌ Status check failed for ${videoId}:`, error.message);
      throw error;
    }
  }

  /**
   * Wait for video completion
   * @param {string} videoId - The video ID
   * @param {number} maxWaitTime - Max wait time in seconds
   * @returns {Object} Completed video info
   */
  async waitForVideoCompletion(videoId, maxWaitTime = 300) {
    console.log(`\n⏳ Waiting for video completion (max ${maxWaitTime}s)...`);

    const startTime = Date.now();
    let attempts = 0;

    while (true) {
      attempts++;
      const status = await this.getVideoStatus(videoId);

      console.log(`   [${attempts}] Status: ${status.status}`);

      if (status.status === 'completed') {
        console.log('✅ Video ready!');
        console.log(`   Download: ${status.video_url}`);
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
   * Complete workflow: Create photo avatar and generate video
   * @param {Object} config - Complete workflow config
   * @returns {Object} Final video result
   */
  async createPhotoAvatarAndGenerateVideo(config) {
    const {
      avatarName,
      photoUrl,
      script,
      heygenAvatarId,  // Use existing avatar ID if available
      elevenLabsVoiceId,
      title,
      waitForCompletion = false
    } = config;

    console.log('\n🚀 Starting Photo Avatar Video Generation Workflow');
    console.log('='.repeat(50));

    let avatarId = heygenAvatarId;

    // If no existing avatar, create a new photo avatar
    if (!avatarId && photoUrl) {
      // Step 1: Create group
      const group = await this.createPhotoAvatarGroup(avatarName);

      // Step 2: Add photo look
      await this.addPhotoAvatarLooks(group.group_id, [{ image: photoUrl, name: 'default' }]);

      // Step 3: Train avatar
      await this.trainPhotoAvatar(group.group_id);

      // Step 4: Wait for training
      const trained = await this.waitForTrainingCompletion(group.group_id);
      avatarId = trained.avatar_id || group.group_id;
    }

    // Generate video with ElevenLabs voice
    const videoResult = await this.generateVideoWithElevenLabsVoice({
      avatarId,
      script,
      elevenLabsVoiceId,
      title
    });

    if (waitForCompletion && !this.simulate) {
      const completed = await this.waitForVideoCompletion(videoResult.video_id);
      return completed;
    }

    return videoResult;
  }

  /**
   * Generate video using pre-configured avatar with mapped ElevenLabs voice
   * @param {Object} config - Video config with avatarId from heygen-avatar-config
   * @returns {Object} Video result
   */
  async generateVideoWithMappedVoice(config) {
    const {
      avatarId,  // e.g., 'Raj_public_v2', 'Priya_public_v2'
      script,
      title,
      background,
      waitForCompletion = false
    } = config;

    // Get ElevenLabs voice mapping for this avatar
    const voiceMapping = elevenlabsConfig.helpers.getVoiceForAvatar(avatarId);

    console.log('\n🎬 Generating Video with Mapped Voice');
    console.log(`   Avatar: ${voiceMapping.avatarName} (${avatarId})`);
    console.log(`   Voice: ${voiceMapping.voiceName} (${voiceMapping.voiceId})`);
    console.log(`   Voice Description: ${voiceMapping.voiceDescription}`);

    const videoResult = await this.generateVideoWithElevenLabsVoice({
      avatarId,
      script,
      elevenLabsVoiceId: voiceMapping.voiceId,
      title,
      background
    });

    if (waitForCompletion && !this.simulate) {
      const completed = await this.waitForVideoCompletion(videoResult.video_id);
      return completed;
    }

    return videoResult;
  }

  /**
   * List available photo avatars
   * @returns {Array} List of photo avatars
   */
  async listPhotoAvatars() {
    if (this.simulate) {
      return [
        { avatar_id: 'photo-avatar-1', name: 'Test Avatar 1', status: 'ready' },
        { avatar_id: 'photo-avatar-2', name: 'Test Avatar 2', status: 'ready' }
      ];
    }

    try {
      const response = await fetch(`${this.baseUrl}/v2/avatars`, {
        method: 'GET',
        headers: {
          'X-Api-Key': this.apiKey
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(`HeyGen API error: ${data.message || response.statusText}`);
      }

      return data.data?.avatars || data.avatars || [];
    } catch (error) {
      console.error('❌ Failed to list avatars:', error.message);
      throw error;
    }
  }
}

module.exports = HeyGenPhotoAvatar;
