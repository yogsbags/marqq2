#!/usr/bin/env node

/**
 * Workflow Orchestrator for Enhanced Bulk Generator
 * Manages the complete N8N-style workflow with approval gates
 * Coordinates all 7 workflow stages with CSV-based data management
 *
 * UPDATED: Now uses direct Google API integrations (not MCP)
 * - Google Ads API for search volumes
 * - Google Analytics 4 API for traffic data (alternative to GSC)
 * - Google Custom Search API for coverage detection
 */

const path = require('path');
const CSVDataManager = require('./csv-data-manager');
const MasterSEOResearcher = require('../research/master-seo-researcher');
const TopicGenerator = require('../research/topic-generator');
const DeepTopicResearcher = require('../research/deep-topic-researcher');
const ContentCreator = require('../content/content-creator');
const ContentValidator = require('../content/content-validator');
const SEOOptimizer = require('../content/seo-optimizer');
const ContentPublisher = require('../content/content-publisher');
const SEODataFetcher = require('../research/seo-data-fetcher');
const GoogleAdsAPIClient = require('../research/google-ads-api-client');
const GoogleSearchConsoleAPIClient = require('../research/google-search-console-api-client');
const GoogleAnalytics4APIClient = require('../research/google-analytics-4-api-client');
const GoogleCustomSearchAPIClient = require('../research/google-custom-search-api-client');

class WorkflowOrchestrator {
  constructor(config = {}) {
    this.csvManager = new CSVDataManager();

    // Initialize Direct Google API Clients
    this.googleAdsClient = new GoogleAdsAPIClient(config);
    this.gscClient = new GoogleSearchConsoleAPIClient(config);
    this.ga4Client = new GoogleAnalytics4APIClient(config);
    this.cseClient = new GoogleCustomSearchAPIClient(config);

    // Initialize SEO Data Fetcher with direct API clients
    this.seoDataFetcher = new SEODataFetcher({
      googleAdsClient: this.googleAdsClient,
      gscClient: this.gscClient,
      ga4Client: this.ga4Client,
      cseClient: this.cseClient,
      siteUrl: config.siteUrl || process.env.SITE_URL || 'https://plindia.com',
      propertyId: config.propertyId || process.env.GA4_PROPERTY_ID || '309159799',
      country: 'in',
      language: 'en'
    });

    // Pass fetcher to workflow components
    this.researcher = new MasterSEOResearcher({
      ...config,
      seoDataFetcher: this.seoDataFetcher
    });

    this.topicGenerator = new TopicGenerator({
      ...config,
      seoDataFetcher: this.seoDataFetcher
    });

    this.config = {
      autoApprove: config.autoApprove || false,
      batchSize: config.batchSize || 10, // Changed from 50 to 10
      gapsPerRun: config.gapsPerRun || 10, // Generate 10 gaps per run
      delayBetweenStages: config.delayBetweenStages || 2000,
      qualityThreshold: config.qualityThreshold || 90,
      siteUrl: config.siteUrl || process.env.SITE_URL || 'https://plindia.com',
      propertyId: config.propertyId || process.env.GA4_PROPERTY_ID || '309159799',
      contentBatchSize: config.contentBatchSize || 1,
      ...config
    };

    // Workflow stages
    this.stages = {
      RESEARCH: 'Master SEO Research',
      TOPICS: 'Topic Generation',
      DEEP_RESEARCH: 'Deep Topic Research',
      CONTENT: 'Content Creation',
      VALIDATION: 'Content Validation',
      SEO: 'SEO Optimization',
      PUBLICATION: 'Publication',
      COMPLETION: 'Completion & Loop'
    };

    this.printInitializationStatus();
  }

  /**
   * Print initialization status showing which APIs are available
   */
  printInitializationStatus() {
    console.log('✅ Workflow Orchestrator initialized');
    console.log('📊 API Status:');

    // Check Google Ads API
    if (this.googleAdsClient.validateCredentials()) {
      console.log('   ✅ Google Ads API: Keyword research (FREE)');
    } else {
      console.log('   ⏸️  Google Ads API: Not configured (optional)');
    }

    // Check GSC API
    if (this.gscClient.validateCredentials()) {
      console.log('   ⚠️  Google Search Console API: Needs permission');
    } else {
      console.log('   ⏸️  Google Search Console API: Not configured');
    }

    // Check GA4 API (alternative to GSC)
    if (this.ga4Client.validateCredentials()) {
      console.log('   ✅ Google Analytics 4 API: Traffic analysis (FREE)');
    } else {
      console.log('   ⏸️  Google Analytics 4 API: Not configured');
    }

    // Check CSE API
    if (this.cseClient.validateCredentials()) {
      console.log('   ✅ Google Custom Search API: Coverage detection (FREE)');
    } else {
      console.log('   ⏸️  Google Custom Search API: Not configured');
    }

    console.log('');
  }

