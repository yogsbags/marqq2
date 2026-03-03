#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const SocialMediaOrchestrator = require('./core/orchestrator');

const ENV_FILES = ['.env', '.env.local'];

/**
 * Load environment variables from .env files
 */
function loadEnvFiles() {
  for (const file of ENV_FILES) {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      if (!line || line.startsWith('#')) continue;

      const [rawKey, ...rawValueParts] = line.split('=');
      if (!rawKey) continue;

      const key = rawKey.trim();
      if (!key || process.env[key]) continue;

      let value = rawValueParts.join('=').trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(argv) {
  const options = {
    command: null,
    campaign: null,
    platform: null,
    topic: null,
    type: null,
    simulate: false,
    duration: 60,
    useVeo: false,
    useAvatar: true,
    autoPublish: false,
    waitForCompletion: false,
    limit: null,
    help: false
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--campaign':
      case '-c':
        options.campaign = argv[i + 1];
        i++;
        break;
      case '--platform':
      case '-p':
        options.platform = argv[i + 1];
        i++;
        break;
      case '--topic':
      case '-t':
        options.topic = argv[i + 1];
        i++;
        break;
      case '--type':
        options.type = argv[i + 1];
        i++;
        break;
      case '--duration':
      case '-d':
        options.duration = parseInt(argv[i + 1], 10);
        i++;
        break;
      case '--simulate':
      case '--dry-run':
        options.simulate = true;
        break;
      case '--use-veo':
        options.useVeo = true;
        break;
      case '--use-avatar':
        options.useAvatar = true;
        break;
      case '--auto-publish':
        options.autoPublish = true;
        break;
      case '--wait':
      case '--wait-for-completion':
        options.waitForCompletion = true;
        break;
      case '--limit':
      case '-l':
        options.limit = parseInt(argv[i + 1], 10);
        i++;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        if (!arg.startsWith('-') && !options.command) {
          options.command = arg;
        }
        break;
    }
  }

  return options;
}

/**
 * Display help information
 */
function printHelp() {
  console.log('');
  console.log('🚀 SOCIAL MEDIA CAMPAIGN AUTOMATION');
  console.log('   AI-Powered Multi-Platform Content & Video Production');
  console.log('');
  console.log('USAGE:');
  console.log('  node main.js [command] [options]');
  console.log('');
  console.log('COMMANDS:');
  console.log('  init                   - Initialize workflow system');
  console.log('  status                 - Show campaign status');
  console.log('  campaign <type>        - Execute specific campaign');
  console.log('  stage <name>           - Execute specific workflow stage');
  console.log('  publish                - Publish ready content to platforms');
  console.log('  help                   - Show this help');
  console.log('');
  console.log('CAMPAIGN TYPES:');
  console.log('  linkedin-carousel      - Multi-slide carousel post');
  console.log('  linkedin-testimonial   - AI avatar testimonial video');
  console.log('  linkedin-data-viz      - Data visualization post');
  console.log('  instagram-reel         - Short-form video (60-90s)');
  console.log('  instagram-carousel     - Image carousel post');
  console.log('  youtube-explainer      - Long-form educational video');
  console.log('  youtube-short          - 60s vertical video');
  console.log('  facebook-reel         - Short-form vertical video (same flow as Instagram Reel)');
  console.log('  twitter-thread         - Educational thread');
  console.log('');
  console.log('WORKFLOW STAGES:');
  console.log('  1. planning            - Campaign planning & topic selection');
  console.log('  2. content             - AI content generation (copy, scripts)');
  console.log('  3. visuals             - Image/graphic generation (Flux)');
  console.log('  4. video               - Video production (Veo/HeyGen/Shotstack)');
  console.log('  5. publishing          - Multi-platform publishing');
  console.log('  6. tracking            - Performance tracking & analytics');
  console.log('');
  console.log('OPTIONS:');
  console.log('  -p, --platform <name>      Target platform (linkedin|instagram|youtube|facebook|twitter)');
  console.log('  -t, --topic <text>         Campaign topic/title');
  console.log('      --type <name>          Campaign subtype (myth-busting, testimonial, etc.)');
  console.log('  -d, --duration <secs>      Video duration in seconds (60, 90, 720, etc.)');
  console.log('      --use-veo              Use Veo 3.1 for video generation');
  console.log('      --use-avatar           Use HeyGen AI avatar (default: true)');
  console.log('      --auto-publish         Auto-publish after generation');
  console.log('      --wait                 Wait for video completion');
  console.log('      --simulate             Dry run without API calls');
  console.log('  -l, --limit <number>       Limit number of campaigns');
  console.log('  -h, --help                 Show this help');
  console.log('');
  console.log('EXAMPLES:');
  console.log('');
  console.log('  📸 Generate LinkedIn Carousel:');
  console.log('  node main.js campaign linkedin-carousel \\');
  console.log('    --topic "7 Money Myths Keeping You Poor" \\');
  console.log('    --type myth-busting');
  console.log('');
  console.log('  🎥 Generate Instagram Testimonial (90s):');
  console.log('  node main.js campaign instagram-reel \\');
  console.log('    --topic "Client Story: ₹50L to ₹2Cr" \\');
  console.log('    --duration 90 \\');
  console.log('    --use-veo \\');
  console.log('    --wait');
  console.log('');
  console.log('  📺 Generate YouTube Explainer (12 min):');
  console.log('  node main.js campaign youtube-explainer \\');
  console.log('    --topic "How to Build ₹1Cr by 40" \\');
  console.log('    --duration 720 \\');
  console.log('    --use-avatar');
  console.log('');
  console.log('  🔄 Execute Specific Stage:');
  console.log('  node main.js stage video --limit 1');
  console.log('  node main.js stage publishing --platform linkedin');
  console.log('');
  console.log('ENVIRONMENT VARIABLES:');
  console.log('  GROQ_API_KEY              - AI content generation');
  console.log('  OPENAI_API_KEY            - Alternative AI model');
  console.log('  GEMINI_API_KEY            - VEO 3.1 video generation');
  console.log('  FAL_KEY                   - LongCat long-form video (>148s)');
  console.log('  HEYGEN_API_KEY            - AI avatar videos');
  console.log('  REPLICATE_API_TOKEN       - Flux image generation');
  console.log('  SHOTSTACK_API_KEY         - Video editing & rendering');
  console.log('  IMGBB_API_KEY             - Image hosting');
  console.log('  ZAPIER_MCP_*              - Publishing integrations (optional)');
  console.log('');
  console.log('VIDEO PRODUCTION METHODS:');
  console.log('  Short (8-148s):  VEO 3.1 scene generation (Google Gemini)');
  console.log('  Long (149-900s): LongCat long-form video (fal.ai, up to 15min)');
  console.log('  Avatar videos:   HeyGen avatar + Shotstack editing');
  console.log('');
}

/**
 * Main execution
 */
async function run() {
  loadEnvFiles();
  const argv = process.argv.slice(2);
  const options = parseArgs(argv);

  if (options.help || argv.length === 0) {
    printHelp();
    return;
  }

  const orchestrator = new SocialMediaOrchestrator({
    projectRoot: path.resolve(__dirname),
    simulate: options.simulate,
    limit: options.limit
  });

  await orchestrator.initialize();

  switch (options.command) {
    case 'init':
      console.log('🔧 Initializing Social Media Campaign System...\n');
      orchestrator.displayBanner();
      console.log('\n✅ System initialized successfully');
      break;

    case 'status':
      await orchestrator.showStatus();
      break;

    case 'campaign':
      if (!options.campaign) {
        console.error('❌ Please specify campaign type');
        console.error('   Example: node main.js campaign linkedin-carousel');
        process.exit(1);
      }
      orchestrator.displayBanner();
      console.log(`\n🎯 EXECUTING CAMPAIGN: ${options.campaign.toUpperCase()}\n`);
      await orchestrator.runCampaign(options.campaign, {
        platform: options.platform,
        topic: options.topic,
        type: options.type,
        duration: options.duration,
        useVeo: options.useVeo,
        useAvatar: options.useAvatar,
        autoPublish: options.autoPublish,
        waitForCompletion: options.waitForCompletion
      });
      console.log(`\n✅ Campaign "${options.campaign}" completed!\n`);
      break;

    case 'stage':
      const stageName = argv[1];
      if (!stageName) {
        console.error('❌ Please specify stage name');
        console.error('   Example: node main.js stage video');
        process.exit(1);
      }
      orchestrator.displayBanner();
      console.log(`\n🎬 EXECUTING STAGE: ${stageName.toUpperCase()}\n`);
      await orchestrator.runStage(stageName, options);
      console.log(`\n✅ Stage "${stageName}" completed!\n`);
      break;

    case 'publish':
      orchestrator.displayBanner();
      console.log('\n📤 PUBLISHING READY CONTENT...\n');
      await orchestrator.runStage('publishing', options);
      console.log('\n✅ Publishing completed!\n');
      break;

    default:
      console.error('❌ Unknown command:', options.command);
      console.error('   Run "node main.js --help" for usage');
      process.exit(1);
  }
}

run().catch((error) => {
  console.error('❌ Social media workflow failed:', error);
  process.exitCode = 1;
});
