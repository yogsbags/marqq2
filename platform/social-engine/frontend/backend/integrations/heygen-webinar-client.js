/**
 * HeyGen Webinar Client
 *
 * Provides methods for creating AI webinars using HeyGen's Template API and Video Generation API
 *
 * Note: HeyGen doesn't have a dedicated "webinar" API, but we can create webinar-like content
 * by combining multiple video segments (introduction, main content, conclusion) using templates
 */

class HeyGenWebinarClient {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('HeyGen API key is required');
    }
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.heygen.com';
  }

  /**
   * Create a video template for reusable webinar content
   * @param {Object} params - Template parameters
   * @param {string} params.template_name - Name of the template
   * @param {string} params.avatar_id - HeyGen avatar ID
   * @param {string} params.voice_id - HeyGen voice ID
   * @param {string} params.default_text - Default text/content for the template
   * @param {Array} params.variables - Template variables (optional)
   * @param {string} params.background_id - Background ID (optional)
   * @param {Object} params.dimension - Video dimensions {width, height} (optional)
   * @returns {Promise<Object>} Template creation result with template_id
   */
  async createTemplate(params) {
    const {
      template_name,
      avatar_id,
      voice_id,
      default_text,
      variables = [],
      background_id = null,
      dimension = { width: 1280, height: 720 }
    } = params;

    if (!template_name || !avatar_id || !voice_id) {
      throw new Error('template_name, avatar_id, and voice_id are required');
    }

    const requestBody = {
      template_name: template_name,
      video_inputs: [{
        character: {
          type: 'avatar',
          avatar_id: avatar_id,
          avatar_style: 'normal'
        },
        voice: {
          type: 'text',
          input_text: default_text || '{{content}}',
          voice_id: voice_id
        }
      }],
      dimension: dimension,
      ...(background_id && { background: { background_id } }),
      variables: variables.length > 0 ? variables : [
        {
          name: 'content',
          type: 'text',
          default_value: default_text || ''
        }
      ]
    };

    console.log(`   🔍 HeyGen Template API Request:`);
    console.log(`      Endpoint: POST ${this.baseUrl}/v2/template`);
    console.log(`      Template Name: ${template_name}`);

    try {
      const response = await fetch(`${this.baseUrl}/v2/template`, {
        method: 'POST',
        headers: {
          'X-Api-Key': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const responseText = await response.text();
      console.log(`   📡 HeyGen Template API Response (${response.status}): ${responseText.substring(0, 200)}...`);

      if (!response.ok) {
        throw new Error(`HeyGen Template API error: ${response.status} ${responseText}`);
      }

      const result = JSON.parse(responseText);

      if (result.error) {
        throw new Error(`HeyGen template creation failed: ${result.error.message || JSON.stringify(result.error)}`);
      }

      if (!result.data?.template_id) {
        throw new Error(`HeyGen template creation failed: No template_id in response`);
      }

      console.log(`   ✅ HeyGen template created: ${result.data.template_id}`);

      return {
        success: true,
        template_id: result.data.template_id,
        template_name: template_name
      };
    } catch (error) {
      console.error(`   ❌ Template creation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate video from a template with variable substitution
   * @param {Object} params - Generation parameters
   * @param {string} params.template_id - Template ID from createTemplate
   * @param {Object} params.variables - Variable values to substitute {content: "..."}
   * @param {string} params.title - Video title (optional)
   * @returns {Promise<Object>} Video generation result with video_id
   */
  async generateFromTemplate(params) {
    const { template_id, variables = {}, title = null } = params;

    if (!template_id) {
      throw new Error('template_id is required');
    }

    const requestBody = {
      template_id: template_id,
      variables: variables,
      ...(title && { title })
    };

    console.log(`   🔍 HeyGen Generate from Template API Request:`);
    console.log(`      Endpoint: POST ${this.baseUrl}/v2/template/generate`);
    console.log(`      Template ID: ${template_id}`);

    try {
      const response = await fetch(`${this.baseUrl}/v2/template/generate`, {
        method: 'POST',
        headers: {
          'X-Api-Key': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const responseText = await response.text();
      console.log(`   📡 HeyGen Template Generate API Response (${response.status}): ${responseText.substring(0, 200)}...`);

      if (!response.ok) {
        throw new Error(`HeyGen Template Generate API error: ${response.status} ${responseText}`);
      }

      const result = JSON.parse(responseText);

      if (result.error) {
        throw new Error(`HeyGen template video generation failed: ${result.error.message || JSON.stringify(result.error)}`);
      }

      if (!result.data?.video_id) {
        throw new Error(`HeyGen template video generation failed: No video_id in response`);
      }

      console.log(`   ✅ HeyGen template video initiated: ${result.data.video_id}`);

      return {
        success: true,
        video_id: result.data.video_id,
        template_id: template_id
      };
    } catch (error) {
      console.error(`   ❌ Template video generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate a single avatar video (helper method)
   * @private
   */
  async _generateVideo(params) {
    const { avatar_id, voice_id, input_text, title } = params;

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
      dimension: {
        width: 1920,
        height: 1080
      },
      title: title || 'Avatar Video'
    };

    const response = await fetch(`${this.baseUrl}/v2/video/generate`, {
      method: 'POST',
      headers: {
        'X-Api-Key': this.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(`HeyGen API error: ${response.status} ${responseText}`);
    }

    const result = JSON.parse(responseText);

    if (result.error) {
      throw new Error(`HeyGen video generation failed: ${result.error.message || JSON.stringify(result.error)}`);
    }

    if (!result.data?.video_id) {
      throw new Error(`HeyGen video generation failed: No video_id in response`);
    }

    return {
      video_id: result.data.video_id
    };
  }

  /**
   * Create a webinar-style video series
   * Creates multiple video segments: introduction, main content (split if needed), conclusion
   * OR a single complete video if singleVideo option is true
   * @param {Object} params - Webinar parameters
   * @param {string} params.webinar_title - Title of the webinar
   * @param {string} params.avatar_id - HeyGen avatar ID
   * @param {string} params.voice_id - HeyGen voice ID
   * @param {string} params.introduction_text - Introduction script
   * @param {string} params.main_content_text - Main content script
   * @param {string} params.conclusion_text - Conclusion script
   * @param {number} params.duration_minutes - Estimated duration in minutes (optional)
   * @param {string} params.background_id - Background ID (optional)
   * @param {boolean} params.singleVideo - If true, creates one complete video instead of segments (default: false)
   * @returns {Promise<Object>} Webinar creation result with video ID(s)
   */
  async createWebinar(params) {
    const {
      webinar_title,
      avatar_id,
      voice_id,
      introduction_text,
      main_content_text,
      conclusion_text,
      duration_minutes = 30,
      background_id = null,
      singleVideo = false
    } = params;

    if (!webinar_title || !avatar_id || !voice_id) {
      throw new Error('webinar_title, avatar_id, and voice_id are required');
    }

    // If singleVideo is true, try to create one complete video
    // If content exceeds HeyGen's 5000 character limit, split intelligently
    if (singleVideo) {
      console.log(`   🎓 Creating Complete HeyGen Webinar Video: ${webinar_title}`);
      console.log(`      Format: Single continuous video (or minimal segments if needed)`);

      const fullScript = [
        introduction_text,
        main_content_text,
        conclusion_text
      ].filter(Boolean).join('\n\n');

      if (!fullScript) {
        throw new Error('At least one of introduction_text, main_content_text, or conclusion_text is required');
      }

      const estimatedDuration = this._estimateDuration(fullScript);
      const maxChars = 5000; // HeyGen's limit per video

      // If script fits in one video, create single video
      if (fullScript.length <= maxChars) {
        console.log(`      Estimated Duration: ~${Math.ceil(estimatedDuration / 60)} minutes`);
        console.log(`      Script Length: ${fullScript.length} characters (within limit)`);

        try {
          const video = await this._generateVideo({
            avatar_id,
            voice_id,
            input_text: fullScript,
            title: webinar_title
          });

          const webinarData = {
            webinar_id: `webinar_${Date.now()}`,
            title: webinar_title,
            created_at: new Date().toISOString(),
            estimated_duration_minutes: Math.ceil(estimatedDuration / 60),
            estimated_duration_seconds: estimatedDuration,
            format: 'single_video',
            video_id: video.video_id,
            status: 'generating'
          };

          console.log(`   ✅ Single complete webinar video created: ${video.video_id}`);
          console.log(`   ⏳ Video is generating. Check status with getVideoStatus('${video.video_id}')`);

          return {
            success: true,
            ...webinarData
          };
        } catch (error) {
          console.error(`   ❌ Single video creation failed: ${error.message}`);
          throw new Error(`HeyGen single video webinar creation failed: ${error.message}`);
        }
      } else {
        // Script too long - split intelligently at paragraph boundaries
        console.log(`      Script Length: ${fullScript.length} characters (exceeds ${maxChars} limit)`);
        console.log(`      Splitting intelligently into minimal segments...`);

        const segments = this._splitIntelligently(fullScript, maxChars);
        console.log(`      Created ${segments.length} segment(s) for complete video`);

        const webinarVideos = [];

        for (let idx = 0; idx < segments.length; idx++) {
          const segmentVideo = await this._generateVideo({
            avatar_id,
            voice_id,
            input_text: segments[idx],
            title: idx === 0 ? webinar_title : `${webinar_title} - Part ${idx + 1}`
          });
          webinarVideos.push({
            segment: idx === 0 ? 'complete' : `part_${idx + 1}`,
            video_id: segmentVideo.video_id,
            text: segments[idx],
            estimated_duration_seconds: this._estimateDuration(segments[idx])
          });
        }

        const totalDurationSeconds = webinarVideos.reduce(
          (sum, seg) => sum + (seg.estimated_duration_seconds || 0),
          0
        );

        const webinarData = {
          webinar_id: `webinar_${Date.now()}`,
          title: webinar_title,
          created_at: new Date().toISOString(),
          estimated_duration_minutes: Math.ceil(totalDurationSeconds / 60),
          estimated_duration_seconds: totalDurationSeconds,
          format: 'multi_segment_minimal',
          segments: webinarVideos,
          total_segments: webinarVideos.length,
          status: 'generating',
          note: 'Content split into minimal segments due to HeyGen 5000 character limit'
        };

        console.log(`   ✅ Complete webinar created with ${webinarVideos.length} segment(s)`);
        console.log(`   ⏳ Estimated total duration: ${webinarData.estimated_duration_minutes} minutes`);
        console.log(`   ⏳ Videos are generating. Check status individually.`);

        return {
          success: true,
          ...webinarData
        };
      }
    }

    // Original multi-segment approach
    console.log(`   🎓 Creating HeyGen Webinar: ${webinar_title}`);
    console.log(`      Duration: ~${duration_minutes} minutes`);
    console.log(`      Format: Multi-segment (Introduction, Main Content, Conclusion)`);

    const webinarVideos = [];

    try {
      // Step 1: Create introduction video
      if (introduction_text) {
        console.log(`   📝 Generating introduction segment...`);
        const introVideo = await this._generateVideo({
          avatar_id,
          voice_id,
          input_text: introduction_text,
          title: `${webinar_title} - Introduction`
        });
        webinarVideos.push({
          segment: 'introduction',
          video_id: introVideo.video_id,
          text: introduction_text,
          estimated_duration_seconds: this._estimateDuration(introduction_text)
        });
      }

      // Step 2: Create main content segments (split if too long)
      if (main_content_text) {
        const maxWordsPerSegment = 750; // ~5 minutes per segment
        const words = main_content_text.split(/\s+/);
        const segments = [];

        for (let i = 0; i < words.length; i += maxWordsPerSegment) {
          const segmentText = words.slice(i, i + maxWordsPerSegment).join(' ');
          segments.push(segmentText);
        }

        console.log(`   📚 Generating ${segments.length} main content segment(s)...`);
        for (let idx = 0; idx < segments.length; idx++) {
          const segmentVideo = await this._generateVideo({
            avatar_id,
            voice_id,
            input_text: segments[idx],
            title: `${webinar_title} - Part ${idx + 1}`
          });
          webinarVideos.push({
            segment: `main_content_${idx + 1}`,
            video_id: segmentVideo.video_id,
            text: segments[idx],
            estimated_duration_seconds: this._estimateDuration(segments[idx])
          });
        }
      }

      // Step 3: Create conclusion video
      if (conclusion_text) {
        console.log(`   🎯 Generating conclusion segment...`);
        const conclusionVideo = await this._generateVideo({
          avatar_id,
          voice_id,
          input_text: conclusion_text,
          title: `${webinar_title} - Conclusion`
        });
        webinarVideos.push({
          segment: 'conclusion',
          video_id: conclusionVideo.video_id,
          text: conclusion_text,
          estimated_duration_seconds: this._estimateDuration(conclusion_text)
        });
      }

      // Calculate total estimated duration
      const totalDurationSeconds = webinarVideos.reduce(
        (sum, seg) => sum + (seg.estimated_duration_seconds || 0),
        0
      );

      const webinarData = {
        webinar_id: `webinar_${Date.now()}`,
        title: webinar_title,
        created_at: new Date().toISOString(),
        estimated_duration_minutes: Math.ceil(totalDurationSeconds / 60),
        estimated_duration_seconds: totalDurationSeconds,
        segments: webinarVideos,
        total_segments: webinarVideos.length,
        status: 'generating'
      };

      console.log(`   ✅ Webinar structure created with ${webinarVideos.length} video segment(s)`);
      console.log(`   ⏳ Estimated total duration: ${webinarData.estimated_duration_minutes} minutes`);
      console.log(`   ⏳ Videos are generating. Check status individually or wait for completion.`);

      return {
        success: true,
        ...webinarData
      };

    } catch (error) {
      console.error(`   ❌ Webinar creation failed: ${error.message}`);
      throw new Error(`HeyGen webinar creation failed: ${error.message}`);
    }
  }

  /**
   * Estimate video duration based on text length
   * Average speaking rate: ~150 words per minute
   * @private
   */
  _estimateDuration(text) {
    if (!text) return 0;
    const wordCount = text.split(/\s+/).length;
    const wordsPerMinute = 150;
    return Math.ceil((wordCount / wordsPerMinute) * 60);
  }

  /**
   * Split text intelligently at paragraph boundaries to stay within character limit
   * Tries to split at natural breaks (double newlines) rather than mid-sentence
   * @private
   */
  _splitIntelligently(text, maxChars) {
    if (text.length <= maxChars) {
      return [text];
    }

    const segments = [];
    const paragraphs = text.split(/\n\n+/);
    let currentSegment = '';

    for (const paragraph of paragraphs) {
      // If adding this paragraph would exceed limit
      if (currentSegment && (currentSegment.length + paragraph.length + 2) > maxChars) {
        // Save current segment and start new one
        if (currentSegment.trim()) {
          segments.push(currentSegment.trim());
        }
        currentSegment = paragraph;
      } else {
        // Add paragraph to current segment
        currentSegment = currentSegment
          ? `${currentSegment}\n\n${paragraph}`
          : paragraph;
      }
    }

    // Add remaining segment
    if (currentSegment.trim()) {
      segments.push(currentSegment.trim());
    }

    // If any segment is still too long (shouldn't happen, but safety check)
    const finalSegments = [];
    for (const seg of segments) {
      if (seg.length <= maxChars) {
        finalSegments.push(seg);
      } else {
        // Force split at sentence boundaries
        const sentences = seg.split(/[.!?]+\s+/);
        let current = '';
        for (const sentence of sentences) {
          if (current && (current.length + sentence.length + 2) > maxChars) {
            finalSegments.push(current.trim() + '.');
            current = sentence;
          } else {
            current = current ? `${current}. ${sentence}` : sentence;
          }
        }
        if (current.trim()) {
          finalSegments.push(current.trim() + '.');
        }
      }
    }

    return finalSegments.length > 0 ? finalSegments : [text.substring(0, maxChars)];
  }

  /**
   * Get video status (reuses existing method pattern)
   * @param {string} video_id - Video ID to check
   * @returns {Promise<Object>} Video status with video_url when ready
   */
  async getVideoStatus(video_id) {
    const response = await fetch(`${this.baseUrl}/v1/video_status.get?video_id=${video_id}`, {
      method: 'GET',
      headers: {
        'X-Api-Key': this.apiKey
      }
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(`HeyGen API error: ${response.status} ${responseText}`);
    }

    const result = JSON.parse(responseText);

    if (result.error) {
      throw new Error(`HeyGen status check failed: ${result.error.message || JSON.stringify(result.error)}`);
    }

    const status = result.data?.status || 'unknown';
    const videoUrl = result.data?.video_url || null;

    return {
      status: status,
      video_url: videoUrl,
      video_id: video_id
    };
  }

  /**
   * Get status of all webinar segments
   * @param {Array<string>} video_ids - Array of video IDs to check
   * @returns {Promise<Array<Object>>} Array of video statuses
   */
  async getWebinarStatus(video_ids) {
    const statusPromises = video_ids.map(video_id => this.getVideoStatus(video_id));
    const statuses = await Promise.all(statusPromises);
    return statuses;
  }
}

/**
 * Factory function to create HeyGen Webinar Client
 * @param {string} apiKey - HeyGen API key (optional, uses env var if not provided)
 * @returns {HeyGenWebinarClient} Client instance
 */
function getHeyGenWebinarClient(apiKey = null) {
  const key = apiKey || process.env.HEYGEN_API_KEY;
  if (!key) {
    throw new Error('HeyGen API key is required. Set HEYGEN_API_KEY environment variable or pass apiKey parameter.');
  }
  return new HeyGenWebinarClient(key);
}

module.exports = {
  HeyGenWebinarClient,
  getHeyGenWebinarClient
};

