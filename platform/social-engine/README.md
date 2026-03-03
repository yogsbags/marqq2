# Social Media Campaign Automation

AI-powered social media campaign workflow engine for multi-platform content generation, video production (Veo 3.1 + HeyGen + Shotstack), and publishing across LinkedIn, Instagram, Facebook, YouTube, and X (Twitter).

## Overview

This project automates the entire social media campaign lifecycle:
1. **Planning** - Generate campaign strategies and content calendars
2. **Content** - Create scripts, captions, and messaging
3. **Visuals** - Generate images, charts, and graphics
4. **Video** - Produce long-form videos using Veo 3.1 scene extension
5. **Publishing** - Distribute to multiple platforms via Zapier MCP
6. **Tracking** - Monitor engagement and performance metrics

### Key Features

- 🎬 **Veo 3.1 Scene Extension**: Generate 60s - 12+ minute videos by chaining 8s clips
- 🎭 **HeyGen AI Avatars**: Professional spokesperson videos with Indian voices
- ✂️ **Shotstack Editing**: Composite avatar + b-roll, add captions, multi-platform rendering
- 📱 **Multi-Platform**: LinkedIn (16:9), Instagram (1:1, 9:16), YouTube (16:9)
- 🔄 **Workflow Engine**: N8N-style orchestration with state persistence
- 🤖 **AI Content**: GPT-4 for scripts, Groq for captions, DALL-E for visuals

## Installation

### Prerequisites

- Node.js >= 16.0.0
- API keys for: Groq, OpenAI, HeyGen, Replicate, Shotstack, ImgBB
- (Optional) Zapier MCP configured for publishing

### Setup

```bash
# Navigate to project
cd projects/social-media

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your API keys
nano .env
```

### Environment Variables

```bash
# AI Content Generation
GROQ_API_KEY=your-groq-api-key
OPENAI_API_KEY=your-openai-api-key

# Video Production - HeyGen AI Avatar
HEYGEN_API_KEY=your-heygen-api-key
HEYGEN_AVATAR_ID=your-default-avatar-id
HEYGEN_VOICE_ID=your-default-voice-id

# Video Production - Multi-Provider (Priority Order)
# Primary: Google Gemini (Veo 2)
GEMINI_API_KEY=your-gemini-api-key

# Secondary: Fal AI (Fast and reliable)
FAL_API_KEY=your-fal-api-key

# Fallback: Replicate (Stable Video Diffusion)
REPLICATE_API_TOKEN=your-replicate-token

# Video Editing - Shotstack
SHOTSTACK_API_KEY=your-shotstack-key

# Image Hosting - ImgBB
IMGBB_API_KEY=your-imgbb-key
```

## Usage

### Initialize Project

```bash
npm run init
```

This creates the state file (`data/campaign-state.json`) and verifies API credentials.

### Check Status

```bash
npm run status
```

Shows current campaigns, videos in progress, and publishing queue.

### Run Campaigns

#### LinkedIn 90s Testimonial (Veo 3.1 + HeyGen)

```bash
node main.js campaign linkedin-testimonial \
  --topic "MADP portfolio 2X returns story" \
  --use-veo \
  --use-avatar \
  --wait
```

**What happens:**
1. Generates testimonial script using AI
2. Creates HeyGen avatar video (90s talking head)
3. Generates Veo 3.1 b-roll (12 clips × 8s = 96s)
4. Composites avatar + b-roll using Shotstack
5. Renders final 16:9 video for LinkedIn
6. (Optional) Publishes via Zapier MCP

#### Instagram Reel (60s)

```bash
node main.js campaign instagram-reel \
  --topic "5 tax-saving strategies for HNIs" \
  --duration 60 \
  --use-veo
```

**Output:** 1:1 and 9:16 renders optimized for Instagram Feed and Stories.

#### YouTube Deep-Dive (12 minutes)

```bash
node main.js campaign youtube-explainer \
  --topic "Complete guide to options trading" \
  --duration 720 \
  --use-veo \
  --wait
```

**Output:** 90 clips × 8s = 12-minute educational video.

### Stage-Based Execution

Run specific workflow stages:

```bash
# Planning only
node main.js stage planning --topic "Q1 2025 LinkedIn strategy"

# Content generation
node main.js stage content --campaign-id CAMP-001

# Video production
node main.js stage video --campaign-id CAMP-001 --use-veo --use-avatar

# Publishing
node main.js stage publishing --campaign-id CAMP-001 --auto-publish
```

### Simulation Mode

Test workflows without consuming API credits:

```bash
node main.js --simulate campaign linkedin-testimonial --topic "Test"
```

## Multi-Provider Video Generation

### Provider Fallback System

The system uses **three video generation providers** with automatic fallback:

