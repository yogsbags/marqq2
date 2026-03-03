/**
 * Test Video Generation - MADP Campaign
 *
 * Tests the VideoGenerator (Veo 3.1) with prompts from the MADP social media campaign
 */

const VideoGenerator = require('./video/video-generator.js');
const fs = require('fs').promises;
const path = require('path');

// MADP Campaign Video Prompts
const testPrompts = [
  {
    name: "financial-growth",
    prompt: "Professional financial analyst presenting data on a modern tablet showing upward trending growth chart, 14.5% returns highlighted in green, clean corporate office background, confident businesswoman in formal attire, natural lighting, photorealistic 4K quality",
    config: {
      aspectRatio: "16:9",
      resolution: "1080p",
      duration: 8
    }
  },
  {
    name: "family-planning",
    prompt: "Happy Indian family of four - parents and two children - sitting together at home reviewing financial documents with satisfied smiles, warm home interior, golden hour lighting, natural family moment, cinematic composition",
    config: {
      aspectRatio: "9:16",  // Instagram/TikTok vertical
      resolution: "720p",
      duration: 6
    }
  },
  {
    name: "investment-comparison",
    prompt: "Animated 3D bar chart comparison showing three columns: MADP at 14.5% (tallest, glowing green), Fixed Deposits at 6.5% (medium, blue), Mutual Funds at 11% (shorter, orange), professional corporate style, smooth camera movement around the chart, modern minimalist design",
    config: {
      aspectRatio: "16:9",  // Veo only supports 16:9 and 9:16
      resolution: "720p",
      duration: 8
    }
  }
];

async function testVideoGeneration() {
  console.log('🎬 Video Generation Test - MADP Campaign\n');
  console.log('=' .repeat(60));

  // Check for API key
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ Error: GEMINI_API_KEY environment variable not set');
    console.log('\nSet it with:');
    console.log('export GEMINI_API_KEY="your-api-key-here"\n');
    return;
  }

  const generator = new VideoGenerator({
    apiKey: process.env.GEMINI_API_KEY,
    simulate: false  // Set to true to test without API calls
  });

  const results = [];
  const outputDir = path.join(__dirname, 'output', 'test-videos');

  // Create output directory
  try {
    await fs.mkdir(outputDir, { recursive: true });
    console.log(`📁 Output directory: ${outputDir}\n`);
  } catch (error) {
    console.error('Error creating output directory:', error.message);
  }

  // Test each prompt
  for (let i = 0; i < testPrompts.length; i++) {
    const test = testPrompts[i];
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Test ${i + 1}/${testPrompts.length}: ${test.name}`);
    console.log('='.repeat(60));

    try {
      console.log(`\n📝 Prompt: ${test.prompt.substring(0, 100)}...`);
      console.log(`⚙️  Config: ${JSON.stringify(test.config)}`);
      console.log('\n⏳ Generating video (this may take 2-5 minutes)...\n');

      const startTime = Date.now();
      const result = await generator.textToVideo(test.prompt, test.config);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log(`\n✅ Success! Generated in ${duration}s`);
      console.log(`   Video URI: ${result.videoUri}`);
      console.log(`   Duration: ${result.duration}s`);
      console.log(`   Config: ${JSON.stringify(result.config)}`);

      results.push({
        name: test.name,
        success: true,
        result: result,
        generationTime: duration
      });

      // Copy to organized output location
      const outputPath = path.join(outputDir, `${test.name}.mp4`);
      try {
        await fs.copyFile(result.videoUri, outputPath);
        console.log(`   📥 Copied to: ${outputPath}`);
      } catch (copyError) {
        console.log(`   ⚠️  Could not copy file: ${copyError.message}`);
      }

    } catch (error) {
      console.error(`\n❌ Error: ${error.message}`);

      if (error.message.includes('quota')) {
        console.log('\n⚠️  API quota exceeded. Wait a few minutes and try again.');
      } else if (error.message.includes('authentication') || error.message.includes('API key')) {
        console.log('\n⚠️  Check your GEMINI_API_KEY is valid.');
      }

      results.push({
        name: test.name,
        success: false,
        error: error.message
      });
    }

    // Wait between requests to avoid rate limiting
    if (i < testPrompts.length - 1) {
      console.log('\n⏸️  Waiting 10 seconds before next test...');
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60));

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`\n✅ Successful: ${successful}/${results.length}`);
  console.log(`❌ Failed: ${failed}/${results.length}`);

  if (successful > 0) {
    console.log('\n🎥 Generated Videos:');
    results.filter(r => r.success).forEach(r => {
      console.log(`   - ${r.name}: ${r.result.videoUri} (${r.generationTime}s)`);
    });
  }

  if (failed > 0) {
    console.log('\n❌ Failed Tests:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`   - ${r.name}: ${r.error}`);
    });
  }

  console.log('\n' + '='.repeat(60));
  console.log('✨ Test complete!\n');
}

// Run tests
testVideoGeneration().catch(error => {
  console.error('\n💥 Unexpected error:', error);
  process.exit(1);
});