  /**
   * Execute complete workflow
   */
  async executeFullWorkflow(options = {}) {
    console.log('\n🚀 ENHANCED BULK GENERATOR - FULL WORKFLOW');
    console.log('='.repeat(60));
    console.log(`📊 Target: ${this.config.batchSize} content pieces`);
    console.log(`📝 Gaps per run: ${this.config.gapsPerRun}`);
    console.log(`🤖 Auto-approve: ${this.config.autoApprove ? 'Enabled' : 'Disabled'}`);
    console.log(`⚡ Quality threshold: ${this.config.qualityThreshold}%`);
    console.log(`🌐 Site URL: ${this.config.siteUrl}`);
    console.log('='.repeat(60));

    try {
      // Initialize CSV files
      this.csvManager.initializeCSVFiles();

      // Stage 1: Master SEO Research (generates 10 gaps)
      await this.executeStage1Research();

      // Stage 2: Topic Generation
      await this.executeStage2Topics();

      // Stage 3: Deep Topic Research (placeholder)
      await this.executeStage3DeepResearch();

      // Stage 4: Content Creation (placeholder)
      await this.executeStage4ContentCreation();

      // Stage 5: SEO Optimization (placeholder)
      await this.executeStage5SEOOptimization();

      // Stage 6: Publication (placeholder)
      await this.executeStage6Publication();

      // Stage 7: Completion & Loop
      await this.executeStage7Completion();

      console.log('\n🎉 FULL WORKFLOW COMPLETED SUCCESSFULLY!');
      return true;

    } catch (error) {
      console.error('❌ Workflow failed:', error.message);
      throw error;
    }
  }

  /**
   * Stage 1: Master SEO Research
   * Uses Google APIs (GA4 + CSE + optional Ads) for real data
   */
  async executeStage1Research(options = {}) {
    console.log('\n📍 STAGE 1: Master SEO Research');
    console.log('-'.repeat(40));

    try {
      console.log(`🎯 Generating ${this.config.gapsPerRun} content gap opportunities...`);

      // Use customTopic if provided, otherwise use category
      const category = options.category || this.config.category || 'derivatives';
      
      if (options.customTopic || this.config.customTopic) {
        const topic = options.customTopic || this.config.customTopic;
        console.log(`✨ Custom Topic Focus: "${topic}"`);
        console.log(`📂 Category (fallback): ${category}`);

        // Update researcher with custom topic
        this.researcher.customTopic = topic;
        this.researcher.selectedCategory = category;
      } else {
        console.log(`📂 Category Filter: ${category}`);
        // Always set category on researcher, even without customTopic
        this.researcher.selectedCategory = category;
      }

      console.log('');
      console.log('🔄 Data Sources:');
      console.log('   1. Groq Llama 3.3 70B: Competitor analysis + web search');
      console.log('   2. GA4 API: Real traffic data from your site');
      console.log('   3. Custom Search API: Coverage detection');
      console.log('   4. OpenAI GPT-4o: JSON structuring');
      console.log('');

      // Execute research (generates 10 gaps and appends to CSV)
      const researchData = await this.researcher.executeResearch();

      // Update workflow status
      this.csvManager.updateWorkflowStatus(
        'RESEARCH-BATCH-' + new Date().toISOString().split('T')[0],
        this.stages.RESEARCH,
        'Research Completed',
        `Generated ${researchData.content_gaps.length} content gaps using real Google data`
      );

      console.log('');
      console.log('✅ Research stage completed!');
      console.log(`📝 ${researchData.content_gaps.length} gaps saved to: data/research-gaps.csv`);

      if (researchData.groq_quick_wins && researchData.groq_quick_wins.length > 0) {
        console.log(`📋 ${researchData.groq_quick_wins.length} quick wins saved to: data/quick-wins.csv`);
      }

      console.log('');
      console.log('💡 CSV Behavior:');
      console.log('   - First run: Creates new CSV files with data');
      console.log('   - Subsequent runs: Appends more data to existing files');
      console.log('');

      // Auto-approve if enabled
      if (this.config.autoApprove) {
        const approved = this.researcher.autoApproveAll();
        console.log(`🤖 Auto-approved ${approved} high-priority gaps`);
      } else {
        console.log('⏳ Next Steps:');
        console.log('   1. Review data/research-gaps.csv');
        console.log('   2. Set approval_status = "Yes" for gaps you want to develop');
        console.log('   3. Run Stage 2 to generate topics: node main.js stage topics');
        console.log('');
        console.log('   OR run Stage 1 again to add 10 more gaps!');
      }

      // Sync to Google Sheets
      await this.syncToGoogleSheets('research-gaps');

      await this.sleep(this.config.delayBetweenStages);
      return true;

    } catch (error) {
      console.error('❌ Stage 1 failed:', error.message);
      throw error;
    }
  }

