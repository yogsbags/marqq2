#!/usr/bin/env node

/**
 * Topic Generator for Enhanced Bulk Generator
 * Uses Groq/compound model to generate 50 strategic topics from approved research gaps
 * Implements N8N Workflow 2: Topic Generation
 */

const fetch = require('node-fetch');
const { jsonrepair } = require('jsonrepair');
const fs = require('fs');
const path = require('path');
const CSVDataManager = require('../core/csv-data-manager');

class TopicGenerator {
  constructor(config = {}) {
    this.groqApiKey = process.env.GROQ_API_KEY;
    this.groqApiUrl = 'https://api.groq.com/openai/v1/chat/completions';

    // Primary and backup models with browser search capabilities
    this.models = {
      primary: 'groq/compound',           // Fast compound model
      compoundMini: 'groq/compound-mini', // Backup compound model
      browserSearch20B: 'openai/gpt-oss-20b',   // Browser search 20B model
      browserSearch120B: 'openai/gpt-oss-120b', // Browser search 120B model
      gemini: 'gemini-2.5-pro',           // Google Gemini model
      fallback: 'meta-llama/llama-4-maverick-17b-128e-instruct' // Latest Llama model
    };

    this.currentModel = config.model || this.models.primary;
    this.csvManager = new CSVDataManager();

    // Load optimized model parameters
    this.modelParams = this.loadModelParameters();

    // 🎯 Category filter for focused topic generation
    this.selectedCategory = config.category || null;

    // 🎯 Topic limit for controlled generation
    this.topicLimit = config.topicLimit || null;

    // 🎯 Custom topic for direct generation (bypasses Stage 1 gaps)
    this.customTopic = config.customTopic || null;

    // 🎯 MCP DATA FETCHERS - Store them from config!
    this.gscDataFetcher = config.gscDataFetcher || null;
    this.seoDataFetcher = config.seoDataFetcher || null;

    // 🎯 Load live topics for deduplication
    this.liveTopics = this.loadLiveTopics();

    // Topic generation strategy
    this.topicStrategy = {
      quickWins: 20,        // Low difficulty, decent volume, 30-60 days ranking
      authorityBuilders: 20, // High volume, topical clusters, 3-6 month ranking
      competitiveStrikes: 10 // Target competitor weaknesses, steal traffic
    };

    // Content type distribution
    this.contentTypeDistribution = {
      blog: 20,      // Educational, how-to guides
      ymyl: 15,      // Investment advice, financial planning
      listicle: 10,  // Top X, best of lists
      news: 5        // Regulatory updates, market news
    };

    this.validateConfig();
  }

  /**
   * Validate configuration
   */
  validateConfig() {
    if (!this.groqApiKey) {
      console.warn('⚠️  GROQ_API_KEY environment variable not set!');
      console.log('Please set it with: export GROQ_API_KEY="your-api-key"');
      console.log('Some features will be disabled until API key is provided.\n');
      return false;
    }
    console.log('✅ Topic Generator initialized');
    console.log(`🤖 Primary Model: ${this.currentModel} (native web search)`);
    console.log(`🔄 Backup Models: ${this.models.compoundMini} (web search), ${this.models.browserSearch20B}, ${this.models.browserSearch120B}, ${this.models.gemini}, ${this.models.fallback}`);
    if (this.selectedCategory) {
      console.log(`📂 Category Focus: ${this.selectedCategory.toUpperCase()}`);
    }
    if (this.topicLimit !== null) {
      console.log(`📊 Topic Limit: ${this.topicLimit}`);
    }
    return true;
  }

  /**
   * Load optimized model parameters from config
   */
  loadModelParameters() {
    try {
      const configPath = path.join(__dirname, '../config/model-parameters.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      console.log('✅ Loaded optimized model parameters from config');
      return config;
    } catch (error) {
      console.warn('⚠️  Failed to load model parameters, using defaults');
      return {
        stages: {
          topics: {
            temperature: 0.4,
            top_p: 0.95,
            frequency_penalty: 0.3,
            presence_penalty: 0.2,
            max_tokens: 16000,
            response_format: { type: 'json_object' }
          }
        }
      };
    }
  }

  /**
   * Load live topics from CSV for deduplication
   * Returns a Set of normalized topic titles for fast lookup
   */
  loadLiveTopics() {
    try {
      const liveTopicsPath = '/tmp/live_topics_all_sheets.csv';

      if (!fs.existsSync(liveTopicsPath)) {
        console.log('ℹ️  Live topics CSV not found, skipping live topic deduplication');
        return new Set();
      }

      const csvContent = fs.readFileSync(liveTopicsPath, 'utf-8');
      const lines = csvContent.split('\n').slice(1); // Skip header

      const liveTopicTitles = new Set();

      lines.forEach(line => {
        if (!line.trim()) return;

        // Parse CSV line (handle quoted fields)
        const match = line.match(/^"([^"]+)"/);
        if (match && match[1]) {
          const title = match[1].trim();
          // Normalize title for comparison (lowercase, remove special chars)
          const normalized = this.normalizeTopicTitle(title);
          liveTopicTitles.add(normalized);
        }
      });

      console.log(`✅ Loaded ${liveTopicTitles.size} live topics for deduplication`);
      return liveTopicTitles;

    } catch (error) {
      console.warn(`⚠️  Failed to load live topics: ${error.message}`);
      return new Set();
    }
  }

  /**
   * Normalize topic title for comparison
   * Removes special characters, extra spaces, and converts to lowercase
   */
  normalizeTopicTitle(title) {
    return title
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove special characters
      .replace(/\s+/g, ' ')    // Normalize spaces
      .trim();
  }

  /**
   * Check if a topic is already live
   */
  isTopicLive(topicTitle) {
    const normalized = this.normalizeTopicTitle(topicTitle);
    return this.liveTopics.has(normalized);
  }

  /**
   * Filter out live topics from generated topics
   */
  deduplicateAgainstLiveTopics(topics) {
    if (this.liveTopics.size === 0) {
      console.log('ℹ️  No live topics loaded, skipping deduplication');
      return topics;
    }

    console.log(`\n🔍 Deduplicating ${topics.length} topics against ${this.liveTopics.size} live topics...`);

    const newTopics = [];
    const duplicates = [];

    topics.forEach(topic => {
      if (this.isTopicLive(topic.topic_title)) {
        duplicates.push(topic);
        console.log(`   ⏭️  "${topic.topic_title}" - Already live, skipping`);
      } else {
        newTopics.push(topic);
      }
    });

    console.log(`✅ Deduplication complete:`);
    console.log(`   ✅ New topics: ${newTopics.length}`);
    console.log(`   ⏭️  Duplicates filtered: ${duplicates.length}`);

    return newTopics;
  }

