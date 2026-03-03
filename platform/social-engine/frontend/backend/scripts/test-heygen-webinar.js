#!/usr/bin/env node
/**
 * Test Script for HeyGen Webinar Client
 *
 * Usage:
 *   node test-heygen-webinar.js
 *
 * Environment Variables Required:
 *   HEYGEN_API_KEY - Your HeyGen API key
 *   HEYGEN_AVATAR_ID_SIDDHARTH - Avatar ID (optional, defaults to configured value)
 *   HEYGEN_VOICE_ID_SIDDHARTH - Voice ID (optional, defaults to configured value)
 */

require('dotenv').config();
const path = require('path');
const { getHeyGenWebinarClient } = require('../integrations/heygen-webinar-client');

// Load HeyGen configuration
const avatarId = process.env.HEYGEN_AVATAR_ID_SIDDHARTH || '9da4afb2c22441b5aab73369dda7f65d';
const voiceId = process.env.HEYGEN_VOICE_ID_SIDDHARTH || 'c8d184ef4d81484a97d70c94bb76fec3';

async function testWebinarCreation() {
  console.log('🧪 Testing HeyGen Webinar Client\n');
  console.log('Configuration:');
  console.log(`   Avatar ID: ${avatarId}`);
  console.log(`   Voice ID: ${voiceId}\n`);

  if (!process.env.HEYGEN_API_KEY) {
    console.error('❌ HEYGEN_API_KEY environment variable is required');
    process.exit(1);
  }

  try {
    const client = getHeyGenWebinarClient();

    // Test webinar creation
    console.log('📝 Creating test webinar...\n');

    const webinarResult = await client.createWebinar({
      webinar_title: 'Test Webinar - Factor Investing Explained',
      avatar_id: avatarId,
      voice_id: voiceId,
      introduction_text: `Hello, I'm Siddharth Vora, Fund Manager at PL Capital. Welcome to this webinar on factor investing. Today, I'll explain how systematic investment strategies can help you build wealth over the long term.`,
      main_content_text: `Factor investing is a systematic approach to portfolio construction that focuses on specific drivers of returns. These factors include value, momentum, quality, and low volatility. Our AQUA strategy leverages multiple factors to identify investment opportunities. Over the past year, AQUA has delivered strong returns by systematically selecting stocks based on quantitative models rather than emotional decisions. The key advantage of factor investing is its repeatable, data-driven process. We analyze thousands of data points to identify stocks that meet our criteria. This approach removes human bias and focuses on what the data tells us.`,
      conclusion_text: `In conclusion, factor investing offers a disciplined approach to wealth creation. By focusing on systematic factors and removing emotion from investment decisions, we can build portfolios that perform consistently over time. Thank you for joining this webinar. For more information, visit plindia.com.`,
      duration_minutes: 5
    });

    console.log('\n✅ Webinar created successfully!\n');
    console.log('Webinar Details:');
    console.log(`   Webinar ID: ${webinarResult.webinar_id}`);
    console.log(`   Title: ${webinarResult.title}`);
    console.log(`   Total Segments: ${webinarResult.total_segments}`);
    console.log(`   Estimated Duration: ${webinarResult.estimated_duration_minutes} minutes\n`);

    console.log('Video Segments:');
    webinarResult.segments.forEach((segment, index) => {
      console.log(`   ${index + 1}. ${segment.segment}:`);
      console.log(`      Video ID: ${segment.video_id}`);
      console.log(`      Estimated Duration: ${segment.estimated_duration_seconds}s`);
      console.log(`      Status: Generating (check with getVideoStatus)`);
    });

    console.log('\n📋 Next Steps:');
    console.log('   1. Wait 5-10 minutes for videos to generate');
    console.log('   2. Check video status using:');
    webinarResult.segments.forEach((segment) => {
      console.log(`      client.getVideoStatus('${segment.video_id}')`);
    });
    console.log('   3. Once all videos are ready, combine them for the full webinar');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

async function testTemplateCreation() {
  console.log('\n🧪 Testing HeyGen Template Creation\n');

  try {
    const client = getHeyGenWebinarClient();

    console.log('📝 Creating test template...\n');

    const templateResult = await client.createTemplate({
      template_name: 'Webinar Introduction Template',
      avatar_id: avatarId,
      voice_id: voiceId,
      default_text: 'Welcome to our webinar on {{topic}}. Today we will discuss {{key_points}}.',
      variables: [
        {
          name: 'topic',
          type: 'text',
          default_value: 'Factor Investing'
        },
        {
          name: 'key_points',
          type: 'text',
          default_value: 'systematic investment strategies'
        }
      ]
    });

    console.log('\n✅ Template created successfully!\n');
    console.log('Template Details:');
    console.log(`   Template ID: ${templateResult.template_id}`);
    console.log(`   Template Name: ${templateResult.template_name}\n`);

    console.log('📝 Testing template video generation...\n');

    const videoResult = await client.generateFromTemplate({
      template_id: templateResult.template_id,
      variables: {
        topic: 'Quantitative Investment Strategies',
        key_points: 'factor investing, systematic approaches, and data-driven decision making'
      },
      title: 'Test Video from Template'
    });

    console.log('\n✅ Template video generation initiated!\n');
    console.log('Video Details:');
    console.log(`   Video ID: ${videoResult.video_id}`);
    console.log(`   Template ID: ${videoResult.template_id}`);
    console.log(`   Status: Generating (check with getVideoStatus)`);

  } catch (error) {
    console.error('\n❌ Template test failed:', error.message);
    console.error(error.stack);
  }
}

// Run tests
(async () => {
  try {
    await testWebinarCreation();
    await testTemplateCreation();
    console.log('\n✨ All tests completed!\n');
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  }
})();