  /**
   * Stage 2: Topic Generation
   * Takes approved research gaps and creates strategic content topics
   */
  async executeStage2Topics(options = {}) {
    console.log('\n📍 STAGE 2: Topic Generation');
    console.log('-'.repeat(40));

    try {
      // Check if we have approved research gaps
      const approvedGaps = this.csvManager.getApprovedResearchGaps();

      if (approvedGaps.length === 0) {
        if (this.config.autoApprove) {
          // Auto-approve high-priority gaps
          console.log('🤖 Auto-approving high-priority gaps...');
          const approved = this.researcher.autoApproveAll();
          console.log(`✅ Auto-approved ${approved} gaps for topic generation`);
        } else {
          console.log('⚠️  No approved research gaps found');
          console.log('');
          console.log('💡 Next Steps:');
          console.log('   1. Open data/research-gaps.csv');
          console.log('   2. Change approval_status from "Pending" to "Yes" for desired gaps');
          console.log('   3. Run this stage again: node main.js stage topics');
          console.log('');
          throw new Error('No approved research gaps found. Please approve some gaps first.');
        }
      }

      console.log(`📊 Found ${approvedGaps.length} approved research gaps`);
      console.log('🎯 Generating strategic topics...');
      console.log('');

      // Get topic limit from options or config
      const limit = options.limit ?? this.config.topicLimit ?? null;

      console.log(`🐛 DEBUG: options.limit = ${options.limit}, this.config.topicLimit = ${this.config.topicLimit}, final limit = ${limit}`);

      // Create topic generator with limit if specified
      const topicGenerator = limit !== null
        ? new TopicGenerator({
            ...this.config,
            topicLimit: limit,
            seoDataFetcher: this.seoDataFetcher
          })
        : this.topicGenerator;

      if (limit !== null) {
        console.log(`🔍 Limiting topic generation to ${limit} topic(s)`);
      }

      // Generate topics
      const topics = await topicGenerator.generateTopics();

      // Update workflow status
      this.csvManager.updateWorkflowStatus(
        'TOPICS-BATCH-' + new Date().toISOString().split('T')[0],
        this.stages.TOPICS,
        'Topics Generated',
        `Generated ${topics.length} strategic topics from ${approvedGaps.length} approved gaps`
      );

      console.log('');
      console.log('✅ Topic generation completed!');
      console.log(`📝 ${topics.length} topics saved to: data/generated-topics.csv`);
      console.log('');

      // Auto-approve if enabled
      if (this.config.autoApprove) {
        const approved = this.topicGenerator.autoApproveAll();
        console.log(`🤖 Auto-approved ${approved} high-priority topics`);
      } else {
        console.log('⏳ Next Steps:');
        console.log('   1. Review data/generated-topics.csv');
        console.log('   2. Set approval_status = "Yes" for topics you want to develop');
        console.log('   3. Run Stage 3 for deep research: node main.js stage deep-research');
      }

      // Sync to Google Sheets
      await this.syncToGoogleSheets('generated-topics');

      await this.sleep(this.config.delayBetweenStages);
      return true;

    } catch (error) {
      console.error('❌ Stage 2 failed:', error.message);
      throw error;
    }
  }

