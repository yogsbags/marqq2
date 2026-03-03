# Multi-Provider Video Generation Guide

## Overview

The social-media project uses a **multi-provider fallback system** for video generation to ensure reliability and cost-effectiveness.

## Provider Priority

```
1. Google Gemini (Primary)
   └─ Veo 2 via AI Studio API
   └─ Best quality, native scene extension

2. Fal AI (Secondary)
   └─ Fast and cost-effective
   └─ Good quality, quick turnaround

3. Replicate (Fallback)
   └─ Stable Video Diffusion
   └─ Reliable baseline option
```

## Setup

### 1. Get API Keys

#### Google Gemini
1. Visit: https://aistudio.google.com/apikey
2. Create new API key
3. Copy key (format: `AIza...`)
4. Set: `export GEMINI_API_KEY="AIza..."`

#### Fal AI
1. Visit: https://fal.ai/dashboard
2. Go to API Keys section
3. Create new key
4. Copy key (format: `key_id:key_secret`)
5. Set: `export FAL_API_KEY="key_id:key_secret"`

#### Replicate
1. Visit: https://replicate.com/account/api-tokens
2. Create new token
3. Copy token (format: `r8_...`)
4. Set: `export REPLICATE_API_TOKEN="r8_..."`

### 2. Configure Environment

Create `.env` file:

```bash
# Copy template
cp .env.example .env

# Edit with your keys
nano .env
```

Add your keys:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
FAL_API_KEY=your_fal_api_key_here
REPLICATE_API_TOKEN=your_replicate_token_here
```

## Usage

### Basic Video Generation

```javascript
const MultiProviderVeoProducer = require('./video/multi-provider-veo-producer');

// Initialize with all providers
const producer = new MultiProviderVeoProducer({
  geminiApiKey: process.env.GEMINI_API_KEY,
  falApiKey: process.env.FAL_API_KEY,
  replicateApiKey: process.env.REPLICATE_API_TOKEN,
  providers: ['gemini', 'fal', 'replicate']  // Priority order
});

// Generate single 8s video
const result = await producer.generateVideo({
  prompt: 'Indian professional presenting financial data',
  config: {
    aspect_ratio: '16:9',
    duration: 8,
    fps: 30
  }
});

console.log(`Generated with: ${result.provider}`);  // 'gemini', 'fal', or 'replicate'
console.log(`Video URL: ${result.videoUri}`);
```

### Scene Extension (90s Video)

```javascript
// Generate 90s testimonial (12 clips × 8s)
const result = await producer.generate90sTestimonial({
  clientName: 'Rajesh Kumar',
  clientAge: 55,
  topic: 'MADP Portfolio Success',
  startValue: '50L',
  endValue: '2Cr'
});

// Check provider usage
console.log(result.providerUsage);
// Output: { gemini: 10, fal: 2 }
// (10 clips via Gemini, 2 clips via Fal fallback)
```

### Custom Provider Priority

```javascript
// Use only Fal AI and Replicate (skip Gemini)
const producer = new MultiProviderVeoProducer({
  falApiKey: process.env.FAL_API_KEY,
  replicateApiKey: process.env.REPLICATE_API_TOKEN,
  providers: ['fal', 'replicate']
});

// Use only Gemini (no fallback)
const producer = new MultiProviderVeoProducer({
  geminiApiKey: process.env.GEMINI_API_KEY,
  providers: ['gemini']
});
```

## Testing

### Run Test Suite

```bash
node test-video-providers.js
```

Expected output:

```
🧪 Testing Multi-Provider Video Generation

📋 Configuration:
   Gemini API Key: ✅ Set
   Fal API Key: ✅ Set
   Replicate API Key: ✅ Set
   Provider Priority: gemini → fal → replicate

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Test 1: Single Video Generation (8s)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎬 Attempting video generation with GEMINI...
✅ Video generated successfully with GEMINI

✅ Test 1 Passed
   Video URI: https://generativelanguage.googleapis.com/...
   Provider Used: GEMINI
   Duration: 8s

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Test 2: Scene Extension (24s = 3 clips)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎬 Starting Multi-Provider Scene Extension
   Segments: 3
   Total Duration: ~24s
   Provider Priority: gemini → fal → replicate

📹 Generating clip 1/3
   Time: 0-8s
   Type: INITIAL
🎬 Attempting video generation with GEMINI...
✅ Video generated successfully with GEMINI
   ✅ Clip 1 generated via GEMINI
   Duration: 8s

📹 Generating clip 2/3
   Time: 8-16s
   Type: EXTENSION
🎬 Attempting video generation with GEMINI...
✅ Video generated successfully with GEMINI
   ✅ Clip 2 generated via GEMINI
   Duration: 8s

📹 Generating clip 3/3
   Time: 16-24s
   Type: EXTENSION
🎬 Attempting video generation with GEMINI...
⚠️  GEMINI failed: Rate limit exceeded
   Trying next provider...
🎬 Attempting video generation with FAL...
✅ Video generated successfully with FAL
   ✅ Clip 3 generated via FAL
   Duration: 8s

📊 Multi-Provider Generation Summary:
   Status: completed
   Clips: 3/3
   Duration: 24s
   Provider Usage: {"gemini":2,"fal":1}
   Final Video: https://fal.ai/...

✅ Test 2 Passed
```

### Simulation Mode

Test without consuming API credits:

```javascript
const producer = new MultiProviderVeoProducer({
  simulate: true
});

const result = await producer.generate90sTestimonial({
  clientName: 'Test Client',
  topic: 'Test Topic'
});