1. **Google Gemini (Primary)** - Veo 2 via AI Studio API
   - Best quality and temporal consistency
   - Supports scene extension natively
   - API: `generativelanguage.googleapis.com/v1beta`

2. **Fal AI (Secondary)** - Fast and reliable
   - Quick generation (30-60s per clip)
   - Good quality, cost-effective
   - API: `queue.fal.run/fal-ai/fast-svd`

3. **Replicate (Fallback)** - Stable Video Diffusion
   - Reliable fallback option
   - Wide model support
   - API: `api.replicate.com/v1`

If Gemini fails → tries Fal AI → if Fal fails → tries Replicate.

### How Scene Extension Works

Each provider generates 8-second clips that chain together:

```
Clip 1: Initial prompt → 8s video (video_obj_1) [Gemini]
Clip 2: Extension prompt + video_obj_1 → 8s video (video_obj_2) [Gemini]
Clip 3: Extension prompt + video_obj_2 → 8s video (video_obj_3) [Fal - fallback]
...
Clip 12: Extension prompt + video_obj_11 → 8s video (final) [Gemini]
```

**Result:** 12 clips × 8s = 96s seamless video with temporal consistency across providers.

### Example: 90s Testimonial with Multi-Provider

```javascript
const MultiProviderVeoProducer = require('./video/multi-provider-veo-producer');

const producer = new MultiProviderVeoProducer({
  geminiApiKey: process.env.GEMINI_API_KEY,
  falApiKey: process.env.FAL_API_KEY,
  replicateApiKey: process.env.REPLICATE_API_TOKEN,
  providers: ['gemini', 'fal', 'replicate']  // Priority order
});

const testimonialData = {
  clientName: 'Rajesh Kumar',
  clientAge: 55,
  topic: 'MADP portfolio success',
  startValue: '50L',
  endValue: '2Cr'
};

// Generate 90s video (12 clips with auto-fallback)
const result = await producer.generate90sTestimonial(testimonialData);

console.log(result.finalVideoUri);      // Download URL
console.log(result.totalDuration);      // ~96s
console.log(result.providerUsage);      // { gemini: 10, fal: 2 }
console.log(result.status);             // 'completed'
```

### Testing Providers

```bash
# Test all three providers
node test-video-providers.js

# Expected output:
# ✅ Gemini API Key: Set
# ✅ Fal API Key: Set
# ✅ Replicate API Key: Set
# Provider Priority: gemini → fal → replicate
#
# Test 1: Single video... ✅ Passed (Gemini)
# Test 2: Scene extension... ✅ Passed (Gemini: 2, Fal: 1)
# Test 3: 90s testimonial... ✅ Passed (Gemini: 11, Fal: 1)
```

### Segment Structure

Each 8s segment has:
- **timeRange**: `"0-8s"`, `"8-16s"`, etc.
- **prompt**: Detailed scene description
- **type**: `'initial'` or `'extension'`

**Example segments:**

```javascript
[
  {
    timeRange: '0-8s',
    prompt: 'Indian 55-year-old male professional, speaking confidently to camera...'
  },
  {
    timeRange: '8-16s',
    prompt: 'Continue scene, add B-roll: MADP dashboard with rising graph...'
  },
  {
    timeRange: '16-24s',
    prompt: 'Continue scene, animated chart: valuation vs momentum...'
  }
  // ... 9 more clips
]
```

## Campaign Types

### LinkedIn

1. **Carousel** (10 slides)
   - Topic-based educational content
   - Data visualizations + insights
   - Generates images via DALL-E

2. **Testimonial** (90s video)
   - HeyGen avatar + Veo b-roll
   - Client success stories
   - 16:9 aspect ratio

3. **Data Visualization** (static post)
   - Charts, graphs, infographics
   - Market insights, portfolio analytics

### Instagram

1. **Reel** (60s vertical video)
   - 9:16 aspect ratio
   - Trending audio + captions
   - Fast-paced edits

2. **Carousel** (10 images)
   - 1:1 aspect ratio
   - Educational or storytelling

### YouTube

1. **Explainer** (12 minutes)
   - Deep-dive educational content
   - 90 clips via Veo scene extension
   - Avatar host + b-roll footage

2. **Short** (60s)
   - 9:16 vertical format
   - Hook + value + CTA

### Facebook & X (Twitter)

Similar to LinkedIn but optimized for each platform's audience and format requirements.

## Architecture