  /**
   * Stage 3: Deep Topic Research
   * Analyzes top 10 competitors for each approved topic
   */
  async executeStage3DeepResearch(options = {}) {
    console.log('\n📍 STAGE 3: Deep Topic Research');
    console.log('-'.repeat(40));

    try {
      const limit = options.limit ?? this.config.deepResearchLimit ?? null;
      const customTitle = options.customTitle || this.config.customTitle || '';

      // 🔀 Custom Title Mode: bypass topics/approvals entirely and let
      // DeepTopicResearcher handle the custom title workflow.
      if (customTitle) {
        console.log(`\n✨ CUSTOM TITLE MODE (Stage 3)`);
        console.log(`📝 Custom Title: "${customTitle}"`);
        console.log('🚀 Bypassing approved topics and running deep research directly on the custom title...');

        const deepResearcher = new DeepTopicResearcher({
          ...this.config,
          customTitle,
          topicLimit: limit
        });

        const researchResults = await deepResearcher.conductDeepResearch(limit);

        if (!researchResults || researchResults.length === 0) {
          console.log('⚠️  Deep research produced no results for custom title. Check API keys and rerun.');
          return false;
        }

        if (this.config.autoApprove) {
          deepResearcher.approveHighQuality();
        } else {
          console.log('\n⏳ Next Steps:');
          console.log('   1. Review data/topic-research.csv');
          console.log('   2. Approve rows (set approval_status = "Yes") for content creation');
        }

        const topicIds = [...new Set(researchResults.map(item => item.topic_id).filter(Boolean))];
        const stageNotes = this.config.autoApprove
          ? 'Deep research auto-approved. Content creation unlocked.'
          : 'Deep research ready. Awaiting manual approval.';
        const stageStatus = this.config.autoApprove ? 'Deep Research Approved' : 'Deep Research Completed';
        const stageApproval = this.config.autoApprove ? 'Approved' : 'Pending';

        if (this.config.autoApprove && topicIds.length > 0) {
          const savedResearch = this.csvManager.getTopicResearchByTopicIds(topicIds);
          savedResearch.forEach(item => {
            if (item.topic_research_id) {
              this.csvManager.updateApprovalStatus('topicResearch', 'topic_research_id', item.topic_research_id, 'Yes');
            }
          });
          console.log(`🤖 Auto-approved ${savedResearch.length} research items for content creation`);
        }

        topicIds.forEach(topicId => {
          this.csvManager.updateWorkflowStatus(
            topicId,
            this.stages.DEEP_RESEARCH,
            stageStatus,
            stageNotes,
            { deep_research_approval: stageApproval }
          );
        });

        console.log(`\n📝 Saved ${researchResults.length} research entries to data/topic-research.csv`);
        await this.syncToGoogleSheets('topic-research');
        await this.sleep(this.config.delayBetweenStages);
        return true;
      }

      // 📂 Standard Topic Mode (no custom title)
      let approvedTopics = this.csvManager.getApprovedTopics();

      if (approvedTopics.length === 0) {
        if (this.config.autoApprove) {
          console.log('🤖 Auto-approving high-priority topics for deep research...');
          this.topicGenerator.autoApproveAll();
          approvedTopics = this.csvManager.getApprovedTopics();

          // Fallback: if auto-approve did not mark any topics as "Yes" (e.g. CSV mismatch),
          // but topics exist, use all topics as a safety net so Stage 3 can still run.
          if (approvedTopics.length === 0) {
            const allTopics = this.csvManager.getAllTopics();
            if (allTopics.length > 0) {
              console.log('⚠️  Auto-approve fallback: using all topics for deep research because none are marked approved.');
              approvedTopics = allTopics;
            }
          }
        }

        if (approvedTopics.length === 0) {
          console.log('⚠️  No approved topics found for deep research.');
          console.log('   • Review data/generated-topics.csv');
          console.log('   • Set approval_status = "Yes" for topics to research further');
          console.log('   • Rerun Stage 3 once approvals are in place');
          throw new Error('No approved topics available for deep research.');
        }
      }

      let topicsToResearch = approvedTopics;
      if (limit && approvedTopics.length > limit) {
        topicsToResearch = approvedTopics.slice(0, limit);
        console.log(`✅ Found ${approvedTopics.length} approved topics`);
        console.log(`🔍 Limiting this run to first ${limit} topic(s)`);
      } else {
        console.log(`✅ Found ${approvedTopics.length} approved topics`);
      }

      const deepResearcher = new DeepTopicResearcher({
        ...this.config,
        topicLimit: limit
      });

      const researchResults = await deepResearcher.conductDeepResearch(limit);

      if (!researchResults || researchResults.length === 0) {
        console.log('⚠️  Deep research produced no results. Check API keys and rerun.');
        return false;
      }

      if (this.config.autoApprove) {
        deepResearcher.approveHighQuality();
      } else {
        console.log('\n⏳ Next Steps:');
        console.log('   1. Review data/topic-research.csv');
        console.log('   2. Approve rows (set approval_status = "Yes") for content creation');
      }

      const topicIds = [...new Set(researchResults.map(item => item.topic_id).filter(Boolean))];
      const stageNotes = this.config.autoApprove
        ? 'Deep research auto-approved. Content creation unlocked.'
        : 'Deep research ready. Awaiting manual approval.';
      const stageStatus = this.config.autoApprove ? 'Deep Research Approved' : 'Deep Research Completed';
      const stageApproval = this.config.autoApprove ? 'Approved' : 'Pending';

      if (this.config.autoApprove && topicIds.length > 0) {
        const savedResearch = this.csvManager.getTopicResearchByTopicIds(topicIds);
        savedResearch.forEach(item => {
          if (item.topic_research_id) {
            this.csvManager.updateApprovalStatus('topicResearch', 'topic_research_id', item.topic_research_id, 'Yes');
          }
        });
        console.log(`🤖 Auto-approved ${savedResearch.length} research items for content creation`);
      }

      topicIds.forEach(topicId => {
        this.csvManager.updateWorkflowStatus(
          topicId,
          this.stages.DEEP_RESEARCH,
          stageStatus,
          stageNotes,
          { deep_research_approval: stageApproval }
        );
      });

      console.log(`\n📝 Saved ${researchResults.length} research entries to data/topic-research.csv`);

      // Sync to Google Sheets
      await this.syncToGoogleSheets('topic-research');

      await this.sleep(this.config.delayBetweenStages);
      return true;

    } catch (error) {
      console.error('❌ Stage 3 failed:', error.message);
      throw error;
    }
  }

