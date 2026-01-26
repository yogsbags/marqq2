#!/usr/bin/env node

/**
 * Content Creator for Enhanced Bulk Generator
 * Implements N8N Workflow 4: Content Creation
 * Generates E-E-A-T compliant, SEO-optimized financial content per topic
 */

// Resolve module paths for Vercel deployment
require('../module-resolver');

const fetch = require('node-fetch');
const { jsonrepair } = require('jsonrepair');
const fs = require('fs');
const path = require('path');
const CSVDataManager = require('../core/csv-data-manager');
const { generateHeroImage } = require('../integrations/image-generator');
const { GoogleGenerativeAI } = require('@google/generative-ai');

class ContentCreator {
  constructor(config = {}) {
    this.config = {
      contentBatchSize: config.contentBatchSize || 1,
      minWordCount: config.minWordCount || 1800,
      maxGenerationAttempts: config.maxGenerationAttempts || 2,
      generateImages: config.generateImages !== undefined ? config.generateImages : process.env.GENERATE_IMAGES !== 'false',
      ...config,
    };

    this.customTitle = config.customTitle || null;
    this.customTopic = config.customTopic || null;
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.groqApiKey = process.env.GROQ_API_KEY;
    this.geminiApiKey = process.env.GEMINI_API_KEY;
    this.openaiApiUrl = 'https://api.openai.com/v1/chat/completions';
    this.groqApiUrl = 'https://api.groq.com/openai/v1/chat/completions';

    // Initialize Google Generative AI
    if (this.geminiApiKey) {
      this.genAI = new GoogleGenerativeAI(this.geminiApiKey);
    }

    this.csvManager = new CSVDataManager();
    this.heroImageCache = new Map();
    this.researchSourceCache = new Map();

    // Load optimized model parameters
    this.modelParams = this.loadModelParameters();

    this.validateConfig();
  }

