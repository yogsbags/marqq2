#!/usr/bin/env node

/**
 * Generic Video Campaign Generator
 *
 * Uses video-generator.js with configurable prompts and segments
 * Accepts campaign config via JSON file or command-line parameters
 *
 * Usage:
 *   node scripts/generate-video.js --config campaigns/aqua-pms-campaign.js
 *   node scripts/generate-video.js --prompts prompts.json --provider fal
 */

const VideoGenerator = require('../video/video-generator');
const fs = require('fs').promises;
const path = require('path');

async function generateVideoCampaign(options) {
  const {
    prompts = [],
    config = {},
    provider = 'fal',
    outputDir = 'output/videos',
    campaignName = 'video-campaign'
  } = options;

  if (!prompts || prompts.length === 0) {
    throw new Error('No prompts provided. Use --prompts or --config');
  }

  console.log(`\n🎬 Video Campaign Generator`);
  console.log(`📊 Campaign: ${campaignName}`);
  console.log(`🔧 Provider: ${provider.toUpperCase()}`);
  console.log(`📹 Segments: ${prompts.length}`);
  console.log(`⏱️  Duration: ~${prompts.length * (config.duration || 8)}s\n`);

  // Initialize video generator
  const videoGenerator = new VideoGenerator({
    provider: provider,
    falApiKey: process.env.FAL_KEY,
    falModel: config.falModel || 'fal-ai/bytedance/seedance/v1/pro/fast/text-to-video',
    apiKey: process.env.GEMINI_API_KEY,
    simulate: options.simulate || false
  });

  // Create output directory
  const fullOutputDir = path.join(process.cwd(), outputDir, campaignName);
  await fs.mkdir(fullOutputDir, { recursive: true });

  const clips = [];
  let currentVideoFile = null;

  // Generate base video (first prompt)
  console.log(`\n📹 Segment 1/${prompts.length}`);
  const firstPrompt = typeof prompts[0] === 'string' ? prompts[0] : prompts[0].prompt;
  const firstConfig = typeof prompts[0] === 'object' && prompts[0].config
    ? { ...config, ...prompts[0].config }
    : config;

  try {
    const baseResult = await videoGenerator.textToVideo(firstPrompt, firstConfig);
    clips.push({
      segment: 1,
      prompt: firstPrompt,
      videoUri: baseResult.videoUri,
      duration: baseResult.duration || 8
    });
    currentVideoFile = baseResult.videoFile;
    console.log(`   ✅ Generated: ${baseResult.videoUri}`);

  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    throw error;
  }

  // Generate extensions for remaining prompts (if using Gemini Veo)
  // For Fal AI, generate separate videos
  for (let i = 1; i < prompts.length; i++) {
    const promptObj = prompts[i];
    const prompt = typeof promptObj === 'string' ? promptObj : promptObj.prompt;
    const segmentConfig = typeof promptObj === 'object' && promptObj.config
      ? { ...config, ...promptObj.config }
      : config;

    console.log(`\n📹 Segment ${i + 1}/${prompts.length}`);

    try {
      let result;

      if (provider === 'gemini' && currentVideoFile) {
        // Use video extension for Gemini Veo
        result = await videoGenerator.extendVideo(currentVideoFile, prompt, segmentConfig);
        currentVideoFile = result.videoFile;
      } else {
        // Generate new video for Fal AI or if no previous video
        result = await videoGenerator.textToVideo(prompt, segmentConfig);
        if (result.videoFile) {
          currentVideoFile = result.videoFile;
        }
      }

      clips.push({
        segment: i + 1,
        prompt: prompt,
        videoUri: result.videoUri,
        duration: result.duration || (provider === 'gemini' ? 7 : 8)
      });

      console.log(`   ✅ Generated: ${result.videoUri}`);

      // Wait between requests
      if (i < prompts.length - 1) {
        console.log('   ⏸️  Waiting 5 seconds...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      // Continue with next segment
    }
  }

  // Save metadata
  const metadata = {
    campaign: campaignName,
    provider: provider,
    segments: clips,
    totalSegments: clips.length,
    totalDuration: clips.reduce((sum, c) => sum + c.duration, 0),
    generatedAt: new Date().toISOString(),
    config: config
  };

  const metadataPath = path.join(fullOutputDir, 'metadata.json');
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

  console.log(`\n✅ Campaign Complete!`);
  console.log(`   Segments: ${clips.length}/${prompts.length}`);
  console.log(`   Output: ${fullOutputDir}`);
  console.log(`   Metadata: ${metadataPath}`);

  return { clips, metadata, outputDir: fullOutputDir };
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options = {
    simulate: args.includes('--simulate')
  };

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && args[i + 1]) {
      const configPath = args[i + 1];
      const configModule = require(path.resolve(configPath));

      // Handle different campaign config formats
      if (configModule.videoConfig?.segments) {
        // Old format: videoConfig.segments array with prompt objects
        options.prompts = configModule.videoConfig.segments.map(s =>
          typeof s === 'string' ? s : s.prompt
        );
        options.config = {
          duration: configModule.videoConfig.duration || 8,
          aspectRatio: configModule.videoConfig.aspectRatio || '16:9',
          ...configModule.videoConfig
        };
      } else if (configModule.prompts) {
        // New format: direct prompts array
        options.prompts = configModule.prompts;
        options.config = configModule.config || {};
      } else if (configModule.segments) {
        // Alternative format: segments array
        options.prompts = configModule.segments.map(s =>
          typeof s === 'string' ? s : s.prompt
        );
        options.config = configModule.config || {};
      }

      options.campaignName = configModule.name || configModule.id || path.basename(configPath, '.js');
      i++;
    } else if (args[i] === '--prompts' && args[i + 1]) {
      const promptsData = await fs.readFile(args[i + 1], 'utf8');
      const promptsJson = JSON.parse(promptsData);
      options.prompts = promptsJson.prompts || promptsJson;
      options.config = promptsJson.config || {};
      i++;
    } else if (args[i] === '--provider' && args[i + 1]) {
      options.provider = args[i + 1];
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      options.outputDir = args[i + 1];
      i++;
    } else if (args[i] === '--name' && args[i + 1]) {
      options.campaignName = args[i + 1];
      i++;
    }
  }

  // If prompts provided directly as arguments
  if (args.length > 0 && !args.includes('--config') && !args.includes('--prompts')) {
    options.prompts = args.filter(arg => !arg.startsWith('--'));
    options.campaignName = options.campaignName || 'custom-campaign';
  }

  if (!options.prompts || options.prompts.length === 0) {
    console.error('❌ No prompts provided');
    console.log('\nUsage:');
    console.log('  node scripts/generate-video.js --config campaigns/aqua-pms-campaign.js');
    console.log('  node scripts/generate-video.js --prompts prompts.json --provider fal');
    console.log('  node scripts/generate-video.js "prompt 1" "prompt 2" "prompt 3"');
    process.exit(1);
  }

  await generateVideoCampaign(options);
}

if (require.main === module) {
  main().catch(error => {
    console.error('\n💥 Error:', error.message);
    process.exit(1);
  });
}

module.exports = { generateVideoCampaign };