  /**
   * Stage 4: Content Creation
   * Creates E-E-A-T compliant, SEO-optimized content
   */
  async executeStage4ContentCreation(options = {}) {
    console.log('\n📍 STAGE 4: Content Creation');
    console.log('-'.repeat(40));

    try {
      // Check if custom topic is provided but no topics exist
      const customTopic = options.customTopic || this.config.customTopic;
      if (customTopic) {
        console.log(`✨ Custom Topic Mode: "${customTopic}"`);

        // Check if we have topics for this custom topic
        const existingTopics = this.csvManager.getAllTopics();
        const hasCustomTopics = existingTopics.some(t =>
          t.topic_title && t.topic_title.toLowerCase().includes(customTopic.toLowerCase())
        );

        if (!hasCustomTopics) {
          console.log(`⚠️  No topics found for "${customTopic}"`);
          console.log('🔄 Auto-running prerequisite stages...\n');

          // Run Stage 2 (Topic Generation)
          await this.executeStage2Topics({ ...options, customTopic });

          // Run Stage 3 (Deep Research)
          await this.executeStage3DeepResearch(options);

          console.log('\n✅ Prerequisites completed, resuming Stage 4...');
        }
      }

      const limit = options.limit ?? this.config.contentLimit ?? null;
      let approvedResearch = this.csvManager.getApprovedTopicResearch();

      if (approvedResearch.length === 0) {
        if (this.config.autoApprove) {
          console.log('🤖 Auto-approving high-impact research items...');
          const researcher = new DeepTopicResearcher(this.config);
          researcher.approveHighQuality();
          approvedResearch = this.csvManager.getApprovedTopicResearch();
        }

        if (approvedResearch.length === 0) {
          console.log('⚠️  No approved deep research items found.');
          console.log('   • Review data/topic-research.csv');
          console.log('   • Set approval_status = "Yes" for research ready for content drafting');
          console.log('   • Rerun Stage 4 afterwards');
          throw new Error('No approved deep research available for content creation.');
        }
      }

      if (limit && approvedResearch.length > limit) {
        approvedResearch = approvedResearch.slice(0, limit);
        console.log(`🔍 Limiting content creation to first ${limit} research item(s)`);
      }

      const existingContent = this.csvManager.getContentByApprovalStatus();
      const creator = new ContentCreator({
        ...this.config,
        contentLimit: limit,
        topicLimit: limit ?? this.config.topicLimit
      });

      const createdContent = await creator.createContent();

      if (!createdContent || createdContent.length === 0) {
        console.log('⚠️  Content creation returned no drafts.');
        return false;
      }

      const topicIds = [...new Set(createdContent.map(item => item.topic_id).filter(Boolean))];
      const allContent = this.csvManager.getContentByApprovalStatus();
      const delta = Math.max(0, allContent.length - existingContent.length);
      const newRecords = delta > 0 ? allContent.slice(-delta) : this.csvManager.getContentByTopicIds(topicIds);

      newRecords.forEach(record => {
        if (record.content_id && (record.approval_status === 'Pending' || record.approval_status === 'Needs-SEO')) {
          this.csvManager.updateContentApprovalStatus(record.content_id, 'Needs-SEO');
        }
        this.csvManager.updateWorkflowStatus(
          record.topic_id,
          this.stages.CONTENT,
          'Content Drafted',
          'Draft ready for SEO optimization',
          { content_approval: 'Pending' }
        );
      });

      console.log(`\n📝 Saved ${newRecords.length} drafts to data/created-content.csv`);

      // Sync to Google Sheets
      await this.syncToGoogleSheets('created-content');

      await this.sleep(this.config.delayBetweenStages);
      return true;

    } catch (error) {
      console.error('❌ Stage 4 failed:', error.message);
      throw error;
    }
  }