  validateConfig() {
    if (!this.openaiApiKey && !this.groqApiKey && !this.geminiApiKey) {
      console.warn('⚠️  No AI API keys configured!');
      console.log('Please set at least one: GEMINI_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY');
      return false;
    }
    if (this.geminiApiKey) {
      console.log('✅ Content Creator initialized with Google Gemini 3.0 Pro Preview (gemini-3-pro-preview)');
    } else {
      console.log('✅ Content Creator initialized');
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
          content: {
            temperature: 0.6,
            top_p: 0.92,
            frequency_penalty: 0.3,
            presence_penalty: 0.1,
            max_tokens: 16000, // Increased from 8000 to handle long-form articles with research verification + SEO metadata
            response_format: { type: 'json_object' }
          }
        }
      };
    }
  }

  /**
   * Main content creation entry point
   */
  async createContent() {
    console.log('\n✍️  CONTENT CREATION STARTED');
    console.log('='.repeat(60));

    try {
      // 🚀 Custom Title Mode: Generate content from custom title (bypass Stages 1-3)
      if (this.customTitle) {
        console.log(`\n🚀 CUSTOM TITLE MODE ACTIVATED`);
        console.log(`📝 Custom Title: "${this.customTitle}"`);
        console.log(`✨ Bypassing Stages 1-3 (Research, Topics, Deep Research)...`);
        console.log(`🎯 Creating content directly from custom title...`);

        const customResearch = await this.getCustomTitleResearch();

        if (!customResearch) {
          throw new Error('Custom title research not found. Deep research must run first.');
        }

        // Override primary_keyword in research with current custom topic/title to ensure correct content
        // Priority: custom_topic > custom_title
        if (customResearch) {
          const originalPrimaryKeyword = customResearch.primary_keyword;
          let newPrimaryKeyword = null;

          if (this.customTopic) {
            // If custom_topic is provided, use it as primary_keyword
            newPrimaryKeyword = this.customTopic;
            console.log(`✅ Overriding research.primary_keyword from "${originalPrimaryKeyword}" to custom_topic: "${newPrimaryKeyword}"`);
          } else if (this.customTitle) {
            // If only custom_title is provided, use it as primary_keyword
            newPrimaryKeyword = this.customTitle;
            console.log(`✅ Overriding research.primary_keyword from "${originalPrimaryKeyword}" to custom_title: "${newPrimaryKeyword}"`);
          }

          if (newPrimaryKeyword) {
            customResearch.primary_keyword = newPrimaryKeyword;
          }
        }

        const content = await this.createArticle(customResearch);
        if (!content) {
          throw new Error('Custom title content creation failed');
        }

        const stored = this.prepareForStorage(content);
        if (!stored) {
          throw new Error('Custom title content serialization failed');
        }

        // Save to CSV
        const saved = this.csvManager.saveCreatedContent([stored]);
        if (saved) {
          console.log(`\n💾 Saved custom title content to created-content.csv`);
        }

        this.printSummary([stored]);
        return [stored];
      }

      const pendingResearch = this.getPendingResearchItems();

      if (pendingResearch.length === 0) {
        console.log('⚠️  No research items require new drafts (already created or not approved).');
        return [];
      }

      console.log(`✅ Preparing ${pendingResearch.length} research item(s) for drafting`);

      const contentResults = [];

      for (let i = 0; i < pendingResearch.length; i++) {
        const research = pendingResearch[i];
        console.log(`\n📝 Creating content ${i + 1}/${pendingResearch.length}: ${research.topic_id}`);

        const content = await this.createArticle(research);
        if (content) {
          const stored = this.prepareForStorage(content);
          if (stored) {
            contentResults.push(stored);
            console.log(`✅ Content created for: ${research.topic_id}`);
          } else {
            console.warn(`⚠️  Skipped storing content for ${research.topic_id} (serialization failed).`);
          }
        } else {
          console.warn(`⚠️  Content generation returned no usable draft for ${research.topic_id}`);
        }
      }

      if (contentResults.length > 0) {
        const saved = this.csvManager.saveCreatedContent(contentResults);
        if (saved) {
          console.log(`\n💾 Saved ${contentResults.length} content item(s) to created-content.csv`);
        }
      }

      this.printSummary(contentResults);
      return contentResults;
    } catch (error) {
      console.error('❌ Content creation failed:', error.message);
      throw error;
    }
  }

  /**
   * Find approved research entries that do not yet have content
   */
  getPendingResearchItems() {
    const approvedResearch = this.csvManager.getApprovedTopicResearch();
    if (!approvedResearch || approvedResearch.length === 0) {
      return [];
    }

    const existingContent = this.csvManager.getContentByTopicIds(
      approvedResearch.map((item) => item.topic_id)
    );
    const existingTopicIds = new Set(existingContent.map((item) => item.topic_id));

    const pending = approvedResearch
      .filter((item) => !existingTopicIds.has(item.topic_id))
      .sort((a, b) => {
        const aDate = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bDate = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bDate - aDate;
      });
    if (pending.length === 0) {
      return [];
    }

    const batchSize = this.config.autoApprove ? pending.length : Math.max(1, this.config.contentBatchSize || 1);
    const limitedByBatch = pending.slice(0, batchSize);
    const limit = this.config.contentLimit ?? this.config.topicLimit ?? null;
    return limit ? limitedByBatch.slice(0, limit) : limitedByBatch;
  }

  /**
   * Get custom title research from CSV (created by DeepTopicResearcher)
   */
  async getCustomTitleResearch() {
    console.log(`\n🔍 Looking for custom title research in topic-research.csv...`);
    console.log(`📝 Current custom title: "${this.customTitle}"`);

    // Get all research entries
    const allResearch = this.csvManager.readCSV(this.csvManager.files.topicResearch);

    if (!allResearch || allResearch.length === 0) {
      console.warn('⚠️  No research entries found in topic-research.csv');
      return null;
    }

    // Find CUSTOM-TITLE entries
    const customTitleEntries = allResearch
      .filter(item => item.topic_id && item.topic_id.startsWith('CUSTOM-TITLE-'))
      .sort((a, b) => {
        // Sort by topic_id descending (timestamp is in the ID)
        return b.topic_id.localeCompare(a.topic_id);
      });

    if (customTitleEntries.length === 0) {
      console.warn('⚠️  No custom title research found. Run deep-research stage first with --custom-title flag.');
      return null;
    }

    // Try to find a match for the current custom title/topic
    // Note: If custom_topic is provided, primary_keyword in research CSV = custom_topic
    // If only custom_title is provided, primary_keyword = extracted keyword from title
    let matchingResearch = null;

    // Extract primary keyword helper (same logic as deep-topic-researcher.js)
    const extractPrimaryKeyword = (title) => {
      const stopWords = ['the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'best', 'top', 'guide', 'how', 'what', 'why', 'when', 'where'];
      const words = title.toLowerCase().split(/\s+/);
      const keywords = words.filter(word => !stopWords.includes(word));
      return keywords.slice(0, 3).join(' ') || title.toLowerCase();
    };

    // Build list of possible keywords to match against
    const possibleKeywords = [];
    if (this.customTopic) {
      possibleKeywords.push(this.customTopic.toLowerCase().trim());
      console.log(`🔍 Matching by custom_topic: "${this.customTopic}"`);
    }
    if (this.customTitle) {
      const extractedFromTitle = extractPrimaryKeyword(this.customTitle).toLowerCase().trim();
      possibleKeywords.push(extractedFromTitle);
      possibleKeywords.push(this.customTitle.toLowerCase().trim()); // Also try full title
      console.log(`🔍 Also matching by extracted keyword from custom_title: "${extractedFromTitle}"`);
    }

    if (possibleKeywords.length > 0) {
      const normalizedCustomTitle = this.customTitle ? this.customTitle.toLowerCase().trim() : null;

      matchingResearch = customTitleEntries.find(item => {
        const itemPrimaryKeyword = (item.primary_keyword || '').toLowerCase().trim();
        const itemTopicTitle = (item.topic_title || '').toLowerCase().trim(); // May not exist in CSV

        // Strategy 1: Exact match on primary_keyword with any of our possible keywords
        for (const keyword of possibleKeywords) {
          if (itemPrimaryKeyword === keyword) {
            return true;
          }
        }

        // Strategy 2: Check if primary keywords are similar (fuzzy match)
        // Check if any of our keywords overlap with the research's primary_keyword
        for (const keyword of possibleKeywords) {
          if (itemPrimaryKeyword && keyword) {
            // Check if one contains the other (handles variations like "retirement planning wealth" vs "wealth maximization")
            if (itemPrimaryKeyword.includes(keyword) || keyword.includes(itemPrimaryKeyword)) {
              return true;
            }
            // Also check if they share significant words (for cases like "retirement planning wealth" vs "wealth maximization")
            const itemWords = itemPrimaryKeyword.split(/\s+/);
            const keywordWords = keyword.split(/\s+/);
            const commonWords = itemWords.filter(word => keywordWords.includes(word) && word.length > 3);
            if (commonWords.length > 0) {
              return true;
            }
          }
        }

        // Strategy 3: If topic_title exists and we have custom_title, match on it
        if (normalizedCustomTitle && itemTopicTitle === normalizedCustomTitle) {
          return true;
        }

        // Strategy 4: Extract keyword from research's primary_keyword and compare with custom_topic
        // This handles cases where research has "retirement planning wealth" and we're looking for "wealth maximization"
        if (this.customTopic && itemPrimaryKeyword) {
          const researchWords = itemPrimaryKeyword.split(/\s+/);
          const topicWords = this.customTopic.toLowerCase().trim().split(/\s+/);
          const matchingWords = researchWords.filter(word => topicWords.includes(word) && word.length > 3);
          if (matchingWords.length > 0) {
            return true;
          }
        }

        return false;
      });
    }

    // If no match found, use the most recent one but warn
    if (!matchingResearch) {
      matchingResearch = customTitleEntries[0];
      const searchTerms = possibleKeywords.length > 0 ? possibleKeywords.join('", "') : 'N/A';
      console.warn(`⚠️  WARNING: No match found for keywords: "${searchTerms}"`);
      console.warn(`⚠️  Using most recent custom title research: ${matchingResearch.topic_id}`);
      console.warn(`⚠️  Found research with topic_title: "${matchingResearch.topic_title || 'N/A'}"`);
      console.warn(`⚠️  Found research with primary_keyword: "${matchingResearch.primary_keyword || 'N/A'}"`);
      console.warn(`⚠️  Searched for keywords: "${searchTerms}"`);
      console.warn(`⚠️  This may result in content for the wrong topic!`);
      if (this.customTopic) {
        console.warn(`⚠️  Please run deep-research stage first with --custom-topic "${this.customTopic}" and --custom-title "${this.customTitle || 'N/A'}"`);
      } else {
        console.warn(`⚠️  Please run deep-research stage first with the correct --custom-title flag.`);
      }
    } else {
      console.log(`✅ Found matching custom title research: ${matchingResearch.topic_id}`);
      console.log(`✅ Matched primary_keyword: "${matchingResearch.primary_keyword || 'N/A'}"`);
      if (this.customTopic) {
        console.log(`✅ Current custom_topic: "${this.customTopic}"`);
      }
      if (this.customTitle) {
        console.log(`✅ Current custom_title: "${this.customTitle}"`);
      }
    }

    return matchingResearch;
  }

  /**
   * Create an article for a single topic, retrying with stricter prompts if needed
   */
  async createArticle(research) {
    let draft = null;
    let feedback = '';

    for (let attempt = 1; attempt <= this.config.maxGenerationAttempts; attempt++) {
      const prompt = this.buildContentPrompt(research, {
        attempt,
        feedback,
      });

      try {
        const response = await this.callAI(prompt);

        // 💾 SAVE RAW AI RESPONSE BEFORE PARSING (for debugging and backup)
        const rawFilePath = await this.saveRawResponse(response, research, attempt);

        const content = this.parseContentResponse(response, research, rawFilePath);

        if (!content) {
          feedback =
            'Previous attempt produced invalid output. Respond with strictly valid JSON matching the requested schema.';
          continue;
        }

        draft = content;
        await this.applyHeroImage(draft, research);

        if (this.meetsQualityStandards(draft)) {
          return draft;
        }

        feedback = this.buildRevisionFeedback(content);
      } catch (error) {
        console.warn(`⚠️  Attempt ${attempt} failed for ${research.topic_id}: ${error.message}`);
        feedback =
          'The previous attempt caused an error. Respond with strictly valid JSON containing the required fields.';
      }
    }

    if (draft) {
      await this.applyHeroImage(draft, research);
    }

    return draft;
  }

  /**
   * Save raw AI response to markdown file before parsing
   * This preserves the original response for debugging if JSON parsing fails
   */
  async saveRawResponse(response, research, attempt = 1) {
    try {
      const fs = require('fs');
      const path = require('path');

      // Create raw-responses directory if it doesn't exist
      const rawDir = path.join(__dirname, '../data/raw-responses');
      if (!fs.existsSync(rawDir)) {
        fs.mkdirSync(rawDir, { recursive: true });
      }

      // Generate filename with topic_id and timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const topicId = research.topic_id || 'unknown';
      const filename = `${topicId}_attempt-${attempt}_${timestamp}.md`;
      const filePath = path.join(rawDir, filename);

      // Prepare markdown content with metadata
      const metadata = `---
Topic ID: ${topicId}
Primary Keyword: ${research.primary_keyword || 'N/A'}
Attempt: ${attempt}
Timestamp: ${new Date().toISOString()}
Content Length: ${response.length} characters
---

# RAW AI RESPONSE

${response}
`;

      // Write to file
      fs.writeFileSync(filePath, metadata, 'utf-8');
      console.log(`💾 Raw response saved: ${filename}`);

      return filePath;
    } catch (error) {
      // Don't fail content creation if raw response saving fails
      console.warn(`⚠️  Failed to save raw response: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract article content from the saved raw markdown file
   * This is used as an intermediate fallback when JSON parsing fails
   */
  extractContentFromRawMarkdown(rawFilePath) {
    if (!rawFilePath) {
      return null;
    }

    try {
      const fs = require('fs');

      // Check if file exists
      if (!fs.existsSync(rawFilePath)) {
        console.warn(`⚠️  Raw markdown file not found: ${rawFilePath}`);
        return null;
      }

      // Read the file
      const fileContent = fs.readFileSync(rawFilePath, 'utf-8');

      // Extract content after metadata header
      // The metadata ends with "---" followed by "# RAW AI RESPONSE"
      const contentMatch = fileContent.match(/---\s*\n\n# RAW AI RESPONSE\s*\n\n([\s\S]+)/);

      if (contentMatch && contentMatch[1]) {
        const rawContent = contentMatch[1].trim();
        console.log(`✅ Extracted ${rawContent.length} characters from raw markdown file`);
        return rawContent;
      }

      console.warn(`⚠️  Could not extract content from raw markdown file`);
      return null;
    } catch (error) {
      console.warn(`⚠️  Failed to read raw markdown file: ${error.message}`);
      return null;
    }
  }

  /**
   * Build the content prompt with strict schema and optional feedback
   */
  buildContentPrompt(research, options = {}) {
    const wordTarget = options.minWordCount || this.config.minWordCount;
    const attempt = options.attempt || 1;
    const feedback = options.feedback ? `\nREVISION FEEDBACK:\n${options.feedback}\n` : '';
    const sources = this.getResearchSources(research);
    const sourcesList = sources.length
      ? sources.map((url, idx) => `${idx + 1}. ${url}`).join('\n')
      : 'Reference RBI publications, SEBI circulars, and reputable Indian financial portals.';

    // Dynamic date context
    const now = new Date();
    const currentMonth = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    const currentYear = now.getFullYear();
    const currentFY = now.getMonth() >= 3 ? `FY ${currentYear}-${(currentYear + 1) % 100}` : `FY ${currentYear - 1}-${currentYear % 100}`;
    const currentAY = now.getMonth() >= 3 ? `AY ${currentYear + 1}-${(currentYear + 2) % 100}` : `AY ${currentYear}-${(currentYear + 1) % 100}`;

    // 🚨 CUSTOM TITLE/TOPIC MODE: Build ultra-forceful enforcement if detected
    const isCustomTitleMode = research.topic_id?.startsWith('CUSTOM-TITLE-');

    // Enrich research with topic_title from topics CSV if not already present
    // NOTE: This is a read-only enrichment for in-memory use only.
    // topic_title is NOT in topicResearch CSV schema, so it won't be saved back to CSV.
    // This is safe because: 1) We only read from topicResearch CSV, 2) writeCSV filters to schema columns
    if (!research.topic_title && research.topic_id) {
      const allTopics = this.csvManager.getAllTopics();
      const matchingTopic = allTopics.find(t => t.topic_id === research.topic_id);
      if (matchingTopic && matchingTopic.topic_title) {
        research.topic_title = matchingTopic.topic_title;
      }
    }

    // For title: customTitle > topic_title (from topic generation stage)
    const effectiveTitle = this.customTitle || research.topic_title || null;

    // For primary_keyword: customTopic > extract from title > research.primary_keyword
    let effectivePrimaryKeyword;
    if (this.customTopic) {
      effectivePrimaryKeyword = this.customTopic;
    } else if (effectiveTitle) {
      // Extract primary keyword from title (same logic as deep-topic-researcher.js)
      const extractPrimaryKeyword = (title) => {
        const stopWords = ['the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'best', 'top', 'guide', 'how', 'what', 'why', 'when', 'where'];
        const words = title.toLowerCase().split(/\s+/);
        const keywords = words.filter(word => !stopWords.includes(word));
        return keywords.slice(0, 3).join(' ') || title.toLowerCase();
      };
      effectivePrimaryKeyword = extractPrimaryKeyword(effectiveTitle);
    } else {
      effectivePrimaryKeyword = research.primary_keyword || '';
    }

    const customTitleEnforcement = (isCustomTitleMode && effectiveTitle) ? `
🚨🚨🚨 CRITICAL OVERRIDE - READ THIS FIRST 🚨🚨🚨

**CUSTOM TITLE MODE ACTIVATED**

The user has provided a CUSTOM ARTICLE TITLE. This OVERRIDES all SEO optimization rules.

**MANDATORY REQUIREMENT:**
- Title: "${effectiveTitle}"
- You MUST use this EXACT title in seo_metadata.title field
- DO NOT change capitalization
- DO NOT add punctuation
- DO NOT add descriptive words
- DO NOT add "Guide", "Strategic", "for Indian Investors", "FY 2025-26", or ANY other text
- DO NOT apply SEO best practices to this title

**EXAMPLES:**
❌ FORBIDDEN: "What is Technical Analysis? A Strategic Guide for Indian Investors (FY 2025-26)"
❌ FORBIDDEN: "What is Technical Analysis: A Complete Guide"
❌ FORBIDDEN: "Technical Analysis Explained"
✅ CORRECT: "${effectiveTitle}" (EXACT COPY, no changes)

primary_keyword: "${effectivePrimaryKeyword}"
secondary_keywords: "${research.secondary_keywords}"
focus_keyphrase: "${effectivePrimaryKeyword}"
slug: "${research.slug}"


**IF YOU MODIFY THIS TITLE IN ANY WAY, YOUR RESPONSE WILL BE REJECTED**

This is a user-provided title override. Ignore ALL other title optimization instructions below.

` : '';

    return `You are an award-winning Indian financial blogger, strategist, senior editor, and compliance reviewer.
Using the approved research brief, craft an SEO ready blog article that reads like it was written by PL Capital's in-house experts.

${customTitleEnforcement}

🚨 **MANDATORY WEB SEARCH REQUIREMENT - CRITICAL FOR ACCURACY:**

**YOU MUST USE GOOGLE SEARCH FOR ALL FACTUAL CLAIMS. THIS IS NON-NEGOTIABLE.**

**Current Date Context:** Today is ${currentMonth} ${currentYear}. Any data, regulations, or tax rates MUST be current as of this date.


**STRICT RULES:**
- ❌ NEVER use pre-training knowledge for dates, numbers, regulations, or tax rates
- ❌ NEVER write "as per [old date]" - always verify current status with web search
- ❌ NEVER assume regulations from 2024 or earlier are still valid in ${currentMonth}  ${currentYear}
- ✅ ALWAYS search with current month/year: "${currentMonth} ${currentYear} [topic] official"
- ✅ ALWAYS cite official sources: "As per NSE circular dated [date]", "According to Budget ${currentFY}"
- ✅ If search shows conflicting info, use the MOST RECENT official source

**AUTOMATIC REJECTION TRIGGERS:**
- Writing "Bank Nifty weekly contracts discontinued" without searching current status
- Stating tax rates without ${currentMonth} ${currentYear} web search verification
- Using lot sizes, limits, or thresholds without NSE/SEBI/IT Department web verification
- Any regulatory statement dated before ${currentMonth} ${currentYear} without current verification

OUTPUT RULES:
1. **First**, output a section labeled "### RESEARCH VERIFICATION" where you perform your Google Searches and list the current facts found.
   - Example format:
   \`\`\`
   ### RESEARCH VERIFICATION

   e.g. Searched: "STCG tax rate India November 2025 Budget"
   → Found: 20% as per Finance Act 2025

   e.g. Searched: "Nifty lot size November 2025 NSE"
   → Found: 75 units per NSE specifications

   e.g. Searched: "Bank Nifty weekly expiry 2025 NSE"
   → Found: Continues every Wednesday per NSE circular Nov 2024
   \`\`\`

2. **IMMEDIATELY AFTER** the research verification section, output ONLY the JSON object - NO OTHER CONTENT.
   - ❌ DO NOT output the article in markdown format before the JSON
   - ❌ DO NOT output any content between "### RESEARCH VERIFICATION" and the JSON object
   - ❌ DO NOT use markdown fences (no \`\`\`json or \`\`\`)
   - ✅ The article content belongs INSIDE the JSON's "article_content" field ONLY
   - ✅ Output format: ### RESEARCH VERIFICATION\n[searches]\n\n{JSON object starts here}
   - The JSON must be valid and parseable
   - All facts in the JSON article content must be verified in the RESEARCH VERIFICATION section above

- Article audience: mass affluent Indian investors and salaried professionals evaluating wealth options in ${currentFY}.
- Voice & tone: Think Moneycontrol's encyclopedic depth meets Zerodha Varsity's conversational clarity. Authoritative like Wikipedia (fact-dense, neutral, well-cited) but with personality that makes readers bookmark and return. Write as if explaining to a smart friend over chai - data-backed yet relatable, compliance-safe yet engaging, with PL Capital's advisory expertise shining through natural storytelling.
- Heading etiquette: never output an H1. Start with \`## Summary\`, then use semantic H2/H3/H4 hierarchy.
- Tables: use valid Markdown tables, never placeholders.
- No placeholder strings ({{...}}, [TODO], etc.). Provide finished copy.

**🎯 KEYWORD USAGE - NATURAL WRITING PRIORITY:**

**CRITICAL: Write naturally and focus on reader value. DO NOT force keywords or repeat phrases unnaturally.**

${effectivePrimaryKeyword ? `
**Primary Concept:** "${effectivePrimaryKeyword}"

**Natural Writing Guidelines:**
- ✅ **SEO Title** (seo_metadata.title field):
  - MUST be 50-60 characters (optimal for search results)
  - MUST include the focus keyphrase naturally
  - MUST be different from the article title (topic_title)
  - Should be compelling and click-worthy
  - Examples: "Nifty Options Trading Guide | Complete Strategy 2025" (58 chars), "Bank Nifty Weekly Options: Expert Trading Guide" (52 chars)
- ✅ **Meta Description**: Mention the core concept in a compelling way
- ✅ **URL Slug**: Use the concept (hyphenated, lowercase)
- ✅ **Introduction**: Introduce the topic naturally in the opening paragraph
- ✅ **Body Content**: Use the concept when it flows naturally, otherwise use:
  - Synonyms and variations (e.g., "this strategy", "these patterns", "this approach")
  - Pronouns (it, this, these, they)
  - Related terms that add variety
- ✅ **Headings**: Use descriptive subheadings that signal topic shifts
- ⚠️ **Avoid:** Repetitive keyword stuffing, forced mentions, unnatural bolding

**Writing Philosophy:**
- Readability and value come FIRST
- If a keyword feels forced, use a natural variation instead
- Bold text should emphasize important concepts, not keywords
- Write as if explaining to a colleague, not a search engine
` : `
**Natural Writing Guidelines:**
- Write for human readers, not search engines
- Use varied language and avoid repetition
- Bold text for emphasis on key concepts only
- Focus on clear explanations and actionable insights
`}

**🔍 ATTRIBUTION REQUIREMENT (MANDATORY FOR ALL FACTUAL CLAIMS):**
- When stating facts, data, regulations, or statistics, ALWAYS add attribution phrases
- Use patterns: "As per [source]...", "According to [authority]...", "Based on [document]..."
- Examples:
  ✅ "As per Union Budget ${currentYear}, LTCG tax is 12.5%"
  ✅ "According to NSE specifications, Bank Nifty lot size is 30 units"
  ✅ "Based on SEBI circular dated ${currentMonth.split(' ')[0]} ${currentYear - 1}..."
  ✅ "As per RBI guidelines..."
- If exact source unknown, use qualifiers: "Typically...", "Generally...", "Industry standards suggest..."
- For current/latest data, reference the year: "As of ${currentYear}...", "For ${currentFY}..."
- NEVER state bare facts without attribution (e.g., ❌ "LTCG tax is 12.5%" without source)

**🚨 CRITICAL: ANTI-HALLUCINATION RULES (VIOLATIONS WILL RESULT IN ARTICLE REJECTION):**

1. ❌ **NO FABRICATED STATISTICS**: NEVER invent specific data points, percentages, or statistics that cannot be verified
   - ❌ WRONG: "India's household net-worth grew only 3% in 2023 despite a 12% market rally"
   - ✅ RIGHT: "Many Indian households lag market gains due to poor asset allocation"
   - If you don't have current verified data, use qualifiers: "Recent trends suggest...", "Experts estimate...", "Industry reports indicate..."

2. ❌ **NO WORKSHEET/TEMPLATE REFERENCES**: NEVER mention downloadable worksheets, printable templates, or fill-in documents
   - ❌ WRONG: "### Worksheet Preview – Goal-Setting Template" or "A printable worksheet asks for target amount..."
   - ❌ WRONG: "Download the allocation worksheet", "Fill in the goal-setting template"
   - ✅ RIGHT: "Consider these factors when setting goals: target amount, time horizon, expected return, monthly SIP"
   - Markdown articles CANNOT include downloadable files - use text explanations instead

3. ❌ **NO INTERACTIVE ELEMENTS**: NEVER reference interactive tools, calculators, heat maps, sliders, or drag-and-drop features
   - ❌ WRONG: "### Interactive Allocation Heat-Map (Embed)" or "Use the PL Capital portal to drag-and-drop percentages"
   - ❌ WRONG: "### Tax-Impact Calculator Walkthrough: 1. Enter investment amount 2. Select tax slab 3. View results"
   - ❌ WRONG: "Embed the calculator below", "Use the interactive slider to adjust allocation"
   - ✅ RIGHT: "Calculate tax impact by multiplying returns by your tax bracket (30% for highest slab)"
   - PL Capital website does NOT have these interactive tools - use manual calculation examples instead

4. ❌ **NO HALLUCINATED FUND NAMES OR SPECIFIC PRODUCTS**: NEVER invent fund names, product names, or specific offerings
   - ❌ WRONG: "XYZ Growth Fund", "ABC Nifty Index Fund", "PQR Tax Saver ELSS"
   - ❌ WRONG: "Fund Type | Avg. Expense Ratio | Example Fund | ..."
   - ✅ RIGHT: "Actively Managed Equity Fund", "Nifty 50 Index Fund", "Tax-saving ELSS fund"
   - ✅ RIGHT: Use generic categories, not specific branded products

5. ❌ **NO HALLUCINATED DATA IN TABLES**: If creating comparison tables, use ONLY generic categories or clearly labeled example values
   - ❌ WRONG: Tables with specific fund names, invented expense ratios, or unverified data points
   - ✅ RIGHT: "| Category | Typical Range | Notes |" with "Example values for illustration only" disclaimer
   - ✅ RIGHT: Use research brief data or mark clearly as "Example calculation assuming..."

**IF YOU NEED SPECIFIC DATA:**
- Use research brief data ONLY
- Add qualifiers: "For example...", "Assuming...", "Typical ranges include..."
- Mark example calculations clearly: "Example: If investing ₹10,000 monthly at 12% returns..."
- NEVER present hypothetical data as facts

**🔍 BEFORE WRITING - MANDATORY WEB SEARCH FOR ALL FACTUAL CLAIMS (NON-NEGOTIABLE):**

⚠️ **CRITICAL**: You have Google Search enabled via Gemini-3-Pro-Preview. ALWAYS search BEFORE writing ANY factual claim.

**UNIVERSAL FACT-CHECKING PROTOCOL (APPLIES TO ALL TOPICS):**

**STEP 1: IDENTIFY FACTUAL CLAIMS** - Before writing, categorize statements as:
- ✅ Opinion/Analysis: "Investors should diversify" → NO search needed
- ❌ Factual Data: "Nifty lot size is 75", "Tax rate is 12.5%", "Expiry is Thursday" → SEARCH REQUIRED

**STEP 2: MANDATORY WEB SEARCH** - For EVERY factual claim, search with current month/year:

Search Pattern: "[topic] [specific_detail] [month] [year] current official"

Examples by Topic Domain:
- F&O/Options: "NSE Nifty lot size ${currentMonth} ${currentYear} current official"
- F&O/Options: "NSE index weekly expiry day ${currentMonth} ${currentYear} current schedule"
- F&O/Options: "BSE Sensex weekly expiry day ${currentMonth} ${currentYear} current"
- F&O/Options: "Nifty weekly expiry Tuesday or Thursday ${currentMonth} ${currentYear}"
- F&O/Options: "Bank Nifty weekly expiry discontinued ${currentYear - 1}"
- Tax: "LTCG tax rate India ${currentMonth} ${currentYear} budget circular"
- Mutual Funds: "SEBI mutual fund expense ratio cap ${currentMonth} ${currentYear}"
- NPS: "NPS tax deduction limit section 80CCD ${currentMonth} ${currentYear}"
- Real Estate: "RERA registration requirement ${currentMonth} ${currentYear}"
- Insurance: "term insurance tax benefit section 80C ${currentMonth} ${currentYear}"
- Stocks: "SEBI margin requirements equity ${currentMonth} ${currentYear}"

**STEP 3: CROSS-VERIFY SEARCH RESULTS** - Compare search results with research brief:

Priority Hierarchy (in case of conflicts):
1. ✅ **Official Government/Regulatory Sources** (SEBI, RBI, NSE, BSE, IT Dept) → HIGHEST PRIORITY
2. ✅ **Recent Official Circulars** (dated within 6 months) → HIGH PRIORITY
3. ⚠️ **News Articles** (dated within 3 months) → MEDIUM PRIORITY (verify with 2+ sources)
4. ❌ **Research Brief Data** (no date/source) → LOWEST PRIORITY (verify before use)
5. ❌ **Undated/Generic Sources** → DO NOT USE

If Search Result ≠ Research Brief:
- ✅ Use Search Result (if from official source)
- ❌ Discard Research Brief data
- ⚠️ Add qualifier: "As per [official source dated month year]..."

**STEP 4: CITE SOURCES EXPLICITLY** - EVERY factual claim MUST have attribution:

Attribution Patterns:
- Regulatory: "As per SEBI circular SEBI/HO/MRD/DP/CIR/P/${currentYear}/xxx dated ${currentMonth.split(' ')[0]} ${currentYear}..."
- Tax: "According to Union Budget ${currentYear} (effective ${currentMonth.split(' ')[0]} 1, ${currentYear})..."
- NSE/BSE: "As per NSE circular NSE/INSP/xxx dated ${currentMonth}..."
- RBI: "Based on RBI notification RBI/${currentYear - 1}-${currentYear % 100}/xxx..."
- Generic: "As of ${currentMonth}, [authority] specifies..."

If Exact Date/Circular Unknown:
- Use: "As per current [authority] guidelines (${currentMonth})..."
- Add qualifier: "(subject to regulatory updates)"
- Mark with asterisk (*) and explain in Important Notes section

**STEP 5: VERIFICATION CHECKPOINT** - Before finalizing ANY section:

✅ All numbers/percentages have search-verified sources cited inline
✅ All regulatory data has official circular/notification reference
✅ All dates/schedules have month+year qualifier
✅ All discontinued policies/schemes are NOT mentioned (verify via search)
✅ No bare facts without "As per..." / "According to..." attribution
✅ Conflicting data resolved by prioritizing official sources over research brief


**IF SEARCH FAILS OR RETURNS CONFLICTING RESULTS:**

- ❌ DO NOT guess or fabricate data
- ❌ DO NOT use research brief blindly
- ✅ Add strong qualifiers:
  * "Generally..." / "Typically..." / "As of ${currentMonth} ${currentYear}..."
  * "Subject to verification on official [authority] website"
  * "Investors should verify current rates/limits with [authority]"
- ✅ Mark with asterisk (*):
  * "Nifty lot size is typically 50-75 units* as of ${currentMonth} ${currentYear}"
  * *Add to Important Notes: "Lot sizes subject to NSE revisions. Verify current lot size on NSE website before trading."

**CRITICAL FAILURE MODES TO AVOID:**

❌ **OUTDATED DATA**: "Bank Nifty weekly expiry is Wednesday" (verify via search - may be discontinued)
❌ **WRONG NUMBERS**: "Nifty lot size is 75" (verify current lot size via search)
❌ **WRONG SCHEDULES**: "Nifty expiry is Thursday" (verify current schedule via search, it is Tuesday currently)
❌ **UNSOURCED CLAIMS**: "LTCG tax is 12.5%" (without "As per Union Budget ${currentYear}...")
❌ **RESEARCH BRIEF OVER SEARCH**: Using research brief data that contradicts search results

✅ **CORRECT APPROACH**: e.g. "As per NSE circular dated ${currentMonth.split(' ')[0]} ${currentYear}, Nifty 50 lot size is [search-verified number] units (subject to NSE revisions). Weekly expiry schedules as of ${currentMonth} ${currentYear}: [search-verified current status]."

**🔤 LSI KEYWORDS & SEMANTIC SEO (MANDATORY TOPICAL AUTHORITY):**

**What are LSI Keywords?**
LSI (Latent Semantic Indexing) = semantically related terms that Google expects to see in comprehensive content about your topic.

**LSI Strategy:**
1. **Research Brief Integration**: Use 5-10 secondary keywords from seo_metadata.secondary_keywords
2. **Semantic Variations**: Include 10-15 topically related terms NOT in keyword list
3. **Entity Recognition**: Reference key entities (organizations, products, regulations, people)
4. **Co-Occurrence Terms**: Use words that commonly appear with primary keyword in top-ranking content

**LSI Keyword Categories (Use 2-3 from EACH category):**

**Category 1: Synonyms & Related Concepts**
Primary Keyword: "Mutual Fund SIP"
- LSI Terms: systematic investment plan, recurring investment, auto-debit investment, monthly mutual fund, SIP mandate, rupee-cost averaging, systematic transfer plan (STP), systematic withdrawal plan (SWP)

Primary Keyword: "Technical Analysis"
- LSI Terms: chart patterns, price action, trend analysis, candlestick formations, support resistance, moving averages, RSI indicator, MACD, volume analysis

**Category 2: Process & Mechanism Terms**
- How it works: mechanics, process, methodology, framework, structure, operation
- Implementation: setup, activation, enrollment, registration, configuration
- Execution: transaction, processing, execution, deployment, initiation

**Category 3: Benefits & Outcomes**
- Advantages: benefits, advantages, pros, upsides, strengths, positives
- Results: returns, gains, outcomes, performance, yield, appreciation
- Impact: effect, influence, consequence, implication, result

**Category 4: Comparisons & Alternatives**
- Versus: vs, compared to, versus, versus alternatives, in comparison
- Alternatives: options, alternatives, substitutes, other choices
- Competitors: similar products, comparable options

**Category 5: Compliance & Regulatory**
For financial content, ALWAYS include:
- Regulatory bodies: SEBI, RBI, PFRDA, IRDAI, NSE, BSE
- Compliance terms: regulation, circular, guidelines, norms, standards
- Tax terms: LTCG, STCG, Section 80C, tax treatment, tax implications
- Legal: disclosure, risk factors, eligibility, terms and conditions

**Category 6: User Intent Terms**
- Informational: guide, tutorial, explanation, definition, meaning, understanding
- Transactional: invest, buy, open account, start, begin, apply
- Navigational: calculator, comparison, review, rating, best options
- Commercial: cost, fees, charges, expense ratio, returns, performance

**Semantic Clustering Example:**

**Topic: NPS (National Pension System)**

**Primary Keyword**: "NPS investment"

**LSI Keywords to Include**:
- Tier 1 account, Tier 2 account (product variations)
- Pension fund managers, fund allocation (process terms)
- Section 80CCD(1), Section 80CCD(2), additional tax deduction (tax benefits)
- PFRDA regulations, annuity purchase, partial withdrawal (compliance)
- Retirement corpus, pension planning, post-retirement income (outcomes)
- PPF vs NPS, EPF comparison, Atal Pension Yojana (alternatives)
- Equity allocation, corporate bond, government securities (investment classes)
- Exit rules, maturity benefits, premature withdrawal (lifecycle terms)

**Semantic Density Target:**
- Primary keyword: 1.0-1.5% (24-36 mentions in 2,400 words)
- LSI keywords combined: 3-5% (72-120 mentions across all LSI terms)
- Natural distribution: 15-20 unique LSI terms used 3-8 times each

**CRITICAL: FOLLOW THESE 41 GUIDELINES STRICTLY**

1. ✅ NEVER mention competitor names: Zerodha, Upstox, Angel One, ICICI Direct, Groww
2. ✅ START DIRECTLY WITH "## Summary" - NO introductory paragraphs before this H2
3. ✅ NO H2 for "Introduction" - One plain text paragraph after Summary (no heading)
4. ✅ ADD "## Key Takeaways" section BEFORE "## Conclusion" (5-7 action-oriented bullets)
5. ✅ ADD "## Action Plan" section BEFORE "## Conclusion" (step-by-step monthly roadmap)
6. ✅ MOVE "## FAQ Section" or "## FAQs on [Topic]" AFTER "## Conclusion" (never before)
7. ✅ Use MIXED formatting throughout - paragraphs, tables, bullets, numbered lists (NOT all bullets)
8. ✅ EEAT COMPLIANCE: Human-readable, high-quality, original content with expertise, experience, authority, trust
9. ✅ CTA in Conclusion: MUST include link to https://instakyc.plindia.com/ with text "Open your PL Capital account"
10. ✅ PRIMARY KEYWORD OPTIMIZATION: Follow 1.0-1.5% density target (see "PRIMARY KEYWORD OPTIMIZATION" section above for full placement hierarchy, distribution pattern, and keyword variation rules). NEVER exceed 2% density - this triggers keyword stuffing penalties
11. ✅ 8th GRADE ENGLISH - Simple language, simplified H2s (avoid jargon, explain technical terms)
12. ✅ H2s and H3s structure - Semantic hierarchy with focus keyword variations in headings
13. ✅ WORD COUNT: MINIMUM 2,200 words, TARGET 2,400 words - substantive and comprehensive. Each H2 section must be 250-350 words with detailed examples, tables, data, and step-by-step breakdowns. DO NOT submit articles under 2,000 words
14. ✅ ELABORATE examples with REAL data - NO hallucination, NO fake statistics, NO invented fund names. Use CURRENT accurate data (e.g., Bank Nifty lot size = 30 units, expiry = last Tuesday)
15. ✅ SENTENCES: Under 15 words average - short, punchy, clear sentences
16. ✅ CONCISE throughout - Every paragraph must earn its place, cut ruthlessly
17. ✅ ENHANCED GREEKS section (if applicable): Flowing explanations with real examples, NOT just definitions
18. ✅ 5 FAQs ONLY - No more, no less (H3 format with complete questions)
19. ✅ 100-WORD Conclusion - Brief, actionable, with PL Capital CTA
20. ✅ DATE CONTEXT: ${currentMonth} ${currentYear} - use "${currentFY}" for current financial year, "${currentAY}" for assessment year
21. ✅ FAQ ANSWERS: 30-40 words each with COMPLETE questions in H3 format (e.g., "### What is...")
22. ✅ FAQ PLACEMENT: MUST be AFTER "## Conclusion" section (never before, never mid-article)
23. ✅ WEB RESEARCH: Use factual accuracy, proper content structure, real data from research brief

**FACTUAL ACCURACY & COMPLIANCE RULES (24-40) - UNIVERSAL APPLICATION:**

24. ✅ VERIFY CURRENT DATA VIA WEB SEARCH: NEVER use research brief data without search verification. If search result conflicts with research brief, ALWAYS use search result from official sources. Add source attribution for ALL factual claims.

25. ✅ QUANTITATIVE CLAIMS (volumes, participation, user counts):
   - ❌ AVOID specific unverifiable numbers: "12 lakh traders", "5.7 crore contracts"
   - ✅ USE general qualifiers: "Lakhs of traders", "Approximately X crore", "Industry estimates suggest..."
   - ✅ IF using specific numbers, cite source: "As per NSE data (${currentMonth.split(' ')[0]} ${currentYear}), approximately X contracts..."
   - Add asterisk (*) and explain in Important Notes if source unavailable

26. ✅ REGULATORY DATA (lot sizes, margins, limits, ratios):
   - ❌ NEVER use hardcoded values without search verification
   - ✅ ALWAYS search: "[specific_data] ${currentMonth} ${currentYear} [authority] official"
   - ✅ ALWAYS add qualifier: "As per [authority] (subject to [authority] revisions)"
   - ✅ Example: "As per NSE specifications (${currentMonth} ${currentYear}), Nifty lot size is X units (subject to NSE revisions)"

27. ✅ SCHEDULES & DATES (expiries, deadlines, timelines):
   - ❌ NEVER assume schedules remain constant - they change frequently
   - ✅ ALWAYS search: "[schedule] ${currentMonth} ${currentYear} current" before writing
   - ✅ ALWAYS verify discontinued schedules: Search "[feature] discontinued ${currentYear}"
   - ✅ Example: "As of ${currentMonth} ${currentYear}, [index] expiry is [day] (subject to exchange notifications)"

28. ✅ RANGES & INTERVALS (strike intervals, percentage bands, thresholds):
   - ❌ AVOID absolute statements: "Strike interval is 50 points"
   - ✅ USE qualifiers: "Typically...", "Generally...", "As of [date]..."
   - ✅ Example: "Strike intervals are typically 50 points for ATM strikes (verify on NSE for specific contracts)"

29. ✅ ELIGIBILITY & REQUIREMENTS (income limits, qualifications, prerequisites):
   - ❌ NEVER present broker requirements as regulatory mandates
   - ✅ CLARIFY source: "Most brokers require...", "Typical broker criteria include..."
   - ✅ NOT: "SEBI requires ₹2 lakh income" UNLESS you have SEBI circular reference
   - ✅ Example: "Brokers typically require minimum annual income (₹2-3 lakh varies by broker) for F&O trading"

30. ✅ LIMITS & CAPS (circuit limits, investment caps, deduction limits):
   - ✅ SEARCH for current limits before writing
   - ✅ CLARIFY scope: "Individual stock circuits...", "Market-wide breakers...", "No strike-level circuits..."
   - ✅ Example: "Individual strikes have no circuit limits; market-wide breakers apply at index level (±10%, ±15%, ±20%)"

31. ✅ TAX RULES (rates, slabs, deductions, exemptions):
   - ✅ ALWAYS specify assessment year: "for ${currentAY}"
   - ✅ ALWAYS cite budget/circular: "As per Union Budget ${currentYear} (effective ${currentMonth.split(' ')[0]} 1, ${currentYear})..."
   - ✅ ALWAYS add disclaimer: "(subject to future budget changes)"
   - ✅ Search before writing: "[tax_type] rate India ${currentMonth} ${currentYear} budget"

32. ✅ DISCONTINUED POLICIES/FEATURES (crucial to avoid outdated content):
   - ✅ SEARCH FIRST: "[feature/policy] discontinued India ${currentYear}" AND "[feature] still available ${currentMonth} ${currentYear}"
   - ❌ IF discontinued, DO NOT mention as current option
   - ✅ IF historically relevant, clarify: "Previously available until [date]" or "Discontinued effective [date]"
   - ✅ Example: If search confirms "Bank Nifty weekly expiry discontinued ${currentYear - 1}" → Don't write about it as current feature
32. ✅ PROBABILITY & SUCCESS RATES: NEVER state as facts - "65% probability of profit" is PROHIBITED. Instead: "Your profit chances improve when [conditions]... exact probability varies by market conditions"
33. ✅ RETURNS & ROI: Always frame as examples - "Example Return: 233% if price reaches upper strike" NOT "Return on Investment: 233% gain"
34. ✅ PERCENTAGE CLAIMS: Qualify cost savings/reductions - "Example shows: 67% cost reduction" or "significantly reduces cost" NOT absolute "40-70% reduction" without context
35. ✅ AVOID REPETITION: Each key concept should be explained ONCE in detail. Don't repeat cost advantages, volatility warnings, or expiry risks across multiple sections. Consolidate.
36. ✅ GREEKS/TECHNICAL SECTIONS: Keep practical and accessible. Focus on "Understanding Risk Factors" with real impact, not heavy Greek formulas. Example: "Time decay (Theta)" with practical effect, not "Bought Call Theta: -₹8, Sold Call Theta: +₹6, Net Theta: -₹2"
37. ✅ UNSOURCED HISTORICAL DATA: NEVER claim "Historical data shows..." or "Studies indicate..." without sources. Use: "Nifty typically shows weekly movements" NOT "Historical data shows Nifty moves 0.5-1% weekly on average"
38. ✅ IMPORTANT NOTES SECTION: IF any asterisks (*) are used in article, add "**Important Notes:**" section at end explaining all asterisked items. IF no asterisks used, standard risk disclaimer is sufficient.
39. ✅ ASTERISK USAGE: Mark claims requiring qualifiers with asterisk (*) in body text, then explain in "Important Notes" section. Only include explanations for asterisk-marked items actually used in the article.
40. ✅ LSI KEYWORDS & SEMANTIC SEO: Use 2-3 terms from EACH of the 6 LSI categories (see "LSI KEYWORDS & SEMANTIC SEO" section above). Target 3-5% combined LSI keyword density (72-120 mentions across 15-20 unique LSI terms). This builds topical authority and helps Google understand content comprehensiveness.

**ARTICLE STRUCTURE (MANDATORY ORDER):**

1. ## Summary (3-4 sentences summarizing the article's KEY FINDINGS and CONCLUSIONS - NOT a forward-looking introduction. Use present tense: "This article covers...", "We analyze...", "The analysis reveals..." NOT "I'm excited to share", "This article aims to", "You'll learn")
2. Plain text introduction paragraph (NO H2 heading, 1 paragraph explaining topic)
3. ## [Main Topic] sections (2-8 H2 sections with H3 subsections)
4. ## Key Takeaways (5-7 action-oriented bullets BEFORE Conclusion)
5. ## Action Plan (Monthly roadmap: Month 1-2, Month 3-4, etc.)
6. ## Conclusion (100 words max, must include CTA with https://instakyc.plindia.com/)
7. ## FAQ Section or ## FAQs on [Topic] (EXACTLY 5 FAQs with H3 questions, 30-40 word answers)

**CRITICAL FORMATTING RULES:**

- **Summary**: Must be FIRST H2, no content before it. MUST summarize article's findings/content in present tense ("This article covers", "We examine", "The guide explains"). NEVER use first-person future ("I'm excited", "you'll learn") or forward-looking language ("aims to provide", "will cover")
- **No Introduction H2**: After Summary, start with plain text paragraph (no heading)
- **Key Takeaways**: BEFORE Conclusion, bullet list with "You can...", "Consider...", "Start with..."
- **Action Plan**: BEFORE Conclusion, monthly timeline (Month 1-2: ..., Month 3-4: ...)
- **Conclusion**: 100 words, 2-3 paragraphs, MUST include: "Ready to [action]? [Open your PL Capital account](https://instakyc.plindia.com/) and..." - This is the ONLY place for CTAs and links
- **FAQs**: AFTER Conclusion, H3 format: "### What is [topic]?", "### How does [topic] work?", etc. - This is the FINAL section, nothing comes after
- **FAQ Answers**: 30-40 words each, complete sentences, specific data (amounts, percentages, timelines)
- **CRITICAL**: Article MUST END with FAQ section. NO external links, NO "Talk to Advisor" sections, NO additional resources after FAQs

**WRITING STYLE - THE "WIKIPEDIA WITH SOUL" APPROACH:**

**Authority Markers (Encyclopedia-like depth):**
- Start sections with definitive statements: "X is...", "Y represents...", "Z consists of..."
- Cite official sources like Wikipedia: "As per SEBI circular...", "According to RBI guidelines..."
- Use precise terminology: "LTCG" before "long-term capital gains tax", "NAV" before "net asset value"
- Include hard numbers: specific percentages, dates, amounts (₹10,000, ₹1 lakh, ₹50,000)
- Structure content logically: definition → how it works → pros/cons → examples → action steps

**Personality Markers (Reader engagement):**
- Address reader directly: "You can...", "Your portfolio...", "When you invest..." (NOT "Investors can...")
- Use relatable analogies: "Think of ELSS like a locked FD with tax benefits" or "Imagine diversification as not putting all eggs in one basket"
- Add contextual hooks: "Here's the catch:", "The reality?", "Why does this matter?", "Here's what changes in ${currentFY}:"
- Sprinkle conversational transitions: "But here's the thing...", "Let's be real...", "The bottom line?", "Fair warning:"
- Create mental images: "Picture a 35-year-old software engineer from Bangalore..." (for case studies)
- Pose rhetorical questions occasionally: "Why do investors overlook this?", "What's the trade-off?" (but answer immediately)

**Execution Guidelines:**
- Short sentences (under 15 words average) - punchy and clear
- 8th grade reading level - accessible without dumbing down
- Active voice dominates (80%+): "You can invest..." NOT "Investors can invest..."
- Mixed formatting: paragraphs + tables + bullets + numbered lists (never all bullets)
- Natural keyword flow - weave terms organically, no stuffing
- Specific examples with INR amounts - make numbers tangible
- Real data only - zero hallucination, zero fake statistics

**Tone Calibration Examples:**
❌ TOO DRY: "Index funds track a market index and offer diversification benefits with lower expense ratios compared to actively managed funds."
✅ BALANCED: "Index funds track a market index like Nifty 50. You get instant diversification across 50 stocks. The catch? Lower costs (expense ratios under 0.5%) but no active stock picking."

❌ TOO CASUAL: "Yo, tax-saving is super easy with ELSS funds! Just dump some cash and chill for 3 years lol"
✅ BALANCED: "ELSS funds offer Section 80C tax deductions up to ₹1.5 lakh. You lock in for 3 years (shortest among tax-saving options). The trade-off? Market risk for potentially higher returns than PPF."

**Balance Check:**
- If it sounds like a textbook definition → Add a "you" statement or relatable example
- If it sounds like a WhatsApp forward → Add official citations and specific data
- If every paragraph starts with "You" → Mix in some neutral statements for authority
- If zero personality shows through → Add one conversational hook per major section

The goal: Readers trust your expertise (Wikipedia-level authority) AND bookmark the page because it's enjoyable to read (personality that respects their intelligence).

**📏 READABILITY MANDATE (MANDATORY 80% COMPLIANCE):**

- TARGET: 80% of sentences MUST be ≤15 words
- Break compound sentences with periods, NOT commas/semicolons
- Transformation examples:
  ❌ WRONG: "As of November 2025, data from NPS Trust reveals a distinct divergence: while 1-year returns have moderated to single digits due to recent market consolidation, 5-year CAGRs remain robust at 20-22%." (42 words)
  ✅ RIGHT: "November 2025 data from NPS Trust shows a divergence. One-year returns have moderated to single digits due to market consolidation. However, 5-year CAGRs remain robust at 20-22%." (3 sentences, 11+14+10 words each)

  ❌ WRONG: "Recent market volatility has tested investor patience, but the structural low-cost advantage of NPS (Expense Ratios capped at 0.09%) continues to compound wealth effectively over the long term." (28 words)
  ✅ RIGHT: "Recent market volatility has tested investor patience. But NPS has a structural advantage. Expense ratios are capped at 0.09%. This compounds wealth effectively long-term." (4 sentences, 7+8+7+6 words each)

- How to split long sentences:
  1. Find compound clauses joined by commas, semicolons, or conjunctions
  2. Break into separate sentences using periods
  3. Keep each sentence focused on ONE idea
  4. Target 10-15 words per sentence (never exceed 20)

**✨ E-E-A-T EXPERIENCE SIGNALS (MANDATORY AUTHORITY BUILDERS):**

- Include 1-2 brief case study examples with realistic scenarios:
  Example: "A 35-year-old software engineer who switched from SBI to UTI Pension Fund in 2020 saw their XIRR improve from 9.8% to 13.2% over 5 years."

- Add expert quote callouts using blockquote format:
  Example:
  > "The key to NPS success is staying invested through volatility cycles. Time in the market beats timing the market."
  > — Senior Pension Fund Analyst, PFRDA-certified advisor

- Link out to 2-3 authoritative sources for regulatory/data claims:
  - Format: "As per [PFRDA guidelines](https://www.pfrda.org.in), you can switch managers once annually."
  - Use official domains: pfrda.org.in, sebi.gov.in, rbi.org.in, nseindia.com
  - Only link to verifiable, credible sources

- Add "Data Source" attributions under tables:
  Example: "*Data Source: PFRDA/NPS Trust disclosures as of ${currentMonth} ${currentYear}. Past performance is not indicative of future results.*"

**GREEKS/RISK FACTORS SECTION (if applicable for options/derivatives topics):**

- Title section "Understanding Risk Factors" NOT "Greeks Analysis" for better accessibility
- Explain concepts in plain language: "Price Movement (Delta)", "Time Decay (Theta)", "Volatility Impact (Vega)"
- Focus on practical impact: "If Nifty moves 100 points, your spread gains value gradually"
- Use simple examples with real ₹ amounts, NOT complex formulas like "Net Theta: -₹2 = (Bought -₹8) + (Sold +₹6)"
- Skip Gamma entirely unless absolutely critical - it's too technical for most readers
- Keep it conversational: "Time works against all options buyers. Bull call spread reduces this impact significantly."

**PROHIBITED:**

- ❌ Competitor names: Zerodha, Upstox, Angel One, ICICI Direct, Groww
- ❌ "## Introduction" heading (use plain text after Summary)
- ❌ FAQs before Conclusion
- ❌ More than 5 FAQs
- ❌ Conclusions longer than 100 words
- ❌ External links sections (e.g., "Talk to a PL Capital Advisor", "Related Links", "Additional Resources")
- ❌ Footer links to SIP Planner, Tax Savings Checklist, Income Tax Department, or any other external pages
- ❌ Navigation links or resource links at the end of the article
- ❌ ANY content after the FAQ section (article MUST end with FAQs)
- ❌ Keyword stuffing or repetitive explanations
- ❌ Fake statistics or invented data
- ❌ FABRICATED STATISTICS: "India's household net-worth grew only 3% in 2023", unverified market data
- ❌ WORKSHEET/TEMPLATE REFERENCES: "Goal-Setting Template", "printable worksheet", "downloadable tools"
- ❌ INTERACTIVE ELEMENTS: "Interactive Heat-Map", "Tax Calculator Walkthrough", "drag-and-drop", "embed calculator"
- ❌ HALLUCINATED FUND NAMES: "XYZ Growth Fund", "ABC Nifty Index Fund", "PQR Tax Saver ELSS"
- ❌ HALLUCINATED DATA IN TABLES: Specific fund names, invented expense ratios, unverified comparisons
- ❌ Generic CTA links (must use https://instakyc.plindia.com/)
- ❌ Outdated date references (always use ${currentMonth} ${currentYear} or ${currentFY})
- ❌ Sentences longer than 20 words (aim for under 15 words)
- ❌ Specific unverifiable trader numbers ("12 lakh traders", "5 lakh users")
- ❌ Absolute statements about lot sizes, volumes, or intervals without qualifiers
- ❌ Presenting broker requirements as SEBI/regulatory mandates
- ❌ "Disclaimer" heading (use "Important Notes" instead)
- ❌ Unqualified tax rules (always add "for ${currentAY}")
- ❌ Probability/success rates stated as facts ("65% probability", "60-65% success rate")
- ❌ Unsourced historical claims ("Historical data shows...", "Studies indicate...")
- ❌ Absolute ROI claims (frame as "Example Return" not "Return on Investment")
- ❌ Future-date references like "as of Nov 2025" (just use "subject to NSE revisions")
- ❌ Heavy Greek formulas (use practical "Understanding Risk Factors" approach)
- ❌ ARTICLES UNDER 2,000 WORDS - Every article must be minimum 2,200 words with substantive content

**❌ CRITICAL: OUTDATED DATA THAT MUST BE SEARCH-VERIFIED (EXAMPLES OF COMMON ERRORS):**

- ❌ **WRONG LOT SIZES**: "Nifty lot size is 75" (verify via search with current date)
- ❌ **WRONG EXPIRY DAYS**: "Nifty expiry is Thursday" (verify via search - schedules change frequently)
- ❌ **DISCONTINUED FEATURES**: "Bank Nifty weekly expiry is Wednesday" (verify if still active via search)
- ❌ **DISCONTINUED FEATURES**: "Fin Nifty weekly expiry" (verify if still active via search)
- ❌ **OLD TAX RATES**: Stating tax rates without Union Budget year and effective date
- ❌ **OLD DEDUCTION LIMITS**: Using previous year's 80C/80CCD limits without verification
- ❌ **OUTDATED REGULATIONS**: Citing old SEBI/RBI circulars without checking for updates

**✅ CORRECT APPROACH - ALWAYS SEARCH FIRST:**
1. Search: "Nifty lot size ${currentMonth} ${currentYear} NSE official" → Use search result, not research brief
2. Search: "NSE index weekly expiry ${currentMonth} ${currentYear}" → Verify current schedule
3. Search: "Bank Nifty weekly expiry discontinued ${currentYear}" → Confirm if feature is available
4. Add source: "As per NSE circular dated ${currentMonth.split(' ')[0]} ${currentYear}, Nifty lot size is X (subject to NSE revisions)"
5. For discontinued features: Don't mention them OR clarify "Previously available until [date]"

**WORD COUNT DISTRIBUTION (MANDATORY 2,400+ words total - DO NOT submit articles under 2,200 words):**

- Summary: 50-80 words
- Introduction paragraph (no heading): 50-80 words
- Main H2 sections (2-8 sections): 1,800-2,000 words (250-350 words each with detailed examples, tables, data)
- Key Takeaways: 100-150 words
- Action Plan: 150-200 words
- Conclusion: 100 words
- FAQs (5 questions): 200-250 words (40-50 words per FAQ)

**CRITICAL: Each main H2 section MUST be substantive (250-350 words) with:**
- Detailed explanations with specific examples
- Data tables comparing options
- Step-by-step breakdowns
- Real ₹ amounts and calculations
- Pros/cons lists where applicable
Total article MUST exceed 2,200 words. Articles under 2,000 words will be REJECTED.

**🚨 FINAL REMINDER - ARTICLE STRUCTURE:**

1. ✅ Conclusion MUST include CTA: "Ready to [action]? [Open your PL Capital account](https://instakyc.plindia.com/) and..."
2. ✅ FAQs section is the FINAL section of the article
3. ❌ NO external links sections after FAQs (e.g., "Talk to a PL Capital Advisor")
4. ❌ NO footer links to SIP Planner, Tax Checklist, Income Tax Department, or any other pages
5. ❌ NO "Related Links", "Additional Resources", or navigation sections
6. ✅ Article MUST END with the FAQ section - NOTHING AFTER

**JSON SCHEMA (REQUIRED OUTPUT FORMAT):**

Respond with a single valid JSON object (no markdown fences) following this schema:

JSON SCHEMA:
{
  "topic_id": "string",
  "seo_metadata": {
    "title": ${isCustomTitleMode ? `"${research.primary_keyword}" (EXACT COPY - NO MODIFICATIONS ALLOWED)` : `"string 50-60 characters (OPTIMAL), MUST contain the focus keyphrase naturally, MUST be different from topic_title"`},
    "meta_description": "string 140-160 characters with a CTA and focus keyphrase",
    "focus_keyphrase": "string",
    "secondary_keywords": ["string", "string", "string"]
  },
  "article_content": "markdown string >= ${wordTarget} words with deep analysis, data, recommendations, CTAs, and inline links",
  "content_upgrades": ["string", "string"],
  "compliance": "string including SEBI/RBI disclaimers and investor risk warnings",
  "quality_metrics": {
    "word_count": number,
    "readability_score": "Excellent | Good | Fair | Needs Review",
    "seo_score": "Excellent | Good | Fair | Needs Review"
  }
}

${feedback}
ATTEMPT: ${attempt}
RESEARCH CONTEXT:
- Topic ID: ${research.topic_id}
- Primary Keyword: ${research.primary_keyword}
- Search Intent: ${research.search_intent}
- Content Gaps to Address: ${research.content_gaps}
- Top 10 Competitors Analysis: ${typeof research.top_10_competitors === 'string' ? research.top_10_competitors : JSON.stringify(research.top_10_competitors || 'Not available')}
- Related Questions Users Ask: ${typeof research.related_questions === 'string' ? research.related_questions : JSON.stringify(research.related_questions || [])}
- Content Superiority Plan: ${research.content_superiority_plan}
- Resource Requirements: ${research.resource_requirements}
- Regulatory Compliance: ${research.regulatory_compliance}
- Estimated Impact: ${research.estimated_impact}
${research.content_outline ? `
**${research.custom_outline_provided ? '🚨 MANDATORY USER-PROVIDED OUTLINE' : 'RECOMMENDED CONTENT OUTLINE (from deep research)'}:**
${typeof research.content_outline === 'string' ? research.content_outline : JSON.stringify(research.content_outline)}

${research.custom_outline_provided
  ? '⚠️ This outline was PROVIDED BY THE USER. You MUST follow this exact structure. Use the specified header tags (H1, H2, H3) as instructed. Do not deviate from this outline. Consider comments as implementation instructions.'
  : 'Use this outline as a strategic guide. Adapt it to ensure the article follows the MANDATORY ORDER and CRITICAL FORMATTING RULES above.'}
` : ''}

Focus on outperforming top competitors in depth, freshness, and authority while maintaining compliance.
`;
  }

  /**
   * Call Gemini/Groq/OpenAI models in priority order for content drafting
   */
  async callAI(prompt) {
    // Try Gemini first (primary model)
    if (this.geminiApiKey) {
      try {
        const result = await this.callGeminiModel('gemini-3-pro-preview', prompt);
        console.log('🤖 Draft generated via Google Gemini 3.0 Pro Preview (primary)');
        return result;
      } catch (error) {
        console.warn(`⚠️  Gemini 3.0 Pro Preview failed: ${error.message}`);
      }
    }

    // Fallback to Groq models
    const groqModels = [
      { name: 'groq/compound', label: 'Groq Compound (fallback)', temperature: 0.55 },
      { name: 'openai/gpt-oss-120b', label: 'Groq GPT-OSS 120B (fallback)', temperature: 0.6 }
    ];

    if (this.groqApiKey) {
      for (const model of groqModels) {
        try {
          const result = await this.callGroqModel(model.name, prompt, model.temperature);
          console.log(`🤖 Draft generated via ${model.label}`);
          return result;
        } catch (error) {
          console.warn(`⚠️  ${model.label} failed: ${error.message}`);
        }
      }
    }

    if (this.openaiApiKey) {
      try {
        const params = this.modelParams.stages.content;
        const response = await fetch(this.openaiApiUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            response_format: params.response_format,
            messages: [
              {
                role: 'system',
                content:
                  'You are a senior financial content strategist. Always respond with valid JSON following the provided schema.',
              },
              { role: 'user', content: prompt },
            ],
            temperature: params.temperature,
            top_p: params.top_p,
            frequency_penalty: params.frequency_penalty,
            presence_penalty: params.presence_penalty,
            max_tokens: params.max_tokens,
          }),
        });

        if (!response.ok) {
          throw new Error(`OpenAI API error: ${response.status}`);
        }

        const data = await response.json();
        const message = data.choices[0]?.message || {};
        const content = message.content || message.parsed || '';
        if (!content) {
          throw new Error('OpenAI returned an empty response');
        }
        console.log('🤖 Draft generated via OpenAI gpt-4o');
        return content;
      } catch (error) {
        console.warn(`⚠️  OpenAI gpt-4o failed: ${error.message}`);
      }
    }

    if (this.groqApiKey) {
      try {
        const fallback = await this.callGroqModel(
          'meta-llama/llama-4-maverick-17b-128e-instruct',
          prompt,
          0.6
        );
        console.log('🤖 Draft generated via Groq Llama-4 Maverick');
        return fallback;
      } catch (error) {
        console.warn(`⚠️  Groq Llama-4 Maverick failed: ${error.message}`);
      }
    }

    throw new Error('No AI API available');
  }

  async callGroqModel(modelName, prompt, temperature = 0.6) {
    if (!this.groqApiKey) {
      throw new Error('GROQ_API_KEY not configured');
    }

    const params = this.modelParams.stages.content;
    const response = await fetch(this.groqApiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelName,
        response_format: params.response_format,
        messages: [
          {
            role: 'system',
            content:
              'You are a senior financial content strategist. Always respond with valid JSON following the provided schema.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: params.temperature,
        top_p: params.top_p,
        frequency_penalty: params.frequency_penalty,
        presence_penalty: params.presence_penalty,
        max_tokens: params.max_tokens,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`${response.status} ${detail ? `- ${detail}` : ''}`.trim());
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message || {};
    const content = message.parsed
      ? typeof message.parsed === 'string'
        ? message.parsed
        : JSON.stringify(message.parsed)
      : message.content || '';

    if (!content) {
      throw new Error('Model returned an empty response');
    }

    return content;
  }

  /**
   * Call Google Gemini model for content generation
   */
  async callGeminiModel(modelName, prompt) {
    if (!this.geminiApiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    try {
      const model = this.genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.6,
          topP: 0.92,
          topK: 40,
          maxOutputTokens: 16000, // Increased from 8192; Gemini 3 Pro supports up to 32,768
          responseMimeType: 'application/json',
        },
        tools: [{ googleSearch: {} }],
        systemInstruction: 'You are a senior financial content strategist. Always respond with valid JSON following the provided schema. Never include markdown code fences or explanatory text - ONLY return the JSON object.',
      });

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const content = response.text();

      if (!content) {
        throw new Error('Gemini returned an empty response');
      }

      return content;
    } catch (error) {
      throw new Error(`Gemini API error: ${error.message}`);
    }
  }

  /**
   * Parse AI response, repairing JSON when necessary
   */
  parseContentResponse(response, research, rawFilePath = null) {
    const safeResponse = this.stripControlChars(response || '');

    // Extract RESEARCH VERIFICATION section
    const researchVerification = this.extractResearchVerification(safeResponse);

    // Extract JSON payload
    const jsonPayload = this.extractJsonPayload(safeResponse);

    if (jsonPayload) {
      const parsed = this.parseJsonObject(jsonPayload);
      if (parsed) {
        return this.structureFromParsed(parsed, research, researchVerification);
      }
    }

    // 🔄 JSON parsing failed - try extracting content from raw markdown file
    console.log(`⚠️  JSON parsing failed for ${research.topic_id}. Attempting to extract from raw markdown...`);

    const rawContent = this.extractContentFromRawMarkdown(rawFilePath);

    if (rawContent) {
      console.log(`✅ Using content extracted from raw markdown file`);
      return this.buildFallbackContent(rawContent, research);
    }

    // 🚨 Both JSON parsing and raw extraction failed - use basic fallback
    console.warn(`⚠️  Could not extract from raw markdown. Using basic fallback.`);
    return this.buildFallbackContent(safeResponse, research);
  }

  /**
   * Attempt to locate JSON within an AI response
   * Extracts content between first { and last } AFTER skipping RESEARCH VERIFICATION
   */
  extractJsonPayload(response) {
    if (!response) return null;

    // Skip RESEARCH VERIFICATION section if present
    // Look for the first { that marks the end of verification section
    const verificationPattern = /###\s*RESEARCH\s+VERIFICATION\s*[\s\S]*?(?=\{)/i;
    const verificationMatch = response.match(verificationPattern);

    // Start searching for JSON after RESEARCH VERIFICATION (or from beginning if no verification)
    const searchStart = verificationMatch ? verificationMatch[0].length : 0;

    const firstBrace = response.indexOf('{', searchStart);
    const lastBrace = response.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
      return null;
    }

    const jsonString = response.substring(firstBrace, lastBrace + 1);
    return this.normalizeJsonString(jsonString);
  }

  /**
   * Extract RESEARCH VERIFICATION section from AI response
   */
  extractResearchVerification(response) {
    if (!response) return '';

    // Match ### RESEARCH VERIFICATION section until:
    // 1. JSON starts ({), OR
    // 2. Markdown separator (\n--- or \n***), OR
    // 3. Article content starts (\n##)
    const match = response.match(/###\s*RESEARCH\s+VERIFICATION\s*([\s\S]*?)(?=\{|\n---|\n\*\*\*|\n##)/i);

    if (match && match[1]) {
      return match[1].trim();
    }

    return '';
  }

  /**
   * Parse JSON, repairing common issues
   */
  parseJsonObject(raw) {
    try {
      return JSON.parse(raw);
    } catch (error) {
      try {
        const repaired = jsonrepair(raw);
        return JSON.parse(repaired);
      } catch (err) {
        return null;
      }
    }
  }

  /**
   * Convert parsed JSON into our storage format
   */
  structureFromParsed(parsed, research, researchVerification = '') {
    const rawArticle = this.stripControlChars(parsed.article_content || '');
    const seoMeta = this.normalizeSeoMetadata(parsed.seo_metadata, research, rawArticle);
    const upgrades = this.ensureArray(parsed.content_upgrades);
    const sources = this.collectSources(parsed.sources, research);

    // Check if article_content already has RESEARCH VERIFICATION section (more flexible pattern)
    const hasResearchVerification = /###\s*RESEARCH\s+VERIFICATION/i.test(rawArticle);

    // If AI didn't include RESEARCH VERIFICATION in article_content, but we extracted it from raw response,
    // prepend it to article_content so it's included in the saved content
    let articleWithVerification = rawArticle;
    if (!hasResearchVerification && researchVerification && researchVerification.trim()) {
      articleWithVerification = `### RESEARCH VERIFICATION\n\n${researchVerification.trim()}\n\n---\n\n${rawArticle}`;
      console.log(`✅ Added RESEARCH VERIFICATION to article_content for ${research.topic_id}`);
    } else if (hasResearchVerification) {
      console.log(`✅ RESEARCH VERIFICATION already present in article_content for ${research.topic_id}`);
    }

    let preparedArticle = this.prepareArticleContent(articleWithVerification, {
      research,
      sources,
      seoMeta,
    });

    // Verify RESEARCH VERIFICATION is still present after preparation
    const stillHasResearchVerification = /###\s*RESEARCH\s+VERIFICATION/i.test(preparedArticle);
    if (!stillHasResearchVerification && (hasResearchVerification || (researchVerification && researchVerification.trim()))) {
      console.warn(`⚠️  WARNING: RESEARCH VERIFICATION was removed during prepareArticleContent for ${research.topic_id}`);
      // Re-add it if it was removed
      const verificationToAdd = researchVerification && researchVerification.trim()
        ? researchVerification.trim()
        : this.extractResearchVerification(articleWithVerification);
      if (verificationToAdd) {
        preparedArticle = `### RESEARCH VERIFICATION\n\n${verificationToAdd.trim()}\n\n---\n\n${preparedArticle}`;
        console.log(`✅ Re-added RESEARCH VERIFICATION after preparation`);
      }
    }

    const quality = this.buildQualityMetrics(parsed.quality_metrics, preparedArticle, false);
    const heroPayload = this.normalizeHeroPayload(parsed.hero_image, research, seoMeta);

    return {
      topic_id: research.topic_id,
      creation_date: new Date().toISOString().split('T')[0],
      seo_metadata: JSON.stringify(seoMeta),
      article_content: preparedArticle,
      content_upgrades: JSON.stringify(upgrades),
      compliance: parsed.compliance || research.regulatory_compliance || '',
      quality_metrics: JSON.stringify(quality),
      sources: JSON.stringify(sources),
      hero_image: heroPayload ? JSON.stringify(heroPayload) : '',
      approval_status: 'Needs-SEO',
      __fallback: false,
      __quality: quality,
      __seo: seoMeta,
      __sources: sources,
      __hero: heroPayload || null,
    };
  }

  /**
   * Fallback structure when JSON parsing fails entirely
   */
  buildFallbackContent(text, research) {
    const rawArticle = this.stripControlChars(text);
    const seoMeta = this.normalizeSeoMetadata({}, research, rawArticle);
    const sources = this.collectSources([], research);
    const preparedArticle = this.prepareArticleContent(rawArticle, {
      research,
      sources,
      seoMeta,
    });

    const quality = this.buildQualityMetrics({}, preparedArticle, true);
    let boundedArticle = preparedArticle;
    if (preparedArticle.length > 12000) {
      const cutoff = preparedArticle.lastIndexOf(' ', 11950);
      boundedArticle = (cutoff > 0 ? preparedArticle.slice(0, cutoff) : preparedArticle.slice(0, 12000)).trim();
    }

    return {
      topic_id: research.topic_id,
      creation_date: new Date().toISOString().split('T')[0],
      seo_metadata: JSON.stringify(seoMeta),
      article_content: boundedArticle,
      content_upgrades: JSON.stringify(['Manual enhancements required']),
      compliance: research.regulatory_compliance || '',
      quality_metrics: JSON.stringify(quality),
      sources: JSON.stringify(sources),
      hero_image: '',
      approval_status: 'Needs-SEO',
      __fallback: true,
      __quality: quality,
      __seo: seoMeta,
      __sources: sources,
      __hero: null,
    };
  }

  /**
   * Does the generated content satisfy our quality minimums?
   */
  meetsQualityStandards(content) {
    if (!content) return false;
    const quality = content.__quality || this.safeParseJSON(content.quality_metrics, {});
    const seoMeta = content.__seo || this.safeParseJSON(content.seo_metadata, {});

    if (!quality || !seoMeta) return false;
    if (quality.source === 'fallback') return false;

    const wordCount = quality.word_count || this.calculateWordCount(content.article_content);
    const metaDescription = seoMeta.meta_description || '';
    const secondaryKeywords = this.ensureArray(seoMeta.secondary_keywords);

    const passesWordCount = wordCount >= this.config.minWordCount;
    const passesMeta = metaDescription.length >= 140 && metaDescription.length <= 160;
    const hasFocus = Boolean(seoMeta.focus_keyphrase);
    const hasUpgrades =
      Array.isArray(this.safeParseJSON(content.content_upgrades, null)) &&
      this.safeParseJSON(content.content_upgrades, []).length >= 2;

    return passesWordCount && passesMeta && hasFocus && hasUpgrades;
  }

  /**
   * Build feedback text for the next attempt
   */
  buildRevisionFeedback(content) {
    if (!content) return '';

    const quality = content.__quality || this.safeParseJSON(content.quality_metrics, {});
    const seoMeta = content.__seo || this.safeParseJSON(content.seo_metadata, {});
    const upgrades = this.safeParseJSON(content.content_upgrades, []);

    const issues = [];

    if (!quality || quality.source === 'fallback') {
      issues.push('- Output must be a strict JSON object matching the schema (no markdown fences).');
    }

    const wordCount = quality?.word_count || this.calculateWordCount(content.article_content);
    if (wordCount < this.config.minWordCount) {
      issues.push(`- Increase article_content to at least ${this.config.minWordCount} words of rich detail.`);
    }

    if (!seoMeta?.meta_description || seoMeta.meta_description.length < 140 || seoMeta.meta_description.length > 160) {
      issues.push('- Provide a meta description between 140 and 160 characters containing the focus keyphrase.');
    }

    if (!seoMeta?.focus_keyphrase) {
      issues.push('- Include a focus_keyphrase that matches the primary keyword intent.');
    }

    if (!Array.isArray(upgrades) || upgrades.length < 2) {
      issues.push('- Suggest at least two distinct content upgrades (e.g., calculators, PDF guides, worksheets).');
    }

    if (issues.length === 0) {
      issues.push('- Improve depth with competitor benchmarks, data tables, and actionable recommendations.');
    }

    return issues.join('\n');
  }

  prepareArticleContent(article, { research = {}, sources = [], seoMeta = {} } = {}) {
    let content = this.sanitizeArticleContent(article || '');
    content = this.normalizeHeadings(content);
    content = this.removeLeadingTitleHeading(content, research, seoMeta);
    content = this.ensureCallToAction(content, research, seoMeta);
    return this.finalizeArticleContent(content);
  }

  sanitizeArticleContent(text) {
    if (!text) return '';

    // Extract the FIRST RESEARCH VERIFICATION section only (stop before second occurrence or ##)
    // Match from ### RESEARCH VERIFICATION until: another ### RESEARCH VERIFICATION, ---, ##, or end
    // Use a more precise pattern that stops at the second header if it exists
    const researchVerificationMatch = text.match(/(###\s*RESEARCH\s+VERIFICATION[\s\S]*?)(?=\n###\s*RESEARCH\s+VERIFICATION|\n---|\n##|$)/i);
    const researchVerificationSection = researchVerificationMatch ? researchVerificationMatch[1] : null;
    let content = text.replace(/\r/g, '');

    const placeholderPatterns = [
      /\{\{IMAGE:[^}]+\}\}/gi,
      /\[IMAGE:[^\]]+\]/gi,
      /\[TABLE:[^\]]+\]/gi,
      /\{\{TABLE:[^}]+\}\}/gi,
      /\[CTA:[^\]]+\]/gi,
    ];

    placeholderPatterns.forEach((pattern) => {
      content = content.replace(pattern, '');
    });

    // Normalize bullet markers (convert en/em dashes to standard hyphen)
    content = content.replace(/^[ \t]*[–—]\s+/gm, '- ');

    // Remove Quality Metrics and Content Upgrades sections (but preserve RESEARCH VERIFICATION)
    content = content.replace(/##\s*Quality\s+Metrics[\s\S]*?(?=\n#{2,}\s|$)/gi, '');
    content = content.replace(/##\s*Content\s+Upgrades[\s\S]*?(?=\n#{2,}\s|$)/gi, '');
    content = content.replace(/^\s{0,3}\*\*?\s*Quality\s+Metrics?:[\s\S]*?(?=\n{2,}|\n#+\s|$)/gim, '');
    content = content.replace(/^\s{0,3}\*\*?\s*Content\s+Upgrades?:[\s\S]*?(?=\n{2,}|\n#+\s|$)/gim, '');

    // Remove ALL occurrences of RESEARCH VERIFICATION from content (including duplicates)
    // This will remove both the first section and any duplicate headers
    content = content.replace(/###\s*RESEARCH\s+VERIFICATION[\s\S]*?(?=\n###\s*RESEARCH\s+VERIFICATION|\n---|\n##|$)/gi, '');

    // Clean up any leftover separators or orphaned headers
    content = content.replace(/\n---\n---/g, '\n---');
    content = content.replace(/^\s*###\s*RESEARCH\s+VERIFICATION\s*$/gim, ''); // Remove orphaned headers
    content = content.replace(/\n{3,}/g, '\n\n').trim();

    // Re-add RESEARCH VERIFICATION at the beginning if it was extracted (only the first one)
    if (researchVerificationSection) {
      const cleanedVerification = researchVerificationSection.trim();
      content = `${cleanedVerification}\n\n---\n\n${content}`.replace(/\n{3,}/g, '\n\n');
    }

    return content;
  }

  normalizeHeadings(content) {
    if (!content) return '';
    const withoutOrphanHeadings = content.replace(/^#(?!#)/gm, '##');
    return withoutOrphanHeadings.replace(/\n{3,}/g, '\n\n');
  }

  removeLeadingTitleHeading(content, research = {}, seoMeta = {}) {
    if (!content) return '';

    const lines = content.split('\n');
    if (lines.length === 0) {
      return content;
    }

    const firstLine = lines[0].trim();

    // Don't remove RESEARCH VERIFICATION section (H3 heading)
    if (/^###\s+RESEARCH\s+VERIFICATION/i.test(firstLine)) {
      return content;
    }

    if (!/^##\s+/i.test(firstLine)) {
      return content;
    }

    const headingText = firstLine.replace(/^##\s+/i, '').trim().toLowerCase();
    const candidates = [
      seoMeta?.title,
      research?.topic_title,
      research?.topic_id,
      research?.primary_keyword,
    ]
      .filter(Boolean)
      .map((value) => String(value).trim().toLowerCase());

    if (candidates.includes(headingText)) {
      lines.shift();
      while (lines[0] !== undefined && lines[0].trim() === '') {
        lines.shift();
      }
      return lines.join('\n');
    }

    return content;
  }

  ensureCallToAction(content, research = {}, seoMeta = {}) {
    if (!content) return '';

    const hasPLCapital = /pl\s+capital/i.test(content);
    const hasCallToAction = /(contact|speak|reach out|call|book|schedule|consult)/i.test(content);
    if (hasPLCapital && hasCallToAction) {
      return content;
    }

    const focusRaw =
      seoMeta.focus_keyphrase ||
      research.primary_keyword ||
      research.topic_title ||
      research.topic_id ||
      'wealth management';
    const focus =
      typeof focusRaw === 'string' && focusRaw.trim().length > 0 ? focusRaw.trim() : 'wealth management';

    const ctaParagraph = [
      '### Partner with PL Capital',
      `Ready to strengthen your ${focus.toLowerCase()} strategy? Connect with PL Capital's SEBI-registered advisors for personalised guidance and actionable portfolios.`,
      '[Book a consultation](https://www.plindia.com/contact-us) today.',
    ].join('\n');

    return `${content.replace(/\s+$/, '')}\n\n${ctaParagraph}\n`;
  }

  finalizeArticleContent(content) {
    if (!content) return '';
    return content
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  collectSources(rawSources, research) {
    const aiSources = this.ensureArray(rawSources).map((source) => {
      if (!source) return source;
      if (typeof source === 'object') {
        return source.url || source.link || source.href || source.value || '';
      }
      return source;
    });

    const researchSources = this.getResearchSources(research);
    return this.normalizeSourceList([...aiSources, ...researchSources]);
  }

  normalizeSourceList(candidates = []) {
    const urls = new Set();

    candidates.forEach((candidate) => {
      if (!candidate) return;
      const value =
        typeof candidate === 'object'
          ? candidate.url || candidate.link || candidate.href || candidate.value || ''
          : candidate;

      if (!value) return;

      let normalized = null;
      if (this.csvManager && typeof this.csvManager.normalizeSourceUrl === 'function') {
        normalized = this.csvManager.normalizeSourceUrl(value);
      }
      if (!normalized) {
        normalized = this.normalizeUrlCandidate(value, false);
      }
      if (normalized) {
        urls.add(normalized);
      }
    });

    return Array.from(urls);
  }

  normalizeUrlCandidate(raw, allowNonHttp = false) {
    if (!raw) return null;
    const value = typeof raw === 'string' ? raw.trim() : String(raw);
    if (!value) return null;

    if (/^https?:\/\//i.test(value)) {
      try {
        const parsed = new URL(value);
        const normalized = `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`.replace(/\/+$/, '');
        return normalized;
      } catch (_) {
        return null;
      }
    }

    return allowNonHttp ? value : null;
  }

  getResearchSources(research) {
    if (!research) return [];

    const cacheKey = research.topic_id || research.topic_research_id;
    if (cacheKey && this.researchSourceCache.has(cacheKey)) {
      return this.researchSourceCache.get(cacheKey);
    }

    let extracted = [];
    if (this.csvManager && typeof this.csvManager.extractSourceUrls === 'function') {
      extracted = this.csvManager.extractSourceUrls(research);
    }

    const normalized = this.normalizeSourceList(extracted);

    if (cacheKey) {
      this.researchSourceCache.set(cacheKey, normalized);
    }

    return normalized;
  }

  composeHeroPrompt(seoMeta = {}, research = {}) {
    const title =
      seoMeta.title ||
      research.topic_title ||
      research.topic_id ||
      research.primary_keyword ||
      'Financial insights for Indian investors';
    const focus = seoMeta.focus_keyphrase || research.primary_keyword || '';
    const intent = research.search_intent || '';
    const superiority = research.content_superiority_plan || '';
    const impact = research.estimated_impact || '';

    const descriptors = [intent, superiority, impact]
      .flatMap((item) => {
        if (!item) return [];
        if (Array.isArray(item)) {
          return item
            .map((entry) => (typeof entry === 'string' ? entry : String(entry ?? '')))
            .filter(Boolean);
        }
        if (typeof item === 'object') {
          return Object.values(item)
            .map((entry) => (typeof entry === 'string' ? entry : String(entry ?? '')))
            .filter(Boolean);
        }
        return [typeof item === 'string' ? item : String(item)];
      })
      .map((item) => item.replace(/\s+/g, ' ').trim())
      .filter((item) => item && item !== '[object Object]')
      .join('. ');

    const descriptorText = descriptors ? `${descriptors}. ` : '';
    const focusText = focus ? `Focus on ${focus} outcomes. ` : '';

    return `Create a professional square hero image (1024×1024 pixels) for an Indian financial article titled "${title}". ${descriptorText}${focusText}Show expert wealth advisors reviewing market data, charts, and projections in a premium Mumbai office. Emphasize professionalism, trust, and forward-looking strategy. Use natural lighting, modern aesthetics, centered composition optimized for small square format (final size: 450×450 pixels), and avoid text or typography. Keep important elements in the center frame to ensure nothing critical is lost when resized.`;
  }

  buildHeroImagePrompt(content, research) {
    const seoMeta = content.__seo || this.safeParseJSON(content.seo_metadata, {});
    return this.composeHeroPrompt(seoMeta, research);
  }

  buildHeroAltText(title, focus) {
    const subject = focus || title || 'financial strategy';
    return `Professional illustration of advisors discussing ${subject} in an Indian financial office`;
  }

  buildHeroPlaceholder(research, seoMeta, reason) {
    const meta = seoMeta || {};
    const title =
      meta.title || research.topic_title || research.topic_id || research.primary_keyword || 'Financial insights';
    const focus = meta.focus_keyphrase || research.primary_keyword || '';
    const prompt = this.composeHeroPrompt(meta, research);

    return {
      topic_id: research.topic_id,
      status: 'placeholder',
      provider: 'placeholder',
      reason,
      prompt,
      alt: this.buildHeroAltText(title, focus),
      generated_at: new Date().toISOString(),
    };
  }

  normalizeHeroPayload(candidate, research, seoMeta) {
    if (!candidate) return null;
    let payload = candidate;

    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (!trimmed) {
        return null;
      }
      if (/^\{/.test(trimmed)) {
        try {
          payload = JSON.parse(trimmed);
        } catch (_) {
          return null;
        }
      } else if (/^https?:\/\//i.test(trimmed)) {
        payload = { status: 'provided', url: trimmed };
      } else {
        return null;
      }
    }

    if (payload && typeof payload === 'object') {
      const normalized = { ...payload };
      const meta = seoMeta || {};
      const title =
        meta.title || research.topic_title || research.topic_id || research.primary_keyword || 'Financial insights';
      const focus = meta.focus_keyphrase || research.primary_keyword || '';

      normalized.topic_id = normalized.topic_id || research.topic_id || null;
      normalized.status = normalized.status || (normalized.url ? 'provided' : 'placeholder');
      if (normalized.url) {
        const normalizedUrl = this.normalizeUrlCandidate(normalized.url, true);
        if (normalizedUrl) {
          normalized.url = normalizedUrl;
        }
      }
      normalized.alt = normalized.alt || this.buildHeroAltText(title, focus);
      normalized.prompt = normalized.prompt || this.composeHeroPrompt(meta, research);
      normalized.generated_at = normalized.generated_at || new Date().toISOString();
      normalized.provider = normalized.provider || 'manual';

      return normalized;
    }

    return null;
  }

  shouldGenerateHeroImage() {
    return Boolean(this.config.generateImages && this.openaiApiKey);
  }

  async applyHeroImage(content, research) {
    if (!content || !research) {
      return content;
    }

    if (content.__heroApplied) {
      return content;
    }

    const seoMeta = content.__seo || this.safeParseJSON(content.seo_metadata, {});
    const cacheKey = research.topic_id || content.topic_id;

    let hero = content.__hero || this.safeParseJSON(content.hero_image, null);
    if (hero && ['generated', 'provided'].includes(hero.status)) {
      content.hero_image = JSON.stringify(hero);
      content.__heroApplied = true;
      return content;
    }

    if (!hero && cacheKey && this.heroImageCache.has(cacheKey)) {
      const cached = this.heroImageCache.get(cacheKey);
      if (cached && ['generated', 'provided'].includes(cached.status)) {
        hero = cached;
      }
    }

    if (!hero && this.shouldGenerateHeroImage()) {
      const prompt = this.buildHeroImagePrompt(content, research);
      const alt = this.buildHeroAltText(
        seoMeta?.title || research.topic_title || research.topic_id,
        seoMeta?.focus_keyphrase || research.primary_keyword
      );

      try {
        const generated = await generateHeroImage({
          prompt,
          topicId: cacheKey,
          title: seoMeta?.title || research.topic_title || research.topic_id,
          focusKeyword: seoMeta?.focus_keyphrase || research.primary_keyword || '',
          saveToDisk: true,
        });

        if (generated && ['generated', 'provided'].includes(generated.status || 'generated')) {
          hero = {
            topic_id: cacheKey,
            status: generated.status || 'generated',
            provider: generated.provider || 'openai-dall-e-3',
            url: generated.url || null,
            local_path: generated.localPath || generated.local_path || null,
            prompt: generated.prompt || prompt,
            alt: generated.alt || alt,
            generated_at: generated.generated_at || new Date().toISOString(),
            metadata: generated.metadata || {},
          };
        }

        if (!hero && generated && generated.status === 'skipped') {
          hero = this.buildHeroPlaceholder(research, seoMeta, 'skipped');
        }
      } catch (error) {
        console.warn(`⚠️  Hero image generation failed for ${cacheKey || research.topic_research_id}: ${error.message}`);
      }
    }

    if (!hero) {
      const reason = this.shouldGenerateHeroImage() ? 'generation_failed' : 'images_disabled';
      hero = this.buildHeroPlaceholder(research, seoMeta, reason);
    }

    if (cacheKey) {
      this.heroImageCache.set(cacheKey, hero);
    }

    content.__hero = hero;
    content.hero_image = JSON.stringify(hero);
    content.__heroApplied = true;
    return content;
  }

  /**
   * Prepare content object for CSV storage (remove internal markers)
   */
  prepareForStorage(content) {
    if (!content) return null;
    const { __fallback, __quality, __seo, __hero, __heroApplied, __sources, ...rest } = content;
    return {
      ...rest,
      approval_status: rest.approval_status || 'Needs-SEO',
    };
  }

  /**
   * Normalize SEO metadata ensuring all required fields exist
   */
  normalizeSeoMetadata(meta, research, article = '') {
    const raw = this.safeParseJSON(meta, meta && typeof meta === 'object' ? meta : {});

    // Enrich research with topic_title from topics CSV if not already present
    // NOTE: This is a read-only enrichment for in-memory use only.
    // topic_title is NOT in topicResearch CSV schema, so it won't be saved back to CSV.
    // This is safe because: 1) We only read from topicResearch CSV, 2) writeCSV filters to schema columns
    if (!research.topic_title && research.topic_id) {
      const allTopics = this.csvManager.getAllTopics();
      const matchingTopic = allTopics.find(t => t.topic_id === research.topic_id);
      if (matchingTopic && matchingTopic.topic_title) {
        research.topic_title = matchingTopic.topic_title;
      }
    }

    // For title: customTitle > topic_title (from topic generation stage)
    const effectiveTitle = this.customTitle || research.topic_title || null;

    // For primary_keyword: customTopic > extract from title > research.primary_keyword
    let effectivePrimaryKeyword;
    if (this.customTopic) {
      effectivePrimaryKeyword = this.customTopic;
    } else if (effectiveTitle) {
      // Extract primary keyword from title (same logic as deep-topic-researcher.js)
      const extractPrimaryKeyword = (title) => {
        const stopWords = ['the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'best', 'top', 'guide', 'how', 'what', 'why', 'when', 'where'];
        const words = title.toLowerCase().split(/\s+/);
        const keywords = words.filter(word => !stopWords.includes(word));
        return keywords.slice(0, 3).join(' ') || title.toLowerCase();
      };
      effectivePrimaryKeyword = extractPrimaryKeyword(effectiveTitle);
    } else {
      effectivePrimaryKeyword = research.primary_keyword || '';
    }

    const focus = raw.focus_keyphrase || effectivePrimaryKeyword || '';

    // ⚠️ CUSTOM TITLE/TOPIC ENFORCEMENT: Override AI-generated title with user's custom title/topic
    let title;
    const isCustomTitleMode = research.topic_id?.startsWith('CUSTOM-TITLE-');

    if (isCustomTitleMode && effectiveTitle) {
      // This is a custom title scenario - use the EXACT title (customTitle or topic_title)
      title = effectiveTitle;

      // Warn if AI ignored the title instruction
      if (raw.title && raw.title !== effectiveTitle) {
        console.warn(`⚠️  AI generated title "${raw.title}" instead of using expected title "${effectiveTitle}". Overriding with expected title.`);
      }

      // Also warn if research.primary_keyword doesn't match current custom topic
      if (this.customTopic && research.primary_keyword && research.primary_keyword !== this.customTopic) {
        console.warn(`⚠️  WARNING: Research entry has primary_keyword "${research.primary_keyword}" but current custom_topic is "${this.customTopic}"`);
        console.warn(`⚠️  This suggests the research entry is from a different custom topic run. Content may be incorrect!`);
      }

      console.log(`✅ Title enforced: "${title}"`);
      if (this.customTopic) {
        console.log(`✅ Primary keyword (from custom_topic): "${effectivePrimaryKeyword}"`);
      } else if (effectiveTitle) {
        console.log(`✅ Primary keyword (extracted from title): "${effectivePrimaryKeyword}"`);
      }
    } else {
      // Normal workflow - use AI-generated title and enforce SEO guidelines
      // Don't use topic_id as fallback - it's not a valid SEO title
      const rawTitle = raw.title || research.primary_keyword || focus || research.topic_title;
      title = this.normalizeSeoTitle(rawTitle, focus, research.topic_title);
    }

    const metaDescription = this.buildMetaDescription(raw.meta_description, article, focus);

    const secondary = this.ensureArray(raw.secondary_keywords || [])
      .filter(Boolean)
      .map((kw) => kw.toLowerCase())
      .slice(0, 5);

    if (secondary.length < 3 && focus) {
      const fallbacks = [
        `${focus} analysis india`,
        `${focus} pros and cons`,
        `${focus} calculator`,
        `${focus} tax benefits`,
      ];
      for (const item of fallbacks) {
        if (secondary.length >= 5) break;
        if (!secondary.includes(item.toLowerCase())) {
          secondary.push(item);
        }
      }
    }

    return {
      title,
      meta_description: metaDescription,
      focus_keyphrase: focus,
      secondary_keywords: secondary,
    };
  }

  /**
   * Build quality metrics with guaranteed fields
   */
  buildQualityMetrics(rawMetrics, article, isFallback) {
    const metrics = this.safeParseJSON(rawMetrics, rawMetrics && typeof rawMetrics === 'object' ? rawMetrics : {});
    const wordCount = metrics.word_count || this.calculateWordCount(article);

    return {
      word_count: wordCount,
      readability_score: metrics.readability_score || 'Needs Review',
      seo_score: metrics.seo_score || 'Pending',
      source: isFallback ? 'fallback' : metrics.source || 'model',
    };
  }

  calculateWordCount(text) {
    if (!text) return 0;
    return text
      .replace(/[`*#>]/g, ' ')
      .split(/\s+/)
      .filter(Boolean).length;
  }

  /**
   * Normalize SEO title to follow best practices:
   * - 50-60 characters (optimal for search results)
   * - Includes focus keyphrase naturally
   * - Different from article title (topic_title)
   * - Truncates intelligently if too long
   */
  normalizeSeoTitle(rawTitle, focusKeyphrase, articleTitle) {
    if (!rawTitle) {
      // Generate a basic title from focus keyphrase if nothing provided
      if (focusKeyphrase) {
        return this.generateSeoTitleFromKeyword(focusKeyphrase, articleTitle);
      }
      return 'Financial Investment Guide';
    }

    let title = rawTitle.trim();

    // Remove any topic ID prefixes (e.g., "TA-001 ", "CUSTOM-TITLE-123 ")
    // Pattern: alphanumeric with dashes followed by space at the start
    title = title.replace(/^[A-Z0-9-]+\s+/i, '');

    // Ensure title is different from article title (case-insensitive)
    if (articleTitle && title.toLowerCase().trim() === articleTitle.toLowerCase().trim()) {
      console.warn(`⚠️  SEO title matches article title "${articleTitle}". Modifying to be different.`);
      // Add a descriptive prefix or suffix to differentiate
      if (title.length < 45) {
        title = `${title} | Complete Guide`;
      } else {
        // Replace last few words with a variation
        const words = title.split(' ');
        if (words.length > 3) {
          words[words.length - 1] = 'Guide';
          title = words.join(' ');
        } else {
          title = `${title} Guide`;
        }
      }
    }

    // Ensure focus keyphrase is included (if provided and title doesn't have it)
    if (focusKeyphrase && focusKeyphrase.length > 0) {
      const titleLower = title.toLowerCase();
      const focusLower = focusKeyphrase.toLowerCase();

      // Check if any significant word from focus keyphrase is in title
      const focusWords = focusLower.split(/\s+/).filter(w => w.length > 3); // Words longer than 3 chars
      const hasFocusKeyword = focusWords.some(word => titleLower.includes(word));

      if (!hasFocusKeyword && title.length < 50) {
        // Try to naturally incorporate the keyphrase
        const words = title.split(' ');
        if (words.length < 6) {
          // Add keyphrase naturally
          title = `${title} ${focusKeyphrase}`;
        } else {
          // Replace a generic word with keyphrase
          const genericWords = ['Guide', 'Complete', 'Best', 'Top', 'How'];
          for (const generic of genericWords) {
            if (title.includes(generic)) {
              title = title.replace(new RegExp(`\\b${generic}\\b`, 'i'), focusKeyphrase);
              break;
            }
          }
        }
      }
    }

    // Enforce 50-60 character limit (optimal SEO length)
    if (title.length > 60) {
      console.warn(
        `⚠️  SEO title exceeds 60 characters ("${title.length}" chars): "${title}". Truncating intelligently.`
      );
      title = this.truncateTitleIntelligently(title, 60, focusKeyphrase);
    } else if (title.length < 50) {
      // If too short, try to expand naturally (but don't force it)
      if (title.length < 40 && focusKeyphrase) {
        // Only expand if significantly short and we have a keyphrase
        const expanded = this.expandTitleNaturally(title, focusKeyphrase, 50);
        if (expanded.length <= 60) {
          title = expanded;
        }
      }
    }

    return title;
  }

  /**
   * Generate SEO title from focus keyphrase when no title is provided
   */
  generateSeoTitleFromKeyword(keyphrase, articleTitle) {
    // Create variations that are different from article title
    const variations = [
      `${keyphrase} | Complete Guide for Indian Investors`,
      `${keyphrase}: Strategy & Analysis Guide`,
      `${keyphrase} Explained | Investment Guide`,
      `Understanding ${keyphrase} | Expert Guide`,
    ];

    // Find one that's different from article title and within 50-60 chars
    for (const variation of variations) {
      if (variation.length >= 50 && variation.length <= 60) {
        if (!articleTitle || variation.toLowerCase() !== articleTitle.toLowerCase()) {
          return variation;
        }
      }
    }

    // Fallback: simple version
    return keyphrase.length <= 60 ? keyphrase : keyphrase.substring(0, 57) + '...';
  }

  /**
   * Truncate title intelligently at word boundaries, preserving focus keyphrase
   */
  truncateTitleIntelligently(title, maxLength, focusKeyphrase) {
    if (title.length <= maxLength) return title;

    // If focus keyphrase is in the title, try to keep it
    if (focusKeyphrase && title.toLowerCase().includes(focusKeyphrase.toLowerCase())) {
      const keyphraseIndex = title.toLowerCase().indexOf(focusKeyphrase.toLowerCase());
      const keyphraseEnd = keyphraseIndex + focusKeyphrase.length;

      // If keyphrase is near the end, truncate before it and add it back
      if (keyphraseEnd > maxLength - 10) {
        const beforeKeyphrase = title.substring(0, keyphraseIndex).trim();
        const truncated = this.truncateAtWordBoundary(beforeKeyphrase, maxLength - focusKeyphrase.length - 3);
        return `${truncated} ${focusKeyphrase}`.substring(0, maxLength);
      }
    }

    // Otherwise, truncate at word boundary
    return this.truncateAtWordBoundary(title, maxLength);
  }

  /**
   * Truncate at word boundary, adding ellipsis if needed
   */
  truncateAtWordBoundary(text, maxLength) {
    if (text.length <= maxLength) return text;

    // Try to truncate at last space before maxLength
    let truncated = text.substring(0, maxLength - 3);
    const lastSpace = truncated.lastIndexOf(' ');

    if (lastSpace > maxLength * 0.7) {
      // If we found a space in a reasonable position, use it
      truncated = truncated.substring(0, lastSpace);
    }

    return truncated.trim() + '...';
  }

  /**
   * Expand title naturally to reach target length
   */
  expandTitleNaturally(title, focusKeyphrase, targetLength) {
    if (title.length >= targetLength) return title;

    const needed = targetLength - title.length;
    const additions = [
      ' | Complete Guide',
      ' | Expert Analysis',
      ' | Investment Guide',
      ' | Strategy Guide',
      ' for Indian Investors',
    ];

    for (const addition of additions) {
      const expanded = title + addition;
      if (expanded.length >= targetLength && expanded.length <= 60) {
        return expanded;
      }
    }

    return title; // Return original if can't expand naturally
  }

  truncateTitle(title) {
    if (!title) return '';
    const cleaned = title.trim();
    if (cleaned.length > 60) {
      console.warn(
        `⚠️  Generated title exceeds 60 characters ("${cleaned.length}" chars): "${cleaned}". Truncating.`
      );
      return this.truncateTitleIntelligently(cleaned, 60);
    }
    return cleaned;
  }

  buildMetaDescription(existing, article, focus) {
    if (existing) {
      const trimmed = existing.trim();
      if (trimmed.length >= 140 && trimmed.length <= 160) {
        return trimmed;
      }
    }

    const focusPhrase = focus || 'mutual fund investments';
    const fallback =
      `Compare ${focusPhrase} performance, costs, and risks. Discover expert analysis, calculators, and action steps for Indian investors today.`;

    const articleSnippet = (article || '')
      .replace(/[`*#>\[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200);

    const candidate = articleSnippet.length > 0 ? `${articleSnippet} Learn how to act now.` : fallback;
    return this.clampDescription(candidate, focusPhrase);
  }

  clampDescription(text, focusPhrase) {
    if (!text) {
      return this.clampDescription(
        `Learn how ${focusPhrase} compares on returns, volatility, and costs. Get expert tips and downloadable tools for Indian investors.`,
        focusPhrase
      );
    }

    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (cleaned.length > 160) {
      return `${cleaned.slice(0, 157).trim()}...`;
    }
    if (cleaned.length < 140) {
      const extension =
        ' Explore comparative charts, expert insights, and takeaways tailored for Indian investors.';
      const extended = `${cleaned}${extension}`;
      return extended.length > 160 ? extended.slice(0, 157).trim() + '...' : extended;
    }
    return cleaned;
  }

  ensureArray(value) {
    if (Array.isArray(value)) {
      return value.filter(Boolean);
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      const trimmed = value.trim();
      if (/^[\[{]/.test(trimmed)) {
        try {
          const parsed = JSON.parse(trimmed);
          return this.ensureArray(parsed);
        } catch (_) {
          // fall through to delimiter split
        }
      }
      return trimmed
        .split(/[\n;,]+/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
    if (value && typeof value === 'object') {
      return Object.values(value)
        .map((entry) => (typeof entry === 'string' ? entry.trim() : entry))
        .filter(Boolean);
    }
    return [];
  }

  safeParseJSON(value, fallback = null) {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }

  stripControlChars(text) {
    if (!text) return '';
    return text.replace(/[^\x09\x0A\x0D\x20-\uFFFF]/g, '');
  }

  /**
   * Convert literal escape sequences (\n, \t, \r) to actual characters
   * This handles cases where AI returns "\n" as literal text instead of newlines
   */
  unescapeStringLiterals(text) {
    if (!text) return '';
    return text
      .replace(/\\n/g, '\n')   // Convert \n to actual newline
      .replace(/\\r/g, '\r')   // Convert \r to carriage return
      .replace(/\\t/g, '\t');  // Convert \t to tab
  }

  normalizeJsonString(text) {
    return text.replace(/,\s*([\]}])/g, '$1');
  }

  /**
   * Print a summary for the batch
   */
  printSummary(results) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 CONTENT CREATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Created Content: ${results.length} article(s)`);
    console.log('\n📋 Next Steps:');
    console.log('   1. Review created-content.csv file');
    console.log('   2. Approve content (set approval_status = "Yes")');
    console.log('   3. Run SEO optimizer: node content/seo-optimizer.js');
    console.log('='.repeat(60) + '\n');
  }
}

// CLI
if (require.main === module) {
  const creator = new ContentCreator();
  const command = process.argv[2];

  switch (command) {
    case 'create':
      creator
        .createContent()
        .then(() => console.log('🎉 Content creation completed!'))
        .catch((err) => {
          console.error('❌ Failed:', err.message);
          process.exit(1);
        });
      break;

    default:
      console.log('Usage: node content-creator.js [create]');
      console.log('');
      console.log('Commands:');
      console.log('  create - Create content from approved research');
  }
}

module.exports = ContentCreator;
