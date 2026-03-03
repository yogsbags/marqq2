const fs = require('fs');
const path = require('path');
const { getMoengageClient } = require('./moengage-client');

class MoengageEmailPublisher {
  constructor() {
    this.client = getMoengageClient();
    // Default configuration from environment variables
    this.defaultSegmentId = process.env.MOENGAGE_DEFAULT_SEGMENT_ID || '66fbb814e4a912bbd07a58a0';
    this.defaultSenderEmail = process.env.MOENGAGE_DEFAULT_SENDER_EMAIL || 'marketing@pl-india.in';
    this.defaultSenderName = process.env.MOENGAGE_DEFAULT_SENDER_NAME || 'PL India Marketing';
    this.defaultTestEmail = process.env.MOENGAGE_DEFAULT_TEST_EMAIL || 'yogsbags@gmail.com';
  }

  /**
   * Find the most recent generated email newsletter content.
   * If a topic is provided, prefer entries matching that topic.
   */
  loadLatestNewsletter(topic) {
    const statePath = path.join(__dirname, '..', 'data', 'workflow-state.json');
    if (!fs.existsSync(statePath)) {
      return null;
    }

    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const records = Object.values(state.content || {});

    const sorted = records
      .filter((r) => r.contentType === 'email-newsletter')
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());

    if (!sorted.length) return null;
    if (!topic) return sorted[0];

    const match = sorted.find((r) => (r.topic || '').toLowerCase() === topic.toLowerCase());
    return match || sorted[0];
  }

  /**
   * Push a broadcast event to MoEngage Data API.
   * Expect MoEngage-side campaign (SendGrid) to pick this event and send the email.
   * @deprecated Use publishNewsletterToSegment or publishNewsletterToUser instead
   */
  async publishNewsletter(newsletter) {
    if (!newsletter?.html || !newsletter?.subject) {
      throw new Error('Newsletter payload missing html or subject');
    }

    const payload = {
      type: 'event',
      customer_id: 'broadcast',
      actions: [
        {
          action: 'EmailNewsletterReady',
          timestamp: Date.now(),
          attributes: {
            subject: newsletter.subject,
            preheader: newsletter.preheader || '',
            html: newsletter.html.slice(0, 48000), // keep payload size manageable
            plainText: newsletter.plainText || '',
            topic: newsletter.topic || '',
            source: 'social-media-automation',
            campaignType: 'email-newsletter'
          }
        }
      ]
    };

    return this.client.track(payload);
  }

  /**
   * Create and send email newsletter to a MoEngage segment using Email Campaign API
   * @param {Object} newsletter - Newsletter content (html, subject, preheader, plainText, topic)
   * @param {Object} options - Publishing options
   * @param {string} options.segmentId - MoEngage segment ID (defaults to MOENGAGE_DEFAULT_SEGMENT_ID)
   * @param {string} options.fromEmail - Sender email (defaults to MOENGAGE_DEFAULT_SENDER_EMAIL)
   * @param {string} options.fromName - Sender name (defaults to MOENGAGE_DEFAULT_SENDER_NAME)
   * @param {string} options.testEmail - Test email address (optional, for testing)
   * @param {boolean} options.testOnly - If true, only send test email, don't create campaign
   * @returns {Promise<Object>} Campaign creation/test result
   */
  async publishNewsletterToSegment(newsletter, options = {}) {
    if (!newsletter?.html || !newsletter?.subject) {
      throw new Error('Newsletter payload missing html or subject');
    }

    const segmentId = options.segmentId || this.defaultSegmentId;
    const fromEmail = options.fromEmail || this.defaultSenderEmail;
    const fromName = options.fromName || this.defaultSenderName;
    const testEmail = options.testEmail || this.defaultTestEmail;
    const testOnly = options.testOnly || false;

    // First, create an email template (or use existing template ID if provided)
    // For now, we'll create a campaign with inline HTML content
    const campaignName = `newsletter-${newsletter.topic || 'campaign'}-${Date.now()}`;

    const campaignConfig = {
      name: campaignName,
      delivery_type: 'scheduled',
      schedule: {
        type: 'immediate'
      },
      target_audience: {
        segment_id: segmentId
      },
      from_name: fromName,
      from_email: fromEmail,
      reply_to: fromEmail,
      subject: newsletter.subject,
      html_content: newsletter.html,
      plain_text_content: newsletter.plainText || '',
      preheader: newsletter.preheader || '',
      metadata: {
        topic: newsletter.topic || '',
        source: 'social-media-automation',
        campaignType: 'email-newsletter',
        created_at: new Date().toISOString()
      }
    };

    try {
      if (testOnly && testEmail) {
        // Create campaign first, then send test email
        console.log(`   📧 Creating test campaign for segment ${segmentId}...`);
        const campaign = await this.client.createEmailCampaign(campaignConfig);
        const campaignId = campaign.id || campaign.campaign_id;

        console.log(`   ✉️  Sending test email to ${testEmail}...`);
        const testResult = await this.client.testEmailCampaign(campaignId, {
          test_emails: [testEmail]
        });

        return {
          success: true,
          mode: 'test',
          campaignId,
          testEmail,
          testResult
        };
      } else {
        // Create and schedule campaign for segment
        console.log(`   📧 Creating email campaign for segment ${segmentId}...`);
        const campaign = await this.client.createEmailCampaign(campaignConfig);
        const campaignId = campaign.id || campaign.campaign_id;

        // Optionally send test email to default test user
        if (testEmail) {
          try {
            console.log(`   ✉️  Sending test email to ${testEmail}...`);
            await this.client.testEmailCampaign(campaignId, {
              test_emails: [testEmail]
            });
          } catch (testError) {
            console.log(`   ⚠️  Test email failed (campaign still created): ${testError.message}`);
          }
        }

        return {
          success: true,
          mode: 'segment',
          campaignId,
          segmentId,
          testEmail: testEmail || null
        };
      }
    } catch (error) {
      throw new Error(`Failed to publish newsletter to segment: ${error.message}`);
    }
  }

  /**
   * Send email newsletter to a specific user (for testing)
   * @param {Object} newsletter - Newsletter content
   * @param {string} userEmail - User email address
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Test result
   */
  async publishNewsletterToUser(newsletter, userEmail, options = {}) {
    return this.publishNewsletterToSegment(newsletter, {
      ...options,
      testEmail: userEmail,
      testOnly: true
    });
  }

  /**
   * Push a WhatsApp creative event to MoEngage Data API.
   * MoEngage/Interakt journey should map this event to an actual WhatsApp send.
   */
  async publishWhatsAppCreative(input) {
    if (!input?.creativeUrl) {
      throw new Error('WhatsApp creativeUrl is required');
    }

    const payload = {
      type: 'event',
      customer_id: 'broadcast',
      actions: [
        {
          action: 'WhatsAppCreativeReady',
          timestamp: Date.now(),
          attributes: {
            topic: input.topic || '',
            creativeUrl: input.creativeUrl,
            cta: input.cta || '',
            source: 'social-media-automation',
            channel: 'whatsapp'
          }
        }
      ]
    };

    return this.client.track(payload);
  }
}

function getMoengageEmailPublisher() {
  return new MoengageEmailPublisher();
}

module.exports = {
  MoengageEmailPublisher,
  getMoengageEmailPublisher
};
