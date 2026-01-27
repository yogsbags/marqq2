#!/usr/bin/env node

/**
 * CSV Data Manager for Enhanced Bulk Generator
 * Handles all CSV operations, data validation, and approval workflows
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

// Import Google Sheets sync (optional - fails gracefully if not configured)
let googleSheetsSyncModule;
try {
  // Path goes up 3 levels: backend/core -> backend -> enhanced-bulk-generator-frontend -> martech -> scripts
  const syncPath = path.resolve(__dirname, '../../../scripts/sync-google-sheets.cjs');
  googleSheetsSyncModule = require(syncPath);
} catch (error) {
  // Google Sheets sync module not available (expected in some environments)
  googleSheetsSyncModule = null;
  console.log('⚠️  Google Sheets sync module not found:', error.message);
}

class CSVDataManager {
  constructor(dataDir = '../data', options = {}) {
    this.dataDir = path.resolve(__dirname, dataDir);
    this.ensureDataDirectory();

    // Google Sheets sync configuration
    this.enableGoogleSheetsSync = options.enableGoogleSheetsSync !== false; // Enabled by default
    this.silentSync = options.silentSync !== false; // Silent by default

    // CSV file paths
    this.files = {
      masterResearch: path.join(this.dataDir, 'master-research.csv'),
      researchGaps: path.join(this.dataDir, 'research-gaps.csv'),
      quickWins: path.join(this.dataDir, 'quick-wins.csv'),
      generatedTopics: path.join(this.dataDir, 'generated-topics.csv'),
      topicResearch: path.join(this.dataDir, 'topic-research.csv'),
      createdContent: path.join(this.dataDir, 'created-content.csv'),
      publishedContent: path.join(this.dataDir, 'published-content.csv'),
      workflowStatus: path.join(this.dataDir, 'workflow-status.csv')
    };
  }

  /**
   * Ensure data directory exists
   */
  ensureDataDirectory() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
      console.log(`📁 Created data directory: ${this.dataDir}`);
    }
  }

  /**
   * Get schema columns for a specific CSV type
   */
  getSchemaColumns(csvType) {
    const schemas = {
      masterResearch: [
        'research_id', 'research_date', 'total_gaps_identified', 'competitors_analyzed',
        'phase_1_focus', 'phase_2_focus', 'phase_3_focus', 'estimated_traffic_growth',
        'approval_status', 'notes', 'created_at'
      ],
      researchGaps: [
        'gap_id', 'topic_area', 'gap_title', 'search_volume', 'keyword_difficulty',
        'commercial_intent', 'competitor_weakness', 'our_competitive_edge',
        'estimated_ranking_time', 'priority_score', 'primary_keyword',
        'secondary_keywords', 'content_type_recommendation', 'word_count_target',
        'expert_required', 'regulatory_compliance', 'quick_win', 'authority_builder',
        'source', 'approval_status', 'created_at'
      ],
      quickWins: [
        'gap_id', 'topic_title', 'topic_area', 'search_volume', 'keyword_difficulty',
        'primary_keyword', 'content_type', 'estimated_time', 'approval_status', 'created_at'
      ],
      generatedTopics: [
        'topic_id', 'research_gap_id', 'content_type', 'topic_title', 'category',
        'primary_keyword', 'secondary_keywords', 'search_volume', 'keyword_difficulty',
        'priority', 'topic_type', 'target_competitor', 'our_competitive_advantage',
        'word_count_target', 'expert_required', 'estimated_ranking_time',
        'estimated_monthly_traffic', 'internal_linking_opportunities',
        'content_upgrade_idea', 'regulatory_requirements', 'approval_status',
        'created_at'
      ],
      topicResearch: [
        'topic_research_id', 'topic_id', 'research_date', 'primary_keyword',
        'top_10_competitors', 'content_gaps', 'search_intent', 'related_questions',
        'content_superiority_plan', 'resource_requirements', 'regulatory_compliance',
        'estimated_impact', 'content_outline', 'source_urls', 'approval_status', 'created_at'
      ],
      createdContent: [
        'content_id', 'topic_id', 'creation_date', 'seo_metadata', 'article_content',
        'content_upgrades', 'compliance', 'quality_metrics', 'sources', 'hero_image',
        'approval_status', 'created_at'
      ],
      publishedContent: [
        'publish_id', 'content_id', 'topic_id', 'wordpress_url', 'uat_wordpress_url', 'sanity_url', 'sanity_desk_url',
        'publish_date', 'status', 'performance_metrics', 'created_at'
      ],
      workflowStatus: [
        'topic_id', 'current_stage', 'overall_status', 'research_approval',
        'topic_approval', 'deep_research_approval', 'content_approval',
        'seo_approval', 'publication_approval', 'last_updated', 'notes'
      ]
    };

    return schemas[csvType] || null;
  }

  /**
   * Initialize CSV files with headers if they don't exist
   */
  initializeCSVFiles() {
    const csvTypes = Object.keys(this.files);

    csvTypes.forEach(csvType => {
      const filePath = this.files[csvType];
      const headers = this.getSchemaColumns(csvType);

      if (!headers) {
        console.warn(`⚠️  No schema defined for ${csvType}`);
        return;
      }

      if (!fs.existsSync(filePath)) {
        // For array headers, write directly as CSV string
        const csvContent = headers.join(',') + '\n';
        fs.writeFileSync(filePath, csvContent);
        console.log(`📄 Initialized ${csvType}.csv with headers`);
      }
    });
  }

  /**
   * Get CSV type from file path
   */
  getCsvTypeFromPath(filePath) {
    for (const [csvType, path] of Object.entries(this.files)) {
      if (path === filePath) {
        return csvType;
      }
    }
    return null;
  }

  /**
   * Read CSV file and return parsed data
   */
  readCSV(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        return [];
      }

      const fileContent = fs.readFileSync(filePath, 'utf-8');
      if (!fileContent.trim()) {
        return [];
      }

      return parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });
    } catch (error) {
      console.error(`❌ Error reading CSV file ${filePath}:`, error.message);
      return [];
    }
  }

  /**
   * Write data to CSV file with schema-enforced columns
   */
  writeCSV(filePath, data, options = {}) {
    try {
      // Determine columns to use
      let columns = options.columns;

      // If no columns specified, use schema columns for known CSV types
      if (!columns) {
        const csvType = this.getCsvTypeFromPath(filePath);
        if (csvType) {
          columns = this.getSchemaColumns(csvType);
        }
      }

      // Fallback to Object.keys if still no columns and data exists
      if (!columns && data.length > 0 && !Array.isArray(data[0])) {
        columns = Object.keys(data[0] || {});
      }

      const csvContent = stringify(data, {
        header: options.header !== false,
        columns: columns,
        quoted: true,  // Always quote fields to handle embedded commas, quotes, newlines
        quoted_string: true,  // Quote all string fields
        escape: '"',  // Use double-quote escaping (standard CSV)
        ...options
      });

      fs.writeFileSync(filePath, csvContent);
      return true;
    } catch (error) {
      console.error(`❌ Error writing CSV file ${filePath}:`, error.message);
      return false;
    }
  }

  /**
   * Append data to CSV file
   */
  appendCSV(filePath, data) {
    try {
      const existingData = this.readCSV(filePath);
      const updatedData = [...existingData, ...data];
      return this.writeCSV(filePath, updatedData);
    } catch (error) {
      console.error(`❌ Error appending to CSV file ${filePath}:`, error.message);
      return false;
    }
  }

  /**
   * Get next incremental ID for a given prefix pattern
   * @param {string} filePath - Path to CSV file
   * @param {string} idField - Name of the ID field (e.g., 'gap_id', 'research_id')
   * @param {string} prefix - ID prefix pattern (e.g., 'GAP-', 'RESEARCH-', 'GAP-QW-')
   * @returns {string} Next incremental ID
   */
  getNextId(filePath, idField, prefix) {
    try {
      const existingData = this.readCSV(filePath);

      if (existingData.length === 0) {
        // First entry - return prefix with 001
        if (prefix.includes('RESEARCH-')) {
          const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
          return `RESEARCH-${date}-001`;
        }
        return `${prefix}001`;
      }

      // Extract all numeric IDs
      const numericIds = existingData
        .map(row => row[idField])
        .filter(id => id && id.startsWith(prefix))
        .map(id => {
          // Extract the numeric part from the ID
          const match = id.match(/(\d+)$/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter(num => !isNaN(num));

      // Find the highest ID
      const maxId = numericIds.length > 0 ? Math.max(...numericIds) : 0;
      const nextId = maxId + 1;

      // Format with leading zeros (3 digits)
      const paddedId = String(nextId).padStart(3, '0');

      // Handle special case for RESEARCH IDs
      if (prefix.includes('RESEARCH-')) {
        const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
        return `RESEARCH-${date}-${paddedId}`;
      }

      return `${prefix}${paddedId}`;
    } catch (error) {
      console.error(`❌ Error generating next ID:`, error.message);
      return `${prefix}001`;
    }
  }

  /**
   * Normalize a string for safe CSV output (no newlines/carriage returns).
   * Prevents field values from bleeding into the next column when the AI
   * returns multiline text inside a single field.
   */
  _sanitizeForCSV(value) {
    if (value == null || value === '') return '';
    const str = String(value).trim();
    return str.replace(/\r\n|\r|\n/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Normalize a research-gap object to schema columns with safe string values.
   * Ensures each field is a single-line value so CSV parsing doesn't misalign columns.
   */
  normalizeResearchGapForCSV(gap) {
    const cols = this.getSchemaColumns('researchGaps');
    if (!cols) return gap;
    const out = {};
    for (const key of cols) {
      const v = gap[key];
      if (typeof v === 'string') {
        out[key] = this._sanitizeForCSV(v);
      } else if (v !== undefined && v !== null) {
        out[key] = String(v).replace(/\r\n|\r|\n/g, ' ').trim();
      } else {
        out[key] = '';
      }
    }
    return out;
  }

  /**
   * Save research gaps data (append mode for subsequent runs)
   */
  saveResearchGaps(gaps) {
    const timestamp = new Date().toISOString();

    // Get the next ID based on existing data once (not per gap)
    const existingData = this.readCSV(this.files.researchGaps);
    const numericIds = existingData
      .map(row => row.gap_id)
      .filter(id => id && id.startsWith('GAP-'))
      .map(id => {
        const match = id.match(/GAP-(\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(num => !isNaN(num));
    const maxId = numericIds.length > 0 ? Math.max(...numericIds) : 0;

    // Generate incremental IDs and normalize each gap for CSV (single-line fields)
    const dataWithTimestamp = gaps.map((gap, index) => {
      const nextId = maxId + index + 1;
      const paddedId = String(nextId).padStart(3, '0');
      const normalized = this.normalizeResearchGapForCSV({
        ...gap,
        gap_id: `GAP-${paddedId}`,
        approval_status: gap.approval_status || 'Pending',
        created_at: timestamp
      });
      return normalized;
    });

    return this.appendCSV(this.files.researchGaps, dataWithTimestamp);
  }

  /**
   * Save quick wins (separate from research gaps)
   */
  saveQuickWins(quickWins) {
    const timestamp = new Date().toISOString();

    // Generate incremental IDs for each quick win
    const dataWithTimestamp = quickWins.map((qw, index) => {
      const existingData = this.readCSV(this.files.quickWins);
      const numericIds = existingData
        .map(row => row.gap_id)
        .filter(id => id && id.startsWith('GAP-QW-'))
        .map(id => {
          const match = id.match(/GAP-QW-(\d+)$/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter(num => !isNaN(num));

      const maxId = numericIds.length > 0 ? Math.max(...numericIds) : 0;
      const nextId = maxId + index + 1;
      const paddedId = String(nextId).padStart(3, '0');

      return {
        ...qw,
        gap_id: `GAP-QW-${paddedId}`,
        approval_status: qw.approval_status || 'Pending',
        created_at: timestamp
      };
    });

    const quickWinsFile = path.join(this.dataDir, 'quick-wins.csv');
    return this.appendCSV(quickWinsFile, dataWithTimestamp);
  }

  /**
   * Save master research summary with strategic recommendations
   */
  saveMasterResearch(researchData) {
    const timestamp = new Date().toISOString();
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '');

    // Get next incremental research ID
    const existingData = this.readCSV(this.files.masterResearch);
    const todayPrefix = `RESEARCH-${date}-`;

    const numericIds = existingData
      .map(row => row.research_id)
      .filter(id => id && id.startsWith(todayPrefix))
      .map(id => {
        const match = id.match(/(\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(num => !isNaN(num));

    const maxId = numericIds.length > 0 ? Math.max(...numericIds) : 0;
    const nextId = maxId + 1;
    const paddedId = String(nextId).padStart(3, '0');

    const masterRecord = {
      research_id: `RESEARCH-${date}-${paddedId}`,
      research_date: researchData.research_date || new Date().toISOString().split('T')[0],
      total_gaps_identified: researchData.total_gaps_identified || researchData.content_gaps?.length || 0,
      competitors_analyzed: Array.isArray(researchData.competitors_analyzed)
        ? researchData.competitors_analyzed.join('; ')
        : researchData.competitors_analyzed || '',
      phase_1_focus: researchData.strategic_recommendations?.phase_1_focus || '',
      phase_2_focus: researchData.strategic_recommendations?.phase_2_focus || '',
      phase_3_focus: researchData.strategic_recommendations?.phase_3_focus || '',
      estimated_traffic_growth: researchData.strategic_recommendations?.estimated_traffic_growth || '',
      approval_status: researchData.approval_status || 'Pending',
      notes: '',
      created_at: timestamp
    };

    return this.appendCSV(this.files.masterResearch, [masterRecord]);
  }

  /**
   * Get approved research gaps
   */
  getApprovedResearchGaps() {
    const gaps = this.readCSV(this.files.researchGaps);
    return gaps.filter(gap => gap.approval_status === 'Yes');
  }

  /**
   * Save generated topics
   */
  saveGeneratedTopics(topics) {
    const timestamp = new Date().toISOString();

    // Generate incremental IDs for each topic
    const dataWithTimestamp = topics.map((topic, index) => {
      const existingData = this.readCSV(this.files.generatedTopics);
      const numericIds = existingData
        .map(row => row.topic_id)
        .filter(id => id && id.startsWith('TOPIC-'))
        .map(id => {
          const match = id.match(/TOPIC-(\d+)$/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter(num => !isNaN(num));

      const maxId = numericIds.length > 0 ? Math.max(...numericIds) : 0;
      const nextId = maxId + index + 1;
      const paddedId = String(nextId).padStart(3, '0');

      return {
        ...topic,
        topic_id: topic.topic_id || `TOPIC-${paddedId}`,
        approval_status: topic.approval_status || 'Pending',
        created_at: timestamp
      };
    });

    return this.writeCSV(this.files.generatedTopics, dataWithTimestamp);
  }

  /**
   * Get approved topics
   */
  getApprovedTopics() {
    const topics = this.readCSV(this.files.generatedTopics);
    return topics.filter(topic => topic.approval_status === 'Yes');
  }

  /**
   * Get all topics (both approved and pending)
   */
  getAllTopics() {
    return this.readCSV(this.files.generatedTopics);
  }

  /**
   * Save topic research data
   */
  saveTopicResearch(research) {
    const timestamp = new Date().toISOString();

    // Generate incremental IDs for each research item
    const dataWithTimestamp = research.map((item, index) => {
      const existingData = this.readCSV(this.files.topicResearch);
      const numericIds = existingData
        .map(row => row.topic_research_id)
        .filter(id => id && id.startsWith('TR-'))
        .map(id => {
          const match = id.match(/TR-(\d+)$/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter(num => !isNaN(num));

      const maxId = numericIds.length > 0 ? Math.max(...numericIds) : 0;
      const nextId = maxId + index + 1;
      const paddedId = String(nextId).padStart(3, '0');

      // Serialize all complex fields for CSV storage
      const serializeField = (field) => {
        if (!field) return '';
        if (typeof field === 'string') return field;
        if (typeof field === 'object') return JSON.stringify(field);
        return String(field);
      };

      return {
        ...item,
        topic_research_id: item.topic_research_id || `TR-${paddedId}`,
        top_10_competitors: serializeField(item.top_10_competitors),
        content_gaps: serializeField(item.content_gaps),
        search_intent: serializeField(item.search_intent),
        related_questions: serializeField(item.related_questions),
        content_superiority_plan: serializeField(item.content_superiority_plan),
        resource_requirements: serializeField(item.resource_requirements),
        regulatory_compliance: serializeField(item.regulatory_compliance),
        estimated_impact: serializeField(item.estimated_impact),
        content_outline: serializeField(item.content_outline),
        source_urls: Array.isArray(item.source_urls) ? JSON.stringify(item.source_urls) : (item.source_urls || '[]'),
        approval_status: item.approval_status || 'Pending',
        created_at: timestamp
      };
    });

    this.appendCSV(this.files.topicResearch, dataWithTimestamp);
    return dataWithTimestamp;
  }

  /**
   * Parse serialized JSON fields in topic research data
   */
  parseTopicResearchFields(item) {
    if (!item) return item;

    const parsed = { ...item };

    // Fields that may contain serialized JSON
    const jsonFields = [
      'top_10_competitors',
      'content_gaps',
      'search_intent',
      'related_questions',
      'content_superiority_plan',
      'resource_requirements',
      'regulatory_compliance',
      'estimated_impact',
      'content_outline',
      'source_urls'
    ];

    jsonFields.forEach(field => {
      if (parsed[field] && typeof parsed[field] === 'string') {
        try {
          // Try to parse if it looks like JSON
          if (parsed[field].startsWith('{') || parsed[field].startsWith('[')) {
            parsed[field] = JSON.parse(parsed[field]);
          }
        } catch (e) {
          // Keep as string if parsing fails
        }
      }
    });

    return parsed;
  }

  /**
   * Get approved topic research with parsed fields
   */
  getApprovedTopicResearch() {
    const research = this.readCSV(this.files.topicResearch);
    return research
      .filter(item => item.approval_status === 'Yes')
      .map(item => this.parseTopicResearchFields(item));
  }

  /**
   * Get topic research entries by topic IDs
   */
  getTopicResearchByTopicIds(topicIds = []) {
    if (!Array.isArray(topicIds) || topicIds.length === 0) {
      return [];
    }
    const research = this.readCSV(this.files.topicResearch);
    const lookup = new Set(topicIds);
    return research.filter(item => lookup.has(item.topic_id));
  }

  /**
   * Save created content data
   */
  saveCreatedContent(content) {
    const timestamp = new Date().toISOString();

    // Generate incremental IDs for each content item
    const dataWithTimestamp = Array.isArray(content) ? content : [content];
    const dataWithIds = dataWithTimestamp.map((item, index) => {
      const existingData = this.readCSV(this.files.createdContent);
      const numericIds = existingData
        .map(row => row.content_id)
        .filter(id => id && id.startsWith('CONTENT-'))
        .map(id => {
          const match = id.match(/CONTENT-(\d+)$/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter(num => !isNaN(num));

      const maxId = numericIds.length > 0 ? Math.max(...numericIds) : 0;
      const nextId = maxId + index + 1;
      const paddedId = String(nextId).padStart(3, '0');

      // Ensure all required fields are present and properly formatted
      // article_content and content_upgrades must be explicitly preserved
      const articleContent = item.article_content || '';
      const contentUpgrades = item.content_upgrades || (typeof item.content_upgrades === 'object' ? JSON.stringify(item.content_upgrades) : '[]');

      // Warn if critical fields are empty (but don't fail - might be intentional in some cases)
      if (!articleContent && item.content_id) {
        console.warn(`⚠️  Warning: article_content is empty for content_id: ${item.content_id || `CONTENT-${paddedId}`}`);
      }
      if (!contentUpgrades || contentUpgrades === '[]' || contentUpgrades === '') {
        console.warn(`⚠️  Warning: content_upgrades is empty for content_id: ${item.content_id || `CONTENT-${paddedId}`}`);
      }

      return {
        ...item,
        content_id: item.content_id || `CONTENT-${paddedId}`,
        topic_id: item.topic_id || '',
        creation_date: item.creation_date || new Date().toISOString().split('T')[0],
        seo_metadata: item.seo_metadata || (typeof item.seo_metadata === 'object' ? JSON.stringify(item.seo_metadata) : '{}'),
        article_content: articleContent,  // Explicitly preserve article_content
        content_upgrades: contentUpgrades,  // Explicitly preserve content_upgrades
        compliance: item.compliance || '',
        quality_metrics: item.quality_metrics || (typeof item.quality_metrics === 'object' ? JSON.stringify(item.quality_metrics) : '{}'),
        sources: Array.isArray(item.sources) ? JSON.stringify(item.sources) : (typeof item.sources === 'string' ? item.sources : (item.sources || '[]')),
        hero_image: item.hero_image || (typeof item.hero_image === 'object' ? JSON.stringify(item.hero_image) : ''),
        approval_status: item.approval_status || 'Pending',
        created_at: timestamp
      };
    });

    this.appendCSV(this.files.createdContent, dataWithIds);
    return dataWithIds;
  }

  /**
   * Save published content data
   */
  savePublishedContent(published) {
    const timestamp = new Date().toISOString();

    // Generate incremental IDs for each published item
    const dataWithTimestamp = Array.isArray(published) ? published : [published];
    const dataWithIds = dataWithTimestamp.map((item, index) => {
      const existingData = this.readCSV(this.files.publishedContent);
      const numericIds = existingData
        .map(row => row.publish_id)
        .filter(id => id && id.startsWith('PUB-'))
        .map(id => {
          const match = id.match(/PUB-(\d+)$/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter(num => !isNaN(num));

      const maxId = numericIds.length > 0 ? Math.max(...numericIds) : 0;
      const nextId = maxId + index + 1;
      const paddedId = String(nextId).padStart(3, '0');

      return {
        ...item,
        publish_id: item.publish_id || `PUB-${paddedId}`,
        created_at: timestamp
      };
    });

    this.appendCSV(this.files.publishedContent, dataWithIds);
    return dataWithIds;
  }

  /**
   * Get created content entries filtered by approval status
   */
  getContentByApprovalStatus(statuses = []) {
    const content = this.readCSV(this.files.createdContent);
    if (!statuses || statuses.length === 0) {
      return content;
    }
    const normalized = new Set(statuses.map(status => status.toLowerCase()));
    return content.filter(item => normalized.has((item.approval_status || '').toLowerCase()));
  }

  /**
   * Get created content entries for specific topic IDs
   */
  getContentByTopicIds(topicIds = []) {
    if (!Array.isArray(topicIds) || topicIds.length === 0) {
      return [];
    }
    const content = this.readCSV(this.files.createdContent);
    const lookup = new Set(topicIds);
    return content.filter(item => lookup.has(item.topic_id));
  }

  /**
   * Update created content record
   */
  updateCreatedContent(contentId, updates = {}) {
    if (!contentId) {
      return false;
    }

    const filePath = this.files.createdContent;
    const rows = this.readCSV(filePath);
    let updated = false;

    const serializedUpdates = { ...updates };
    if (serializedUpdates.seo_metadata && typeof serializedUpdates.seo_metadata === 'object') {
      serializedUpdates.seo_metadata = JSON.stringify(serializedUpdates.seo_metadata);
    }
    if (serializedUpdates.quality_metrics && typeof serializedUpdates.quality_metrics === 'object') {
      serializedUpdates.quality_metrics = JSON.stringify(serializedUpdates.quality_metrics);
    }
    if (serializedUpdates.content_upgrades && typeof serializedUpdates.content_upgrades === 'object') {
      serializedUpdates.content_upgrades = JSON.stringify(serializedUpdates.content_upgrades);
    }

    const updatedRows = rows.map(row => {
      if (row.content_id === contentId) {
        updated = true;
        return { ...row, ...serializedUpdates };
      }
      return row;
    });

    if (updated) {
      return this.writeCSV(filePath, updatedRows);
    }

    return false;
  }

  /**
   * Update approval status for created content entries
   */
  updateContentApprovalStatus(contentId, approvalStatus) {
    return this.updateCreatedContent(contentId, { approval_status: approvalStatus });
  }

  /**
   * Update approval status for any CSV file
   */
  updateApprovalStatus(csvType, idField, id, approvalStatus) {
    try {
      const filePath = this.files[csvType];
      const data = this.readCSV(filePath);

      const updatedData = data.map(row => {
        if (row[idField] === id) {
          return { ...row, approval_status: approvalStatus };
        }
        return row;
      });

      return this.writeCSV(filePath, updatedData);
    } catch (error) {
      console.error(`❌ Error updating approval status:`, error.message);
      return false;
    }
  }

  /**
   * Update workflow status
   */
  updateWorkflowStatus(topicId, stage, status, notes = '', stageUpdates = {}) {
    const statusData = this.readCSV(this.files.workflowStatus);
    const timestamp = new Date().toISOString();

    const existingIndex = statusData.findIndex(row => row.topic_id === topicId);

    const statusUpdate = {
      topic_id: topicId,
      current_stage: stage,
      overall_status: status,
      last_updated: timestamp,
      notes: notes,
      ...stageUpdates
    };

    if (existingIndex >= 0) {
      statusData[existingIndex] = { ...statusData[existingIndex], ...statusUpdate };
    } else {
      statusData.push({
        ...statusUpdate,
        research_approval: 'Not Started',
        topic_approval: 'Not Started',
        deep_research_approval: 'Not Started',
        content_approval: 'Not Started',
        seo_approval: 'Not Started',
        publication_approval: 'Not Started'
      });
    }

    return this.writeCSV(this.files.workflowStatus, statusData);
  }

  /**
   * Get workflow statistics
   */
  getWorkflowStats() {
    const stats = {
      researchGaps: this.readCSV(this.files.researchGaps),
      generatedTopics: this.readCSV(this.files.generatedTopics),
      topicResearch: this.readCSV(this.files.topicResearch),
      createdContent: this.readCSV(this.files.createdContent),
      publishedContent: this.readCSV(this.files.publishedContent),
      workflowStatus: this.readCSV(this.files.workflowStatus)
    };

    return {
      totalResearchGaps: stats.researchGaps.length,
      approvedResearchGaps: stats.researchGaps.filter(g => g.approval_status === 'Yes').length,
      totalTopics: stats.generatedTopics.length,
      approvedTopics: stats.generatedTopics.filter(t => t.approval_status === 'Yes').length,
      completedResearch: stats.topicResearch.filter(r => r.approval_status === 'Yes').length,
      createdContent: stats.createdContent.length,
      publishedContent: stats.publishedContent.length,
      workflowItems: stats.workflowStatus.length
    };
  }

  /**
   * Normalize a potential source URL string
   * @param {string} rawUrl
   * @returns {string|null}
   */
  normalizeSourceUrl(rawUrl) {
    if (!rawUrl) {
      return null;
    }

    const text = String(rawUrl)
      .replace(/[`"'<>]/g, '')
      .replace(/\((https?:\/\/[^\s)]+)\)/i, '$1')
      .trim();

    if (!text) {
      return null;
    }

    // Extract markdown links [label](url)
    const markdownMatch = text.match(/\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/i);
    const candidate = markdownMatch ? markdownMatch[1] : text;

    // Extract raw URLs from text fragments
    const urlInTextMatch = candidate.match(/https?:\/\/[^\s)]+/i);
    let url = urlInTextMatch ? urlInTextMatch[0] : candidate;

    // Remove bullets, numbering, or "Source:" prefixes
    url = url.replace(/^(?:source|link|url)\s*[:\-]\s*/i, '');
    url = url.replace(/^[\s•\-–—\d.)]+/, '').trim();
    url = url.replace(/\s+$/g, '');

    if (!url) {
      return null;
    }

    if (!/^https?:\/\//i.test(url)) {
      url = url.replace(/^[^A-Za-z0-9]+/, '');
      if (!url) {
        return null;
      }
      url = `https://${url}`;
    }

    try {
      const parsed = new URL(url);
      if (!/^https?:$/i.test(parsed.protocol)) {
        return null;
      }
      const pathname = parsed.pathname ? parsed.pathname.replace(/\/+$/, '') : '';
      const search = parsed.search || '';
      const normalized = `${parsed.protocol}//${parsed.hostname}${pathname}${search}`;
      return normalized;
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse CSV fields that may contain JSON, delimited strings, or bullet lists
   * @param {*} value
   * @returns {Array}
   */
  parseStructuredField(value) {
    if (value === null || value === undefined) {
      return [];
    }

    if (Array.isArray(value)) {
      return value.filter(item => item !== null && item !== undefined);
    }

    if (typeof value === 'object') {
      const entries = [];
      const possibleUrlKeys = ['url', 'link', 'href', 'source_url', 'value'];

      possibleUrlKeys.forEach(key => {
        if (value[key]) {
          entries.push(value[key]);
        }
      });

      if (entries.length > 0) {
        return entries;
      }

      return Object.values(value)
        .map(v => this.parseStructuredField(v))
        .flat();
    }

    const text = String(value).trim();
    if (!text) {
      return [];
    }

    // Attempt JSON parsing when the text looks like JSON
    if (/^[\[{]/.test(text)) {
      try {
        const parsed = JSON.parse(text);
        return this.parseStructuredField(parsed);
      } catch (_) {
        // fall back to delimiter parsing
      }
    }

    // Split delimited strings (newline, semicolon, pipe, comma)
    const fragments = text
      .split(/[\n\r;,|]+/)
      .map(item => item.trim())
      .filter(Boolean);

    if (fragments.length > 0) {
      return fragments;
    }

    return [text];
  }

  /**
   * Extract URLs embedded in arbitrary text content
   * @param {string} text
   * @returns {string[]}
   */
  extractUrlsFromText(text) {
    if (!text || typeof text !== 'string') {
      return [];
    }
    const matches = text.match(/https?:\/\/[^\s)]+/gi);
    return matches ? matches.map(match => match.trim()) : [];
  }

  /**
   * Gather normalized source URLs from a topic research record
   * @param {Object} researchItem
   * @returns {string[]}
   */
  extractSourceUrls(researchItem = {}) {
    const urls = new Set();

    const consider = candidate => {
      if (candidate === null || candidate === undefined) {
        return;
      }

      if (typeof candidate === 'string') {
        this.extractUrlsFromText(candidate).forEach(textUrl => {
          const normalized = this.normalizeSourceUrl(textUrl);
          if (normalized) {
            urls.add(normalized);
          }
        });
      }

      const normalized = this.normalizeSourceUrl(candidate);
      if (normalized) {
        urls.add(normalized);
      }
    };

    const candidateFields = [
      'source_urls',
      'sources',
      'reference_links',
      'research_links',
      'top_sources',
      'supporting_links',
      'top_10_competitors',
      'top_competitors',
      'competitor_urls',
      'additional_sources',
      'external_links',
      'context_urls',
      'links'
    ];

    candidateFields.forEach(field => {
      if (!Object.prototype.hasOwnProperty.call(researchItem, field)) {
        return;
      }
      const entries = this.parseStructuredField(researchItem[field]);
      entries.forEach(entry => consider(entry));
    });

    // Consider content gaps or supplementary notes where URLs may be embedded
    const textFields = ['content_gaps', 'notes', 'content_superiority_plan'];
    textFields.forEach(field => {
      if (!researchItem[field]) {
        return;
      }
      const embedded = this.extractUrlsFromText(researchItem[field]);
      embedded.forEach(url => {
        const normalized = this.normalizeSourceUrl(url);
        if (normalized) {
          urls.add(normalized);
        }
      });
    });

    return Array.from(urls);
  }

  /**
   * Generate data summary report
   */
  generateSummaryReport() {
    const stats = this.getWorkflowStats();

    console.log('\n' + '='.repeat(60));
    console.log('📊 ENHANCED BULK GENERATOR - DATA SUMMARY');
    console.log('='.repeat(60));
    console.log(`📋 Research Gaps: ${stats.totalResearchGaps} total, ${stats.approvedResearchGaps} approved`);
    console.log(`🎯 Generated Topics: ${stats.totalTopics} total, ${stats.approvedTopics} approved`);
    console.log(`🔍 Completed Research: ${stats.completedResearch} deep research items`);
    console.log(`📝 Created Content: ${stats.createdContent} pieces`);
    console.log(`🚀 Published Content: ${stats.publishedContent} pieces`);
    console.log(`⚡ Active Workflows: ${stats.workflowItems} items in progress`);
    console.log('='.repeat(60) + '\n');

    return stats;
  }

  /**
   * Sync all CSV files to Google Sheets (if configured)
   * @returns {Promise<Object>} Sync result with success status
   */
  async syncToGoogleSheets() {
    // Check if sync is enabled
    if (!this.enableGoogleSheetsSync) {
      return { success: true, skipped: true, reason: 'Sync disabled' };
    }

    // Check if sync module is available
    if (!googleSheetsSyncModule || !googleSheetsSyncModule.syncToGoogleSheets) {
      return { success: true, skipped: true, reason: 'Sync module not available' };
    }

    // Note: Credentials check removed - module now has hardcoded fallback path

    try {
      const result = await googleSheetsSyncModule.syncToGoogleSheets({
        csvDir: this.dataDir,
        silent: this.silentSync
      });

      return result;
    } catch (error) {
      // Log error but don't fail the workflow
      if (!this.silentSync) {
        console.warn('⚠️  Google Sheets sync failed:', error.message);
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Migrate CSV file to match current schema (adds missing columns)
   */
  migrateCSVToSchema(csvType) {
    const filePath = this.files[csvType];
    const schemaColumns = this.getSchemaColumns(csvType);

    if (!schemaColumns) {
      console.warn(`⚠️  No schema defined for ${csvType}`);
      return false;
    }

    if (!fs.existsSync(filePath)) {
      console.log(`ℹ️  ${csvType}.csv doesn't exist, skipping migration`);
      return false;
    }

    try {
      // Read existing data
      const existingData = this.readCSV(filePath);

      if (existingData.length === 0) {
        console.log(`ℹ️  ${csvType}.csv is empty, rewriting with correct headers`);
        const csvContent = schemaColumns.join(',') + '\n';
        fs.writeFileSync(filePath, csvContent);
        return true;
      }

      // Check if migration is needed
      const existingColumns = Object.keys(existingData[0] || {});
      const missingColumns = schemaColumns.filter(col => !existingColumns.includes(col));

      if (missingColumns.length === 0) {
        console.log(`✅ ${csvType}.csv already has all schema columns`);
        return true;
      }

      console.log(`🔄 Migrating ${csvType}.csv - adding columns: ${missingColumns.join(', ')}`);

      // Create backup
      const backupPath = `${filePath}.backup.${Date.now()}`;
      fs.copyFileSync(filePath, backupPath);
      console.log(`📦 Backup created: ${backupPath}`);

      // Add missing columns with empty values
      const migratedData = existingData.map(row => {
        const newRow = { ...row };
        missingColumns.forEach(col => {
          newRow[col] = '';
        });
        return newRow;
      });

      // Write back with schema columns (this will use writeCSV which enforces schema)
      this.writeCSV(filePath, migratedData);
      console.log(`✅ Successfully migrated ${csvType}.csv (${existingData.length} rows)`);

      return true;
    } catch (error) {
      console.error(`❌ Error migrating ${csvType}.csv:`, error.message);
      return false;
    }
  }

  /**
   * Migrate all CSV files to match current schemas
   */
  migrateAllCSVs() {
    console.log('\n' + '='.repeat(60));
    console.log('🔄 CSV SCHEMA MIGRATION');
    console.log('='.repeat(60));

    const csvTypes = Object.keys(this.files);
    const results = {};

    csvTypes.forEach(csvType => {
      results[csvType] = this.migrateCSVToSchema(csvType);
    });

    console.log('='.repeat(60));
    const successCount = Object.values(results).filter(r => r === true).length;
    console.log(`✅ Migration complete: ${successCount}/${csvTypes.length} files processed\n`);

    return results;
  }

  /**
   * Clean up old data (optional maintenance)
   */
  cleanupOldData(daysOld = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    Object.entries(this.files).forEach(([key, filePath]) => {
      if (key === 'workflowStatus') return; // Don't clean workflow status

      const data = this.readCSV(filePath);
      const cleanedData = data.filter(row => {
        if (!row.created_at) return true;
        return new Date(row.created_at) > cutoffDate;
      });

      if (cleanedData.length < data.length) {
        this.writeCSV(filePath, cleanedData);
        console.log(`🧹 Cleaned ${data.length - cleanedData.length} old records from ${key}.csv`);
      }
    });
  }
}

module.exports = CSVDataManager;

// CLI usage
if (require.main === module) {
  const manager = new CSVDataManager();
  const command = process.argv[2];

  switch (command) {
    case 'init':
      manager.initializeCSVFiles();
      console.log('✅ All CSV files initialized');
      break;

    case 'stats':
      manager.generateSummaryReport();
      break;

    case 'cleanup':
      const days = parseInt(process.argv[3]) || 30;
      manager.cleanupOldData(days);
      break;

    case 'migrate':
      const csvType = process.argv[3];
      if (csvType) {
        // Migrate specific CSV
        manager.migrateCSVToSchema(csvType);
      } else {
        // Migrate all CSVs
        manager.migrateAllCSVs();
      }
      break;

    default:
      console.log('Usage: node csv-data-manager.js [init|stats|cleanup|migrate [csvType]]');
      console.log('  init              - Initialize CSV files with headers');
      console.log('  stats             - Show workflow statistics');
      console.log('  cleanup [days]    - Clean up old data (default: 30 days)');
      console.log('  migrate [csvType] - Migrate CSV(s) to match current schema');
      console.log('                      If csvType is provided, migrates that specific CSV');
      console.log('                      Otherwise, migrates all CSV files');
  }
}