```
social-media/
├── core/
│   ├── orchestrator.js       # Main workflow engine
│   └── state-manager.js      # Campaign state persistence
├── campaigns/
│   ├── linkedin-handler.js   # LinkedIn-specific logic
│   ├── instagram-handler.js  # Instagram campaigns
│   └── youtube-handler.js    # YouTube workflows
├── video/
│   ├── veo-producer.js       # Veo 3.1 scene extension
│   ├── heygen-producer.js    # HeyGen AI avatars
│   └── shotstack-editor.js   # Video compositing
├── integrations/
│   ├── ai-content.js         # GPT-4, Groq, DALL-E
│   └── zapier-mcp.js         # Publishing via Zapier
├── data/
│   └── campaign-state.json   # State persistence
├── .claude/
│   └── skills/
│       └── social-media-automation/
│           └── SKILL.md      # Claude skill definition
├── main.js                   # CLI entry point
└── package.json
```

## API Integrations

### HeyGen (AI Avatar)

```javascript
const HeyGenProducer = require('./video/heygen-producer');
const heygen = new HeyGenProducer({ apiKey: process.env.HEYGEN_API_KEY });

const result = await heygen.generateVideo({
  script: 'Your testimonial script here...',
  avatarId: 'avatar-id',
  voiceId: 'indian-english-neutral',
  duration: 90
});

await heygen.waitForCompletion(result.videoId);
```

### Shotstack (Video Editing)

```javascript
const ShotstackEditor = require('./video/shotstack-editor');
const shotstack = new ShotstackEditor({ apiKey: process.env.SHOTSTACK_API_KEY });

// Composite avatar + b-roll
const result = await shotstack.compositeAvatarWithBroll({
  avatarVideoUrl: 'https://heygen.com/video.mp4',
  brollVideoUrl: 'https://replicate.com/veo.mp4',
  duration: 90,
  textOverlays: [{ text: 'Book consultation: plcapital.com', start: 80, duration: 10 }],
  aspectRatio: '16:9'
});

// Multi-platform renders
const renders = await shotstack.createMultiPlatformRenders(result.url);
// { linkedin: {...}, instagramFeed: {...}, instagramStories: {...}, youtube: {...} }
```

## Workflow Stages

### 1. Planning

- Generate campaign strategy
- Create content calendar
- Define target platforms
- Set KPIs and goals

### 2. Content

- Write scripts (testimonials, explainers)
- Generate captions and hashtags
- Create hooks and CTAs
- SEO optimization

### 3. Visuals

- Generate images via DALL-E
- Create charts/graphs
- Design carousel slides
- Produce thumbnails

### 4. Video

- **HeyGen**: AI avatar videos
- **Veo 3.1**: B-roll and scenes
- **Shotstack**: Editing and compositing
- **Multi-format**: 16:9, 1:1, 9:16

### 5. Publishing

- Upload to platforms via Zapier MCP
- Schedule posts
- Cross-post variations
- Track post IDs

### 6. Tracking

- Monitor engagement (likes, comments, shares)
- Track video views and retention
- Measure click-through rates
- ROI analysis

## State Management

Campaign state is stored in `data/campaign-state.json`:

```json
{
  "campaigns": {
    "CAMP-001": {
      "id": "CAMP-001",
      "type": "linkedin-testimonial",
      "status": "video-production",
      "topic": "MADP portfolio success",
      "createdAt": "2025-01-15T10:00:00Z"
    }
  },
  "videos": {
    "VID-001": {
      "id": "VID-001",
      "campaignId": "CAMP-001",
      "provider": "veo",
      "status": "completed",
      "duration": 96,
      "url": "https://..."
    }
  },
  "published": {
    "POST-001": {
      "id": "POST-001",
      "campaignId": "CAMP-001",
      "platform": "linkedin",
      "status": "published",
      "engagementMetrics": {}
    }
  }
}
```

## Troubleshooting

### Multi-Provider Video Generation Issues

**Problem:** All providers failing.

**Solution:**
1. Check all API keys are set:
   ```bash
   echo $GEMINI_API_KEY
   echo $FAL_API_KEY
   echo $REPLICATE_API_TOKEN
   ```
2. Verify API key validity at provider dashboards
3. Check account credits/quotas
4. Use `--simulate` mode to test logic first:
   ```javascript
   const producer = new MultiProviderVeoProducer({ simulate: true });
   ```

**Problem:** Gemini API errors (401/403).

**Solution:**
- Verify API key at: https://aistudio.google.com/apikey
- Check Gemini API is enabled in Google Cloud Console
- Ensure you're using the correct model (`gemini-2.0-flash-exp`)
- Note: Gemini video generation is in beta (see docs)

**Problem:** Fal AI timeout.

**Solution:**
- Fal jobs can take 1-2 minutes
- Increase `maxAttempts` in `pollFalStatus()` if needed
- Check Fal dashboard for job status
- Verify API key format: `key_id:key_secret`

**Problem:** Replicate fallback not working.

