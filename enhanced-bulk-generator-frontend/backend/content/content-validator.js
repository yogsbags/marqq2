#!/usr/bin/env node

/**
 * Content Validator for Enhanced Bulk Generator
 * Implements Stage 4.5: Content Validation
 * Validates created content against 39 critical guidelines before SEO optimization
 * Now includes AI-powered auto-correction using groq/gpt-oss-120b
 */

const CSVDataManager = require('../core/csv-data-manager');
const fetch = require('node-fetch');

class ContentValidator {
  constructor(config = {}) {
    this.csvManager = new CSVDataManager();

    this.config = {
      autoApprove: config.autoApprove || false,
      strictMode: config.strictMode !== false, // Strict mode enabled by default
      validationLimit: config.validationLimit || null,
      autoCorrect: config.autoCorrect !== false, // Auto-correction enabled by default
    };

    // Validation rule weights (for scoring)
    this.ruleWeights = {
      CRITICAL: 10,   // Must pass: structure, compliance
      HIGH: 5,        // Should pass: quality, SEO
      MEDIUM: 2,      // Nice to have: formatting
      LOW: 1,         // Optional: enhancements
    };

    // Minimum passing score
    this.passingScore = 80; // 80% of weighted score

    // AI correction setup (using groq/gpt-oss-120b as requested)
    this.groqApiKey = process.env.GROQ_API_KEY;
    this.groqApiUrl = 'https://api.groq.com/openai/v1/chat/completions';
    this.correctionModel = 'openai/gpt-oss-120b'; // User-requested model
    this.maxCorrectionAttempts = 2; // Try correction up to 2 times
  }

  /**
   * Main validation entry point
   */
  async validateContent() {
    console.log('\n🔍 CONTENT VALIDATION STARTED');
    console.log('='.repeat(60));

    try {
      // Get content that needs validation (Needs-SEO status)
      const pendingContent = this.getPendingContentForValidation();

      if (pendingContent.length === 0) {
        console.log('⚠️  No content found requiring validation.');
        console.log('   • Content must have approval_status = "Needs-SEO"');
        console.log('   • Run Stage 4 (content creation) first');
        return [];
      }

      console.log(`✅ Found ${pendingContent.length} content item(s) to validate`);

      const validationResults = [];

      for (let i = 0; i < pendingContent.length; i++) {
        let content = pendingContent[i];
        console.log(`\n🔍 Validating ${i + 1}/${pendingContent.length}: ${content.content_id}`);

        let result = await this.validateSingleContent(content);
        let correctionAttempts = 0;

        // Auto-correct if failed and auto-correction enabled
        while (!result.passed && this.config.autoCorrect && correctionAttempts < this.maxCorrectionAttempts) {
          correctionAttempts++;
          console.log(`\n🔧 Correction Attempt ${correctionAttempts}/${this.maxCorrectionAttempts}`);

          const correctedContent = await this.correctContent(content, result);

          if (correctedContent) {
            // Save corrected content to CSV immediately
            this.csvManager.updateCreatedContent(content.content_id, {
              article_content: correctedContent.article_content,
              correction_applied: true,
              correction_date: correctedContent.correction_date
            });

            // Re-validate corrected content
            console.log(`\n🔍 Re-validating corrected content...`);
            content = correctedContent;
            const revalidationResult = await this.validateSingleContent(content);

            // Compare scores
            const improved = revalidationResult.score_percentage > result.score_percentage;
            console.log(`   Score: ${result.score_percentage}% → ${revalidationResult.score_percentage}% ${improved ? '✅ Improved' : '⚠️ No improvement'}`);

            if (improved) {
              result = revalidationResult;
              result.correction_attempts = correctionAttempts;

              if (result.passed) {
                console.log(`   ✅ Validation PASSED after correction!`);
                break;
              }
            } else {
              console.log(`   ⚠️ Correction did not improve score - stopping attempts`);
              break;
            }
          } else {
            console.log(`   ⚠️ Correction failed - using original content`);
            break;
          }
        }

        if (correctionAttempts > 0 && !result.passed) {
          console.log(`\n⚠️  Auto-correction attempts exhausted (${correctionAttempts}/${this.maxCorrectionAttempts})`);
          console.log(`   Final score: ${result.score_percentage}% - manual review required`);
        }

        validationResults.push(result);

        // Update CSV with final validation results
        this.updateContentWithValidation(content.content_id, result);

        // Print validation summary for this content
        this.printContentValidationSummary(content.content_id, result);
      }

      // Print overall summary
      this.printOverallSummary(validationResults);

      return validationResults;

    } catch (error) {
      console.error('❌ Content validation failed:', error.message);
      throw error;
    }
  }