  /**
   * Stage 4.5: Content Validation
   * Validates content against 39 critical guidelines with AI-powered auto-correction
   */
  async executeStage45Validation(options = {}) {
    console.log('\n📍 STAGE 4.5: Content Validation');
    console.log('-'.repeat(40));

    try {
      const limit = options.limit ?? this.config.validationLimit ?? null;
      const validator = new ContentValidator({
        autoApprove: this.config.autoApprove,
        strictMode: this.config.strictMode !== false,
        validationLimit: limit,
        autoCorrect: this.config.autoCorrect !== false
      });

      const validationResults = await validator.validateContent();

      if (!validationResults || validationResults.length === 0) {
        console.log('⚠️  No content available for validation.');
        return false;
      }

      const passedCount = validationResults.filter(r => r.passed).length;
      const failedCount = validationResults.filter(r => !r.passed).length;

      console.log(`\n✅ Validation completed: ${passedCount} passed, ${failedCount} failed`);

      if (failedCount > 0) {
        console.log('⚠️  Failed content requires fixes before SEO optimization');
        console.log('   • Review validation issues in created-content.csv');
        console.log('   • Auto-correction was attempted using groq/gpt-oss-120b');
        console.log('   • Manual review may be needed for remaining issues');
      }

      // Sync to Google Sheets
      await this.syncToGoogleSheets('created-content');

      await this.sleep(this.config.delayBetweenStages);
      return true;

    } catch (error) {
      console.error('❌ Stage 4.5 failed:', error.message);
      throw error;
    }
  }

  /**
   * Stage 5: SEO Optimization
   * Optimizes metadata, schema markup, and technical SEO
   */
  async executeStage5SEOOptimization() {
    console.log('\n📍 STAGE 5: SEO Optimization');
    console.log('-'.repeat(40));

    try {
      const optimizer = new SEOOptimizer({
        autoApprove: this.config.autoApprove
      });

      const optimizedItems = await optimizer.optimize();

      if (!optimizedItems || optimizedItems.length === 0) {
        console.log('⚠️  No drafts were eligible for SEO optimization.');
        return false;
      }

      optimizedItems.forEach(item => {
        const approvalState = this.config.autoApprove ? 'Approved' : 'Pending';
        this.csvManager.updateWorkflowStatus(
          item.topic_id,
          this.stages.SEO,
          this.config.autoApprove ? 'SEO Metadata Approved' : 'SEO Metadata Pending Review',
          this.config.autoApprove
            ? 'Metadata optimized and auto-approved.'
            : 'Review SEO metadata in created-content.csv.',
          { seo_approval: approvalState }
        );
      });

      // Sync to Google Sheets
      await this.syncToGoogleSheets('created-content');

      await this.sleep(this.config.delayBetweenStages);
      return true;

    } catch (error) {
      console.error('❌ Stage 5 failed:', error.message);
      throw error;
    }
  }

  /**
   * Stage 6: Publication
   * Publishes to WordPress and Sanity with smart scheduling
   */
  async executeStage6Publication(options = {}) {
    console.log('\n📍 STAGE 6: Publication');
    console.log('-'.repeat(40));

    try {
      const limit = options.limit ?? this.config.publicationLimit ?? this.config.contentLimit ?? this.config.topicLimit ?? null;
      const publisher = new ContentPublisher({
        ...this.config,
        publicationLimit: limit
      });

      const published = await publisher.publishAll();

      if (!published || published.length === 0) {
        console.log('⚠️  No SEO-ready content found for publication.');
        return false;
      }

      published.forEach(item => {
        const isPublished = item.status === 'Published';
        const isSimulated = item.status === 'Simulated';
        const statusLabel = isPublished
          ? 'Content Published'
          : isSimulated
            ? 'Publication Simulated'
            : 'Publication Failed';
        const approvalState = isPublished ? 'Published' : isSimulated ? 'Simulated' : 'Failed';
        const notes = isPublished
          ? 'Published to WordPress/Sanity.'
          : isSimulated
            ? 'Simulated publish. Configure credentials for live posting.'
            : 'Check logs for publishing errors.';

        this.csvManager.updateWorkflowStatus(
          item.topic_id,
          this.stages.PUBLICATION,
          statusLabel,
          notes,
          { publication_approval: approvalState }
        );
      });

      // Sync to Google Sheets
      await this.syncToGoogleSheets('published-content');

      await this.sleep(this.config.delayBetweenStages);
      return true;

    } catch (error) {
      console.error('❌ Stage 6 failed:', error.message);
      throw error;
    }
  }

