const fs = require('fs').promises;
const path = require('path');

class StateManager {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.stateFile = path.join(dataDir, 'workflow-state.json');
    this.state = {
      campaigns: {},
      content: {},
      visuals: {},
      videos: {},
      published: {},
      metrics: {}
    };
  }

  /**
   * Initialize state management
   */
  async initialize() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });

      // Load existing state if it exists
      try {
        const data = await fs.readFile(this.stateFile, 'utf8');
        this.state = JSON.parse(data);
      } catch (err) {
        // File doesn't exist, use default state
        await this.save();
      }
    } catch (error) {
      throw new Error(`Failed to initialize state manager: ${error.message}`);
    }
  }

  /**
   * Save state to disk
   */
  async save() {
    try {
      await fs.writeFile(this.stateFile, JSON.stringify(this.state, null, 2));
    } catch (error) {
      throw new Error(`Failed to save state: ${error.message}`);
    }
  }

  /**
   * Add campaign
   */
  async addCampaign(campaign) {
    this.state.campaigns[campaign.id] = {
      ...campaign,
      createdAt: new Date().toISOString()
    };
    await this.save();
    return campaign.id;
  }

  /**
   * Update campaign
   */
  async updateCampaign(campaignId, updates) {
    if (!this.state.campaigns[campaignId]) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }

    this.state.campaigns[campaignId] = {
      ...this.state.campaigns[campaignId],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    await this.save();
  }

  /**
   * Add content piece
   */
  async addContent(content) {
    this.state.content[content.id] = {
      ...content,
      createdAt: new Date().toISOString(),
      status: content.status || 'draft'
    };
    await this.save();
    return content.id;
  }

  /**
   * Update content status
   */
  async updateContentStatus(contentId, status, metadata = {}) {
    if (!this.state.content[contentId]) {
      throw new Error(`Content not found: ${contentId}`);
    }

    this.state.content[contentId] = {
      ...this.state.content[contentId],
      status,
      ...metadata,
      updatedAt: new Date().toISOString()
    };

    await this.save();
  }

  /**
   * Add video
   */
  async addVideo(video) {
    this.state.videos[video.id] = {
      ...video,
      createdAt: new Date().toISOString()
    };
    await this.save();
    return video.id;
  }

  /**
   * Update video
   */
  async updateVideo(videoId, updates) {
    if (!this.state.videos[videoId]) {
      throw new Error(`Video not found: ${videoId}`);
    }

    this.state.videos[videoId] = {
      ...this.state.videos[videoId],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    await this.save();
  }

  /**
   * Add published content
   */
  async addPublished(published) {
    this.state.published[published.id] = {
      ...published,
      publishedAt: new Date().toISOString()
    };
    await this.save();
    return published.id;
  }

  /**
   * Get content by status
   */
  getContentByStatus(status) {
    return Object.values(this.state.content).filter(c => c.status === status);
  }

  /**
   * Get campaigns by platform
   */
  getCampaignsByPlatform(platform) {
    return Object.values(this.state.campaigns).filter(c => c.platform === platform);
  }
}

module.exports = StateManager;