  /**
   * Get content items that need validation
   */
  getPendingContentForValidation() {
    const allContent = this.csvManager.getContentByApprovalStatus();

    // Filter for content with "Needs-SEO" status (just created, not validated yet)
    const pending = allContent.filter(item =>
      item.approval_status === 'Needs-SEO'
    );

    if (this.config.validationLimit && pending.length > this.config.validationLimit) {
      return pending.slice(0, this.config.validationLimit);
    }

    return pending;
  }

  /**
   * Validate a single content item against all rules
   */
  async validateSingleContent(content) {
    const result = {
      content_id: content.content_id,
      topic_id: content.topic_id,
      validation_date: new Date().toISOString(),
      passed: false,
      score: 0,
      max_score: 0,
      issues: [],
      warnings: [],
      suggestions: [],
    };

    // Parse article content
    const article = content.article_content || '';
    const seoMeta = this.safeParseJSON(content.seo_metadata, {});
    const qualityMetrics = this.safeParseJSON(content.quality_metrics, {});

    // Extract article title (from first H1 or topic_title)
    const articleTitle = this.extractArticleTitle(article, content);

    // Run all validation categories
    this.validateStructure(article, result);
    this.validateContentQuality(article, content, result);
    this.validateCompliance(article, result);
    this.validateSEO(seoMeta, article, result, articleTitle);
    this.validateFormatting(article, result);

    // Calculate final score
    result.score_percentage = result.max_score > 0
      ? Math.round((result.score / result.max_score) * 100)
      : 0;

    // Determine if content passed
    result.passed = result.score_percentage >= this.passingScore && result.issues.length === 0;

    // Set validation status
    if (result.passed) {
      result.status = 'Validation-Passed';
    } else if (result.score_percentage >= 60) {
      result.status = 'Validation-Warning';
    } else {
      result.status = 'Validation-Failed';
    }

    return result;
  }

