# Installation Guide

## Quick Start

```bash
cd projects/social-media
npm install
node test-video-providers.js
```

## Step-by-Step Installation

### 1. Install Dependencies

```bash
npm install
```

This installs:
- `@google/genai` - Google Gemini Veo 3.1 SDK
- `node-fetch` - HTTP client for Fal AI and Replicate
- `replicate` - Replicate API client

### 2. Set Environment Variables

```bash
# Copy template
cp .env.example .env

# Edit with your API keys
nano .env
```

Add your keys:

```bash
# Google Gemini (Primary)
GEMINI_API_KEY=your_gemini_api_key_here

# Fal AI (Secondary)
FAL_API_KEY=your_fal_api_key_here

# Replicate (Fallback)
REPLICATE_API_TOKEN=your_replicate_token_here
```

Or export them directly:

```bash
export GEMINI_API_KEY="your_gemini_api_key_here"
export FAL_API_KEY="your_fal_api_key_here"
export REPLICATE_API_TOKEN="your_replicate_token_here"
```

### 3. Test the Setup

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
   Generating with Veo 3.1...
   Operation started, polling for completion...
   [1/60] Waiting for video generation...
   ...
   ✅ Video downloaded to /tmp/gemini-veo-xxx.mp4
✅ Video generated successfully with GEMINI

✅ Test 1 Passed
   Video URI: /tmp/gemini-veo-xxx.mp4
   Provider Used: GEMINI
   Duration: 8s
```

## Troubleshooting

### "Cannot find module '@google/genai'"

```bash
npm install @google/genai
```

### "GEMINI_API_KEY not configured"

Make sure your `.env` file exists and contains:

```bash
GEMINI_API_KEY=AIzaSy...
```

Or export it:

```bash
export GEMINI_API_KEY="AIzaSy..."
```

### "All providers failed"

Check that at least one API key is set:

```bash
echo $GEMINI_API_KEY
echo $FAL_API_KEY
echo $REPLICATE_API_TOKEN
```

### Import Error with `@google/genai`

Make sure you're using Node.js >= 16:

```bash
node --version
# Should be v16.0.0 or higher
```

If using older Node, upgrade:

```bash
# macOS (via Homebrew)
brew install node

# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Or use nvm
nvm install 18
nvm use 18
```

## Verification

### Check Installation

```bash
# List installed packages
npm list --depth=0

# Should show:
# ├── @google/genai@0.21.0
# ├── node-fetch@3.3.2
# └── replicate@0.27.0
```

### Test Each Provider Individually

**Gemini Only:**

```javascript
const MultiProviderVeoProducer = require('./video/multi-provider-veo-producer');

const producer = new MultiProviderVeoProducer({
  geminiApiKey: process.env.GEMINI_API_KEY,
  providers: ['gemini']  // Only Gemini
});

const result = await producer.generateVideo({
  prompt: 'Test video',
  config: { duration: 8 }
});

console.log('Gemini works!', result.videoUri);
```

**Fal AI Only:**

```javascript
const producer = new MultiProviderVeoProducer({
  falApiKey: process.env.FAL_API_KEY,
  providers: ['fal']
});
```

**Replicate Only:**

```javascript
const producer = new MultiProviderVeoProducer({
  replicateApiKey: process.env.REPLICATE_API_TOKEN,
  providers: ['replicate']
});
```

## Next Steps

Once installation is verified:

1. **Read the docs**: `README.md` and `MULTI_PROVIDER_GUIDE.md`
2. **Run a campaign**: `node main.js campaign linkedin-testimonial --topic "test"`
3. **Generate a video**: See usage examples in `README.md`

## Production Setup

For production deployment:

1. **Use environment secrets** (not `.env` file)
2. **Configure CDN** for video storage (instead of `/tmp`)
3. **Set up monitoring** for provider failures
4. **Enable logging** for debugging

Example production config:

```javascript
const producer = new MultiProviderVeoProducer({
  geminiApiKey: process.env.GEMINI_API_KEY,
  falApiKey: process.env.FAL_API_KEY,
  replicateApiKey: process.env.REPLICATE_API_TOKEN,
  providers: ['gemini', 'fal', 'replicate'],

  // Production settings
  maxRetries: 5,
  uploadToCDN: true,
  cdnEndpoint: process.env.CDN_ENDPOINT,
  enableLogging: true,
  logLevel: 'info'
});
```

---

**Need help?** Check `MULTI_PROVIDER_GUIDE.md` for detailed troubleshooting.