**Solution:**
- Ensure REPLICATE_API_TOKEN starts with `r8_`
- Check model availability: `stability-ai/stable-video-diffusion`
- Verify account has sufficient credits
- Use Replicate dashboard to debug predictions

### Scene Extension Fails Mid-Sequence

**Problem:** Clip generation stops mid-sequence.

**Solution:**
- Provider automatically switches to next in priority list
- Check `result.providerUsage` to see which providers were used
- Reduce total clips (90s = 12 clips is safer than 12 min = 90 clips)
- Monitor provider usage: some clips may use different providers

### HeyGen Video Not Generating

**Problem:** Video stuck in "processing" status.

**Solution:**
- HeyGen typically takes 1-2 minutes
- Use `waitForCompletion()` with maxWaitTime=300
- Check HEYGEN_AVATAR_ID and HEYGEN_VOICE_ID are valid
- Verify API key has video generation permissions

### Shotstack Render Timeout

**Problem:** Multi-platform renders exceed timeout.

**Solution:**
- Renders can take 5-10 minutes for 90s videos
- Increase `maxWaitTime` parameter
- Queue renders sequentially instead of parallel
- Use Shotstack stage environment for testing

### Publishing Fails (Zapier MCP)

**Problem:** Videos not publishing to LinkedIn/Instagram.

**Solution:**
- Ensure Zapier MCP is configured in Claude Code settings
- Verify platform tokens are fresh (refresh if needed)
- Check video file size limits (LinkedIn: 5GB, Instagram: 4GB)
- Confirm aspect ratios match platform requirements

## Example Workflows

### Full LinkedIn Testimonial Campaign

```bash
# 1. Planning
node main.js stage planning \
  --topic "Client success: ₹50L → ₹2Cr in 5 years" \
  --platform linkedin

# 2. Content
node main.js stage content --campaign-id CAMP-001

# 3. Video (HeyGen + Veo + Shotstack)
node main.js stage video \
  --campaign-id CAMP-001 \
  --use-veo \
  --use-avatar \
  --wait

# 4. Publish
node main.js stage publishing \
  --campaign-id CAMP-001 \
  --auto-publish
```

### Batch Instagram Reels

```bash
# Generate 5 reels on different topics
for topic in "Tax saving" "Mutual funds" "IPO strategy" "Options basics" "Portfolio rebalancing"
do
  node main.js campaign instagram-reel \
    --topic "$topic" \
    --duration 60 \
    --use-veo
done
```

### YouTube Deep-Dive Series

```bash
# Create 3-part educational series
node main.js campaign youtube-explainer \
  --topic "Options Trading Complete Course - Part 1" \
  --duration 720 \
  --use-veo \
  --wait

node main.js campaign youtube-explainer \
  --topic "Options Trading Complete Course - Part 2" \
  --duration 720 \
  --use-veo \
  --wait

node main.js campaign youtube-explainer \
  --topic "Options Trading Complete Course - Part 3" \
  --duration 720 \
  --use-veo \
  --wait
```

## Advanced Configuration

### Custom Avatar Settings

```bash
export HEYGEN_AVATAR_ID="custom-avatar-123"
export HEYGEN_VOICE_ID="indian-english-male-professional"

node main.js campaign linkedin-testimonial --topic "Custom avatar test"
```

### Shotstack Production Mode

```bash
# Use production environment (higher quality, slower)
# Edit shotstack-editor.js: this.stage = 'production'

node main.js stage video --campaign-id CAMP-001 --wait
```

### Custom Veo Segments

```javascript
// In veo-producer.js, modify create90sSegments()
create90sSegments(data) {
  return [
    { timeRange: '0-8s', prompt: 'Your custom prompt here...' },
    { timeRange: '8-16s', prompt: 'Extension prompt...' },
    // Add more custom segments
  ];
}
```

## Performance Notes

- **Veo 3.1**: ~30-60s per 8s clip (sequential, not parallel)
- **HeyGen**: ~1-2 minutes for 90s avatar video
- **Shotstack**: ~5-10 minutes for compositing + multi-platform renders
- **Total for 90s testimonial**: ~15-20 minutes end-to-end

**Optimization tips:**
- Use simulation mode for workflow testing
- Queue multiple campaigns to run overnight
- Cache generated content/visuals for reuse
- Pre-generate avatar videos for common scenarios

## License

MIT

## Support

For issues or questions:
- Check troubleshooting section above
- Review `.claude/skills/social-media-automation/SKILL.md` for detailed workflow docs
- Examine `data/campaign-state.json` for state debugging
- Enable `--simulate` mode to test without API consumption

---

**Built with:** Veo 3.1 (Google Deepmind) • HeyGen AI Avatars • Shotstack Video API • Replicate • OpenAI GPT-4 • Groq • Claude Code