  /**
   * Generate topic ID
   */
  generateTopicId(index) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `TOPIC-${date}-${String(index).padStart(3, '0')}`;
  }

  /**
   * Generate 50 strategic topics from approved research gaps
   * NOW WITH CSE DUPLICATE DETECTION!
   */
  async generateTopics() {
    // Determine effective topic target (use limit if specified, otherwise default to 50)
    const targetTopics = this.topicLimit ?? 50;

    console.log(`🐛 DEBUG TopicGenerator: this.topicLimit = ${this.topicLimit}, targetTopics = ${targetTopics}`);

    console.log('\n🎯 TOPIC GENERATION STARTED');
    console.log('='.repeat(50));
    console.log(`🤖 AI Model: ${this.currentModel}`);
    console.log(`📊 Target: ${targetTopics} strategic topics`);
    if (this.selectedCategory) {
      console.log(`📂 Category Filter: ${this.selectedCategory.toUpperCase()}`);
    }
    if (this.topicLimit !== null) {
      console.log(`🔍 Topic limit applied: ${this.topicLimit}`);
    }

    try {
      // 🎯 Custom Topic Mode: Generate topics based on user input (bypass Stage 1)
      if (this.customTopic) {
        console.log(`\n✨ CUSTOM TOPIC MODE ACTIVATED`);
        console.log(`📝 Custom Topic: "${this.customTopic}"`);
        console.log(`🚀 Bypassing Stage 1 research gaps...`);

        const customTopics = await this.generateCustomTopics(this.customTopic, targetTopics);

        if (!customTopics || !Array.isArray(customTopics) || customTopics.length < 1) {
          throw new Error(`Failed to generate custom topics`);
        }

        console.log(`✅ Generated ${customTopics.length} custom topic(s)`);

        // Save custom topics to CSV
        const saved = this.csvManager.saveGeneratedTopics(customTopics);

        if (saved) {
          console.log(`\n✅ Custom topic generation completed: ${customTopics.length} topics created`);
          this.generateTopicSummary(customTopics);
          return customTopics;
        } else {
          throw new Error('Failed to save custom topics to CSV');
        }
      }

      // Get approved research gaps
      let approvedGaps = this.csvManager.getApprovedResearchGaps();

      if (approvedGaps.length === 0) {
        throw new Error('No approved research gaps found. Run master-seo-researcher.js first and approve some gaps.');
      }

      console.log(`✅ Found ${approvedGaps.length} total approved research gaps`);

      // Filter by category if specified
      if (this.selectedCategory) {
        const categoryLower = this.selectedCategory.toLowerCase().replace(/-/g, '_');
        const originalLength = approvedGaps.length;

        approvedGaps = approvedGaps.filter(gap => {
          const gapCategory = (gap.topic_area || gap.category || '').toLowerCase().replace(/-/g, '_');
          return gapCategory === categoryLower;
        });

        console.log(`🎯 Filtered to ${approvedGaps.length} gaps in "${this.selectedCategory}" category (from ${originalLength} total)`);

        if (approvedGaps.length === 0) {
          throw new Error(`No approved research gaps found for category "${this.selectedCategory}". Available categories: ${[...new Set(this.csvManager.getApprovedResearchGaps().map(g => g.topic_area || g.category))].join(', ')}`);
        }
      }

      // Generate topics with batch strategy for reliability
      let topics = await this.generateTopicsInBatches(approvedGaps, targetTopics);

      if (!topics || !Array.isArray(topics) || topics.length < 1) {
        throw new Error(`No topics generated`);
      }

      console.log(`✅ Generated ${topics.length} topics from ${approvedGaps.length} research gaps`);

      // 🎯 FIRST: Deduplicate against live topics from spreadsheet
      topics = this.deduplicateAgainstLiveTopics(topics);

      if (topics.length === 0) {
        console.log('⚠️  All generated topics are already live. No new topics to create.');
        return [];
      }

      // 🎯 SECOND: Validate topics with CSE to prevent duplicates!
      if (this.gscDataFetcher && this.gscDataFetcher.cseClient && this.gscDataFetcher.useCSE) {
        try {
          console.log(`\n🔍 [MCP CSE] Validating ${topics.length} topics for duplicate content...`);
          const validatedTopics = [];
          let duplicatesFound = 0;
          let updateOpportunities = 0;

          for (const topic of topics) {
            try {
              // Check if content already exists on site
              const coverage = await this.gscDataFetcher.analyzeTopicCoverage(
                topic.topic_title,
                [topic.primary_keyword, ...topic.secondary_keywords.split(',').slice(0, 2)]
              );

              // Add coverage data to topic
              topic.coverage_score = coverage.coverageScore;
              topic.existing_content = coverage.hasExistingContent;
              topic.recommendation = coverage.recommendation;

              if (coverage.recommendation === 'create') {
                // No duplicate - safe to create
                validatedTopics.push(topic);
                console.log(`   ✅ [MCP CSE] "${topic.topic_title}" - No duplicate (coverage: ${coverage.coverageScore}%)`);
              } else if (coverage.recommendation === 'update') {
                // Content exists but needs update
                topic.action = 'update';
                topic.existing_url = coverage.existingArticles[0]?.url || '';
                validatedTopics.push(topic);
                updateOpportunities++;
                console.log(`   🔄 [MCP CSE] "${topic.topic_title}" - Update opportunity (coverage: ${coverage.coverageScore}%)`);
              } else {
                // High coverage - skip
                topic.action = 'skip';
                topic.skip_reason = `Already well-covered (${coverage.coverageScore}%)`;
                duplicatesFound++;
                console.log(`   ⏭️  [MCP CSE] "${topic.topic_title}" - Duplicate detected (coverage: ${coverage.coverageScore}%)`);
              }

              // Small delay to avoid rate limits
              await new Promise(resolve => setTimeout(resolve, 500));

            } catch (coverageError) {
              // If coverage check fails, keep the topic
              console.log(`   ⚠️  [MCP CSE] Failed to check "${topic.topic_title}": ${coverageError.message}`);
              validatedTopics.push(topic);
            }
          }

          console.log(`\n✅ [MCP CSE] Validation complete:`);
          console.log(`   ✅ New topics: ${validatedTopics.filter(t => t.recommendation === 'create').length}`);
          console.log(`   🔄 Update opportunities: ${updateOpportunities}`);
          console.log(`   ⏭️  Duplicates prevented: ${duplicatesFound}`);

          topics = validatedTopics;

        } catch (error) {
          console.log(`⚠️  [MCP CSE] Coverage validation failed: ${error.message}`);
          console.log('   Proceeding with all topics...');
        }
      } else {
        console.log('ℹ️  CSE MCP not configured, skipping duplicate detection');
      }

      // Save topics to CSV
      const saved = this.csvManager.saveGeneratedTopics(topics);

      if (saved) {
        console.log(`\n✅ Topic generation completed: ${topics.length} topics created`);
        this.generateTopicSummary(topics);
        return topics;
      } else {
        throw new Error('Failed to save topics to CSV');
      }

    } catch (error) {
      console.error('❌ Topic generation failed:', error.message);
      throw error;
    }
  }

  /**
   * Generate topics in batches for reliability
   * Dynamically generates N topics based on topicLimit (defaults to 50)
   */
  async generateTopicsInBatches(approvedGaps, targetTotal = 50) {
    const batchSize = Math.min(25, targetTotal);  // Max 25 topics per batch, or less if target is smaller
    const batches = Math.ceil(targetTotal / batchSize);

    console.log(`\n🔄 Batch Generation Strategy: ${batches} batches of ${batchSize} topics each`);

    let allTopics = [];

    for (let batchNum = 1; batchNum <= batches; batchNum++) {
      console.log(`\n📦 Generating Batch ${batchNum}/${batches}...`);

      try {
        const batchTopics = await this.generateTopicsWithAI(approvedGaps, batchSize);

        if (batchTopics && Array.isArray(batchTopics) && batchTopics.length > 0) {
          console.log(`   ✅ Batch ${batchNum}: Generated ${batchTopics.length} topics`);
          allTopics = allTopics.concat(batchTopics);
        } else {
          console.warn(`   ⚠️  Batch ${batchNum}: No topics generated, retrying...`);

          // Retry once with fallback
          const retryTopics = await this.generateTopicsWithAI(approvedGaps, batchSize);
          if (retryTopics && Array.isArray(retryTopics) && retryTopics.length > 0) {
            console.log(`   ✅ Batch ${batchNum} (retry): Generated ${retryTopics.length} topics`);
            allTopics = allTopics.concat(retryTopics);
          } else {
            console.warn(`   ⚠️  Batch ${batchNum}: Failed after retry, continuing...`);
          }
        }

        // Progress update
        console.log(`   📊 Total progress: ${allTopics.length}/${targetTotal} topics`);

        // Delay between batches to avoid rate limits
        if (batchNum < batches) {
          console.log(`   ⏳ Waiting 3 seconds before next batch...`);
          await this.sleep(3000);
        }

      } catch (error) {
        console.error(`   ❌ Batch ${batchNum} failed: ${error.message}`);
        // Continue to next batch instead of failing completely
      }
    }

    console.log(`\n✅ Batch generation complete: ${allTopics.length} total topics`);

    // If we didn't get exactly 50, that's okay - return what we got
    if (allTopics.length < targetTotal) {
      console.warn(`⚠️  Generated ${allTopics.length} topics (target was ${targetTotal})`);
    }

    return allTopics;
  }

  /**
   * Generate custom topics based on user-provided topic title
   * Bypasses Stage 1 research gaps entirely
   */
  async generateCustomTopics(customTopicTitle, targetCount = 1) {
    console.log(`\n🎯 Generating custom topics for: "${customTopicTitle}"`);
    console.log(`📊 Target count: ${targetCount}`);

    const prompt = this.buildCustomTopicPrompt(customTopicTitle, targetCount);

    console.log('🤖 Generating custom topics with AI...');
    console.log(`📊 Using model: ${this.currentModel}`);

    const modelsToTry = [
      this.currentModel,
      this.models.compoundMini,
      this.models.browserSearch20B,
      this.models.browserSearch120B,
      this.models.gemini,
      this.models.fallback
    ];

    for (const modelToTry of modelsToTry) {
      console.log(`🔄 Trying model: ${modelToTry}`);

      try {
        let apiUrl = this.groqApiUrl;
        let apiKey = this.groqApiKey;
        let requestBody;

        if (modelToTry.includes('gemini')) {
          const params = this.modelParams.stages.topics;
          apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent';
          apiKey = process.env.GEMINI_API_KEY || 'AIzaSyAcCCA2Kt0TMVF4-uiOW2iRU--WSiGMk8k';

          requestBody = {
            contents: [{
              parts: [{
                text: `You are an Expert Content Strategist specializing in Indian WealthTech. Generate strategic content topics based on user input.\n\n${prompt}`
              }]
            }],
            generationConfig: {
              temperature: params.temperature,
              topP: params.top_p,
              maxOutputTokens: params.max_tokens
            },
            tools: [{
              googleSearch: {}
            }]
          };
        } else {
          const params = this.modelParams.stages.topics;
          requestBody = {
            model: modelToTry,
            messages: [
              {
                role: 'system',
                content: 'You are an Expert Content Strategist specializing in Indian Broking and WealthTech. Generate HIGH-QUALITY, SPECIFIC, ACTIONABLE content topics based on user input. Focus on creating compelling, SEO-optimized titles that include primary keywords naturally and provide clear value propositions. Avoid generic topics - be specific and strategic.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: params.temperature,
            top_p: params.top_p,
            frequency_penalty: params.frequency_penalty,
            presence_penalty: params.presence_penalty,
            max_tokens: params.max_tokens,
            response_format: params.response_format
          };

          if (modelToTry.includes('groq/compound')) {
            requestBody.search_settings = {
              country: "india",
              include_domains: ["*.in", "groww.in", "zerodha.com", "etmoney.com"],
              exclude_domains: ["wikipedia.org"]
            };
          }

          if (modelToTry.includes('openai/gpt-oss')) {
            requestBody.tools = [{ type: "browser_search" }];
            requestBody.tool_choice = "auto";
            delete requestBody.response_format;
          }
        }

        const headers = modelToTry.includes('gemini')
          ? { 'Content-Type': 'application/json' }
          : {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            };

        const fetchUrl = modelToTry.includes('gemini')
          ? `${apiUrl}?key=${apiKey}`
          : apiUrl;

        const response = await fetch(fetchUrl, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          console.log(`⚠️  ${modelToTry} error: ${response.status}, trying next model...`);
          continue;
        }

        const data = await response.json();

        let content;
        if (modelToTry.includes('gemini')) {
          content = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!content) {
            console.log(`⚠️  Gemini response missing content, trying next model...`);
            continue;
          }
        } else {
          const message = data.choices[0]?.message || {};
          if (message.parsed) {
            content = typeof message.parsed === 'string'
              ? message.parsed
              : JSON.stringify(message.parsed);
          } else {
            content = message.content || '';
          }
        }

        try {
          const cleanResponse = this.cleanModelResponse(content, modelToTry);
          const topics = this.parseTopicsPayload(cleanResponse, modelToTry);

          console.log(`✅ Custom topic generation completed with ${modelToTry}`);

          topics.forEach(topic => {
            topic.model_used = modelToTry;
            topic.browser_search_enabled = modelToTry.includes('openai/gpt-oss');
            topic.custom_topic = true;
          });

          // Create synthetic research gap for custom topics
          const syntheticTopics = topics.map(topic => ({
            ...topic,
            research_gap_id: 'CUSTOM-GAP',
            approval_status: 'Pending'
          }));

          return this.validateAndEnhanceTopics(syntheticTopics, []);

        } catch (parseError) {
          console.log(`⚠️  JSON parsing failed for ${modelToTry}: ${parseError.message}`);
          continue;
        }

      } catch (error) {
        console.log(`❌ Model ${modelToTry} failed: ${error.message}, trying next model...`);
        continue;
      }
    }

    throw new Error('All models failed to generate custom topics');
  }

  /**
   * Build prompt for custom topic generation
   */
  buildCustomTopicPrompt(customTopicTitle, topicCount = 1) {
    const categoryInstruction = this.selectedCategory
      ? `The topic MUST be in the "${this.selectedCategory}" category.`
      : 'Auto-detect the most appropriate category based on the topic.';

    // Dynamic date context
    const now = new Date();
    const currentYear = now.getFullYear();

    return `You are an Expert Content Strategist for Indian WealthTech. Generate ${topicCount} HIGH-QUALITY, STRATEGIC content topic(s) based on this user-provided topic: "${customTopicTitle}"

${categoryInstruction}

🎯 QUALITY REQUIREMENTS (CRITICAL):
- topic_title MUST be compelling, specific, and SEO-optimized (50-60 chars max)
- Include the user-provided topic "${customTopicTitle}" naturally in the title
- Use power words: "Complete", "Ultimate", "Step-by-Step", "Comprehensive", "Best", "Top"
- Include year (${currentYear}) when relevant for time-sensitive content
- Make it ACTIONABLE and SPECIFIC - avoid generic titles
- primary_keyword should be extracted from the topic title, not just copied

TOPIC GENERATION REQUIREMENTS:

For EACH of the ${topicCount} topic(s), provide:

1. research_gap_id: "CUSTOM-GAP" (since this bypasses Stage 1 research)
2. content_type: [blog|ymyl|listicle|news] (auto-detect based on topic - blog for educational, ymyl for investment advice)
3. topic_title:
   - Generate a compelling, SEO-optimized blog title based on "${customTopicTitle}"
   - Format: "[Primary Keyword] [Year]: [Value Proposition]" or "[Action] [Primary Keyword] [Year]"
   - Examples: "Nifty Options Strategies: Complete Guide for Beginners in ${currentYear}", "Best ELSS Funds ${currentYear}: Top Tax-Saving Equity Schemes for Indian Investors"
   - MUST be 50-60 characters, include the primary keyword, and be specific
   - AVOID generic titles like "Investment Guide" or "Wealth Management Tips"
4. category: [mutual_funds|tax_planning|stock_market|retirement_planning|insurance|personal_finance|investment_strategies|derivatives] (auto-detect)
5. primary_keyword: Extract main target keyword from topic_title (should match "${customTopicTitle}" or be closely related)
6. secondary_keywords: 3-5 related keywords (comma-separated string) - include variations, long-tail keywords, and related terms
7. search_volume: Realistic estimated monthly search volume (1000-15000 range, based on keyword competitiveness)
8. keyword_difficulty: 0-100 score (estimate based on competition - 20-40 for niche, 40-60 for competitive, 60+ for very competitive)
9. priority: [High|Medium|Low] - High if search_volume >8000 or difficulty <30, Medium if 3000-8000, Low otherwise
10. topic_type: [quick_win|authority_builder|competitive_strike] (quick_win if difficulty <35, authority_builder if volume >8000, competitive_strike if targeting specific competitor)
11. target_competitor: Which competitor we're outranking (Groww, Zerodha, ETMoney, PaytmMoney, etc.)
12. our_competitive_advantage: Specific, actionable plan to beat competitor (e.g., "${currentYear} data, interactive calculator, expert quotes, video comparisons")
13. word_count_target: Recommended length (2000-3000 words for comprehensive guides, 1500-2000 for quick wins)
14. expert_required: [true|false] - true for YMYL content, investment advice, or complex topics
15. estimated_ranking_time: Days to rank (30-45 for quick wins, 60-90 for authority builders)
16. estimated_monthly_traffic: Expected traffic when ranked (calculate as 60-70% of search_volume)
17. internal_linking_opportunities: 3-5 related topic slugs for clustering (comma-separated, e.g., "related-guide,calculator-tool,basics")
18. content_upgrade_idea: Specific, actionable lead magnet (e.g., "Interactive Calculator", "Downloadable Checklist PDF", "Video Tutorial Series")
19. regulatory_requirements: Compliance needs (comma-separated) - typically "SEBI disclaimer,Risk warning" for investment content
20. approval_status: "Pending"

OUTPUT FORMAT:
- Return a JSON object with a single key "topics" containing the array of topic objects.
- No markdown, no comments, no explanations.
- topic_id will be auto-generated, so you can omit it or use placeholder

EXAMPLE (High Quality):
{
  "topics": [
    {
      "research_gap_id": "CUSTOM-GAP",
      "content_type": "ymyl",
      "topic_title": "Nifty Options Strategies: Complete Guide for Beginners in ${currentYear}",
      "category": "derivatives",
      "primary_keyword": "nifty options strategies",
      "secondary_keywords": "nifty options trading,options strategies for beginners,weekly options nifty,options trading guide ${currentYear}",
      "search_volume": 8500,
      "keyword_difficulty": 32,
      "priority": "High",
      "topic_type": "authority_builder",
      "target_competitor": "Zerodha",
      "our_competitive_advantage": "${currentYear} lot size updates, interactive strategy calculator, backtesting examples, expert trader interviews",
      "word_count_target": 2500,
      "expert_required": "true",
      "estimated_ranking_time": 60,
      "estimated_monthly_traffic": 5950,
      "internal_linking_opportunities": "options-basics,derivatives-guide,strategy-calculator,nifty-trading",
      "content_upgrade_idea": "Interactive Options Strategy Backtesting Tool with P&L Calculator",
      "regulatory_requirements": "SEBI disclaimer,Risk warning,Derivatives trading risks",
      "approval_status": "Pending"
    }
  ]
}

❌ BAD TOPIC TITLE EXAMPLES (DO NOT GENERATE):
- "${customTopicTitle}" (just the keyword, no enhancement)
- "Investment Guide" (too generic)
- "Wealth Management Tips" (not specific)
- "Financial Planning" (no value proposition)

✅ GOOD TOPIC TITLE EXAMPLES:
- "Best ELSS Funds ${currentYear}: Top Tax-Saving Equity Schemes for Indian Investors"
- "Nifty Options Strategies: Complete Guide for Beginners in ${currentYear}"
- "Section 80C Deductions ${currentYear}: Step-by-Step Guide to Maximize Tax Savings"
- "Bank Nifty Weekly Options Trading: Tuesday Expiry Strategy Guide ${currentYear}"

CRITICAL:
- Generate exactly ${topicCount} topic(s)
- Return ONLY the JSON object described above
- No markdown formatting, no explanations
- topic_title MUST be compelling, specific (50-60 chars), and include "${customTopicTitle}" naturally
- primary_keyword should match or be closely related to "${customTopicTitle}"
- Validate JSON structure before returning`;
  }

  /**
   * Generate topics using Groq AI with multiple model fallback
   */
  async generateTopicsWithAI(approvedGaps, topicCount = 50) {
    const prompt = this.buildTopicPrompt(approvedGaps, topicCount);

    console.log('🤖 Generating strategic topics with Groq AI...');
    console.log(`📊 Using model: ${this.currentModel}`);
    console.log(`🎯 Target: ${topicCount} topics`);

    const modelsToTry = [
      this.currentModel,
      this.models.compoundMini,     // Try compound-mini as first backup
      this.models.browserSearch20B,  // Browser search for real-time competitive data
      this.models.browserSearch120B, // More powerful browser search
      this.models.gemini,           // Google Gemini 2.5 Pro
      this.models.fallback          // Latest Llama model
    ];

    for (const modelToTry of modelsToTry) {
      console.log(`🔄 Trying model: ${modelToTry}`);

      try {
          // Determine API endpoint and key based on model
          let apiUrl = this.groqApiUrl;
          let apiKey = this.groqApiKey;
          let requestBody;

          if (modelToTry.includes('gemini')) {
            // Use Google Gemini API with optimized parameters
            const params = this.modelParams.stages.topics;
            apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent';
            apiKey = process.env.GEMINI_API_KEY || 'AIzaSyAcCCA2Kt0TMVF4-uiOW2iRU--WSiGMk8k';

            requestBody = {
              contents: [{
                parts: [{
                  text: `You are an Expert Content Strategist specializing in topic selection for competitive SEO dominance in Indian WealthTech. Your role is to transform research insights into HIGH-QUALITY, SPECIFIC, ACTIONABLE content topics that directly address research gaps. Focus on creating compelling, SEO-optimized titles that include primary keywords naturally and provide clear value propositions. Avoid generic topics - be specific and strategic.\n\n${prompt}`
                }]
              }],
              generationConfig: {
                temperature: params.temperature,
                topP: params.top_p,
                maxOutputTokens: params.max_tokens
              },
              tools: [{
                googleSearch: {}
              }]
            };

            console.log('🤖 Using Google Gemini 2.5 Pro API with Google Search grounding');
          } else {
            // Use Groq API for all other models with optimized parameters
            const params = this.modelParams.stages.topics;
            requestBody = {
              model: modelToTry,
              messages: [
                {
                  role: 'system',
                  content: 'You are an Expert Content Strategist specializing in topic selection for competitive SEO dominance in Indian WealthTech. Your role is to transform research insights into HIGH-QUALITY, SPECIFIC, ACTIONABLE content topics that directly address research gaps. Focus on creating compelling, SEO-optimized titles that include primary keywords naturally and provide clear value propositions. Avoid generic topics - be specific and strategic.'
                },
                {
                  role: 'user',
                  content: prompt
                }
              ],
              temperature: params.temperature,
              top_p: params.top_p,
              frequency_penalty: params.frequency_penalty,
              presence_penalty: params.presence_penalty,
              max_tokens: params.max_tokens,
              response_format: params.response_format
            };

            // Add web search for compound models (native capability)
            if (modelToTry.includes('groq/compound')) {
              // Add search settings for Indian WealthTech focus
              requestBody.search_settings = {
                country: "india",
                include_domains: ["*.in", "groww.in", "zerodha.com", "etmoney.com", "paytmmoney.com", "indmoney.com"],
                exclude_domains: ["wikipedia.org", "*.wiki*"]
              };
              console.log('🌐 Web search enabled natively with India focus for topic validation');
            }

            // Add browser search tool for supported models
            if (modelToTry.includes('openai/gpt-oss')) {
              requestBody.tools = [{ type: "browser_search" }];
              requestBody.tool_choice = "auto";
              // Remove response_format when using tools - JSON mode can't be combined with tool calling
              delete requestBody.response_format;
              console.log('🌐 Browser search enabled for real-time topic validation (JSON mode disabled for tool compatibility)');
            }
          }

          const headers = modelToTry.includes('gemini')
            ? { 'Content-Type': 'application/json' }
            : {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
              };

          const fetchUrl = modelToTry.includes('gemini')
            ? `${apiUrl}?key=${apiKey}`
            : apiUrl;

          const response = await fetch(fetchUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody)
          });

          if (response.status === 429) {
            console.log(`⏳ Rate limited on ${modelToTry}, trying next model...`);
            continue; // Try next model immediately
          }

          if (response.status === 400) {
            const errorBody = await response.text();
            console.log(`⚠️  Model ${modelToTry} failed with 400 error: ${errorBody.substring(0, 200)}`);
            continue; // Try next model
          }

          if (!response.ok) {
            console.log(`⚠️  ${modelToTry} error: ${response.status}, trying next model...`);
            continue; // Try next model
          }

          const data = await response.json();

          // Extract content based on API provider
          let content;
          if (modelToTry.includes('gemini')) {
            // Gemini API response format
            content = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!content) {
              console.log(`⚠️  Gemini response missing content, trying next model...`);
              continue;
            }
          } else {
            const message = data.choices[0]?.message || {};
            if (message.parsed) {
              content = typeof message.parsed === 'string'
                ? message.parsed
                : JSON.stringify(message.parsed);
            } else {
              content = message.content || '';
            }
          }

          try {
            const cleanResponse = this.cleanModelResponse(content, modelToTry);
            const topics = this.parseTopicsPayload(cleanResponse, modelToTry);

            console.log(`✅ AI topic generation completed with ${modelToTry} (${content.length} characters)`);
            console.log(`📊 Generated ${topics.length} topics`);

            // Log sample topics for quality check
            if (topics.length > 0) {
              console.log(`\n📝 Sample generated topics (first 3):`);
              topics.slice(0, 3).forEach((topic, idx) => {
                console.log(`   ${idx + 1}. "${topic.topic_title || 'N/A'}" (${topic.primary_keyword || 'N/A'})`);
              });
            }

            topics.forEach(topic => {
              topic.model_used = modelToTry;
              topic.browser_search_enabled = modelToTry.includes('openai/gpt-oss');
            });

            return this.validateAndEnhanceTopics(topics, approvedGaps);

          } catch (parseError) {
            console.log(`⚠️  JSON parsing failed for ${modelToTry}: ${parseError.message}`);

            if (modelToTry.includes('openai/gpt-oss')) {
              console.log('🔄 Creating fallback topics from browser search content...');
              return this.createFallbackTopics(approvedGaps, modelToTry);
            }

            console.log('Trying next model...');
            continue;
          }

        } catch (error) {
          console.log(`❌ Model ${modelToTry} failed: ${error.message}, trying next model...`);
          continue; // Try next model immediately
        }
    }

    throw new Error('All models failed after multiple attempts');
  }

  cleanModelResponse(content, modelName) {
    let text = (content || '').toString();

    // Remove markdown fences and control characters
    text = text.replace(/\r/g, '');
    text = text.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1');
    text = text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

    if (modelName.includes('openai/gpt-oss') || modelName.includes('groq/compound')) {
      text = text.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
      text = text.replace(/\n\s*\n/g, '\n');
    }

    return text.trim();
  }

  extractJsonArrayCandidate(text) {
    if (!text) {
      return '';
    }

    const trimmed = text.trim();
    const start = trimmed.indexOf('[');
    const end = trimmed.lastIndexOf(']');

    if (start !== -1 && end !== -1 && end > start) {
      return trimmed.slice(start, end + 1);
    }

    const match = trimmed.match(/\[[\s\S]*\]/);
    return match ? match[0] : trimmed;
  }

  parseTopicsPayload(text, modelName) {
    let candidate = text.trim();

    const objectCandidate = this.extractObjectCandidate(candidate);
    if (objectCandidate) {
      candidate = objectCandidate;
    } else {
      const arrayCandidate = this.extractJsonArrayCandidate(candidate);
      if (arrayCandidate) {
        candidate = `{"topics": ${arrayCandidate}}`;
      }
    }

    const sanitized = candidate
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/\u0000/g, '');

    const parsed = this.safeParseJsonWithRepair(sanitized);

    const topics =
      Array.isArray(parsed) ? parsed :
      Array.isArray(parsed?.topics) ? parsed.topics :
      Array.isArray(parsed?.data) ? parsed.data :
      null;

    if (!topics) {
      throw new Error('Parsed payload does not contain a topics array');
    }

    if (!Array.isArray(topics) || topics.length === 0) {
      throw new Error('Topics array is empty or invalid');
    }

    return topics;
  }

  extractObjectCandidate(text) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      return text.slice(start, end + 1);
    }
    return null;
  }

  safeParseJsonWithRepair(text) {
    try {
      return JSON.parse(text);
    } catch (parseError) {
      try {
        return JSON.parse(jsonrepair(text));
      } catch (repairError) {
        throw new Error(
          repairError?.message || parseError?.message || 'Failed to parse JSON payload'
        );
      }
    }
  }

  /**
   * Create fallback topics when browser search JSON parsing fails
   */
  createFallbackTopics(approvedGaps, modelUsed) {
    console.log('🛠️  Creating structured fallback topics from browser search content...');

    const date = new Date().toISOString().split('T')[0];
    const fallbackTopics = [];

    // Generate topics based on approved gaps
    const topicTemplates = [
      {
        category: 'mutual_funds',
        title: `Index Funds vs Mutual Funds: Complete ${new Date().getFullYear()} Guide`,
        keyword: 'index funds vs mutual funds',
        volume: 12000,
        difficulty: 28,
        type: 'authority_builder'
      },
      {
        category: 'tax_planning',
        title: 'ELSS vs Tax-Saving FDs: Which Saves More Tax?',
        keyword: 'elss vs tax saving fd',
        volume: 8500,
        difficulty: 32,
        type: 'quick_win'
      },
      {
        category: 'stock_market',
        title: `Small Cap vs Mid Cap vs Large Cap: ${new Date().getFullYear()} Analysis`,
        keyword: 'small cap vs mid cap vs large cap',
        volume: 6800,
        difficulty: 25,
        type: 'quick_win'
      }
    ];

    topicTemplates.forEach((template, index) => {
      // Note: topic_id will be auto-generated by csvManager.saveGeneratedTopics()

      fallbackTopics.push({
        // topic_id removed - will be auto-generated
        research_gap_id: approvedGaps.length > index ? approvedGaps[index].gap_id : `GAP-FB-${String(index + 1).padStart(3, '0')}`,
        content_type: template.type === 'authority_builder' ? 'ymyl' : 'blog',
        topic_title: template.title,
        category: template.category,
        primary_keyword: template.keyword,
        secondary_keywords: `${template.keyword} ${new Date().getFullYear()},${template.category.replace('_', ' ')} guide,investment comparison`,
        search_volume: template.volume,
        keyword_difficulty: template.difficulty,
        priority: template.volume > 8000 ? 'High' : 'Medium',
        topic_type: template.type,
        target_competitor: 'Groww',
        our_competitive_advantage: 'Browser search-enhanced content with real-time data',
        word_count_target: template.type === 'authority_builder' ? 2500 : 2000,
        expert_required: template.type === 'authority_builder',
        estimated_ranking_time: template.difficulty < 30 ? 45 : 60,
        estimated_monthly_traffic: Math.floor(template.volume * 0.7),
        internal_linking_opportunities: `${template.category}-guide,calculator-tools,investment-basics`,
        content_upgrade_idea: `Interactive ${template.category.replace('_', ' ')} calculator`,
        regulatory_requirements: template.category.includes('tax') ? 'SEBI disclaimer,Tax disclaimer' : 'SEBI disclaimer,Risk warning',
        approval_status: 'Pending',
        created_at: new Date().toISOString(),
        model_used: modelUsed,
        browser_search_enabled: true,
        fallback_response: true
      });
    });

    console.log(`✅ Created ${fallbackTopics.length} fallback topics`);
    return fallbackTopics;
  }

  /**
   * Build comprehensive topic generation prompt
   */
  buildTopicPrompt(approvedGaps, topicCount = 50) {
    // Dynamic date context
    const now = new Date();
    const currentYear = now.getFullYear();
    
    // Select top gaps for prompt context
    const topGaps = approvedGaps
      .sort((a, b) => parseInt(b.priority_score) - parseInt(a.priority_score))
      .slice(0, 20);

    const gapsContext = topGaps.map(gap => ({
      gap_id: gap.gap_id,
      topic_area: gap.topic_area,
      gap_title: gap.gap_title,
      search_volume: gap.search_volume,
      keyword_difficulty: gap.keyword_difficulty,
      commercial_intent: gap.commercial_intent,
      primary_keyword: gap.primary_keyword,
      secondary_keywords: gap.secondary_keywords,
      content_type_recommendation: gap.content_type_recommendation,
      word_count_target: gap.word_count_target,
      competitor_weakness: gap.competitor_weakness,
      our_competitive_edge: gap.our_competitive_edge,
      estimated_ranking_time: gap.estimated_ranking_time,
      expert_required: gap.expert_required,
      regulatory_compliance: gap.regulatory_compliance,
      quick_win: gap.quick_win,
      authority_builder: gap.authority_builder
    }));

    const categoryInstruction = this.selectedCategory
      ? `\n\n⚠️ CRITICAL: Generate ALL ${topicCount} topics EXCLUSIVELY from the "${this.selectedCategory}" category. DO NOT include topics from other categories like tax_planning, mutual_funds, stock_market, etc. ONLY focus on "${this.selectedCategory}" content gaps provided in the research data.`
      : '';

    return `You are an Expert Content Strategist for Indian Broking and WealthTech. Generate ${topicCount} HIGH-QUALITY, STRATEGIC content topics directly from the approved research gaps below.${categoryInstruction}

🎯 QUALITY REQUIREMENTS (CRITICAL):
- Each topic MUST directly map to a specific research gap from the provided data
- topic_title MUST be compelling, specific, and SEO-optimized (50-60 chars max)
- Use the gap_title and primary_keyword from research gaps as the foundation, but enhance them
- Topics should be ACTIONABLE and SPECIFIC - avoid generic titles like "Investment Guide" or "Wealth Management Tips"
- Include year (${currentYear}) when relevant for time-sensitive content
- Use power words: "Complete", "Ultimate", "Step-by-Step", "Comprehensive", "Best", "Top"
- Ensure topics address the competitor_weakness and leverage our_competitive_edge from research gaps

RESEARCH CONTEXT (APPROVED GAPS):
${JSON.stringify({ approved_gaps: gapsContext }, null, 2)}

📊 SELECTION STRATEGY:
1. QUICK WINS (${this.topicStrategy.quickWins} topics): Low difficulty (<35), decent volume (>3000), can rank in 30-60 days
2. AUTHORITY BUILDERS (${this.topicStrategy.authorityBuilders} topics): High volume (>8000), build topical clusters, 3-6 month ranking
3. COMPETITIVE STRIKES (${this.topicStrategy.competitiveStrikes} topics): Target specific competitor weaknesses, steal their traffic

📝 TOPIC GENERATION REQUIREMENTS:

For EACH of the ${topicCount} topics, you MUST:

1. **research_gap_id**: MUST link to a specific gap from the research data above (e.g., "GAP-001")
2. **topic_title**:
   - Base it on the gap_title from the research gap, but make it MORE compelling
   - Format: "[Primary Keyword] [Year]: [Value Proposition]" or "[Action] [Primary Keyword] [Year]"
   - Examples: "Index Funds vs Mutual Funds ${currentYear}: Complete Comparison Guide", "Best ELSS Funds ${currentYear}: Top Tax-Saving Equity Schemes"
   - AVOID generic titles like "Wealth Management Guide" or "Investment Strategies"
   - MUST include the primary_keyword naturally in the title
3. **primary_keyword**: Use EXACTLY the primary_keyword from the research gap (don't modify it)
4. **category**: Use the topic_area from the research gap (mutual_funds, tax_planning, stock_market, etc.)
5. **content_type**: Use the content_type_recommendation from the research gap (blog, ymyl, listicle, news)
6. **secondary_keywords**: Use the secondary_keywords from the research gap, add 1-2 related terms
7. **search_volume**: Use the search_volume from the research gap
8. **keyword_difficulty**: Use the keyword_difficulty from the research gap
9. **priority**: Calculate based on search_volume (>8000=High, 3000-8000=Medium, <3000=Low) and keyword_difficulty (<30=High, 30-50=Medium, >50=Low)
10. **topic_type**: Use quick_win/authority_builder flags from research gap, or infer from difficulty/volume
11. **target_competitor**: Extract from competitor_weakness field in research gap
12. **our_competitive_advantage**: Use the our_competitive_edge from research gap, make it specific and actionable
13. **word_count_target**: Use the word_count_target from research gap
14. **expert_required**: Use the expert_required from research gap
15. **estimated_ranking_time**: Use the estimated_ranking_time from research gap
16. **estimated_monthly_traffic**: Calculate as 60-70% of search_volume (realistic ranking expectation)
17. **internal_linking_opportunities**: Generate 3-5 related topic slugs based on category and primary_keyword
18. **content_upgrade_idea**: Create specific, actionable lead magnet (calculator, checklist, template, PDF guide)
19. **regulatory_requirements**: Use the regulatory_compliance from research gap

CONTENT TYPE DISTRIBUTION (TARGET):
- Blog posts: ${this.contentTypeDistribution.blog} topics (educational, how-to guides)
- YMYL guides: ${this.contentTypeDistribution.ymyl} topics (investment advice, financial planning)
- Listicles: ${this.contentTypeDistribution.listicle} topics (Top X, best of lists)
- News articles: ${this.contentTypeDistribution.news} topics (regulatory updates, market news)

OUTPUT FORMAT:
- Return a JSON object with a single key "topics" containing the array of topic objects.
- No markdown, no comments, no explanations.
- topic_id will be auto-generated, so you can omit it or use placeholder "TOPIC-YYYYMMDD-XXX"

EXAMPLE (High Quality):
{
  "topics": [
    {
      "research_gap_id": "GAP-001",
      "content_type": "ymyl",
      "topic_title": "Index Funds vs Mutual Funds ${currentYear}: Complete Comparison Guide for Indian Investors",
      "category": "mutual_funds",
      "primary_keyword": "index funds vs mutual funds",
      "secondary_keywords": "best index funds ${currentYear},index fund calculator,passive investing india,index fund returns ${currentYear}",
      "search_volume": 12000,
      "keyword_difficulty": 28,
      "priority": "High",
      "topic_type": "authority_builder",
      "target_competitor": "Groww",
      "our_competitive_advantage": "Include ${currentYear} expense ratio data, interactive calculator, video comparisons, expert CFA quotes",
      "word_count_target": 2500,
      "expert_required": "true",
      "estimated_ranking_time": 60,
      "estimated_monthly_traffic": 8400,
      "internal_linking_opportunities": "passive-investing-guide,sip-calculator,mutual-fund-taxation,index-fund-basics",
      "content_upgrade_idea": "Interactive Index Fund vs Mutual Fund Calculator with expense ratio comparison",
      "regulatory_requirements": "SEBI disclaimer,Risk warning,Past performance disclaimer",
      "approval_status": "Pending"
    }
  ]
}

❌ BAD TOPIC TITLE EXAMPLES (DO NOT GENERATE):
- "Investment Guide" (too generic)
- "Wealth Management Tips" (not specific)
- "Financial Planning" (no value proposition)
- "Stock Market Analysis" (too broad)

✅ GOOD TOPIC TITLE EXAMPLES:
- "Best ELSS Funds ${currentYear}: Top Tax-Saving Equity Schemes for Indian Investors"
- "Nifty Options Strategies: Complete Guide for Beginners in ${currentYear}"
- "Section 80C Deductions ${currentYear}: Step-by-Step Guide to Maximize Tax Savings"
- "Bank Nifty Weekly Options Trading: Tuesday Expiry Strategy Guide ${currentYear}"

CRITICAL RULES:
- Generate exactly ${topicCount} topics (no more, no less)
- Each topic MUST map to a unique research gap (don't duplicate gap_ids)
- Use data DIRECTLY from research gaps - don't invent new keywords or volumes
- topic_title MUST be compelling, specific, and include the primary_keyword
- Return ONLY the JSON object - no markdown, no explanations, no comments
- Validate JSON structure before returning`;
  }

  /**
   * Validate and enhance generated topics
   */
  validateAndEnhanceTopics(topics, approvedGaps) {
    // Create a map of research gaps for quick lookup
    const gapMap = new Map();
    approvedGaps.forEach(gap => {
      gapMap.set(gap.gap_id, gap);
    });

    const enhancedTopics = topics.map((topic, index) => {
      // Note: topic_id will be auto-generated by csvManager.saveGeneratedTopics()
      // Remove any existing topic_id to ensure incremental generation
      delete topic.topic_id;

      // Validate required fields
      const required = ['topic_title', 'content_type', 'category', 'primary_keyword', 'research_gap_id'];
      required.forEach(field => {
        if (!topic[field]) {
          throw new Error(`Topic ${index + 1} missing required field: ${field}`);
        }
      });

      // Validate that research_gap_id exists in approved gaps
      if (topic.research_gap_id && topic.research_gap_id !== 'CUSTOM-GAP') {
        const linkedGap = gapMap.get(topic.research_gap_id);
        if (!linkedGap) {
          console.warn(`⚠️  Topic ${index + 1} references non-existent research_gap_id: ${topic.research_gap_id}`);
        } else {
          // Enhance topic with data from research gap if missing
          if (!topic.search_volume && linkedGap.search_volume) {
            topic.search_volume = linkedGap.search_volume;
          }
          if (!topic.keyword_difficulty && linkedGap.keyword_difficulty) {
            topic.keyword_difficulty = linkedGap.keyword_difficulty;
          }
          if (!topic.word_count_target && linkedGap.word_count_target) {
            topic.word_count_target = linkedGap.word_count_target;
          }
          if (!topic.estimated_ranking_time && linkedGap.estimated_ranking_time) {
            topic.estimated_ranking_time = linkedGap.estimated_ranking_time;
          }
        }
      }

      // Validate topic_title quality
      if (topic.topic_title) {
        const title = topic.topic_title.toLowerCase();
        // Check for generic/low-quality patterns
        const genericPatterns = [
          /^(investment|financial|wealth|money|guide|tips|strategies)$/,
          /^(complete|ultimate|best|top)\s+(guide|tips|strategies)$/,
          /^.*\s+(guide|tips|strategies)\s*$/
        ];

        const isTooGeneric = genericPatterns.some(pattern => pattern.test(title)) &&
                            topic.topic_title.length < 40;

        if (isTooGeneric) {
          console.warn(`⚠️  Topic ${index + 1} has generic title: "${topic.topic_title}" - Consider making it more specific`);
        }

        // Ensure primary_keyword is in title (case-insensitive)
        if (topic.primary_keyword) {
          const keywordLower = topic.primary_keyword.toLowerCase();
          const titleLower = topic.topic_title.toLowerCase();
          if (!titleLower.includes(keywordLower)) {
            console.warn(`⚠️  Topic ${index + 1} title doesn't include primary_keyword: "${topic.topic_title}" vs "${topic.primary_keyword}"`);
          }
        }
      }

      // Ensure secondary_keywords is a string
      if (Array.isArray(topic.secondary_keywords)) {
        topic.secondary_keywords = topic.secondary_keywords.join(',');
      }

      // Ensure internal_linking_opportunities is a string
      if (Array.isArray(topic.internal_linking_opportunities)) {
        topic.internal_linking_opportunities = topic.internal_linking_opportunities.join(',');
      }

      // Ensure regulatory_requirements is a string
      if (Array.isArray(topic.regulatory_requirements)) {
        topic.regulatory_requirements = topic.regulatory_requirements.join(',');
      }

      // Set default values (approval_status and created_at will be set by csvManager)
      topic.approval_status = topic.approval_status || 'Pending';

      return topic;
    });

    // Validate topic distribution
    this.validateTopicDistribution(enhancedTopics);

    // Log quality metrics
    console.log('\n📊 TOPIC QUALITY METRICS:');
    const titlesWithKeyword = enhancedTopics.filter(t => {
      const titleLower = (t.topic_title || '').toLowerCase();
      const keywordLower = (t.primary_keyword || '').toLowerCase();
      return titleLower.includes(keywordLower);
    }).length;
    console.log(`   ✅ Titles with primary_keyword: ${titlesWithKeyword}/${enhancedTopics.length}`);

    const avgTitleLength = Math.round(
      enhancedTopics.reduce((sum, t) => sum + (t.topic_title || '').length, 0) / enhancedTopics.length
    );
    console.log(`   📏 Average title length: ${avgTitleLength} chars (target: 50-60)`);

    const specificTitles = enhancedTopics.filter(t => {
      const title = (t.topic_title || '').toLowerCase();
      return title.length >= 40 &&
             !/^(investment|financial|wealth|money|guide|tips|strategies)$/.test(title);
    }).length;
    console.log(`   ✅ Specific titles (not generic): ${specificTitles}/${enhancedTopics.length}`);

    return enhancedTopics;
  }

  /**
   * Validate topic type and content type distribution
   */
  validateTopicDistribution(topics) {
    const topicTypes = {
      quick_win: topics.filter(t => t.topic_type === 'quick_win').length,
      authority_builder: topics.filter(t => t.topic_type === 'authority_builder').length,
      competitive_strike: topics.filter(t => t.topic_type === 'competitive_strike').length
    };

    const contentTypes = {
      blog: topics.filter(t => t.content_type === 'blog').length,
      ymyl: topics.filter(t => t.content_type === 'ymyl').length,
      listicle: topics.filter(t => t.content_type === 'listicle').length,
      news: topics.filter(t => t.content_type === 'news').length
    };

    console.log('\n📊 TOPIC DISTRIBUTION VALIDATION:');
    console.log(`   Quick Wins: ${topicTypes.quick_win} (target: ${this.topicStrategy.quickWins})`);
    console.log(`   Authority Builders: ${topicTypes.authority_builder} (target: ${this.topicStrategy.authorityBuilders})`);
    console.log(`   Competitive Strikes: ${topicTypes.competitive_strike} (target: ${this.topicStrategy.competitiveStrikes})`);

    console.log('\n📝 CONTENT TYPE DISTRIBUTION:');
    console.log(`   Blog Posts: ${contentTypes.blog} (target: ${this.contentTypeDistribution.blog})`);
    console.log(`   YMYL Guides: ${contentTypes.ymyl} (target: ${this.contentTypeDistribution.ymyl})`);
    console.log(`   Listicles: ${contentTypes.listicle} (target: ${this.contentTypeDistribution.listicle})`);
    console.log(`   News Articles: ${contentTypes.news} (target: ${this.contentTypeDistribution.news})`);
  }

  /**
   * Generate topic summary report
   */
  generateTopicSummary(topics) {
    console.log('\n📊 TOPIC GENERATION SUMMARY');
    console.log('='.repeat(50));
    console.log(`📝 Total Topics Generated: ${topics.length}`);

    // Priority breakdown
    const priorities = {
      High: topics.filter(t => t.priority === 'High').length,
      Medium: topics.filter(t => t.priority === 'Medium').length,
      Low: topics.filter(t => t.priority === 'Low').length
    };

    console.log('\n⭐ PRIORITY BREAKDOWN:');
    Object.entries(priorities).forEach(([priority, count]) => {
      console.log(`   ${priority} Priority: ${count} topics`);
    });

    // Category breakdown
    const categories = {};
    topics.forEach(topic => {
      categories[topic.category] = (categories[topic.category] || 0) + 1;
    });

    console.log('\n📋 CATEGORY BREAKDOWN:');
    Object.entries(categories).forEach(([category, count]) => {
      console.log(`   ${category.replace('_', ' ').toUpperCase()}: ${count} topics`);
    });

    // Traffic potential
    const totalTrafficPotential = topics.reduce((sum, topic) =>
      sum + (parseInt(topic.estimated_monthly_traffic) || 0), 0
    );

    console.log('\n📈 TRAFFIC POTENTIAL:');
    console.log(`   Total Estimated Monthly Traffic: ${totalTrafficPotential.toLocaleString()} visits`);
    console.log(`   Average per Topic: ${Math.round(totalTrafficPotential / topics.length).toLocaleString()} visits`);

    // Quick stats
    const expertRequired = topics.filter(t => t.expert_required === 'true').length;
    const avgWordCount = Math.round(topics.reduce((sum, t) => sum + parseInt(t.word_count_target), 0) / topics.length);
    const avgRankingTime = Math.round(topics.reduce((sum, t) => sum + parseInt(t.estimated_ranking_time), 0) / topics.length);

    console.log('\n📊 CONTENT REQUIREMENTS:');
    console.log(`   Expert Review Required: ${expertRequired} topics`);
    console.log(`   Average Word Count: ${avgWordCount} words`);
    console.log(`   Average Ranking Time: ${avgRankingTime} days`);

    console.log('\n✅ Next Steps:');
    console.log('   1. Review generated-topics.csv file');
    console.log('   2. Approve promising topics (set approval_status = "Yes")');
    console.log('   3. Run deep research: node deep-topic-researcher.js');
    console.log('='.repeat(50) + '\n');
  }

  /**
   * Get topics that need approval
   */
  getPendingApprovals() {
    const topics = this.csvManager.readCSV(this.csvManager.files.generatedTopics);
    return topics.filter(topic => topic.approval_status === 'Pending');
  }

  /**
   * Approve specific topics
   */
  approveTopics(topicIds) {
    let approvedCount = 0;

    topicIds.forEach(topicId => {
      const success = this.csvManager.updateApprovalStatus('generatedTopics', 'topic_id', topicId, 'Yes');
      if (success) approvedCount++;
    });

    console.log(`✅ Approved ${approvedCount} topics`);
    return approvedCount;
  }

  /**
   * Auto-approve high-priority topics
   */
  autoApproveAll() {
    const topics = this.csvManager.readCSV(this.csvManager.files.generatedTopics);
    const topicIds = topics.filter(topic => topic.approval_status !== 'Yes').map(topic => topic.topic_id);
    topicIds.forEach(id => {
      this.csvManager.updateApprovalStatus('generatedTopics', 'topic_id', id, 'Yes');
    });
    if (topicIds.length > 0) {
      console.log(`🤖 Auto-approved ${topicIds.length} topics`);
    } else {
      console.log('🤖 All topics already approved');
    }
    return topicIds.length;
  }

  autoApproveHighPriority() {
    const topics = this.csvManager.readCSV(this.csvManager.files.generatedTopics);
    const highPriorityTopics = topics.filter(topic =>
      topic.approval_status === 'Pending' &&
      topic.priority === 'High'
    );

    const topicIds = highPriorityTopics.map(topic => topic.topic_id);
    return this.approveTopics(topicIds);
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = TopicGenerator;

// CLI usage
if (require.main === module) {
  const command = process.argv[2];
  const generator = new TopicGenerator();

  switch (command) {
    case 'generate':
      generator.generateTopics()
        .then(() => {
          console.log('🎉 Topic generation completed successfully!');
          process.exit(0);
        })
        .catch((error) => {
          console.error('❌ Topic generation failed:', error.message);
          process.exit(1);
        });
      break;

    case 'approve-high':
      const approved = generator.autoApproveHighPriority();
      console.log(`✅ Auto-approved ${approved} high-priority topics`);
      break;

    case 'pending':
      const pending = generator.getPendingApprovals();
      console.log(`📋 ${pending.length} topics pending approval`);
      pending.forEach(topic => {
        console.log(`   ${topic.topic_id}: ${topic.topic_title} (${topic.priority})`);
      });
      break;

    default:
      console.log('Usage: node topic-generator.js [generate|approve-high|pending]');
      console.log('');
      console.log('Commands:');
      console.log('  generate     - Generate 50 strategic topics from approved research gaps');
      console.log('  approve-high - Auto-approve high-priority topics');
      console.log('  pending      - Show topics pending approval');
  }
}