  /**
   * Validate article structure (CRITICAL)
   */
  validateStructure(article, result) {
    const weight = this.ruleWeights.CRITICAL;

    // Rule 1: No H1 title at start
    const hasH1 = /^#\s+[^\n]+/m.test(article);
    this.addValidationCheck(
      result,
      !hasH1,
      weight,
      'No H1 title at article start (should start with ## Summary)',
      'H1 heading found at article start - remove it'
    );

    // Rule 2: Summary is first H2
    const firstH2Match = article.match(/^##\s+([^\n]+)/m);
    const firstH2Text = firstH2Match ? firstH2Match[1].trim() : '';
    const isSummaryFirst = /^Summary$/i.test(firstH2Text);

    this.addValidationCheck(
      result,
      isSummaryFirst,
      weight,
      'Summary is the first H2 heading',
      `First H2 is "${firstH2Text}" instead of "Summary"`
    );

    // Rule 3: No "Introduction" H2 heading
    const hasIntroductionH2 = /^##\s+Introduction/mi.test(article);
    this.addValidationCheck(
      result,
      !hasIntroductionH2,
      weight,
      'No "Introduction" H2 heading (use plain text after Summary)',
      'Found "## Introduction" heading - should be plain text paragraphs'
    );

    // Rule 4: Key Takeaways exists
    const hasKeyTakeaways = /^##\s+Key\s+Takeaways/mi.test(article);
    this.addValidationCheck(
      result,
      hasKeyTakeaways,
      weight,
      'Key Takeaways section present',
      'Missing "## Key Takeaways" section'
    );

    // Rule 5: Action Plan exists
    const hasActionPlan = /^##\s+Action\s+Plan/mi.test(article);
    this.addValidationCheck(
      result,
      hasActionPlan,
      weight,
      'Action Plan section present',
      'Missing "## Action Plan" section'
    );

    // Rule 6: Conclusion exists
    const hasConclusion = /^##\s+Conclusion/mi.test(article);
    this.addValidationCheck(
      result,
      hasConclusion,
      weight,
      'Conclusion section present',
      'Missing "## Conclusion" section'
    );

    // Rule 7: FAQ section exists AFTER Conclusion
    const faqRegex = /^##\s+(FAQ|Frequently\s+Asked\s+Questions|FAQs\s+on)/mi;
    const hasFAQ = faqRegex.test(article);

    if (hasFAQ && hasConclusion) {
      const conclusionIndex = article.search(/^##\s+Conclusion/mi);
      const faqIndex = article.search(faqRegex);
      const faqAfterConclusion = faqIndex > conclusionIndex;

      this.addValidationCheck(
        result,
        faqAfterConclusion,
        weight,
        'FAQ section placed AFTER Conclusion',
        'FAQ section found BEFORE Conclusion - must be after'
      );
    } else if (!hasFAQ) {
      this.addValidationCheck(
        result,
        false,
        weight,
        'FAQ section present',
        'Missing FAQ section'
      );
    }

    // Rule 8: Exactly 5 FAQs
    const faqH3Count = (article.match(/^###\s+(?:What|How|Why|When|Which|Is|Are|Can|Do|Does)/gmi) || []).length;
    this.addValidationCheck(
      result,
      faqH3Count === 5,
      weight,
      'Exactly 5 FAQ questions (H3 format)',
      `Found ${faqH3Count} FAQ questions, expected exactly 5`
    );

    // Rule 9: Key Takeaways and Action Plan BEFORE Conclusion
    if (hasKeyTakeaways && hasConclusion) {
      const keyTakeawaysIndex = article.search(/^##\s+Key\s+Takeaways/mi);
      const conclusionIndex = article.search(/^##\s+Conclusion/mi);
      const correctOrder = keyTakeawaysIndex < conclusionIndex;

      this.addValidationCheck(
        result,
        correctOrder,
        weight,
        'Key Takeaways placed BEFORE Conclusion',
        'Key Takeaways must be BEFORE Conclusion'
      );
    }

    if (hasActionPlan && hasConclusion) {
      const actionPlanIndex = article.search(/^##\s+Action\s+Plan/mi);
      const conclusionIndex = article.search(/^##\s+Conclusion/mi);
      const correctOrder = actionPlanIndex < conclusionIndex;

      this.addValidationCheck(
        result,
        correctOrder,
        weight,
        'Action Plan placed BEFORE Conclusion',
        'Action Plan must be BEFORE Conclusion'
      );
    }
  }

  /**
   * Validate content quality (HIGH)
   */
  validateContentQuality(article, content, result) {
    const weight = this.ruleWeights.HIGH;

    // Rule 1: Word count (2000-2500 target, ~2400 optimal)
    const wordCount = this.calculateWordCount(article);
    const wordCountInRange = wordCount >= 2000 && wordCount <= 2500;

    this.addValidationCheck(
      result,
      wordCountInRange,
      weight,
      `Word count in target range (2000-2500): ${wordCount} words`,
      `Word count ${wordCount} outside target range (2000-2500)`
    );

    // Rule 2: No competitor names
    const competitorPattern = /(zerodha|upstox|angel\s+one|icici\s+direct|groww)/gi;
    const competitorMatches = article.match(competitorPattern);

    this.addValidationCheck(
      result,
      !competitorMatches,
      weight,
      'No competitor names mentioned',
      `Found competitor names: ${competitorMatches ? competitorMatches.join(', ') : ''}`
    );

    // Rule 3: CTA link presence
    const hasCTALink = article.includes('instakyc.plindia.com') || article.includes('https://www.plindia.com');

    this.addValidationCheck(
      result,
      hasCTALink,
      weight,
      'CTA link to PL Capital present',
      'Missing CTA link (https://instakyc.plindia.com/ or https://www.plindia.com)'
    );

    // Rule 4: Sentence length check (sample first 500 words)
    const sampleText = article.split(/\s+/).slice(0, 500).join(' ');
    const sentences = sampleText.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgWordsPerSentence = sentences.length > 0
      ? sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0) / sentences.length
      : 0;

    const shortSentences = avgWordsPerSentence <= 15;

    if (!shortSentences) {
      this.addValidationCheck(
        result,
        false,
        this.ruleWeights.MEDIUM, // Medium priority
        'Average sentence length under 15 words',
        `Average sentence length: ${avgWordsPerSentence.toFixed(1)} words (target: under 15)`
      );
    } else {
      this.addValidationCheck(
        result,
        true,
        this.ruleWeights.MEDIUM,
        `Average sentence length: ${avgWordsPerSentence.toFixed(1)} words (under 15)`,
        ''
      );
    }

    // Rule 5: No keyword stuffing (focus keyphrase appears 3-8 times max)
    const seoMeta = this.safeParseJSON(content.seo_metadata, {});
    const focusKeyphrase = seoMeta.focus_keyphrase || '';

    if (focusKeyphrase) {
      const keyphraseCount = (article.match(new RegExp(focusKeyphrase, 'gi')) || []).length;
      const noStuffing = keyphraseCount >= 3 && keyphraseCount <= 8;

      if (!noStuffing) {
        result.warnings.push(`Focus keyphrase "${focusKeyphrase}" appears ${keyphraseCount} times (optimal: 3-8)`);
      }
    }
  }

  /**
   * Validate compliance (CRITICAL)
   */
  validateCompliance(article, result) {
    const weight = this.ruleWeights.CRITICAL;

    // Rule 1: Date references (November 2025, FY 2025-26, AY 2026-27)
    const hasJanuary2025 = /january\s+2025/gi.test(article);

    this.addValidationCheck(
      result,
      !hasJanuary2025,
      weight,
      'No January 2025 references (use November 2025)',
      'Found "January 2025" references - should use November 2025'
    );

    // Rule 2: No absolute probability claims
    const probabilityPattern = /(\d+%?\s*probability|success\s+rate.*\d+%)/gi;
    const hasProbabilityClaims = probabilityPattern.test(article);

    this.addValidationCheck(
      result,
      !hasProbabilityClaims,
      weight,
      'No absolute probability/success rate claims',
      'Found probability/success rate stated as facts - must qualify with conditions'
    );

    // Rule 3: No unsourced historical claims
    const historicalPattern = /(historical\s+data\s+shows|studies\s+indicate|research\s+shows)/gi;
    const hasHistoricalClaims = historicalPattern.test(article);

    this.addValidationCheck(
      result,
      !hasHistoricalClaims,
      weight,
      'No unsourced historical data claims',
      'Found "historical data shows" or similar claims without sources'
    );

    // Rule 4: Asterisk and Important Notes alignment
    const hasAsterisks = article.includes('*') && !article.includes('**'); // Single asterisk usage
    const hasImportantNotes = /\*\*Important\s+Notes?:?\*\*/i.test(article);

    if (hasAsterisks && !hasImportantNotes) {
      this.addValidationCheck(
        result,
        false,
        weight,
        'Important Notes section present when asterisks used',
        'Asterisks (*) used but no "Important Notes" section found'
      );
    } else if (!hasAsterisks && hasImportantNotes) {
      result.warnings.push('Important Notes section present but no asterisks found in article');
    }

    // Rule 5: Future date references
    const hasFutureDateRef = /as\s+of\s+(nov|november)\s+2025/gi.test(article);

    if (hasFutureDateRef) {
      result.warnings.push('Found "as of Nov 2025" - use "subject to NSE revisions" instead');
    }
  }

  /**
   * Extract article title from content or metadata
   */
  extractArticleTitle(article, content) {
    // Try to extract from first H1 in article
    const h1Match = article.match(/^#\s+([^\n]+)/m);
    if (h1Match) {
      return h1Match[1].trim();
    }

    // Fallback to topic_title from content
    if (content.topic_title) {
      return content.topic_title.trim();
    }

    // Fallback to first H2 if no H1
    const h2Match = article.match(/^##\s+([^\n]+)/m);
    if (h2Match) {
      return h2Match[1].trim();
    }

    return null;
  }

  /**
   * Validate SEO metadata (HIGH)
   */
  validateSEO(seoMeta, article, result, articleTitle = null) {
    const weight = this.ruleWeights.HIGH;

    // Rule 1: Meta title length (50-60 characters)
    const title = seoMeta.title || '';
    const titleLength = title.length;
    const titleInRange = titleLength >= 50 && titleLength <= 60;

    this.addValidationCheck(
      result,
      titleInRange,
      weight,
      `Meta title length optimal (50-60 chars): ${titleLength} chars`,
      `Meta title length ${titleLength} chars (target: 50-60)`
    );

    // Rule 1.5: Article title and SEO title must be different
    if (articleTitle && title) {
      const titlesAreDifferent = articleTitle.toLowerCase().trim() !== title.toLowerCase().trim();
      this.addValidationCheck(
        result,
        titlesAreDifferent,
        weight,
        'Article title and SEO title are different',
        `Article title "${articleTitle}" and SEO title "${title}" are the same - they must be different`
      );
    }

    // Rule 2: Meta description length (140-160 characters)
    const description = seoMeta.meta_description || '';
    const descLength = description.length;
    const descInRange = descLength >= 140 && descLength <= 160;

    this.addValidationCheck(
      result,
      descInRange,
      weight,
      `Meta description length optimal (140-160 chars): ${descLength} chars`,
      `Meta description length ${descLength} chars (target: 140-160)`
    );

    // Rule 3: Focus keyphrase present
    const hasFocusKeyphrase = Boolean(seoMeta.focus_keyphrase && seoMeta.focus_keyphrase.trim().length > 0);

    this.addValidationCheck(
      result,
      hasFocusKeyphrase,
      weight,
      'Focus keyphrase defined',
      'Missing focus keyphrase in SEO metadata'
    );

    // Rule 4: Secondary keywords (3-5 keywords)
    const secondaryKeywords = Array.isArray(seoMeta.secondary_keywords)
      ? seoMeta.secondary_keywords
      : [];
    const hasSecondaryKeywords = secondaryKeywords.length >= 3 && secondaryKeywords.length <= 5;

    this.addValidationCheck(
      result,
      hasSecondaryKeywords,
      weight,
      `Secondary keywords count optimal (3-5): ${secondaryKeywords.length} keywords`,
      `Secondary keywords count ${secondaryKeywords.length} (target: 3-5)`
    );

    // Rule 5: Focus keyphrase in meta description
    if (hasFocusKeyphrase && description) {
      const keyphraseInDesc = description.toLowerCase().includes(seoMeta.focus_keyphrase.toLowerCase());

      if (!keyphraseInDesc) {
        result.warnings.push('Focus keyphrase not found in meta description');
      }
    }
  }

  /**
   * Validate formatting (MEDIUM)
   */
  validateFormatting(article, result) {
    const weight = this.ruleWeights.MEDIUM;

    // Rule 1: Mixed formatting (paragraphs, tables, bullets, numbered lists)
    const hasBullets = /^[\s]*[-*]\s+/m.test(article);
    const hasNumberedLists = /^[\s]*\d+\.\s+/m.test(article);
    const hasTables = /\|.*\|.*\|/m.test(article);

    const formatTypes = [hasBullets, hasNumberedLists, hasTables].filter(Boolean).length;
    const hasMixedFormatting = formatTypes >= 2;

    this.addValidationCheck(
      result,
      hasMixedFormatting,
      weight,
      `Mixed formatting present (${formatTypes}/3 types: bullets, numbered lists, tables)`,
      'Limited formatting variety - should use paragraphs, bullets, numbered lists, and tables'
    );

    // Rule 2: No trailing years in headings (except FY)
    const headingsWithYears = article.match(/^##\s+[^#\n]+20\d{2}\s*$/gm);
    const hasTrailingYears = headingsWithYears && headingsWithYears.some(h => !/FY\s*20\d{2}/i.test(h));

    if (hasTrailingYears) {
      result.warnings.push('Found trailing years in headings (should be removed unless FY)');
    }

    // Rule 3: Proper en dash usage for ranges
    const hasRanges = /\d+%?[\s]*–[\s]*\d+%?/g.test(article);
    const hasHyphenRanges = /\d+%?[\s]*-[\s]*\d+%?/g.test(article);

    if (hasHyphenRanges && !hasRanges) {
      result.suggestions.push('Use en dashes (–) for ranges instead of hyphens (-)');
    }

    // Rule 4: Conclusion length (under 100 words)
    const conclusionMatch = article.match(/^##\s+Conclusion\s*$([\s\S]*?)(?=^##\s+|$)/m);
    if (conclusionMatch) {
      const conclusionText = conclusionMatch[1] || '';
      const conclusionWordCount = this.calculateWordCount(conclusionText);

      if (conclusionWordCount > 150) {
        result.warnings.push(`Conclusion is ${conclusionWordCount} words (target: under 100 words)`);
      }
    }
  }

  /**
   * Add validation check result
   */
  addValidationCheck(result, passed, weight, passMessage, failMessage) {
    result.max_score += weight;

    if (passed) {
      result.score += weight;
      // Only log critical/high priority passes
      if (weight >= this.ruleWeights.HIGH) {
        // Success - no need to log every pass
      }
    } else {
      if (weight >= this.ruleWeights.CRITICAL) {
        result.issues.push(`[CRITICAL] ${failMessage}`);
      } else if (weight >= this.ruleWeights.HIGH) {
        result.issues.push(`[HIGH] ${failMessage}`);
      } else {
        result.warnings.push(failMessage);
      }
    }
  }

  /**
   * AI-powered content correction using groq/gpt-oss-120b
   * Attempts to fix validation issues automatically
   */
  async correctContent(content, validationResult) {
    if (!this.groqApiKey) {
      console.log('⚠️  Groq API key not found - skipping auto-correction');
      return null;
    }

    console.log(`🔧 Attempting AI-powered correction for ${content.content_id}...`);

    try {
      const correctionPrompt = this.buildCorrectionPrompt(content, validationResult);

      const requestBody = {
        model: this.correctionModel,
        messages: [
          {
            role: 'system',
            content: 'You are an expert content editor specializing in Indian financial content compliance (SEBI/RBI). Your task is to fix validation issues while preserving the article\'s value and accuracy.'
          },
          { role: 'user', content: correctionPrompt }
        ],
        temperature: 0.3,
        top_p: 0.9,
        frequency_penalty: 0.2,
        presence_penalty: 0.1,
        max_tokens: 8000,
        tools: [{ type: "browser_search" }], // Enable browser search for gpt-oss model
        tool_choice: "auto"
      };

      console.log(`   Using model: ${this.correctionModel} with browser search`);

      const response = await fetch(this.groqApiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.groqApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`   ❌ API error (${response.status}): ${errorText}`);
        return null;
      }

      const data = await response.json();
      const correctedArticle = data.choices[0].message.content;

      if (!correctedArticle || correctedArticle.length < 100) {
        console.log('   ❌ AI returned invalid corrected content');
        return null;
      }

      console.log(`   ✅ AI correction complete (${correctedArticle.length} chars)`);

      // Return corrected content object
      return {
        ...content,
        article_content: correctedArticle,
        correction_applied: true,
        correction_date: new Date().toISOString()
      };

    } catch (error) {
      console.error(`   ❌ Correction failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Build correction prompt based on validation issues
   */
  buildCorrectionPrompt(content, validationResult) {
    const article = content.article_content || '';
    const seoMeta = this.safeParseJSON(content.seo_metadata, {});
    
    // Dynamic date context
    const now = new Date();
    const currentMonth = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    const currentYear = now.getFullYear();

    let prompt = `# Content Correction Task\n\n`;
    prompt += `You must fix the following ${validationResult.issues.length} validation issues in this financial article.\n\n`;

    // Add critical issues
    if (validationResult.issues.length > 0) {
      prompt += `## CRITICAL ISSUES TO FIX:\n\n`;
      validationResult.issues.forEach((issue, idx) => {
        prompt += `${idx + 1}. ${issue}\n`;
      });
      prompt += `\n`;
    }

    // Add context about the 39 critical guidelines
    prompt += `## COMPLIANCE GUIDELINES:\n\n`;
    prompt += `1. **Structure**: Start with "## Summary" (no H1), followed by plain text intro paragraphs\n`;
    prompt += `2. **Required Sections** (in this order): Summary → Main content → Key Takeaways → Action Plan → Conclusion → FAQ\n`;
    prompt += `3. **Word Count**: Must be 2000-2500 words\n`;
    prompt += `4. **No Competitor Names**: Remove all mentions of Zerodha, Upstox, Angel One, ICICI Direct, Groww\n`;
    prompt += `5. **CTA Link**: Include https://instakyc.plindia.com/ or https://www.plindia.com\n`;
    prompt += `6. **Sentence Length**: Keep sentences under 15 words average\n`;
    prompt += `7. **FAQ**: Exactly 5 FAQ questions in H3 format (###), placed AFTER Conclusion\n`;
    prompt += `8. **Dates**: Use "${currentMonth}" not outdated months/years\n`;
    prompt += `9. **No Absolute Claims**: Avoid "X% probability" or "success rate of Y%" without qualifiers\n`;
    prompt += `10. **Formatting**: Use bullets, numbered lists, and tables for variety\n`;
    prompt += `11. **Title Difference**: The article title (from topic_title or first heading) MUST be different from the SEO meta title (seo_metadata.title)\n\n`;

    // Add SEO context if relevant
    if (seoMeta.focus_keyphrase) {
      prompt += `## SEO CONTEXT:\n\n`;
      prompt += `- Focus Keyphrase: "${seoMeta.focus_keyphrase}"\n`;
      prompt += `- Use keyphrase 3-8 times naturally throughout the article\n\n`;
    }

    // Add the article content
    prompt += `## CURRENT ARTICLE TO FIX:\n\n`;
    prompt += `${article}\n\n`;

    // Add instructions
    prompt += `## YOUR TASK:\n\n`;
    prompt += `1. Fix ALL the critical issues listed above\n`;
    prompt += `2. Preserve the article's value, accuracy, and original intent\n`;
    prompt += `3. Return ONLY the corrected markdown article (no explanations)\n`;
    prompt += `4. Ensure the corrected article follows ALL 39 compliance guidelines\n`;
    prompt += `5. If word count is low, expand with relevant examples, case studies, or tables\n`;
    prompt += `6. If competitor names found, replace with generic terms like "other platforms" or "traditional brokers"\n`;
    prompt += `7. Maintain professional, authoritative tone suitable for Indian investors\n\n`;

    return prompt;
  }

  /**
   * Update content record with validation results
   */
  updateContentWithValidation(contentId, validationResult) {
    // Update approval status based on validation
    const newStatus = validationResult.status;

    this.csvManager.updateContentApprovalStatus(contentId, newStatus);

    // Add validation notes to workflow status
    const notes = this.buildValidationNotes(validationResult);

    this.csvManager.updateWorkflowStatus(
      validationResult.topic_id,
      'Content Validation',
      newStatus,
      notes,
      {
        validation_score: validationResult.score_percentage,
        validation_date: validationResult.validation_date
      }
    );
  }

  /**
   * Build validation notes summary
   */
  buildValidationNotes(validationResult) {
    const parts = [];

    parts.push(`Score: ${validationResult.score_percentage}% (${validationResult.score}/${validationResult.max_score})`);

    if (validationResult.issues.length > 0) {
      parts.push(`Issues: ${validationResult.issues.length}`);
    }

    if (validationResult.warnings.length > 0) {
      parts.push(`Warnings: ${validationResult.warnings.length}`);
    }

    if (validationResult.passed) {
      parts.push('✅ Passed - Ready for SEO optimization');
    } else {
      parts.push('❌ Failed - Requires fixes');
    }

    return parts.join(' | ');
  }

  /**
   * Print validation summary for single content
   */
  printContentValidationSummary(contentId, validationResult) {
    console.log('');
    console.log('─'.repeat(60));
    console.log(`📊 Validation Results: ${contentId}`);
    console.log('─'.repeat(60));
    console.log(`Status: ${validationResult.status}`);
    console.log(`Score: ${validationResult.score_percentage}% (${validationResult.score}/${validationResult.max_score} points)`);
    console.log('');

    if (validationResult.issues.length > 0) {
      console.log('❌ ISSUES (must fix):');
      validationResult.issues.forEach((issue, idx) => {
        console.log(`   ${idx + 1}. ${issue}`);
      });
      console.log('');
    }

    if (validationResult.warnings.length > 0) {
      console.log('⚠️  WARNINGS (should review):');
      validationResult.warnings.slice(0, 5).forEach((warning, idx) => {
        console.log(`   ${idx + 1}. ${warning}`);
      });
      if (validationResult.warnings.length > 5) {
        console.log(`   ... and ${validationResult.warnings.length - 5} more warnings`);
      }
      console.log('');
    }

    if (validationResult.suggestions.length > 0) {
      console.log('💡 SUGGESTIONS (optional):');
      validationResult.suggestions.slice(0, 3).forEach((suggestion, idx) => {
        console.log(`   ${idx + 1}. ${suggestion}`);
      });
      console.log('');
    }

    if (validationResult.passed) {
      console.log('✅ VALIDATION PASSED - Content ready for SEO optimization');
    } else {
      console.log('❌ VALIDATION FAILED - Content requires fixes before SEO');
    }
    console.log('─'.repeat(60));
  }

  /**
   * Print overall validation summary
   */
  printOverallSummary(results) {
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const avgScore = results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + r.score_percentage, 0) / results.length)
      : 0;

    console.log('');
    console.log('='.repeat(60));
    console.log('📊 OVERALL VALIDATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Validated: ${results.length} content item(s)`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📈 Average Score: ${avgScore}%`);
    console.log('');

    if (passed > 0) {
      console.log('✅ Next Steps for Passed Content:');
      console.log('   1. Passed content automatically progresses to SEO optimization');
      console.log('   2. Run Stage 5: node main.js stage seo');
    }

    if (failed > 0) {
      console.log('');
      console.log('❌ Next Steps for Failed Content:');
      console.log('   1. Review validation issues in created-content.csv');
      console.log('   2. Fix critical issues manually or regenerate content');
      console.log('   3. Re-run validation: node main.js stage validation');
    }

    console.log('='.repeat(60));
    console.log('');
  }

  /**
   * Calculate word count
   */
  calculateWordCount(text) {
    if (!text) return 0;
    return text
      .replace(/[`*#>]/g, ' ')
      .split(/\s+/)
      .filter(Boolean).length;
  }

  /**
   * Safe JSON parse
   */
  safeParseJSON(value, fallback = {}) {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }
}

module.exports = ContentValidator;

// CLI
if (require.main === module) {
  const validator = new ContentValidator({
    autoApprove: process.argv.includes('--auto-approve'),
    strictMode: !process.argv.includes('--lenient'),
  });

  validator
    .validateContent()
    .then((results) => {
      console.log('🎉 Content validation completed!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Validation failed:', err.message);
      process.exit(1);
    });
}
