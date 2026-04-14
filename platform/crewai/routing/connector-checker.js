/**
 * ConnectorChecker - Validates which integrations user has connected
 * Used by Veena orchestrator to determine if routing can proceed
 * or if user needs to connect integrations first
 */

const { createClient } = require('@supabase/supabase-js');

class ConnectorChecker {
  constructor(supabaseUrl, supabaseKey) {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase URL and key are required for ConnectorChecker');
    }
    this.supabase = createClient(supabaseUrl, supabaseKey);

    // Mapping of connector IDs to user-friendly names
    this.connectorLabels = {
      'google_ads': 'Google Ads',
      'meta_ads': 'Meta Ads',
      'linkedin_ads': 'LinkedIn Ads',
      'tiktok_ads': 'TikTok Ads',
      'hubspot': 'HubSpot',
      'salesforce': 'Salesforce',
      'ga4': 'Google Analytics 4',
      'linkedin': 'LinkedIn',
      'linkedin_sales_nav': 'LinkedIn Sales Navigator',
      'facebook': 'Facebook',
      'instagram': 'Instagram',
      'twitter': 'Twitter/X',
      'apollo': 'Apollo.io',
      'hunter': 'Hunter.io',
      'clearbit': 'Clearbit',
      'mailchimp': 'Mailchimp',
      'klaviyo': 'Klaviyo',
      'sendgrid': 'SendGrid',
      'instantly': 'Instantly',
      'lemlist': 'Lemlist',
      'herreach': 'HeyReach',
      'wordpress': 'WordPress',
      'sanity': 'Sanity CMS',
      'notion': 'Notion',
      'airtable': 'Airtable',
      'google_calendar': 'Google Calendar',
      'zapier': 'Zapier',
      'unbounce': 'Unbounce',
      'leadpages': 'Leadpages',
      'instapage': 'Instapage',
      'optimizely': 'Optimizely',
      'vwo': 'VWO',
      'google_optimize': 'Google Optimize',
      'hotjar': 'Hotjar',
      'amplitude': 'Amplitude',
      'segment': 'Segment',
      'mixpanel': 'Mixpanel',
      'gainsight': 'Gainsight',
      'product_analytics': 'Product Analytics',
      'firecrawl': 'Firecrawl',
      'gsc': 'Google Search Console',
      'semrush': 'Semrush',
      'ahrefs': 'Ahrefs',
      'dalle3': 'DALL-E 3',
      'fal_ai': 'Fal AI',
      'canva': 'Canva',
      'stripe': 'Stripe',
      'email_validator': 'Email Validator'
    };
  }

  /**
   * Get all connected integrations for a user in a workspace
   * @param {string} userId - Supabase user ID
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<Object>} Connected connectors with metadata
   */
  async getConnectedIntegrations(userId, workspaceId) {
    try {
      if (!userId || !workspaceId) {
        console.warn('[ConnectorChecker] Missing userId or workspaceId');
        return {};
      }

      const { data, error } = await this.supabase
        .from('workspace_integrations')
        .select('connector_id, connector_name, status, last_sync, auth_token, configuration')
        .eq('user_id', userId)
        .eq('workspace_id', workspaceId)
        .eq('status', 'connected');

      if (error) {
        console.error('[ConnectorChecker] Error fetching connectors:', error);
        return {};
      }

      // Transform to map for easy lookup
      const connected = {};
      if (data && Array.isArray(data)) {
        data.forEach(conn => {
          connected[conn.connector_id] = {
            name: conn.connector_name,
            status: conn.status,
            lastSync: conn.last_sync || null,
            hasAuth: !!conn.auth_token,
            config: conn.configuration || {}
          };
        });
      }

      console.log('[ConnectorChecker] Found', Object.keys(connected).length, 'connected integrations');
      return connected;
    } catch (error) {
      console.error('[ConnectorChecker] Unexpected error in getConnectedIntegrations:', error);
      return {};
    }
  }

  /**
   * Check if user has required connectors
   * @param {string} userId - Supabase user ID
   * @param {string} workspaceId - Workspace ID
   * @param {string[]} requiredConnectors - List of required connector IDs
   * @returns {Promise<Object>} Check result with missing connectors
   */
  async checkRequired(userId, workspaceId, requiredConnectors = []) {
    try {
      const connected = await this.getConnectedIntegrations(userId, workspaceId);
      const connectorIds = Object.keys(connected);

      // If no required connectors specified, always allow
      if (!requiredConnectors || requiredConnectors.length === 0) {
        return {
          canProceed: true,
          missing: [],
          connected: connectorIds,
          details: connected
        };
      }

      // Find which required connectors are missing
      const missing = requiredConnectors.filter(
        req => !connectorIds.includes(req)
      );

      return {
        canProceed: missing.length === 0,
        missing,
        connected: connectorIds,
        details: connected,
        connectedNames: connectorIds.map(id => this.connectorLabels[id] || id)
      };
    } catch (error) {
      console.error('[ConnectorChecker] Error in checkRequired:', error);
      return {
        canProceed: false,
        missing: requiredConnectors || [],
        connected: [],
        details: {},
        error: error.message
      };
    }
  }

  /**
   * Check optional connectors that enhance the analysis
   * @param {string} userId - Supabase user ID
   * @param {string} workspaceId - Workspace ID
   * @param {string[]} optionalConnectors - List of optional connector IDs
   * @returns {Promise<Object>} Available optional connectors
   */
  async checkOptional(userId, workspaceId, optionalConnectors = []) {
    try {
      const connected = await this.getConnectedIntegrations(userId, workspaceId);
      const connectorIds = Object.keys(connected);

      const available = optionalConnectors.filter(opt =>
        connectorIds.includes(opt)
      );

      return {
        available,
        unavailable: optionalConnectors.filter(opt =>
          !connectorIds.includes(opt)
        ),
        availableNames: available.map(id => this.connectorLabels[id] || id),
        details: available.reduce((acc, id) => {
          acc[id] = connected[id];
          return acc;
        }, {})
      };
    } catch (error) {
      console.error('[ConnectorChecker] Error in checkOptional:', error);
      return {
        available: [],
        unavailable: optionalConnectors || [],
        availableNames: [],
        details: {},
        error: error.message
      };
    }
  }

  /**
   * Generate user-friendly message for missing connectors
   * @param {string} goalId - The goal being routed
   * @param {string[]} missing - List of missing connector IDs
   * @param {string[]} optional - List of optional connector IDs (available)
   * @returns {Object} Prompt configuration for chat UI
   */
  generateMissingConnectorPrompt(goalId, missing = [], optional = []) {
    const missingLabels = missing.map(m => this.connectorLabels[m] || m);
    const optionalLabels = optional.map(o => this.connectorLabels[o] || o);

    let message = '';
    let action = 'connect_integrations';

    if (missing.length > 0 && optional.length > 0) {
      // Both missing and optional available
      message = `I need ${missingLabels.join(' + ')} to help with this goal. I can also use ${optionalLabels.join(' + ')} to give you better insights. Would you like to connect now?`;
    } else if (missing.length > 0) {
      // Only missing connectors
      message = `I need ${missingLabels.join(' + ')} to help with this. Would you like to connect now?`;
    } else if (optional.length > 0) {
      // Only optional available
      message = `I can work with what you have, but I'll get better results with ${optionalLabels.join(' + ')}. Want to connect?`;
    }

    return {
      type: 'connector_missing',
      goal_id: goalId,
      missing,
      optional,
      message,
      action,
      missingLabels,
      optionalLabels
    };
  }

  /**
   * Get connector connection URL (for OAuth flows)
   * @param {string} connectorId - Connector ID to connect
   * @returns {string} Connection URL
   */
  getConnectorConnectionUrl(connectorId) {
    const baseUrl = process.env.VITE_API_BASE_URL || 'http://localhost:3000';
    return `${baseUrl}/api/integrations/connect/${connectorId}`;
  }

  /**
   * Validate all integrations are still active (useful for health checks)
   * @param {string} userId - Supabase user ID
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<Object>} Health status of all connected integrations
   */
  async validateIntegrationHealth(userId, workspaceId) {
    try {
      const connected = await this.getConnectedIntegrations(userId, workspaceId);
      const now = new Date();
      const healthStatus = {};

      for (const [connectorId, details] of Object.entries(connected)) {
        const lastSync = details.lastSync ? new Date(details.lastSync) : null;
        const hoursSinceSync = lastSync ? (now - lastSync) / (1000 * 60 * 60) : null;

        healthStatus[connectorId] = {
          name: this.connectorLabels[connectorId] || connectorId,
          status: details.status,
          lastSync,
          hoursSinceSync,
          isHealthy: !lastSync || hoursSinceSync < 24, // Healthy if synced in last 24h
          needsRefresh: lastSync && hoursSinceSync > 12 // Needs refresh if > 12h
        };
      }

      return {
        healthy: Object.entries(healthStatus)
          .filter(([_, h]) => h.isHealthy)
          .map(([id, _]) => id),
        needsRefresh: Object.entries(healthStatus)
          .filter(([_, h]) => h.needsRefresh && h.isHealthy)
          .map(([id, _]) => id),
        stale: Object.entries(healthStatus)
          .filter(([_, h]) => !h.isHealthy)
          .map(([id, _]) => id),
        details: healthStatus
      };
    } catch (error) {
      console.error('[ConnectorChecker] Error in validateIntegrationHealth:', error);
      return {
        healthy: [],
        needsRefresh: [],
        stale: [],
        details: {},
        error: error.message
      };
    }
  }

  /**
   * Get recommended connectors to connect for a goal
   * (Returns missing + optional that would enhance the analysis)
   * @param {string} goalId - Goal ID
   * @param {Object} routingTable - The routing table JSON
   * @param {string} userId - User ID
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<Object>} Recommendation with priority
   */
  async getConnectorRecommendation(goalId, routingTable, userId, workspaceId) {
    try {
      const goalConfig = routingTable.goals[goalId];
      if (!goalConfig) {
        return { error: 'Goal not found', recommendations: [] };
      }

      const requiredCheck = await this.checkRequired(
        userId,
        workspaceId,
        goalConfig.required_connectors || []
      );

      const optionalCheck = await this.checkOptional(
        userId,
        workspaceId,
        goalConfig.optional_connectors || []
      );

      return {
        goalId,
        required: {
          missing: requiredCheck.missing,
          missingLabels: requiredCheck.missing.map(
            m => this.connectorLabels[m] || m
          ),
          hasAll: requiredCheck.canProceed
        },
        optional: {
          available: optionalCheck.available,
          availableLabels: optionalCheck.availableNames,
          unavailable: optionalCheck.unavailable,
          unavailableLabels: optionalCheck.unavailable.map(
            u => this.connectorLabels[u] || u
          )
        },
        canProceed: requiredCheck.canProceed,
        priority: requiredCheck.missing.length > 0 ? 'high' : 'low'
      };
    } catch (error) {
      console.error('[ConnectorChecker] Error in getConnectorRecommendation:', error);
      return {
        error: error.message,
        recommendations: []
      };
    }
  }
}

module.exports = ConnectorChecker;