// All clips return simulated URLs
// No API calls made
```

## Provider Comparison

| Feature | Gemini | Fal AI | Replicate |
|---------|--------|--------|-----------|
| **Quality** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Speed** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Cost** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Reliability** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Scene Extension** | Native | Via chaining | Via chaining |
| **Max Duration** | 8s per clip | 8s per clip | 8s per clip |
| **Typical Time** | 60-120s | 30-60s | 60-90s |

## Cost Estimates

**90s Testimonial (12 clips):**

- **Gemini**: ~$0.50 (assuming all clips via Gemini)
- **Fal AI**: ~$0.30 (if using Fal exclusively)
- **Replicate**: ~$0.40 (SVD pricing)
- **Mixed (10 Gemini + 2 Fal)**: ~$0.45

**12-minute YouTube Deep-Dive (90 clips):**

- **Gemini**: ~$3.75
- **Fal AI**: ~$2.25
- **Replicate**: ~$3.00
- **Mixed**: ~$3.20

*Note: Prices are approximate and vary by provider pricing updates*

## Fallback Behavior

### How Fallback Works

```
User requests video generation
    ↓
Try Gemini
    ├─ Success → Return Gemini video
    └─ Fail (rate limit, error, etc.)
        ↓
    Try Fal AI
        ├─ Success → Return Fal video
        └─ Fail
            ↓
        Try Replicate
            ├─ Success → Return Replicate video
            └─ Fail → Throw error
```

### Fallback Scenarios

**Rate Limits:**
- Gemini hits rate limit → Fal AI takes over
- Transparent to user
- Provider usage tracked in result

**Quota Exceeded:**
- Provider quota exceeded → Next provider tries
- Common during high-volume generation

**API Errors:**
- Network issues → Automatic retry with next provider
- Provider downtime → Seamless failover

**Quality Issues:**
- Manual intervention required
- Check `result.clips` to see which provider generated which clip
- Can regenerate specific clips if needed

## Best Practices

### 1. Use All Three Providers

**Recommended:**
```javascript
providers: ['gemini', 'fal', 'replicate']
```

**Why:**
- Maximizes reliability
- Handles rate limits gracefully
- Cost optimization (uses cheaper providers when available)

### 2. Monitor Provider Usage

```javascript
const result = await producer.generate90sTestimonial(data);

console.log('Provider Stats:', result.providerUsage);
// { gemini: 8, fal: 3, replicate: 1 }

// If seeing too many fallbacks, investigate:
if (result.providerUsage.fal > 5 || result.providerUsage.replicate > 0) {
  console.warn('Excessive fallbacks detected - check Gemini status');
}
```

### 3. Handle Partial Failures

```javascript
const result = await producer.generateLongVideo(segments);

if (result.status === 'partial') {
  console.log(`Only ${result.completedClips}/${result.totalClips} completed`);

  // Find failed clips
  const failedClips = result.clips.filter(c => c.status === 'failed');
  console.log('Failed clips:', failedClips.map(c => c.clipNumber));

  // Option 1: Accept partial result
  // Option 2: Retry failed clips
  // Option 3: Start over with different providers
}
```

### 4. Optimize for Cost

```javascript
// For high-volume: Start with Fal (cheaper)
const costOptimizedProducer = new MultiProviderVeoProducer({
  providers: ['fal', 'gemini', 'replicate']
});

// For quality: Start with Gemini
const qualityProducer = new MultiProviderVeoProducer({
  providers: ['gemini', 'fal', 'replicate']
});
```

## Advanced Configuration

### Custom Retry Logic

```javascript
class CustomVeoProducer extends MultiProviderVeoProducer {
  async generateVideo(params) {
    let lastError;

    for (let retry = 0; retry < 3; retry++) {
      try {
        return await super.generateVideo(params);
      } catch (error) {
        lastError = error;
        console.log(`Retry ${retry + 1}/3...`);
        await new Promise(r => setTimeout(r, 5000)); // Wait 5s
      }
    }

    throw lastError;
  }
}
```

### Provider-Specific Settings

```javascript
const producer = new MultiProviderVeoProducer({
  geminiApiKey: process.env.GEMINI_API_KEY,
  falApiKey: process.env.FAL_API_KEY,
  replicateApiKey: process.env.REPLICATE_API_TOKEN,

  // Custom timeouts
  geminiTimeout: 120000,  // 2 minutes
  falTimeout: 60000,      // 1 minute
  replicateTimeout: 90000, // 1.5 minutes

  // Max retries per provider
  maxRetries: 3
});
```

## Troubleshooting

### Check API Key Validity

```bash
# Test Gemini
curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY"

# Test Fal (requires request)
curl -X POST "https://queue.fal.run/fal-ai/fast-svd" \
  -H "Authorization: Key $FAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test"}'

# Test Replicate
curl "https://api.replicate.com/v1/models" \
  -H "Authorization: Token $REPLICATE_API_TOKEN"
```

### Debug Provider Failures

```javascript
// Enable verbose logging
const producer = new MultiProviderVeoProducer({
  // ... keys
  debug: true
});

// Logs will show:
// - Which provider is being tried
// - Full error messages
// - API response details
// - Timing information
```

### Common Issues

**"All providers failed"**
- Check all three API keys
- Verify account credits
- Check provider status pages

**"Gemini API error: 400"**
- Invalid model name
- Check you're using `gemini-2.0-flash-exp`
- Verify API is enabled in Google Cloud

**"Fal timeout"**
- Job took > 5 minutes
- Increase `maxAttempts` in code
- Try simpler prompts

**"Replicate prediction failed"**
- Model may be unavailable
- Check Replicate status page
- Try different model

---

**Last Updated**: 2025-11-16
**Version**: 1.0
**Maintained By**: PL Capital Engineering Team