  /**
   * Stage 7: Completion & Loop
   * Analyzes batch completion and prepares for next cycle
   */
  async executeStage7Completion() {
    console.log('\n📍 STAGE 7: Completion & Loop');
    console.log('-'.repeat(40));

    // Generate final summary
    const stats = this.csvManager.generateSummaryReport();

    // Check if batch is complete
    const completionRate = this.calculateCompletionRate(stats);

    console.log(`📊 Batch Completion Rate: ${completionRate}%`);
    console.log('');

    if (completionRate >= 80) {
      console.log('✅ Batch completed successfully!');
      console.log('🔄 Ready for next research cycle...');
      console.log('');

      // Update workflow status
      this.csvManager.updateWorkflowStatus(
        'COMPLETION-BATCH-' + new Date().toISOString().split('T')[0],
        this.stages.COMPLETION,
        'Batch Completed',
        `Completion rate: ${completionRate}%`
      );

      console.log('💡 Next Steps for Continuous Content Domination:');
      console.log('   1. Wait 7 days for published content to gain traction');
      console.log('   2. Analyze GA4 data to see which topics are performing');
      console.log('   3. Update competitor analysis to find new opportunities');
      console.log('   4. Run Stage 1 again to generate 10 more gaps');
      console.log('   5. Rinse and repeat for exponential growth!');

    } else {
      console.log('⚠️  Batch incomplete - review progress');
      console.log('   Current stage: Research and Topics (2/7 stages implemented)');
      console.log('   Check data/workflow-status.csv for details');
      console.log('');
      console.log('💡 To continue:');
      console.log('   - Approve research gaps and run Stage 2');
      console.log('   - Or run Stage 1 again to add 10 more gaps');
    }

    // Sync to Google Sheets
    await this.syncToGoogleSheets('workflow-status');

    return true;
  }

  /**
   * Calculate completion rate based on workflow stats
   */
  calculateCompletionRate(stats) {
    const totalStages = 7; // Research through Completion
    const completedStages = 2; // Currently only Research and Topics are fully implemented

    return Math.round((completedStages / totalStages) * 100);
  }

  /**
   * Execute individual workflow stage
   */
  async executeStage(stageName, options = {}) {
    console.log(`\n🎯 Executing Stage: ${stageName}`);

    switch (stageName.toLowerCase()) {
      case 'research':
        return await this.executeStage1Research(options);
      case 'topics':
        return await this.executeStage2Topics(options);
      case 'deep-research':
        return await this.executeStage3DeepResearch(options);
      case 'content':
        return await this.executeStage4ContentCreation(options);
      case 'validation':
        return await this.executeStage45Validation(options);
      case 'seo':
        return await this.executeStage5SEOOptimization();
      case 'publication':
        return await this.executeStage6Publication(options);
      case 'completion':
        return await this.executeStage7Completion();
      default:
        throw new Error(`Unknown stage: ${stageName}`);
    }
  }

  /**
   * Get workflow status for all items
   */
  getWorkflowStatus() {
    return this.csvManager.readCSV(this.csvManager.files.workflowStatus);
  }

  /**
   * Monitor workflow progress
   */
  monitorProgress() {
    const status = this.getWorkflowStatus();
    const stats = this.csvManager.getWorkflowStats();

    console.log('\n📊 WORKFLOW PROGRESS MONITOR');
    console.log('='.repeat(50));

    // Stage completion summary
    const stageStats = {};
    status.forEach(item => {
      stageStats[item.current_stage] = (stageStats[item.current_stage] || 0) + 1;
    });

    if (Object.keys(stageStats).length > 0) {
      console.log('\n📍 Items by Stage:');
      Object.entries(stageStats).forEach(([stage, count]) => {
        console.log(`   ${stage}: ${count} items`);
      });
    }

    console.log('\n📈 Overall Statistics:');
    console.log(`   Research Gaps: ${stats.approvedResearchGaps}/${stats.totalResearchGaps} approved`);
    console.log(`   Topics: ${stats.approvedTopics}/${stats.totalTopics} approved`);
    console.log(`   Content: ${stats.createdContent} pieces created`);
    console.log(`   Published: ${stats.publishedContent} pieces live`);
    console.log('');

    console.log('💡 Available Commands:');
    console.log('   - Generate more gaps: node main.js stage research');
    console.log('   - Generate topics: node main.js stage topics');
    console.log('   - Full workflow: node main.js full');

    return { status, stats };
  }

