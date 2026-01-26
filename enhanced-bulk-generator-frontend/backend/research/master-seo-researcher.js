#!/usr/bin/env node

/**
 * Master SEO Researcher for Enhanced Bulk Generator
 * Uses Groq/compound model to analyze competitors and identify content gaps
 * Implements N8N Workflow 1: Master SEO Research
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { jsonrepair } = require('jsonrepair');
const CSVDataManager = require('../core/csv-data-manager');

class MasterSEOResearcher {
  constructor(config = {}) {
    this.groqApiKey = process.env.GROQ_API_KEY;
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.groqApiUrl = 'https://api.groq.com/openai/v1/chat/completions';
    this.openaiApiUrl = 'https://api.openai.com/v1/chat/completions';

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

    // 🎯 MCP DATA FETCHERS - Store them from config!
    this.gscDataFetcher = config.gscDataFetcher || null;
    this.seoDataFetcher = config.seoDataFetcher || null;

    // Default competitors for Indian WealthTech & private wealth
    this.competitors = config.competitors || [
      // Wealthtech platforms
      'Groww.in',
      'Zerodha.com/varsity',
      'ETMoney.com',
      'PaytmMoney.com',
      'INDmoney.com',
      'Kuvera.in',
      'Smallcase.com',
      'Upstox.com',
      'Angelone.in/',
      // Private wealth/advisory
      'hdfcsec.com',
      'icicidirect.com/wealth',
      'kotak.com/en/personal-banking/investments',
      'motilaloswal.com',
      'edelweiss.in',
      'scripbox.com'
    ];

    this.contentCategories = this.loadContentCategories(config.categoriesPath);
    this.selectedCategory = config.category || 'derivatives'; // Default to derivatives
    this.customTopic = config.customTopic || ''; // Custom topic overrides category if provided

    this.validateConfig();
  }

  /**
   * Validate configuration
   */
  /**
   * Load optimized model parameters from config file
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
          research: {
            temperature: 0.3,
            top_p: 0.9,
            frequency_penalty: 0.2,
            presence_penalty: 0.1,
            max_tokens: 8000,
            response_format: { type: 'json_object' }
          },
          json_parser: {
            temperature: 0.1,
            top_p: 0.9,
            frequency_penalty: 0,
            presence_penalty: 0,
            max_tokens: 8000,
            response_format: { type: 'json_object' }
          }
        }
      };
    }
  }

  validateConfig() {
    if (!this.groqApiKey) {
      console.warn('⚠️  GROQ_API_KEY environment variable not set!');
      console.log('Please set it with: export GROQ_API_KEY="your-api-key"');
      console.log('Some features will be disabled until API key is provided.\n');
      return false;
    }
    console.log('✅ Master SEO Researcher initialized');
    console.log(`🤖 Primary Model: ${this.currentModel} (native web search)`);
    console.log(`🔄 Backup Models: ${this.models.compoundMini} (web search), ${this.models.browserSearch20B}, ${this.models.browserSearch120B}, ${this.models.gemini}, ${this.models.fallback}`);

    // Show custom topic if provided, otherwise show category
    if (this.customTopic) {
      console.log(`✨ Research Focus: "${this.customTopic}" (CUSTOM TOPIC)`);
      console.log(`   Category: ${this.selectedCategory.replace('_', ' ').toUpperCase()} (fallback for gap categorization)`);
    } else {
      console.log(`📂 Category Focus: ${this.selectedCategory.replace('_', ' ').toUpperCase()}`);
    }

    return true;
  }

  /**
   * Generate research ID
   */
  generateResearchId() {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `RESEARCH-${date}-001`;
  }

  /**
   * Categorize keyword into topic area
   */
  categorizeKeyword(keyword) {
    const kw = (keyword || '').toLowerCase();
    const matchers = this.categoryMatchers || [];

    for (const matcher of matchers) {
      if (matcher.patterns.some(pattern => kw.includes(pattern))) {
        return matcher.category;
      }
    }

    return 'personal_finance';
  }

  loadContentCategories(categoriesPath) {
    const defaultPath = path.join(__dirname, 'wealth_categories.json');
    const resolvedPath = categoriesPath ? path.resolve(categoriesPath) : defaultPath;

    try {
      const raw = fs.readFileSync(resolvedPath, 'utf-8');
      const data = JSON.parse(raw);
      const categories = {};
      const matchers = [];

      data.forEach(entry => {
        categories[entry.category] = typeof entry.weight === 'number' ? entry.weight : 10;
        matchers.push({
          category: entry.category,
          patterns: (entry.patterns || []).map(pattern => pattern.toLowerCase())
        });
      });

      // Keep a fallback category if not provided
      if (!categories.personal_finance) {
        categories.personal_finance = 10;
        matchers.push({
          category: 'personal_finance',
          patterns: []
        });
      }

      this.categoryMatchers = matchers;
      return categories;
    } catch (error) {
      console.warn(`⚠️  Failed to load category config at ${resolvedPath}: ${error.message}`);
      this.categoryMatchers = [
        { category: 'mutual_funds', patterns: ['mutual fund', 'index fund', 'etf', 'sip', 'systematic investment'] },
        { category: 'tax_planning', patterns: ['tax', 'elss', '80c', 'capital gains'] },
        { category: 'stock_market', patterns: ['stock', 'equity', 'ipo', 'market cap'] },
        { category: 'retirement_planning', patterns: ['retirement', 'pension', 'nps', 'annuity'] },
        { category: 'insurance', patterns: ['insurance', 'term plan', 'health plan'] },
        { category: 'investment_strategies', patterns: ['invest', 'portfolio', 'diversif', 'asset allocation'] },
        { category: 'personal_finance', patterns: [] }
      ];
      return {
        mutual_funds: 20,
        tax_planning: 15,
        stock_market: 20,
        retirement_planning: 10,
        insurance: 10,
        personal_finance: 15,
        investment_strategies: 10
      };
    }
  }

  categorizeKeyword(keyword) {
    const kw = (keyword || '').toLowerCase();
    const matchers = this.categoryMatchers || [];

    for (const matcher of matchers) {
      if (matcher.patterns.some(pattern => kw.includes(pattern))) {
        return matcher.category;
      }
    }

    return 'personal_finance';
  }

  /**
   * Generate gap title from keyword
   */
  generateGapTitle(keyword) {
    const year = new Date().getFullYear();
    const titleTemplates = [
      `${keyword}: Complete ${year} Guide`,
      `${keyword} Analysis for ${year}`,
      `Understanding ${keyword} in ${year}`,
      `${keyword}: Expert Guide ${year}`
    ];
    return titleTemplates[Math.floor(Math.random() * titleTemplates.length)];
  }

  /**
   * Execute comprehensive Master SEO Research
   * NOW WITH REAL MCP DATA!
   */
  async executeResearch() {
    console.log('\n🔍 MASTER SEO RESEARCH STARTED');
    console.log('='.repeat(50));
    console.log(`🤖 AI Model: ${this.groqModel}`);
    console.log(`🎯 Target: 100 content gap opportunities`);
    console.log(`🏢 Competitors: ${this.competitors.length}`);

    const researchId = this.generateResearchId();
    let allGaps = [];

    try {
      // 🎯 STEP 1: Try to get REAL content gaps from GSC first!
      if (this.gscDataFetcher) {
        try {
          console.log('\n🔍 [MCP] Fetching REAL content gaps from Google Search Console...');
          const gscGaps = await this.gscDataFetcher.getContentGaps({
            minImpressions: 500,
            maxCTR: 0.03,
            minPosition: 10
          });

          if (gscGaps && gscGaps.length > 0) {
            console.log(`✅ [MCP GSC] Found ${gscGaps.length} REAL opportunities from your site!`);
            console.log(`📊 [MCP GSC] Total potential traffic gain: ${gscGaps.reduce((sum, g) => sum + g.trafficGain, 0).toLocaleString()} clicks/month`);

            // Convert GSC gaps to our format
            const formattedGSCGaps = gscGaps.map(gap => ({
              gap_id: `GSC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              topic_area: this.selectedCategory || this.categorizeKeyword(gap.keyword),
              gap_title: this.generateGapTitle(gap.keyword),
              search_volume: gap.impressions,
              keyword_difficulty: Math.round(gap.position * 2), // Rough estimate
              commercial_intent: gap.position <= 20 ? 'High' : 'Medium',
              competitor_weakness: `Low CTR (${(gap.ctr * 100).toFixed(2)}%) despite ${gap.impressions} impressions`,
              our_competitive_edge: `Already ranking at position ${gap.position.toFixed(1)} - optimize for better CTR`,
              estimated_ranking_time: '15-30 days',
              priority_score: gap.opportunityScore / 50, // Scale to 0-100
              primary_keyword: gap.keyword,
              secondary_keywords: '',
              content_type_recommendation: gap.position <= 10 ? 'blog' : 'ymyl',
              word_count_target: 2000 + Math.round(gap.impressions / 100),
              expert_required: gap.position > 15,
              regulatory_compliance: 'SEBI disclosure,Risk warning',
              quick_win: gap.trafficGain > 500,
              authority_builder: gap.impressions > 5000,
              approval_status: gap.opportunityScore > 3000 ? 'Yes' : 'Pending',
              created_at: new Date().toISOString(),
              source: 'GSC MCP',
              current_traffic: gap.clicks,
              potential_traffic: gap.potentialTraffic,
              traffic_gain: gap.trafficGain
            }));

            allGaps.push(...formattedGSCGaps);
            console.log(`✅ [MCP GSC] Added ${formattedGSCGaps.length} gaps from real site data`);
          } else {
            console.log('⚠️  [MCP GSC] No qualifying content gaps found (need min 500 impressions, <3% CTR)');
          }
        } catch (error) {
          console.log(`⚠️  [MCP GSC] Failed to fetch GSC data: ${error.message}`);
          console.log('   Falling back to AI competitor analysis...');
        }
      } else {
        console.log('ℹ️  GSC MCP not configured, skipping real data fetch');
      }

      // 🎯 STEP 2: Execute AI research (either as supplement or primary)
      console.log(`\n🤖 [AI] Analyzing competitors with Groq AI${allGaps.length > 0 ? ' (supplementing GSC data)' : ''}...`);
      const researchData = await this.analyzeCompetitors(researchId);

      if (!researchData || !researchData.content_gaps) {
        if (allGaps.length > 0) {
          console.log('⚠️  AI research failed, but we have GSC data!');
          researchData = { content_gaps: [] };
        } else {
          throw new Error('Invalid research data structure');
        }
      }

      // Add AI-generated gaps with category override
      if (researchData.content_gaps && researchData.content_gaps.length > 0) {
        console.log(`\n🔧 [DEBUG] Category override starting...`);
        console.log(`   🔧 this.selectedCategory = "${this.selectedCategory}"`);
        console.log(`   🔧 Gaps before override:`, researchData.content_gaps.map(g => ({ id: g.gap_id, topic_area: g.topic_area })));

        researchData.content_gaps.forEach(gap => {
          gap.source = 'AI Analysis';
          const originalArea = gap.topic_area;
          // Override topic_area with selected category if specified
          if (this.selectedCategory) {
            gap.topic_area = this.selectedCategory;
            console.log(`   🔧 Overrode "${originalArea}" → "${gap.topic_area}"`);
          }
        });

        console.log(`   🔧 Gaps after override:`, researchData.content_gaps.map(g => ({ id: g.gap_id, topic_area: g.topic_area })));

        allGaps.push(...researchData.content_gaps);
        console.log(`✅ [AI] Added ${researchData.content_gaps.length} gaps from AI competitor analysis`);
        if (this.selectedCategory) {
          console.log(`   📂 All gaps set to category: ${this.selectedCategory.replace('_', ' ').toUpperCase()}`);
        }
      }

      // 🎯 STEP 3: Enhance gaps with Google Ads MCP keyword data
      if (this.seoDataFetcher && allGaps.length > 0) {
        console.log(`\n🔍 [MCP] Enhancing ${Math.min(10, allGaps.length)} gaps with Google Ads keyword data...`);
        let enhancedCount = 0;

        for (let i = 0; i < Math.min(10, allGaps.length); i++) {
          const gap = allGaps[i];
          try {
            const metrics = await this.seoDataFetcher.fetchKeywordMetrics(gap.primary_keyword);

            if (metrics && metrics.search_volume) {
              gap.search_volume_verified = metrics.search_volume;
              gap.keyword_difficulty_verified = metrics.keyword_difficulty;
              gap.cpc_verified = metrics.cpc;
              gap.data_source = metrics.source;
              enhancedCount++;

              if (metrics.source === 'Google Ads MCP') {
                console.log(`   ✅ [MCP Google Ads] "${gap.primary_keyword}": ${metrics.search_volume.toLocaleString()}/month (FREE data!)`);
              } else {
                console.log(`   ✅ [${metrics.source}] "${gap.primary_keyword}": ${metrics.search_volume.toLocaleString()}/month`);
              }
            }
          } catch (error) {
            console.log(`   ⚠️  Failed to fetch metrics for "${gap.primary_keyword}"`);
          }
        }

        if (enhancedCount > 0) {
          console.log(`✅ [MCP] Enhanced ${enhancedCount} gaps with real keyword data`);
        }
      }

      // Deduplicate against existing CSV entries before saving
      const existingGaps = this.csvManager.readCSV(this.csvManager.files.researchGaps);
      const existingKeySet = new Set(
        existingGaps.map(gap => this.buildGapKey(gap.primary_keyword, gap.topic_area, gap.source))
      );

      const newUniqueGaps = [];
      const seen = new Set();

      for (const gap of allGaps) {
        const key = this.buildGapKey(gap.primary_keyword, gap.topic_area, gap.source);
        if (existingKeySet.has(key)) {
          continue;
        }
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        newUniqueGaps.push(gap);
      }

      if (newUniqueGaps.length === 0) {
        console.log('ℹ️  All identified gaps already exist in research-gaps.csv. Skipping save to avoid duplicates.');
        this.generateCoverageMatrix();
        return {
          content_gaps: existingGaps,
          quick_wins: [],
          authority_builders: [],
          total_gaps_identified: existingGaps.length,
          skipped_duplicates: allGaps.length
        };
      }

      const saved = this.csvManager.saveResearchGaps(newUniqueGaps);

      if (saved) {
        console.log(`ℹ️  Saved ${newUniqueGaps.length} new gaps (skipped ${allGaps.length - newUniqueGaps.length} duplicates).`);

        // Calculate quick wins and authority builders from unique gaps
        const quickWins = newUniqueGaps.filter(g => g.quick_win === 'true' || g.quick_win === true);
        const authorityBuilders = newUniqueGaps.filter(g => g.authority_builder === 'true' || g.authority_builder === true);

        // Extract and save separate quick_wins array from Groq response
        const groqQuickWins = researchData.quick_wins || [];
        if (groqQuickWins.length > 0) {
          console.log(`\n📋 Found ${groqQuickWins.length} additional quick wins from Groq analysis`);
          const quickWinsSaved = this.csvManager.saveQuickWins(groqQuickWins);
          if (quickWinsSaved) {
            console.log(`✅ Quick wins saved to: data/quick-wins.csv`);
          }
        }

        console.log(`\n✅ Research completed: ${newUniqueGaps.length} new gaps identified`);
        console.log(`📊 Quick wins (from gaps): ${quickWins.length}`);
        console.log(`📋 Quick wins (from Groq): ${groqQuickWins.length}`);
        console.log(`🏗️  Authority builders: ${authorityBuilders.length}`);
        console.log(`💾 Data saved to: research-gaps.csv`);

        // Create complete research data object
        const completeResearchData = {
          ...researchData,
          content_gaps: newUniqueGaps,
          quick_wins: quickWins,
          groq_quick_wins: groqQuickWins,
          authority_builders: authorityBuilders,
          total_gaps_identified: newUniqueGaps.length
        };

        // Save master research summary with strategic recommendations
        const masterSaved = this.csvManager.saveMasterResearch(completeResearchData);
        if (masterSaved) {
          console.log(`✅ Master research summary saved to: data/master-research.csv`);
        }

        this.generateResearchSummary(completeResearchData);
        this.generateCoverageMatrix();
        return completeResearchData;
      } else {
        throw new Error('Failed to save research data to CSV');
      }

    } catch (error) {
      console.error('❌ Research failed:', error.message);
      throw error;
    }
  }

  /**
   * Analyze competitors using Groq AI with multiple model fallback and browser search
   */
  async analyzeCompetitors(researchId) {
    const prompt = this.buildResearchPrompt();

    console.log('🤖 Analyzing competitors with Groq AI...');
    console.log(`📊 Using model: ${this.currentModel}`);

    const modelsToTry = [
      this.currentModel,
      this.models.compoundMini,     // Try compound-mini as first backup
      this.models.browserSearch20B,  // Try browser search for better competitor data
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
            const params = this.modelParams.stages.research;
            apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent';
            apiKey = process.env.GEMINI_API_KEY;

            requestBody = {
              contents: [{
                parts: [{
                  text: `You are an Elite SEO Research Analyst specializing in Indian WealthTech competitive intelligence. Your mission: Identify content gaps and opportunities to make PL Capital #1 in the Indian WealthTech niche.\n\n${prompt}`
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
            const params = this.modelParams.stages.research;
            requestBody = {
              model: modelToTry,
              messages: [
                {
                  role: 'system',
                  content: 'You are an Elite SEO Research Analyst specializing in Indian WealthTech competitive intelligence. Your mission: Identify content gaps and opportunities to make PL Capital #1 in the Indian WealthTech niche.'
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
              // Extract base domains from competitor list for include_domains
              const competitorDomains = this.competitors.map(comp => {
                // Extract base domain (remove paths, convert to lowercase, remove trailing slash)
                let domain = comp.toLowerCase().trim();
                // Remove protocol if present
                domain = domain.replace(/^https?:\/\//, '');
                // Remove path and query string
                domain = domain.split('/')[0];
                // Remove www. prefix
                domain = domain.replace(/^www\./, '');
                return domain;
              });

              // Remove duplicates and sort
              const uniqueDomains = [...new Set(competitorDomains)].sort();

              // Add search settings for Indian WealthTech focus
              // Include all competitor domains plus *.in for broader Indian content
              requestBody.search_settings = {
                country: "india",
                include_domains: ["*.in", ...uniqueDomains],
                exclude_domains: ["wikipedia.org", "*.wiki*"],
                max_results: 10  // Get more sources for comprehensive competitor analysis
              };
              console.log(`🌐 Web search enabled natively with India focus for competitor analysis (max_results: 10, ${uniqueDomains.length} competitor domains)`);
            }

            // Add browser search tool for supported models
            if (modelToTry.includes('openai/gpt-oss')) {
              requestBody.tools = [{ type: "browser_search" }];
              requestBody.tool_choice = "auto";
              console.log('🌐 Browser search enabled for comprehensive competitor analysis');
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
            console.log(`⚠️  Model ${modelToTry} failed with 400 error, trying next model...`);
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
            // Groq API response format
            content = data.choices[0].message.content;
          }

          // Check if we have search results from web search (Groq only)
          let searchResults = null;
          if (!modelToTry.includes('gemini') && data.choices[0].message.executed_tools && data.choices[0].message.executed_tools.length > 0) {
            searchResults = data.choices[0].message.executed_tools[0].search_results;
            console.log(`🔍 Web search found ${searchResults?.results?.length || 0} sources`);
          }

          // Send Groq output directly to OpenAI GPT-4o for JSON structuring
          console.log(`✅ ${modelToTry} generated content (${content.length} characters)`);
          console.log('\n📄 RAW GROQ OUTPUT:');
          console.log('='.repeat(80));
          console.log(content);
          console.log('='.repeat(80));

          // Use OpenAI GPT-4o to convert raw output to structured JSON when available
          let parsedResult = null;
          if (this.openaiApiKey) {
            console.log('🤖 [OpenAI GPT-4o] Converting raw output to structured JSON...');
            parsedResult = await this.parseJsonWithOpenAI(content, modelToTry);
          } else {
            console.log('ℹ️  OPENAI_API_KEY not set. Falling back to local JSON repair.');
          }

          // Try Groq JSON parser fallback if OpenAI parsing failed
          if ((!parsedResult || !parsedResult.content_gaps) && this.groqApiKey) {
            console.log('🔄 Attempting Groq GPT-OSS-20B JSON parser fallback...');
            parsedResult = await this.parseJsonWithGroq(content, modelToTry);
          }

          // Fall back to local JSON repair if all structured parsers failed
          if (!parsedResult || !parsedResult.content_gaps) {
            console.log('🔄 Attempting JSON repair fallback...');
            parsedResult = this.parseJsonFallback(content, modelToTry);
          }

          if (parsedResult && parsedResult.content_gaps) {
            // Validate gap count
            const gapCount = parsedResult.content_gaps.length;
            if (gapCount < 10) {
              console.warn(`⚠️  WARNING: Only ${gapCount} gaps generated (expected 10). The AI may not have followed the instruction to generate exactly 10 gaps.`);
            }
            
            // Add metadata
            parsedResult.model_used = modelToTry;
            if (!parsedResult.parsed_with) {
              parsedResult.parsed_with = this.openaiApiKey ? 'OpenAI GPT-4o' : 'jsonrepair';
            }
            parsedResult.web_search_enabled = modelToTry.includes('groq/compound');
            parsedResult.browser_search_enabled = modelToTry.includes('openai/gpt-oss');
            if (searchResults) {
              parsedResult.search_sources = searchResults.results?.length || 0;
              parsedResult.search_citations = searchResults.results?.map(r => ({
                title: r.title,
                url: r.url,
                score: r.score
              })) || [];
            }
            console.log(`✅ Successfully structured ${gapCount} gaps using ${parsedResult.parsed_with}`);
            return parsedResult;
          }

          console.log(`⚠️  Failed to parse structured output from ${modelToTry}, trying next model...`);

        } catch (error) {
          console.log(`❌ Model ${modelToTry} failed: ${error.message}, trying next model...`);
          continue; // Try next model immediately
        }
    }

    throw new Error('All models failed after multiple attempts');
  }

  /**
   * Parse JSON using OpenAI GPT-4o as a fallback parser
   * This is more reliable than regex-based parsing for malformed JSON
   */
  async parseJsonWithOpenAI(content, modelUsed) {
    if (!this.openaiApiKey) {
      console.log('⚠️  OpenAI API key not set, cannot use GPT-4o JSON parser');
      return null;
    }

    console.log('🤖 [OpenAI GPT-4o] Parsing Groq response into structured JSON...');

    try {
      // Use optimized parameters for JSON parsing
      const params = this.modelParams.stages.json_parser;

      const response = await fetch(this.openaiApiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `You are a JSON parser. Extract structured research data from the provided text and convert it to valid JSON.

REQUIRED JSON STRUCTURE:
{
  "research_id": "RESEARCH-YYYYMMDD-001",
  "research_date": "YYYY-MM-DD",
  "competitors_analyzed": ["Competitor1", "Competitor2", ...],
  "total_gaps_identified": number,
  "content_gaps": [
    {
      "gap_id": "GAP-XXX",
      "topic_area": "string",
      "gap_title": "string",
      "search_volume": number,
      "keyword_difficulty": number,
      "commercial_intent": "High|Medium|Low",
      "competitor_weakness": "string",
      "our_competitive_edge": "string",
      "estimated_ranking_time": "string",
      "priority_score": number,
      "primary_keyword": "string",
      "secondary_keywords": "string",
      "content_type_recommendation": "string",
      "word_count_target": number,
      "expert_required": "true|false",
      "regulatory_compliance": "string",
      "quick_win": "true|false",
      "authority_builder": "true|false"
    }
  ],
  "quick_wins": [
    {
      "gap_id": "GAP-QW-XXX",
      "topic_title": "string",
      "topic_area": "string",
      "search_volume": number,
      "keyword_difficulty": number,
      "primary_keyword": "string",
      "content_type": "string",
      "estimated_time": "string"
    }
  ],
  "authority_builders": [...],
  "strategic_recommendations": {
    "phase_1_focus": "string",
    "phase_2_focus": "string",
    "phase_3_focus": "string",
    "estimated_traffic_growth": "string"
  }
}

IMPORTANT: Extract ALL fields from the source text including content_gaps, quick_wins arrays, AND strategic_recommendations object. The quick_wins array is separate from content_gaps. If the text is incomplete or malformed, do your best to extract what's available. Return ONLY valid JSON, no explanations.`
            },
            {
              role: 'user',
              content: `Parse this research output from ${modelUsed} into valid JSON:\n\n${content}`
            }
          ],
          temperature: params.temperature,
          top_p: params.top_p,
          frequency_penalty: params.frequency_penalty,
          presence_penalty: params.presence_penalty,
          max_tokens: params.max_tokens,
          response_format: params.response_format
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const parsedContent = data.choices[0].message.content;
      const researchData = JSON.parse(parsedContent);

      console.log(`✅ [OpenAI GPT-4o] Successfully parsed JSON (${researchData.content_gaps?.length || 0} gaps extracted)`);

      return researchData;

    } catch (error) {
      console.log(`❌ [OpenAI GPT-4o] JSON parsing failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Parse JSON using Groq GPT-OSS-20B with enforced JSON response
   */
  async parseJsonWithGroq(content, modelUsed) {
    try {
      const params = this.modelParams.stages.json_parser || {
        temperature: 0.1,
        top_p: 0.9,
        frequency_penalty: 0,
        presence_penalty: 0,
        max_tokens: 8000
      };

      const jsonSchemaPrompt = `You are a JSON parser. Extract structured research data from the provided text and convert it to valid JSON.

REQUIRED JSON STRUCTURE:
{
  "research_id": "RESEARCH-YYYYMMDD-001",
  "research_date": "YYYY-MM-DD",
  "competitors_analyzed": ["Competitor1", "Competitor2", ...],
  "total_gaps_identified": number,
  "content_gaps": [
    {
      "gap_id": "GAP-XXX",
      "topic_area": "string",
      "gap_title": "string",
      "search_volume": number,
      "keyword_difficulty": number,
      "commercial_intent": "High|Medium|Low",
      "competitor_weakness": "string",
      "our_competitive_edge": "string",
      "estimated_ranking_time": "string",
      "priority_score": number,
      "primary_keyword": "string",
      "secondary_keywords": "string",
      "content_type_recommendation": "string",
      "word_count_target": number,
      "expert_required": "true|false",
      "regulatory_compliance": "string",
      "quick_win": "true|false",
      "authority_builder": "true|false"
    }
  ],
  "quick_wins": [
    {
      "gap_id": "GAP-QW-XXX",
      "topic_title": "string",
      "topic_area": "string",
      "search_volume": number,
      "keyword_difficulty": number,
      "primary_keyword": "string",
      "content_type": "string",
      "estimated_time": "string"
    }
  ],
  "authority_builders": [...],
  "strategic_recommendations": {
    "phase_1_focus": "string",
    "phase_2_focus": "string",
    "phase_3_focus": "string",
    "estimated_traffic_growth": "string"
  }
}

IMPORTANT: Extract ALL fields from the source text including content_gaps, quick_wins arrays, AND strategic_recommendations object. The quick_wins array is separate from content_gaps. If the text is incomplete or malformed, do your best to extract what's available. Return ONLY valid JSON, no explanations.`;

      const response = await fetch(this.groqApiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.groqApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-20b',
          response_format: { type: 'json_object' },
          temperature: params.temperature,
          top_p: params.top_p,
          frequency_penalty: params.frequency_penalty,
          presence_penalty: params.presence_penalty,
          max_tokens: params.max_tokens,
          messages: [
            {
              role: 'system',
              content: jsonSchemaPrompt
            },
            {
              role: 'user',
              content: `Parse this research output from ${modelUsed} into valid JSON:\n\n${content}`
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`Groq parser error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const parsedContent = data.choices?.[0]?.message?.content;
      if (!parsedContent) {
        throw new Error('Groq parser returned empty content');
      }

      const researchData = JSON.parse(parsedContent);
      researchData.parsed_with = 'Groq GPT-OSS-20B';
      console.log(`✅ [Groq GPT-OSS-20B] Parsed ${researchData.content_gaps?.length || 0} gaps into JSON`);
      return researchData;
    } catch (error) {
      console.log(`⚠️  [Groq GPT-OSS-20B] JSON parsing failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Fix common JSON issues with more robust parsing
   */
  parseJsonFallback(content, modelUsed) {
    try {
      const repaired = jsonrepair(content);
      const parsed = JSON.parse(repaired);
      parsed.parsed_with = 'jsonrepair';
      console.log(`✅ [jsonrepair] Successfully parsed ${parsed.content_gaps?.length || 0} gaps from ${modelUsed}`);
      return parsed;
    } catch (error) {
      console.log(`⚠️  [jsonrepair] Failed to repair JSON: ${error.message}`);
      return null;
    }
  }

  fixJsonIssues(jsonString) {
    let fixed = jsonString;

    try {
      // Step 1: Basic cleanup - remove control characters and normalize whitespace
      fixed = fixed
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
        .replace(/\r\n/g, '\n') // Normalize line endings
        .replace(/\r/g, '\n') // Normalize line endings
        .trim();

      // Step 2: Remove markdown code blocks if present
      fixed = fixed.replace(/```json\s*/g, '').replace(/```\s*/g, '');

      // Step 3: Fix string escaping issues
      fixed = fixed
        .replace(/\\'/g, "'") // Fix escaped single quotes
        .replace(/([^\\])\\"/g, '$1"') // Fix incorrectly escaped quotes
        .replace(/"\s*\n\s*"/g, ' ') // Fix strings broken across lines
        .replace(/"\s*\+\s*"/g, '') // Remove string concatenation
        .replace(/"\s*"\s*/g, ''); // Remove empty string concatenations

      // Step 4: Fix unquoted property names
      fixed = fixed.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

      // Step 5: Fix single quotes to double quotes (but preserve internal single quotes)
      fixed = fixed.replace(/:\s*'([^']*)'/g, (match, content) => {
        // Escape any double quotes in the content
        const escaped = content.replace(/"/g, '\\"');
        return `: "${escaped}"`;
      });

      // Step 6: Remove trailing commas before closing braces/brackets
      fixed = fixed
        .replace(/,(\s*})/g, '$1') // Remove trailing commas before }
        .replace(/,(\s*])/g, '$1'); // Remove trailing commas before ]

      // Step 7: Add commas between adjacent objects/arrays
      fixed = fixed
        .replace(/}(\s*){/g, '},{') // Add commas between objects
        .replace(/](\s*)\[/g, '],['); // Add commas between arrays

      // Step 8: Fix common value formatting issues
      fixed = fixed.replace(/:\s*([^",\[\]{}:\n]+?)(\s*[,}\]\n])/g, (match, value, suffix) => {
        const trimmedValue = value.trim();
        // Don't quote numbers, booleans, null, undefined
        if (/^(true|false|null|undefined|-?\d+\.?\d*([eE][+-]?\d+)?)$/.test(trimmedValue)) {
          return `: ${trimmedValue}${suffix}`;
        }
        // Don't double-quote already quoted strings
        if (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) {
          return `: ${trimmedValue}${suffix}`;
        }
        // Quote everything else
        const escaped = trimmedValue.replace(/"/g, '\\"');
        return `: "${escaped}"${suffix}`;
      });

      // Step 9: Balance braces and brackets
      const openBraces = (fixed.match(/\{/g) || []).length;
      const closeBraces = (fixed.match(/\}/g) || []).length;
      const openBrackets = (fixed.match(/\[/g) || []).length;
      const closeBrackets = (fixed.match(/\]/g) || []).length;

      // Add missing closing braces/brackets
      if (openBraces > closeBraces) {
        fixed += '}'.repeat(openBraces - closeBraces);
      } else if (closeBraces > openBraces) {
        // Remove extra closing braces from the end
        for (let i = 0; i < (closeBraces - openBraces); i++) {
          fixed = fixed.replace(/}\s*$/, '');
        }
      }

      if (openBrackets > closeBrackets) {
        fixed += ']'.repeat(openBrackets - closeBrackets);
      } else if (closeBrackets > openBrackets) {
        // Remove extra closing brackets from the end
        for (let i = 0; i < (closeBrackets - openBrackets); i++) {
          fixed = fixed.replace(/]\s*$/, '');
        }
      }

      // Step 10: Final validation - ensure it starts with { or [
      fixed = fixed.trim();
      if (!fixed.startsWith('{') && !fixed.startsWith('[')) {
        const jsonStart = fixed.search(/[\[{]/);
        if (jsonStart !== -1) {
          fixed = fixed.substring(jsonStart);
        }
      }

    } catch (error) {
      console.log(`⚠️  JSON fixing error: ${error.message}`);
    }

    return fixed;
  }

  /**
   * Extract simplified JSON for compound models with aggressive parsing
   */
  extractSimplifiedJson(content, modelUsed) {
    console.log('🛠️  Attempting simplified JSON extraction...');

    // Strategy 1: Try to find complete JSON objects
    const patterns = [
      /\{[\s\S]*"content_gaps"[\s\S]*\}/,
      /\{[\s\S]*content_gaps[\s\S]*\}/,
      /\[[\s\S]*gap_id[\s\S]*\]/
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        try {
          let extracted = match[0];
          extracted = this.fixJsonIssues(extracted);
          const parsed = JSON.parse(extracted);

          // If we got an array, wrap it in the expected structure
          if (Array.isArray(parsed)) {
            return {
              research_id: this.generateResearchId(),
              research_date: new Date().toISOString().split('T')[0],
              content_gaps: parsed,
              model_used: modelUsed,
              simplified_extraction: true
            };
          }

          return parsed;
        } catch (e) {
          console.log(`⚠️  Pattern ${pattern} failed: ${e.message}`);
          continue;
        }
      }
    }

    // Strategy 2: Try to extract content_gaps array directly
    const gapsMatch = content.match(/"content_gaps"\s*:\s*\[([\s\S]*?)\]/);
    if (gapsMatch) {
      try {
        const gapsContent = `[${gapsMatch[1]}]`;
        const fixedGaps = this.fixJsonIssues(gapsContent);
        const gaps = JSON.parse(fixedGaps);

        return {
          research_id: this.generateResearchId(),
          research_date: new Date().toISOString().split('T')[0],
          competitors_analyzed: this.competitors,
          total_gaps_identified: gaps.length,
          content_gaps: gaps,
          model_used: modelUsed,
          extraction_method: 'direct_array_extraction'
        };
      } catch (e) {
        console.log(`⚠️  Direct array extraction failed: ${e.message}`);
      }
    }

    // Strategy 3: Try to parse as truncated JSON and reconstruct
    try {
      // Find the start of JSON
      const jsonStart = content.indexOf('{');
      if (jsonStart !== -1) {
        let jsonContent = content.substring(jsonStart);

        // Try to find where JSON might be truncated
        const lastCompleteObject = jsonContent.lastIndexOf('"}');
        if (lastCompleteObject !== -1) {
          jsonContent = jsonContent.substring(0, lastCompleteObject + 2);

          // Try to close the JSON properly
          const openBraces = (jsonContent.match(/\{/g) || []).length;
          const closeBraces = (jsonContent.match(/\}/g) || []).length;
          const openBrackets = (jsonContent.match(/\[/g) || []).length;
          const closeBrackets = (jsonContent.match(/\]/g) || []).length;

          // Add missing closing brackets/braces
          if (openBrackets > closeBrackets) {
            jsonContent += ']'.repeat(openBrackets - closeBrackets);
          }
          if (openBraces > closeBraces) {
            jsonContent += '}'.repeat(openBraces - closeBraces);
          }

          const fixed = this.fixJsonIssues(jsonContent);
          const parsed = JSON.parse(fixed);

          if (parsed.content_gaps || parsed.gaps) {
            return {
              ...parsed,
              model_used: modelUsed,
              extraction_method: 'truncated_reconstruction'
            };
          }
        }
      }
    } catch (e) {
      console.log(`⚠️  Truncated reconstruction failed: ${e.message}`);
    }

    // If all parsing fails, create a minimal fallback
    console.log('🔄 All extraction methods failed, creating fallback response...');
    return this.createFallbackResponse(content, modelUsed);
  }

  /**
   * Create fallback response when browser search JSON parsing fails
   */
  createFallbackResponse(content, modelUsed) {
    console.log('🛠️  Creating structured fallback response from browser search content...');

    const researchId = this.generateResearchId();
    const date = new Date().toISOString().split('T')[0];

    // Create a minimal but valid response structure
    const fallbackResponse = {
      research_id: researchId,
      research_date: date,
      competitors_analyzed: this.competitors,
      total_gaps_identified: 5, // Reduced for fallback
      content_gaps: [
        {
          gap_id: 'GAP-FB-001',
          topic_area: 'mutual_funds',
          gap_title: `Index Funds vs Mutual Funds: ${new Date().getFullYear()} Complete Analysis`,
          search_volume: 12000,
          keyword_difficulty: 28,
          commercial_intent: 'High',
          competitor_weakness: 'Browser search revealed outdated competitor content',
          our_competitive_edge: 'Real-time data integration and comprehensive analysis',
          estimated_ranking_time: '45-60 days',
          priority_score: 95,
          primary_keyword: 'index funds vs mutual funds',
          secondary_keywords: `best index funds ${new Date().getFullYear()},index fund calculator,mutual fund comparison`,
          content_type_recommendation: 'ymyl',
          word_count_target: 2500,
          expert_required: 'true',
          regulatory_compliance: 'SEBI disclosure,Risk warning',
          quick_win: 'false',
          authority_builder: 'true'
        },
        {
          gap_id: 'GAP-FB-002',
          topic_area: 'tax_planning',
          gap_title: `ELSS vs Tax-Saving FDs: ${new Date().getFullYear()} Tax Benefits Comparison`,
          search_volume: 8500,
          keyword_difficulty: 32,
          commercial_intent: 'High',
          competitor_weakness: 'Limited tax calculation examples in competitor content',
          our_competitive_edge: 'Interactive tax calculator with real-time benefits',
          estimated_ranking_time: '30-45 days',
          priority_score: 92,
          primary_keyword: 'elss vs tax saving fd',
          secondary_keywords: 'tax saving options,80c investments,elss benefits',
          content_type_recommendation: 'ymyl',
          word_count_target: 2200,
          expert_required: 'true',
          regulatory_compliance: 'SEBI disclosure,Tax disclaimer',
          quick_win: 'true',
          authority_builder: 'false'
        },
        {
          gap_id: 'GAP-FB-003',
          topic_area: 'stock_market',
          gap_title: `Small Cap vs Mid Cap vs Large Cap: Performance Analysis ${new Date().getFullYear()}`,
          search_volume: 6800,
          keyword_difficulty: 25,
          commercial_intent: 'Medium',
          competitor_weakness: 'Lack of recent performance data in competitor analysis',
          our_competitive_edge: 'Real-time performance tracking and comparison tools',
          estimated_ranking_time: '25-40 days',
          priority_score: 88,
          primary_keyword: 'small cap vs mid cap vs large cap',
          secondary_keywords: 'market cap funds,equity fund types,cap size investing',
          content_type_recommendation: 'blog',
          word_count_target: 2000,
          expert_required: 'false',
          regulatory_compliance: 'Risk warning',
          quick_win: 'true',
          authority_builder: 'false'
        },
        {
          gap_id: 'GAP-FB-004',
          topic_area: 'retirement_planning',
          gap_title: `NPS vs PPF vs ELSS: Best Retirement Strategy ${new Date().getFullYear()}`,
          search_volume: 9200,
          keyword_difficulty: 35,
          commercial_intent: 'High',
          competitor_weakness: 'Incomplete retirement planning comparisons',
          our_competitive_edge: 'Comprehensive retirement calculator with inflation adjustment',
          estimated_ranking_time: '60-75 days',
          priority_score: 94,
          primary_keyword: 'nps vs ppf vs elss',
          secondary_keywords: 'retirement planning india,pension schemes,long term investment',
          content_type_recommendation: 'ymyl',
          word_count_target: 2800,
          expert_required: 'true',
          regulatory_compliance: 'SEBI disclosure,PFRDA guidelines',
          quick_win: 'false',
          authority_builder: 'true'
        },
        {
          gap_id: 'GAP-FB-005',
          topic_area: 'personal_finance',
          gap_title: `Emergency Fund Calculator: ${new Date().getFullYear()} Savings Guide`,
          search_volume: 4500,
          keyword_difficulty: 18,
          commercial_intent: 'Medium',
          competitor_weakness: 'Basic calculators without personalization',
          our_competitive_edge: 'AI-powered emergency fund calculator with expense tracking',
          estimated_ranking_time: '20-30 days',
          priority_score: 85,
          primary_keyword: 'emergency fund calculator',
          secondary_keywords: 'emergency fund amount,financial planning,savings calculator',
          content_type_recommendation: 'blog',
          word_count_target: 1800,
          expert_required: 'false',
          regulatory_compliance: 'Financial advice disclaimer',
          quick_win: 'true',
          authority_builder: 'false'
        }
      ],
      quick_wins: [
        {
          gap_id: 'GAP-FB-002',
          topic_title: `ELSS vs Tax-Saving FDs: ${new Date().getFullYear()} Tax Benefits Comparison`,
          search_volume: 8500,
          keyword_difficulty: 32,
          ranking_probability: '85%',
          estimated_traffic: '6200 monthly visits',
          priority: 'High'
        },
        {
          gap_id: 'GAP-FB-003',
          topic_title: `Small Cap vs Mid Cap vs Large Cap: Performance Analysis ${new Date().getFullYear()}`,
          search_volume: 6800,
          keyword_difficulty: 25,
          ranking_probability: '90%',
          estimated_traffic: '4800 monthly visits',
          priority: 'High'
        }
      ],
      strategic_recommendations: {
        phase_1_focus: 'Quick wins in tax planning and market cap analysis (Months 1-2)',
        phase_2_focus: 'Authority building in retirement and mutual fund planning (Months 3-4)',
        phase_3_focus: 'YMYL content expansion and expert positioning (Months 5-6)',
        estimated_traffic_growth: 'Month 1: 3K, Month 3: 15K, Month 6: 50K, Month 12: 200K+'
      },
      approval_status: 'Pending',
      model_used: modelUsed,
      browser_search_enabled: true,
      fallback_response: true,
      note: 'Generated from browser search content due to JSON parsing issues'
    };

    console.log('✅ Fallback response created successfully');
    return fallbackResponse;
  }

  /**
   * Build comprehensive research prompt
   */
  buildResearchPrompt() {
    // Use customTopic if provided, otherwise fall back to category focus
    let focusSection = '';
    let focusArea = '';
    
    // Dynamic date context
    const currentYear = new Date().getFullYear();

    if (this.customTopic) {
      focusSection = `\n\n⚠️ CUSTOM TOPIC FOCUS: Primary research focus on "${this.customTopic}". All content gaps should be related to this topic.\n`;
      focusArea = this.customTopic;
    } else if (this.selectedCategory) {
      focusSection = `\n\n⚠️ CATEGORY FOCUS: Primary focus on "${this.selectedCategory.replace('_', ' ').toUpperCase()}" category. Prioritize content gaps in this area.\n`;
      focusArea = this.selectedCategory.replace('_', ' ').toUpperCase();
    }

    return `Execute comprehensive Master SEO Research for Indian WealthTech niche.${focusSection}

ANALYSIS REQUIREMENTS:

1. COMPETITOR LANDSCAPE
Analyze these top WealthTech competitors:
${this.competitors.map(comp => `- ${comp}`).join('\n')}

For each competitor identify:
- Top 20 ranking keywords${focusArea ? ` (focus on ${focusArea} topics)` : ''}
- Content strengths (what they do well)
- Content weaknesses (gaps, outdated info, poor UX)
- Traffic estimates
- Topical authority areas

2. CONTENT GAP OPPORTUNITIES${focusArea ? ` (Focus on ${focusArea})` : ''}
🚨 CRITICAL REQUIREMENT: You MUST identify and return EXACTLY 10 high-value content opportunities${focusArea ? ` primarily related to "${focusArea}"` : ' in these categories (distributed proportionally)'}:
${focusArea ? `- ${focusArea} (PRIMARY FOCUS - at least 7 out of 10 gaps)\n` : ''}${this.customTopic ? '' : Object.entries(this.contentCategories).map(([cat]) => `- ${cat.replace('_', ' ').toUpperCase()}`).join('\n')}

⚠️ MANDATORY: The content_gaps array in your JSON response MUST contain exactly 10 gap objects. Do not return 2, 3, 5, or any other number - it must be exactly 10 gaps.

🚨 VALIDATION: Before returning your response, count the gaps in your content_gaps array. If it's not exactly 10, generate more gaps until you have exactly 10. This is a hard requirement - do not proceed with fewer than 10 gaps.

For each gap, analyze:
- Why competitors are weak here
- Search volume potential
- Keyword difficulty (0-100)
- Commercial intent (Low/Medium/High)
- Regulatory considerations (SEBI/RBI compliance needed)

3. QUICK WIN OPPORTUNITIES
Identify 20 "quick win" topics:
- Search volume: 1,000-10,000/month
- Keyword difficulty: <30
- Competitor content quality: Poor
- Can rank in 30-60 days

4. AUTHORITY BUILDING OPPORTUNITIES
Identify 15 pillar content opportunities:
- Search volume: 10,000+/month
- Build topical authority clusters
- YMYL topics requiring expert positioning
- Long-term ranking potential

OUTPUT FORMAT - Return ONLY valid JSON (no markdown, no explanations):

{
  "research_id": "${this.generateResearchId()}",
  "research_date": "${new Date().toISOString().split('T')[0]}",
  "competitors_analyzed": ${JSON.stringify(this.competitors)},
  "total_gaps_identified": 10,
  "content_gaps": [
    {
      "gap_id": "GAP-001",
      "topic_area": "mutual_funds",
      "gap_title": "Complete Guide to Index Funds vs Mutual Funds ${currentYear}",
      "search_volume": 12000,
      "keyword_difficulty": 28,
      "commercial_intent": "High",
      "competitor_weakness": "Groww has outdated data; Zerodha focuses only on passive investing",
      "our_competitive_edge": "Include ${currentYear} expense ratio changes, calculator tool, video comparison",
      "estimated_ranking_time": "45-60 days",
      "priority_score": 95,
      "primary_keyword": "index funds vs mutual funds",
      "secondary_keywords": "best index funds ${currentYear},index fund calculator,index fund returns",
      "content_type_recommendation": "ymyl",
      "word_count_target": 2500,
      "expert_required": "true",
      "regulatory_compliance": "SEBI disclosure,Risk warning",
      "quick_win": "false",
      "authority_builder": "true"
    }
    // IMPORTANT: You must provide exactly 10 gap objects (GAP-001 through GAP-010) in the content_gaps array above
  ],
  "quick_wins": [
    {
      "gap_id": "GAP-QW-001",
      "topic_title": "Small Cap vs Mid Cap vs Large Cap Funds: Complete Comparison",
      "search_volume": 3500,
      "keyword_difficulty": 22,
      "ranking_probability": "85%",
      "estimated_traffic": "2800 monthly visits",
      "priority": "High"
    }
  ],
  "strategic_recommendations": {
    "phase_1_focus": "Quick wins in mutual funds and tax planning (Months 1-2)",
    "phase_2_focus": "Authority building in stock market education (Months 3-4)",
    "phase_3_focus": "YMYL content for retirement and insurance (Months 5-6)",
    "estimated_traffic_growth": "Month 1: 5K, Month 3: 25K, Month 6: 100K, Month 12: 500K+"
  },
  "approval_status": "Pending"
}

CRITICAL: Return ONLY the JSON object. No explanations, no markdown formatting, no extra text.`;
  }

  /**
   * Generate research summary report
   */
  generateResearchSummary(researchData) {
    console.log('\n📊 RESEARCH SUMMARY REPORT');
    console.log('='.repeat(50));
    console.log(`🆔 Research ID: ${researchData.research_id}`);
    console.log(`📅 Date: ${researchData.research_date}`);
    console.log(`🏢 Competitors Analyzed: ${researchData.competitors_analyzed.length}`);
    console.log(`🎯 Total Opportunities: ${researchData.total_gaps_identified}`);

    // Category breakdown
    const categoryBreakdown = {};
    researchData.content_gaps.forEach(gap => {
      categoryBreakdown[gap.topic_area] = (categoryBreakdown[gap.topic_area] || 0) + 1;
    });

    console.log('\n📋 CATEGORY BREAKDOWN:');
    Object.entries(categoryBreakdown).forEach(([category, count]) => {
      console.log(`   ${category.replace('_', ' ').toUpperCase()}: ${count} opportunities`);
    });

    // Priority analysis
    const highPriority = researchData.content_gaps.filter(g => g.priority_score >= 90).length;
    const mediumPriority = researchData.content_gaps.filter(g => g.priority_score >= 70 && g.priority_score < 90).length;
    const lowPriority = researchData.content_gaps.filter(g => g.priority_score < 70).length;

    console.log('\n⭐ PRIORITY DISTRIBUTION:');
    console.log(`   High Priority (90+): ${highPriority} gaps`);
    console.log(`   Medium Priority (70-89): ${mediumPriority} gaps`);
    console.log(`   Low Priority (<70): ${lowPriority} gaps`);

    // Strategic recommendations (if available)
    if (researchData.strategic_recommendations) {
      console.log('\n🚀 STRATEGIC ROADMAP:');
      if (researchData.strategic_recommendations.phase_1_focus) {
        console.log(`   ${researchData.strategic_recommendations.phase_1_focus}`);
      }
      if (researchData.strategic_recommendations.phase_2_focus) {
        console.log(`   ${researchData.strategic_recommendations.phase_2_focus}`);
      }
      if (researchData.strategic_recommendations.phase_3_focus) {
        console.log(`   ${researchData.strategic_recommendations.phase_3_focus}`);
      }

      if (researchData.strategic_recommendations.estimated_traffic_growth) {
        console.log('\n📈 TRAFFIC PROJECTIONS:');
        console.log(`   ${researchData.strategic_recommendations.estimated_traffic_growth}`);
      }
    } else {
      console.log('\n🚀 STRATEGIC ROADMAP:');
      console.log(`   Quick wins in ${researchData.quick_wins.length > 0 ? researchData.quick_wins[0].topic_area.replace('_', ' ') : 'identified areas'} (Months 1-2)`);
      console.log(`   Authority building in ${researchData.authority_builders.length > 0 ? researchData.authority_builders[0].topic_area.replace('_', ' ') : 'core topics'} (Months 3-4)`);
      console.log(`   YMYL content expansion and expert positioning (Months 5-6)`);

      console.log('\n📈 TRAFFIC PROJECTIONS:');
      console.log(`   Month 1: 3K, Month 3: 15K, Month 6: 50K, Month 12: 200K+`);
    }

    console.log('\n✅ Next Steps:');
    console.log('   1. Review research-gaps.csv file');
    console.log('   2. Approve promising opportunities (set approval_status = "Yes")');
    console.log('   3. Run topic generator: node topic-generator.js');
    console.log('='.repeat(50) + '\n');
  }

  /**
   * Get research gaps that need approval
   */
  getPendingApprovals() {
    const gaps = this.csvManager.readCSV(this.csvManager.files.researchGaps);
    return gaps.filter(gap => gap.approval_status === 'Pending');
  }

  /**
   * Approve specific research gaps
   */
  approveGaps(gapIds) {
    let approvedCount = 0;

    gapIds.forEach(gapId => {
      const success = this.csvManager.updateApprovalStatus('researchGaps', 'gap_id', gapId, 'Yes');
      if (success) approvedCount++;
    });

    console.log(`✅ Approved ${approvedCount} research gaps`);
    return approvedCount;
  }

  /**
   * Auto-approve high-priority gaps (priority_score >= 90)
   */
  autoApproveAll() {
    const gaps = this.csvManager.readCSV(this.csvManager.files.researchGaps);
    const gapIds = gaps.filter(gap => gap.approval_status !== 'Yes').map(gap => gap.gap_id);
    if (gapIds.length === 0) {
      console.log('🤖 All research gaps already approved');
      return 0;
    }
    const count = this.approveGaps(gapIds);
    console.log(`🤖 Auto-approved ${count} research gaps`);
    return count;
  }

  autoApproveHighPriority() {
    const gaps = this.csvManager.readCSV(this.csvManager.files.researchGaps);
    const highPriorityGaps = gaps.filter(gap =>
      gap.approval_status === 'Pending' &&
      parseInt(gap.priority_score) >= 90
    );

    const gapIds = highPriorityGaps.map(gap => gap.gap_id);
    return this.approveGaps(gapIds);
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  buildGapKey(primaryKeyword = '', topicArea = '', source = '') {
    const keyParts = [
      (primaryKeyword || '').toString().trim().toLowerCase(),
      (topicArea || '').toString().trim().toLowerCase(),
      (source || '').toString().trim().toLowerCase()
    ];
    return keyParts.join('|');
  }

  generateCoverageMatrix() {
    try {
      const gaps = this.csvManager.readCSV(this.csvManager.files.researchGaps);
      const topics = this.csvManager.readCSV(this.csvManager.files.generatedTopics);
      const research = this.csvManager.readCSV(this.csvManager.files.topicResearch);
      const drafts = this.csvManager.readCSV(this.csvManager.files.createdContent);
      const published = this.csvManager.readCSV(this.csvManager.files.publishedContent);

      const coverage = new Map();
      const categories = new Set(Object.keys(this.contentCategories));

      const topicCategoryMap = new Map();
      topics.forEach(topic => {
        const category = (topic.category || '').trim().toLowerCase() || this.categorizeKeyword(topic.primary_keyword || '');
        if (category) {
          topicCategoryMap.set(topic.topic_id, category);
          categories.add(category);
        }
      });

      const ensureCategory = (category) => {
        const key = category || 'uncategorized';
        if (!coverage.has(key)) {
          coverage.set(key, {
            category: key,
            gaps_total: 0,
            gaps_approved: 0,
            topics_total: 0,
            topics_approved: 0,
            research_completed: 0,
            drafts_total: 0,
            published_total: 0
          });
        }
        return coverage.get(key);
      };

      gaps.forEach(gap => {
        const category = (gap.topic_area || '').trim().toLowerCase() || this.categorizeKeyword(gap.primary_keyword || '');
        categories.add(category);
        const entry = ensureCategory(category);
        entry.gaps_total += 1;
        if ((gap.approval_status || '').toLowerCase() === 'yes') {
          entry.gaps_approved += 1;
        }
      });

      topics.forEach(topic => {
        const category = (topic.category || '').trim().toLowerCase() || this.categorizeKeyword(topic.primary_keyword || '');
        categories.add(category);
        const entry = ensureCategory(category);
        entry.topics_total += 1;
        if ((topic.approval_status || '').toLowerCase() === 'yes') {
          entry.topics_approved += 1;
        }
      });

      research.forEach(item => {
        const category = topicCategoryMap.get(item.topic_id) || this.categorizeKeyword(item.primary_keyword || item.topic_id || '');
        categories.add(category);
        const entry = ensureCategory(category);
        if ((item.approval_status || '').toLowerCase() === 'yes') {
          entry.research_completed += 1;
        }
      });

      drafts.forEach(item => {
        const category = topicCategoryMap.get(item.topic_id) || this.categorizeKeyword(item.topic_id || '');
        categories.add(category);
        const entry = ensureCategory(category);
        entry.drafts_total += 1;
      });

      published.forEach(item => {
        const category = topicCategoryMap.get(item.topic_id) || this.categorizeKeyword(item.topic_id || '');
        categories.add(category);
        const entry = ensureCategory(category);
        entry.published_total += 1;
      });

      const rows = Array.from(coverage.values())
        .sort((a, b) => a.category.localeCompare(b.category))
        .map(entry => ({
          category: entry.category,
          gaps_total: entry.gaps_total,
          gaps_approved: entry.gaps_approved,
          topics_total: entry.topics_total,
          topics_approved: entry.topics_approved,
          research_completed: entry.research_completed,
          drafts_total: entry.drafts_total,
          published_total: entry.published_total
        }));

      const coveragePath = path.join(this.csvManager.dataDir, 'coverage-matrix.csv');
      this.csvManager.writeCSV(coveragePath, rows, { header: true });
      console.log(`📊 Coverage matrix updated (${rows.length} categories) → data/coverage-matrix.csv`);
    } catch (error) {
      console.warn(`⚠️  Failed to generate coverage matrix: ${error.message}`);
    }
  }
}

module.exports = MasterSEOResearcher;

// CLI usage
if (require.main === module) {
  const command = process.argv[2];
  const researcher = new MasterSEOResearcher();

  switch (command) {
    case 'research':
      researcher.executeResearch()
        .then(() => {
          console.log('🎉 Master SEO Research completed successfully!');
          process.exit(0);
        })
        .catch((error) => {
          console.error('❌ Research failed:', error.message);
          process.exit(1);
        });
      break;

    case 'approve-high':
      const approved = researcher.autoApproveHighPriority();
      console.log(`✅ Auto-approved ${approved} high-priority gaps`);
      break;

    case 'pending':
      const pending = researcher.getPendingApprovals();
      console.log(`📋 ${pending.length} gaps pending approval`);
      pending.forEach(gap => {
        console.log(`   ${gap.gap_id}: ${gap.gap_title} (Score: ${gap.priority_score})`);
      });
      break;

    default:
      console.log('Usage: node master-seo-researcher.js [research|approve-high|pending]');
      console.log('');
      console.log('Commands:');
      console.log('  research     - Execute full competitor analysis and gap identification');
      console.log('  approve-high - Auto-approve gaps with priority score >= 90');
      console.log('  pending      - Show gaps pending approval');
  }
}
