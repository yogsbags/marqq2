#!/usr/bin/env node

/**
 * Deep Topic Researcher for Enhanced Bulk Generator
 * Implements N8N Workflow 3: Deep Topic Research
 * Analyzes top 10 competitors and creates content battle plan
 */

const fetch = require('node-fetch');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const CSVDataManager = require('../core/csv-data-manager');

class DeepTopicResearcher {
  constructor(config = {}) {
    this.config = config;
    this.topicLimit = config.topicLimit ?? null;
    this.customTitle = config.customTitle || null;
    this.groqApiKey = process.env.GROQ_API_KEY;
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.groqApiUrl = 'https://api.groq.com/openai/v1/chat/completions';
    this.openaiApiUrl = 'https://api.openai.com/v1/chat/completions';

    this.models = {
      primary: 'groq/compound',
      secondary: 'openai/gpt-oss-120b',
      fallback: 'meta-llama/llama-4-maverick-17b-128e-instruct'
    };

    this.csvManager = new CSVDataManager();
    this.competitorCache = new Map();

    // Load optimized model parameters
    this.modelParams = this.loadModelParameters();

    this.validateConfig();
  }

  validateConfig() {
    if (!this.groqApiKey && !this.openaiApiKey) {
      console.warn('⚠️  Neither GROQ_API_KEY nor OPENAI_API_KEY set!');
      console.log('Please set at least one: export GROQ_API_KEY="your-key" or export OPENAI_API_KEY="your-key"');
      return false;
    }
    console.log('✅ Deep Topic Researcher initialized');
    console.log(`🤖 Primary Model: ${this.models.primary}`);
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
          deep_research: {
            temperature: 0.3,
            top_p: 0.9,
            frequency_penalty: 0.1,
            presence_penalty: 0.1,
            max_tokens: 8000,
            response_format: { type: 'json_object' }
          }
        }
      };
    }
  }

  /**
   * Main research execution
   */
  async conductDeepResearch(limit = null) {
    console.log('\n🔬 DEEP TOPIC RESEARCH STARTED');
    console.log('='.repeat(60));

    try {
      // 🚀 Custom Title Mode: Generate research based on user-provided title (bypass Stages 1-2)
      if (this.customTitle) {
        console.log(`\n🚀 CUSTOM TITLE MODE ACTIVATED`);
        console.log(`📝 Custom Title: "${this.customTitle}"`);
        console.log(`✨ Bypassing Stages 1-2 (Research & Topic Generation)...`);

        const customResearch = await this.conductCustomTitleResearch(this.customTitle);

        if (customResearch) {
          // Save research result
          const saved = this.csvManager.saveTopicResearch([customResearch]);
          console.log(`\n💾 Saved custom title research to topic-research.csv`);

          this.printSummary([customResearch]);
          return [customResearch];
        } else {
          throw new Error('Custom title research failed');
        }
      }

      // Get approved topics
      const approvedTopics = this.csvManager.getApprovedTopics();

      if (approvedTopics.length === 0) {
        throw new Error('No approved topics found. Run topic-generator.js first and approve some topics.');
      }

      const effectiveLimit = limit ?? this.topicLimit ?? null;
      let topicsToResearch = approvedTopics;
      if (effectiveLimit && approvedTopics.length > effectiveLimit) {
        topicsToResearch = approvedTopics.slice(0, effectiveLimit);
        console.log(`✅ Found ${approvedTopics.length} approved topics`);
        console.log(`🔍 Restricting deep research to first ${effectiveLimit} topic(s)`);
      } else {
        console.log(`✅ Found ${approvedTopics.length} approved topics`);
      }

      const researchResults = [];

      // Conduct research for each approved topic
      for (let i = 0; i < topicsToResearch.length; i++) {
        const topic = topicsToResearch[i];
        console.log(`\n📋 Researching ${i + 1}/${topicsToResearch.length}: ${topic.topic_title}`);

        const research = await this.researchTopic(topic);
        if (research) {
          researchResults.push(research);
          console.log(`✅ Research completed for: ${topic.topic_id}`);
        }
      }

      // Save all research results
      if (researchResults.length > 0) {
        const saved = this.csvManager.saveTopicResearch(researchResults);
        console.log(`\n💾 Saved ${researchResults.length} research item(s) to topic-research.csv`);
      }

      this.printSummary(researchResults);
      return researchResults;

    } catch (error) {
      console.error('❌ Deep research failed:', error.message);
      throw error;
    }
  }

  /**
   * Conduct research for custom title (bypass approved topics)
   */
  async conductCustomTitleResearch(customTitle) {
    console.log(`\n📋 Conducting deep research for custom title: "${customTitle}"`);

    // Create synthetic topic object from custom title
    const syntheticTopic = {
      topic_id: `CUSTOM-TITLE-${Date.now()}`,
      topic_title: customTitle,
      content_type: 'blog',
      category: 'derivatives',
      primary_keyword: this.extractPrimaryKeyword(customTitle),
      secondary_keywords: '',
      search_volume: 'Not specified',
      keyword_difficulty: 'Not specified',
      priority: 'High',
      topic_type: 'Custom Title',
      target_competitor: 'Top financial websites',
      our_competitive_advantage: 'Custom title-driven content with deep research',
      word_count_target: 2000,
      expert_required: 'Financial expert',
      estimated_ranking_time: '30-60',
      estimated_monthly_traffic: 'To be determined',
      internal_linking_opportunities: 'To be determined',
      content_upgrade_idea: 'Calculator or downloadable guide',
      regulatory_requirements: 'SEBI/RBI disclaimers'
    };

    const research = await this.researchTopic(syntheticTopic);
    if (research) {
      console.log(`✅ Research completed for custom title: ${customTitle}`);
      return research;
    } else {
      console.error(`❌ Failed to research custom title: ${customTitle}`);
      return null;
    }
  }

  /**
   * Extract primary keyword from custom title
   */
  extractPrimaryKeyword(title) {
    // Simple extraction: remove common words and take first meaningful phrase
    const stopWords = ['the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'best', 'top', 'guide', 'how', 'what', 'why', 'when', 'where'];
    const words = title.toLowerCase().split(/\s+/);
    const keywords = words.filter(word => !stopWords.includes(word));
    return keywords.slice(0, 3).join(' ') || title;
  }

  /**
   * Research individual topic
   */
  async researchTopic(topic) {
    const prompt = this.buildResearchPrompt(topic);

    try {
      const response = await this.callAI(prompt);
      const research = await this.parseResearchResponse(response, topic);
      return research;
    } catch (error) {
      console.error(`⚠️  Failed to research ${topic.topic_id}:`, error.message);
      return null;
    }
  }

  /**
   * Build research prompt
   */
  buildResearchPrompt(topic) {
    return `Conduct deep-dive research for this approved financial content topic:

TOPIC CONTEXT:
- Topic ID: ${topic.topic_id}
- Title: ${topic.topic_title}
- Content Type: ${topic.content_type || 'blog'}
- Category: ${topic.category}
- Primary Keyword: ${topic.primary_keyword}
- Secondary Keywords: ${topic.secondary_keywords || 'Not specified'}
- Search Volume: ${topic.search_volume || 'Not specified'} monthly searches
- Keyword Difficulty: ${topic.keyword_difficulty || 'Not specified'}/100
- Priority: ${topic.priority || 'Medium'}
- Topic Type: ${topic.topic_type || 'Not specified'} (quick_win/authority_builder/competitive_strike)
- Target Competitor: ${topic.target_competitor || 'Top financial websites'}
- Our Competitive Advantage: ${topic.our_competitive_advantage || 'Deep research and E-E-A-T compliance'}
- Word Count Target: ${topic.word_count_target} words
- Expert Required: ${topic.expert_required || 'Not specified'}
- Estimated Ranking Time: ${topic.estimated_ranking_time || 'Not specified'} days
- Estimated Monthly Traffic: ${topic.estimated_monthly_traffic || 'Not specified'} visits
- Internal Linking Opportunities: ${topic.internal_linking_opportunities || 'Not specified'}
- Content Upgrade Idea: ${topic.content_upgrade_idea || 'Calculator or downloadable guide'}
- Regulatory Requirements: ${topic.regulatory_requirements || 'Standard disclaimers'}

RESEARCH REQUIREMENTS:

1. TOP 10 COMPETITOR ANALYSIS
Analyze what's currently ranking for "${topic.primary_keyword}":
- What content format do they use?
- What depth of coverage?
- What makes them rank?
- What are their weaknesses?

2. CONTENT GAPS
Identify what ALL top articles are missing:
- Unanswered questions
- Missing examples or case studies
- Outdated information
- Lack of visual content
- Missing expert perspectives

3. SEARCH INTENT MAPPING
- Primary intent (informational/transactional/navigational)
- User questions and pain points
- Related queries people search for

4. CONTENT SUPERIORITY PLAN
Create a battle plan to outrank competitors:
- Unique angles to cover
- Additional depth needed
- Visual content requirements
- Expert quotes/data sources needed
- Internal linking opportunities

5. RESOURCE REQUIREMENTS
What's needed to create this content:
- Subject matter expert consultation needed?
- Data sources required
- Visual assets (charts, infographics, calculators)
- Legal/compliance review needed

6. CONTENT OUTLINE
Create a detailed article outline with:
- Introduction hook and key points to cover
- 8-12 main sections (H2 headings) with subsections (H3 headings)
- FAQ section with 5-8 common questions
- Conclusion with key takeaways and call-to-action
- Each section should specify what to cover in detail

Return your analysis in this JSON format:
{
  "topic_id": "${topic.topic_id}",
  "primary_keyword": "${topic.primary_keyword}",
  "top_10_competitors": "List of top ranking sites and their strengths",
  "content_gaps": "What's missing from current top content",
  "search_intent": "Primary user intent and related queries",
  "related_questions": "Common questions users ask",
  "content_superiority_plan": "Detailed plan to create better content",
  "resource_requirements": "Expert, data, visual requirements",
  "regulatory_compliance": "${topic.regulatory_requirements || 'Standard disclaimers'}",
  "estimated_impact": "Expected ranking improvement and traffic",
  "content_outline": "Detailed article outline with introduction, main sections (H2/H3), FAQ, and conclusion",
  "approval_status": "Pending"
}

Focus on Indian market context and SEBI/RBI compliance where applicable.`;
  }

  /**
   * Call AI model
   */
  async callAI(prompt) {
    const sources = [];

    if (this.groqApiKey) {
      sources.push({
        type: 'groq',
        model: this.models.primary,
        handler: async () => {
          const params = this.modelParams.stages.deep_research;
          const response = await fetch(this.groqApiUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.groqApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: this.models.primary,
              response_format: params.response_format,
              messages: this.buildSystemMessages(prompt),
              temperature: params.temperature,
              top_p: params.top_p,
              frequency_penalty: params.frequency_penalty,
              presence_penalty: params.presence_penalty,
              max_tokens: params.max_tokens,
              search_settings: {
                country: 'india',
                include_domains: ['*.in', 'groww.in', 'zerodha.com', 'etmoney.com', 'paytmmoney.com', 'indmoney.com'],
                exclude_domains: ['wikipedia.org']
              }
            })
          });

          if (!response.ok) throw new Error(`Groq API error: ${response.status}`);

          const data = await response.json();
          const message = data.choices[0]?.message || {};
          const content = message.parsed
            ? typeof message.parsed === 'string' ? message.parsed : JSON.stringify(message.parsed)
            : message.content || '';
          if (!content) throw new Error('Empty response content');
          return content;
        }
      });

      sources.push({
        type: 'groq',
        model: this.models.secondary,
        handler: async () => {
          const params = this.modelParams.stages.deep_research;
          const response = await fetch(this.groqApiUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.groqApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: this.models.secondary,
              response_format: params.response_format,
              messages: this.buildSystemMessages(prompt),
              temperature: params.temperature,
              top_p: params.top_p,
              frequency_penalty: params.frequency_penalty,
              presence_penalty: params.presence_penalty,
              max_tokens: params.max_tokens,
              tools: [{ type: 'browser_search' }],
              tool_choice: 'auto'
            })
          });

          if (!response.ok) throw new Error(`Groq OSS error: ${response.status}`);

          const data = await response.json();
          const message = data.choices[0]?.message || {};
          const content = message.parsed
            ? typeof message.parsed === 'string' ? message.parsed : JSON.stringify(message.parsed)
            : message.content || '';
          if (!content) throw new Error('Empty response content');
          return content;
        }
      });
    }

    if (this.openaiApiKey) {
      sources.push({
        type: 'openai',
        model: 'gpt-4o',
        handler: async () => {
          const params = this.modelParams.stages.deep_research;
          const response = await fetch(this.openaiApiUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.openaiApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'gpt-4o',
              response_format: params.response_format,
              messages: this.buildSystemMessages(prompt),
              temperature: params.temperature,
              top_p: params.top_p,
              frequency_penalty: params.frequency_penalty,
              presence_penalty: params.presence_penalty,
              max_tokens: params.max_tokens
            })
          });

          if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);

          const data = await response.json();
          const message = data.choices[0]?.message || {};
          const content = message.parsed
            ? typeof message.parsed === 'string' ? message.parsed : JSON.stringify(message.parsed)
            : message.content || '';
          if (!content) throw new Error('Empty response content');
          return content;
        }
      });
    }

    if (this.groqApiKey) {
      sources.push({
        type: 'groq',
        model: this.models.fallback,
        handler: async () => {
          const params = this.modelParams.stages.deep_research;
          const response = await fetch(this.groqApiUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.groqApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: this.models.fallback,
              response_format: params.response_format,
              messages: this.buildSystemMessages(prompt),
              temperature: params.temperature,
              top_p: params.top_p,
              frequency_penalty: params.frequency_penalty,
              presence_penalty: params.presence_penalty,
              max_tokens: params.max_tokens
            })
          });

          if (!response.ok) throw new Error(`Groq fallback error: ${response.status}`);

          const data = await response.json();
          const message = data.choices[0]?.message || {};
          const content = message.parsed
            ? typeof message.parsed === 'string' ? message.parsed : JSON.stringify(message.parsed)
            : message.content || '';
          if (!content) throw new Error('Empty response content');
          return content;
        }
      });
    }

    for (const source of sources) {
      try {
        const result = await source.handler();
        console.log(`🤖 Research generated via ${source.type.toUpperCase()} (${source.model})`);
        return result;
      } catch (error) {
        console.warn(`⚠️  ${source.type} ${source.model} failed: ${error.message}`);
      }
    }

    throw new Error('No AI API available');
  }

  buildSystemMessages(prompt) {
    const system = {
      role: 'system',
      content: 'You are a senior financial research analyst focused on Indian wealth and wealthtech content.'
    };

    return [system, { role: 'user', content: prompt }];
  }

  extractSourceUrls(parsed, topic) {
    const urls = new Set();
    const addUrl = (value) => {
      if (!value) return;
      let url = value.toString().trim();
      if (!url) return;
      if (!/^https?:\/\//i.test(url)) {
        url = url.replace(/^[^A-Za-z0-9]+/, '');
        if (!url) return;
        url = `https://${url}`;
      }
      try {
        const normalized = new URL(url).href.replace(/\/?$/, '/');
        urls.add(normalized.slice(0, -1));
      } catch (_) {}
    };

    const competitors = parsed.top_10_competitors || parsed.top_competitors || parsed.competitor_urls || [];
    competitors.forEach((entry) => {
      if (!entry) return;
      if (typeof entry === 'string') {
        addUrl(entry);
      } else if (typeof entry === 'object') {
        addUrl(entry.url || entry.link || entry.site);
        if (entry.domain) addUrl(entry.domain);
        if (entry.name) addUrl(entry.name);
      }
    });

    if (parsed.reference_urls) {
      const list = Array.isArray(parsed.reference_urls) ? parsed.reference_urls : [parsed.reference_urls];
      list.forEach(addUrl);
    }

    if (topic && topic.target_competitor) {
      addUrl(topic.target_competitor);
    }

    const unique = Array.from(urls).filter((url) => /\.[a-z]{2,}$/i.test(url));
    return unique.slice(0, 10);
  }

  async enrichWithCompetitorOutlines(research, parsed, topic) {
    try {
      const candidateUrls = Array.isArray(research.source_urls)
        ? research.source_urls
        : this.extractSourceUrls(parsed, topic);

      const uniqueUrls = Array.from(new Set(candidateUrls)).slice(0, 6);
      if (uniqueUrls.length === 0) {
        return;
      }

      const outlines = [];
      for (const url of uniqueUrls) {
        const outline = await this.fetchCompetitorOutline(url, topic);
        if (outline) {
          outlines.push(outline);
        }
      }

      if (outlines.length === 0) {
        return;
      }

      const aggregate = this.aggregateOutlineMetrics(outlines);
      const tips = this.generateCompetitiveTips(aggregate, topic);
      const score = Math.round(aggregate.averageScore);

      research.competitor_outline = JSON.stringify(outlines);
      research.rankmath_competition_score = `${score}/100`;
      research.competitor_outline_summary = JSON.stringify(aggregate);

      const scorecard = [
        '### Competitive Scorecard',
        `- Average competitor score: ${score}/100`,
        `- Avg word count: ${Math.round(aggregate.averageWordCount)}`,
        `- Avg H2 count: ${aggregate.averageH2.toFixed(1)} | Avg H3 count: ${aggregate.averageH3.toFixed(1)}`,
        `- Media usage (images/video per article): ${aggregate.averageMedia.toFixed(1)}`
      ];

      if (tips.length > 0) {
        scorecard.push('- Opportunities:', ...tips.map(tip => `  - ${tip}`));
      }

      research.content_superiority_plan = [
        research.content_superiority_plan || '',
        scorecard.join('\n')
      ].join('\n\n').trim();
    } catch (error) {
      console.warn(`⚠️  Unable to enrich competitor outlines: ${error.message}`);
    }
  }

  async fetchCompetitorOutline(url, topic) {
    try {
      const normalizedUrl = this.normalizeUrl(url);
      if (!normalizedUrl) return null;

      if (this.competitorCache.has(normalizedUrl)) {
        return this.competitorCache.get(normalizedUrl);
      }

      const html = await this.fetchHtml(normalizedUrl, 12000);
      if (!html) {
        return null;
      }

      const title = this.extractTitle(html);
      const h1 = this.extractHeadings(html, 'h1');
      const h2 = this.extractHeadings(html, 'h2');
      const h3 = this.extractHeadings(html, 'h3');
      const mediaCount = this.countMatches(html, /<(img|video|picture)\b/gi);
      const tableCount = this.countMatches(html, /<table\b/gi);

      const bodyText = this.stripHtml(html);
      const wordCount = bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0;

      const faqCount = h2.concat(h3).filter(text => /faq|question|how|what|why|which/i.test(text)).length;

      const score = this.computeRankMathScore({ wordCount, h1Count: h1.length, h2Count: h2.length, h3Count: h3.length, mediaCount, tableCount, faqCount });

      const outline = {
        url: normalizedUrl,
        domain: this.getDomain(normalizedUrl),
        title,
        h1,
        h2,
        h3,
        wordCount,
        mediaCount,
        tableCount,
        faqCount,
        score
      };

      this.competitorCache.set(normalizedUrl, outline);
      return outline;
    } catch (error) {
      console.warn(`⚠️  Failed to analyze ${url}: ${error.message}`);
      return null;
    }
  }

  async fetchHtml(url, timeout = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
        },
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`status ${response.status}`);
      }

      return await response.text();
    } catch (error) {
      if (error.name === 'AbortError') {
        console.warn(`⚠️  Fetch timeout for ${url}`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  computeRankMathScore(metrics) {
    let score = 100;

    if (metrics.wordCount < 1800) {
      score -= Math.min(35, Math.round((1800 - metrics.wordCount) / 40));
    }
    if (metrics.h2Count < 8) {
      score -= (8 - metrics.h2Count) * 4;
    }
    if (metrics.h3Count < 6) {
      score -= (6 - metrics.h3Count) * 3;
    }
    if (metrics.mediaCount < 3) {
      score -= 5;
    }
    if (metrics.tableCount === 0) {
      score -= 5;
    }
    if (metrics.faqCount === 0) {
      score -= 4;
    }
    if (metrics.h1Count !== 1) {
      score -= 4;
    }

    return Math.max(0, Math.min(100, score));
  }

  aggregateOutlineMetrics(outlines) {
    const total = outlines.length;
    const sum = outlines.reduce((acc, outline) => {
      acc.wordCount += outline.wordCount;
      acc.h2 += outline.h2.length;
      acc.h3 += outline.h3.length;
      acc.media += outline.mediaCount;
      acc.score += outline.score;
      return acc;
    }, { wordCount: 0, h2: 0, h3: 0, media: 0, score: 0 });

    return {
      total,
      averageWordCount: total ? sum.wordCount / total : 0,
      averageH2: total ? sum.h2 / total : 0,
      averageH3: total ? sum.h3 / total : 0,
      averageMedia: total ? sum.media / total : 0,
      averageScore: total ? sum.score / total : 0
    };
  }

  generateCompetitiveTips(aggregate, topic) {
    const tips = [];
    if (aggregate.averageWordCount < 1800) {
      tips.push('Target 1,900+ words to outrank shorter competitors.');
    }
    if (aggregate.averageH2 < 8) {
      tips.push('Add at least 8 detailed H2 sections (comparisons, FAQs, case studies).');
    }
    if (aggregate.averageH3 < 6) {
      tips.push('Deepen subtopics with 6+ H3 subsections.');
    }
    if (aggregate.averageMedia < 3) {
      tips.push('Use more charts/visuals than competitors (aim for 4+ media assets).');
    }
    tips.push(`Include a dedicated section on ${topic.primary_keyword} with India-specific data and SEBI/RBI references.`);
    tips.push('Add schematized FAQ and comparison tables to improve SERP rich results.');
    return tips;
  }

  normalizeUrl(url) {
    if (!url) return null;
    let trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      trimmed = `https://${trimmed.replace(/^\/*/, '')}`;
    }
    try {
      const parsed = new URL(trimmed);
      parsed.hash = '';
      return parsed.toString();
    } catch (_) {
      return null;
    }
  }

  getDomain(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, '');
    } catch (_) {
      return url;
    }
  }

  extractTitle(html) {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return this.cleanText(match ? match[1] : '');
  }

  extractHeadings(html, tag) {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'gi');
    const headings = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
      const text = this.cleanText(match[1]);
      if (text) {
        headings.push(text);
      }
    }
    return headings;
  }

  stripHtml(html) {
    return this.cleanText(html);
  }

  cleanText(text) {
    if (!text) return '';
    return text
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  countMatches(text, regex) {
    if (!text) return 0;
    const matches = text.match(regex);
    return matches ? matches.length : 0;
  }

  /**
   * Parse research response
   */
  async parseResearchResponse(response, topic) {
    try {
      // Clean Markdown formatting that breaks JSON parsing
      let cleanedResponse = response
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .replace(/^\s*[\*\-]\s+/gm, '')
        .replace(/\*\*([^\*]+)\*\*/g, '$1')
        .replace(/\*([^\*]+)\*/g, '$1')
        .trim();

      // Try to extract JSON from cleaned response
      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        let jsonString = jsonMatch[0];

        // Additional cleanup for common JSON issues
        jsonString = jsonString
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']')
          .replace(/\r?\n/g, ' ')
          .replace(/\s+/g, ' ')
          // Quote unquoted property names like foo: "bar" -> "foo": "bar"
          .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

        try {
          const parsed = JSON.parse(jsonString);
          const sources = this.extractSourceUrls(parsed, topic);
          const research = {
            topic_id: topic.topic_id,
            research_date: new Date().toISOString().split('T')[0],
            primary_keyword: topic.primary_keyword,
            top_10_competitors: parsed.top_10_competitors || '',
            content_gaps: parsed.content_gaps || '',
            search_intent: parsed.search_intent || '',
            related_questions: parsed.related_questions || '',
            content_superiority_plan: parsed.content_superiority_plan || '',
            resource_requirements: parsed.resource_requirements || '',
            regulatory_compliance: parsed.regulatory_compliance || topic.regulatory_requirements || '',
            estimated_impact: parsed.estimated_impact || '',
            content_outline: parsed.content_outline || '',
            source_urls: sources,
            approval_status: 'Pending'
          };
          await this.enrichWithCompetitorOutlines(research, parsed, topic);
          console.log(`✅ Successfully parsed JSON response for ${topic.topic_id}`);
          return research;
        } catch (jsonError) {
          console.warn(`⚠️  JSON parse failed for ${topic.topic_id}: ${jsonError.message}`);
          console.warn(`📄 Problematic JSON (first 500 chars): ${jsonString.substring(0, 500)}`);
        }
      }

      // Fallback: use raw response
      console.warn(`⚠️  No valid JSON found, using fallback parsing for ${topic.topic_id}`);
      const fallbackSources = this.extractSourceUrls({}, topic);
      const research = {
        topic_id: topic.topic_id,
        research_date: new Date().toISOString().split('T')[0],
        primary_keyword: topic.primary_keyword,
        top_10_competitors: 'Analysis conducted',
        content_gaps: response.substring(0, 500),
        search_intent: 'Informational',
        related_questions: '',
        content_superiority_plan: response.substring(0, 1000),
        resource_requirements: 'Expert review recommended',
        regulatory_compliance: topic.regulatory_requirements || 'Standard disclaimers',
        estimated_impact: 'High',
        content_outline: '',
        source_urls: fallbackSources,
        approval_status: 'Pending'
      };
      await this.enrichWithCompetitorOutlines(research, {}, topic);
      return research;

    } catch (error) {
      console.error(`❌ Failed to parse research response for ${topic.topic_id}:`, error.message);
      return null;
    }
  }

  /**
   * Print summary
   */
  printSummary(results) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 DEEP RESEARCH SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Completed Research: ${results.length} topics`);
    console.log('\n📋 Next Steps:');
    console.log('   1. Review topic-research.csv file');
    console.log('   2. Approve research items (set approval_status = "Yes")');
    console.log('   3. Run content creator: node content/content-creator.js');
    console.log('='.repeat(60) + '\n');
  }

  /**
   * Approve high-quality research
   */
  approveHighQuality() {
    const research = this.csvManager.readCSV(this.csvManager.files.topicResearch);
    let approved = 0;

    research.forEach(item => {
      if (item.approval_status === 'Pending' && item.estimated_impact === 'High') {
        this.csvManager.updateApprovalStatus('topicResearch', 'topic_research_id', item.topic_research_id, 'Yes');
        approved++;
      }
    });

    console.log(`✅ Auto-approved ${approved} high-impact research items`);
  }
}

// CLI
if (require.main === module) {
  const limitArg = process.argv.find(arg => arg.startsWith('--topic-limit=')) || process.argv.find(arg => arg.startsWith('--limit='));
  const parsedLimit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;
  const effectiveLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : null;

  const researcher = new DeepTopicResearcher({
    topicLimit: effectiveLimit
  });
  const command = process.argv[2];

  switch (command) {
    case 'research':
      researcher.conductDeepResearch(effectiveLimit)
        .then(() => console.log('🎉 Deep research completed!'))
        .catch(err => {
          console.error('❌ Failed:', err.message);
          process.exit(1);
        });
      break;

    case 'approve-high':
      researcher.approveHighQuality();
      break;

  default:
    console.log('Usage: node deep-topic-researcher.js [research|approve-high]');
    console.log('');
    console.log('Commands:');
    console.log('  research     - Conduct deep research on approved topics');
    console.log('  approve-high - Auto-approve high-impact research');
    console.log('');
    console.log('Options:');
    console.log('  --topic-limit=N  Limit number of topics processed in this run');
  }
}

module.exports = DeepTopicResearcher;
