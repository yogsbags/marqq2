#!/usr/bin/env node
/**
 * Test Script: MADP PMS Webinar by Siddharth Vora
 *
 * Creates a proper AI webinar about MADP PMS (Multi-Asset Diversified Portfolio)
 * featuring Siddharth Vora, Fund Manager at PL Capital
 *
 * Usage:
 *   node test-madp-webinar.js
 *
 * Environment Variables Required:
 *   HEYGEN_API_KEY - Your HeyGen API key
 *   HEYGEN_AVATAR_ID_SIDDHARTH - Avatar ID (defaults to configured value)
 *   HEYGEN_VOICE_ID_SIDDHARTH - Voice ID (defaults to configured value)
 */

// Try to load dotenv if available, otherwise use process.env directly
try {
  require('dotenv').config();
} catch (e) {
  // dotenv not available, use process.env directly
}

const path = require('path');
const { getHeyGenWebinarClient } = require('../integrations/heygen-webinar-client');

// Load HeyGen configuration for Siddharth Vora
const avatarId = process.env.HEYGEN_AVATAR_ID_SIDDHARTH || '9da4afb2c22441b5aab73369dda7f65d';
const voiceId = process.env.HEYGEN_VOICE_ID_SIDDHARTH || 'c8d184ef4d81484a97d70c94bb76fec3';