  /**
   * Sync CSV data to Google Sheets after stage completion
   * @param {string} primarySheet - Primary sheet to highlight (optional)
   */
  async syncToGoogleSheets(primarySheet = null) {
    try {
      const result = await this.csvManager.syncToGoogleSheets();

      if (result.skipped) {
        // Silently skip if not configured
        return result;
      }

      if (result.success && result.syncedSheets) {
        console.log(`📊 Synced ${result.syncedSheets} sheet(s) to Google Sheets`);

        // Import the URL helper functions
        let googleSheetsSyncModule;
        try {
          // Path goes up 3 levels: backend/core -> backend -> enhanced-bulk-generator-frontend -> martech -> scripts
          const syncPath = path.resolve(__dirname, '../../../scripts/sync-google-sheets.cjs');
          googleSheetsSyncModule = require(syncPath);
        } catch (error) {
          // Module not available, skip URL display
          return result;
        }

        // Show the "View on Google Sheets" button
        const allUrls = googleSheetsSyncModule.getAllSheetUrls();
        const spreadsheetId = googleSheetsSyncModule.SPREADSHEET_ID;
        const baseUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

        console.log('');
        console.log('🔗 View on Google Sheets:');

        if (primarySheet && allUrls[primarySheet]) {
          // Highlight the primary sheet for this stage
          console.log(`   📊 ${primarySheet}: ${allUrls[primarySheet]}`);
        } else {
          // Show the main spreadsheet URL
          console.log(`   📊 Spreadsheet: ${baseUrl}`);
        }
      }

      return result;
    } catch (error) {
      // Don't fail workflow if sync fails
      console.warn('⚠️  Google Sheets sync skipped:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = WorkflowOrchestrator;

// CLI usage
if (require.main === module) {
  const command = process.argv[2];
  const orchestrator = new WorkflowOrchestrator({
    autoApprove: process.argv.includes('--auto-approve'),
    batchSize: parseInt(process.argv.find(arg => arg.startsWith('--batch-size='))?.split('=')[1]) || 10,
    gapsPerRun: parseInt(process.argv.find(arg => arg.startsWith('--gaps='))?.split('=')[1]) || 10
  });

  switch (command) {
    case 'full':
      orchestrator.executeFullWorkflow()
        .then(() => {
          console.log('🎉 Full workflow completed!');
          process.exit(0);
        })
        .catch((error) => {
          console.error('❌ Workflow failed:', error.message);
          process.exit(1);
        });
      break;

    case 'stage':
      const stageName = process.argv[3];
      if (!stageName) {
        console.log('❌ Please specify stage name');
        console.log('');
        console.log('Available stages:');
        console.log('  research       - Generate 10 content gap opportunities (append to CSV)');
        console.log('  topics         - Generate strategic topics from approved gaps');
        console.log('  deep-research  - Analyze competitors for each topic');
        console.log('  content        - Create E-E-A-T compliant content');
        console.log('  validation     - Validate content with AI auto-correction');
        console.log('  seo            - Optimize for SEO');
        console.log('  publication    - Publish to WordPress & Sanity');
        console.log('  completion     - Finalize batch');
        process.exit(1);
      }

      orchestrator.executeStage(stageName)
        .then(() => {
          console.log(`\n✅ Stage ${stageName} completed!`);
          process.exit(0);
        })
        .catch((error) => {
          console.error(`❌ Stage ${stageName} failed:`, error.message);
          process.exit(1);
        });
      break;

    case 'monitor':
      orchestrator.monitorProgress();
      break;

    case 'status':
      orchestrator.csvManager.generateSummaryReport();
      break;

    default:
      console.log('🚀 Enhanced Bulk Generator - Workflow Orchestrator');
      console.log('='.repeat(60));
      console.log('');
      console.log('Usage: node workflow-orchestrator.js [command] [options]');
      console.log('');
      console.log('Commands:');
      console.log('  full                    - Execute complete workflow (all 7 stages)');
      console.log('  stage <stage-name>      - Execute specific workflow stage');
      console.log('  monitor                 - Monitor workflow progress');
      console.log('  status                  - Show current status summary');
      console.log('');
      console.log('Options:');
      console.log('  --auto-approve          - Auto-approve high-priority items');
      console.log('  --batch-size=N          - Set batch size (default: 10)');
      console.log('  --gaps=N                - Gaps per run (default: 10)');
      console.log('');
      console.log('Examples:');
      console.log('  node workflow-orchestrator.js stage research');
      console.log('  node workflow-orchestrator.js stage topics --auto-approve');
      console.log('  node workflow-orchestrator.js full --gaps=20');
      console.log('');
      console.log('Available stages:');
      console.log('  research, topics, deep-research, content, validation, seo, publication, completion');
      console.log('');
      console.log('💡 Tip: Run "research" stage multiple times to accumulate gaps!');
  }
}
