# Video Generation Scripts

## Generic Video Generator

Use `scripts/generate-video.js` with `video-generator.js` for all video campaigns. No need to create separate scripts for each video type.

### Usage Options

#### 1. Using Campaign Config File

```bash
# Generate AQUA PMS video
node scripts/generate-video.js --config campaigns/aqua-pms-campaign.js

# With Fal AI Seedance
node scripts/generate-video.js --config campaigns/aqua-pms-campaign.js --provider fal

# Simulation mode (no API calls)
node scripts/generate-video.js --config campaigns/aqua-pms-campaign.js --simulate
```

#### 2. Using JSON Prompts File

```bash
# Create prompts.json
cat > prompts.json << EOF
{
  "prompts": [
    "Professional analyst presenting",
    "Animated chart showing results",
    "Closing shot with logo"
  ],
  "config": {
    "duration": 8,
    "aspectRatio": "16:9",
    "provider": "fal"
  }
}
EOF

# Generate video
node scripts/generate-video.js --prompts prompts.json
```

#### 3. Direct Prompts (Command Line)

```bash
node scripts/generate-video.js \
  "Prompt for segment 1" \
  "Prompt for segment 2" \
  "Prompt for segment 3" \
  --provider fal \
  --name my-campaign
```

### Campaign Config Format

Campaign configs should export:
- `prompts`: Array of prompt strings
- `config`: Video configuration object
- `name` or `id`: Campaign name

Example (`campaigns/aqua-pms-campaign.js`):
```javascript
module.exports = {
  name: 'AQUA PMS Video',
  prompts: [
    'Professional advisor presenting...',
    'Animated chart showing 76% returns...',
    // ... more prompts
  ],
  config: {
    duration: 8,
    aspectRatio: '16:9',
    provider: 'fal'
  }
};
```

### Environment Variables

```bash
# For Fal AI Seedance
export FAL_KEY="your-fal-api-key"

# For Gemini Veo 3.1
export GEMINI_API_KEY="your-gemini-api-key"
```

### Output

Videos are saved to:
```
output/videos/{campaign-name}/
├── metadata.json (campaign info)
└── (video files in /tmp/ - will be copied later)
```

### Examples

```bash
# AQUA PMS video with Fal AI
export FAL_KEY="your-key"
node scripts/generate-video.js --config campaigns/aqua-pms-campaign.js --provider fal

# Custom prompts with Gemini Veo
export GEMINI_API_KEY="your-key"
node scripts/generate-video.js \
  "Professional presentation" \
  "Data visualization" \
  "Closing shot" \
  --provider gemini \
  --name custom-video
```