async function createMADPWebinar() {
  console.log('🎓 Creating MADP PMS Webinar by Siddharth Vora\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('   Topic: MADP PMS - Multi-Asset Diversified Portfolio');
  console.log('   Speaker: Siddharth Vora, Fund Manager, PL Capital');
  console.log('   Format: AI Avatar Webinar');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('Configuration:');
  console.log(`   Avatar ID: ${avatarId}`);
  console.log(`   Voice ID: ${voiceId}\n`);

  if (!process.env.HEYGEN_API_KEY) {
    console.error('❌ HEYGEN_API_KEY environment variable is required');
    process.exit(1);
  }

  try {
    const client = getHeyGenWebinarClient();

    // Introduction Script
    const introductionText = `Hello, I'm Siddharth Vora, Fund Manager at PL Capital. Welcome to this webinar on MADP PMS - our Multi-Asset Diversified Portfolio strategy.

Today, I'll explain how MADP helps investors build wealth through systematic diversification across multiple asset classes. This strategy is designed for investors who want exposure to equities, debt, and alternative assets in a single, professionally managed portfolio.

Over the next few minutes, I'll cover what makes MADP unique, how we construct portfolios, and why this approach can help you achieve your long-term financial goals. Let's begin.`;

    // Main Content Script
    const mainContentText = `MADP, or Multi-Asset Diversified Portfolio, is PL Capital's flagship PMS strategy that combines the best of equity, debt, and alternative investments in a single portfolio.

The core philosophy behind MADP is diversification. We don't put all your eggs in one basket. Instead, we allocate your capital across three key asset classes: equities for growth, debt for stability, and alternatives for enhanced returns.

Our equity allocation focuses on high-quality companies with strong fundamentals. We use quantitative models to identify stocks with superior earnings growth, reasonable valuations, and strong balance sheets. This isn't about picking stocks based on tips or emotions - it's about systematic, data-driven selection.

The debt portion of MADP provides stability and regular income. We invest in high-quality corporate bonds and government securities, carefully managing duration and credit risk. This allocation acts as a cushion during volatile equity markets, helping preserve capital while generating steady returns.

The alternative allocation includes structured products, arbitrage opportunities, and other non-traditional investments. This component enhances overall returns while maintaining diversification benefits.

What sets MADP apart is our dynamic asset allocation. We don't follow a static 60-40 equity-debt split. Instead, we adjust allocations based on market conditions, valuation levels, and risk-return opportunities. When equities are expensive, we reduce exposure. When debt offers attractive yields, we increase allocation. This active management approach helps optimize returns while managing risk.

Our portfolio construction process is rigorous. Every investment decision goes through multiple layers of analysis - fundamental research, quantitative screening, risk assessment, and compliance checks. We maintain strict quality standards and only invest in instruments that meet our criteria.

Risk management is embedded in every aspect of MADP. We use sophisticated risk models to measure portfolio risk, monitor exposures, and ensure we stay within predefined risk limits. Our goal isn't just to maximize returns - it's to deliver consistent, risk-adjusted returns over the long term.

Performance-wise, MADP has delivered strong results. While past performance doesn't guarantee future results, our track record demonstrates the effectiveness of our multi-asset approach. The strategy has consistently outperformed benchmarks while maintaining lower volatility than pure equity portfolios.

For investors, MADP offers several advantages. First, it provides diversification in a single product - you don't need to manage multiple investments yourself. Second, it's professionally managed by our experienced team. Third, it's tax-efficient, structured as a PMS product. And fourth, it's transparent - you get regular reports on portfolio composition and performance.

The minimum investment for MADP is typically higher than mutual funds, making it suitable for high net worth individuals and family offices. However, the professional management, customization options, and potential for better risk-adjusted returns make it an attractive option for serious investors.

Our investment philosophy is simple: invest in quality, diversify intelligently, and manage risk actively. We believe that over the long term, this approach delivers superior results compared to chasing short-term trends or making emotional investment decisions.`;

    // Conclusion Script
    const conclusionText = `In conclusion, MADP PMS represents a comprehensive approach to wealth creation. By combining equities, debt, and alternatives in a single, professionally managed portfolio, we offer investors a way to achieve their financial goals while managing risk effectively.

The key benefits of MADP are diversification, professional management, dynamic asset allocation, and a focus on risk-adjusted returns. Whether you're planning for retirement, building wealth for your family, or seeking to preserve and grow capital, MADP can be a valuable part of your investment strategy.

I encourage you to learn more about MADP by visiting our website at plindia.com or speaking with our relationship managers. We're happy to discuss how MADP can fit into your overall financial plan.

Remember, investing involves risk, and past performance doesn't guarantee future results. Please read all scheme-related documents carefully before investing. PL Capital is SEBI registered Portfolio Manager, registration number INP000007021.

Thank you for joining this webinar. I hope you found it informative. If you have questions, please reach out to our team. Let's build wealth together, systematically.`;

    console.log('📝 Creating complete webinar video...\n');
    console.log('   Note: If content exceeds 5000 characters, will split intelligently\n');

    const webinarResult = await client.createWebinar({
      webinar_title: 'MADP PMS - Multi-Asset Diversified Portfolio Explained',
      avatar_id: avatarId,
      voice_id: voiceId,
      introduction_text: introductionText,
      main_content_text: mainContentText,
      conclusion_text: conclusionText,
      duration_minutes: 10,
      singleVideo: true // Create single complete video instead of segments
    });

    console.log('\n✅ Webinar created successfully!\n');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('WEBINAR DETAILS');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`   Webinar ID: ${webinarResult.webinar_id}`);
    console.log(`   Title: ${webinarResult.title}`);
    console.log(`   Total Segments: ${webinarResult.total_segments}`);
    console.log(`   Estimated Duration: ${webinarResult.estimated_duration_minutes} minutes`);
    console.log(`   Estimated Duration: ${webinarResult.estimated_duration_seconds} seconds`);
    console.log(`   Status: ${webinarResult.status}`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log('VIDEO SEGMENTS:');
    console.log('───────────────────────────────────────────────────────────────');
    webinarResult.segments.forEach((segment, index) => {
      const durationMin = Math.floor(segment.estimated_duration_seconds / 60);
      const durationSec = segment.estimated_duration_seconds % 60;
      console.log(`\n   ${index + 1}. ${segment.segment.toUpperCase()}`);
      console.log(`      Video ID: ${segment.video_id}`);
      console.log(`      Estimated Duration: ${durationMin}m ${durationSec}s`);
      console.log(`      Text Preview: ${segment.text.substring(0, 80)}...`);
      console.log(`      Status: Generating`);
    });

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('NEXT STEPS');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('   1. Wait 5-10 minutes for all videos to generate');
    console.log('   2. Check video status using:');
    console.log('      const status = await client.getVideoStatus(video_id)');
    console.log('   3. Once all videos are ready, download and combine them');
    console.log('   4. Add intro/outro graphics, lower thirds, and branding');
    console.log('   5. Export final webinar video\n');

    console.log('VIDEO IDS FOR STATUS CHECKING:');
    webinarResult.segments.forEach((segment, index) => {
      console.log(`   ${index + 1}. ${segment.segment}: ${segment.video_id}`);
    });

    console.log('\n📊 Webinar Structure:');
    console.log(`   • Introduction: Sets context and introduces MADP`);
    console.log(`   • Main Content: ${webinarResult.segments.filter(s => s.segment.startsWith('main_content')).length} segment(s) covering strategy details`);
    console.log(`   • Conclusion: Summarizes key points and call to action\n`);

    // Save webinar metadata to file
    const fs = require('fs');
    const outputPath = path.join(__dirname, '..', 'data', `madp-webinar-${Date.now()}.json`);
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, JSON.stringify(webinarResult, null, 2));
    console.log(`💾 Webinar metadata saved to: ${outputPath}\n`);

    return webinarResult;

  } catch (error) {
    console.error('\n❌ Webinar creation failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
(async () => {
  try {
    const webinar = await createMADPWebinar();
    console.log('✨ MADP Webinar creation initiated successfully!\n');
    console.log('⏳ Videos are generating in the background.');
    console.log('   Check HeyGen dashboard: https://app.heygen.com/home\n');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
})();

