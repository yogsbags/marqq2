# LongCat Video Generation Integration

## Overview

LongCat integration adds support for long-form video generation (up to 15 minutes) using fal.ai's LongCat models. This extends the platform beyond VEO 3.1's 148-second limitation.

## Video Generation Providers

The system now supports two video generation providers with automatic routing:

### VEO 3.1 (Google Gemini)
- **Duration**: 8s - 148s
- **Provider**: Google Gemini
- **Best for**: Short to medium-length videos
- **Features**:
  - High-quality scene generation
  - Scene extensions (7s per extension, max 20)
  - Image-to-video conversion
  - Frame conditioning

### LongCat (fal.ai)
- **Duration**: 149s - 900s (15 minutes)
- **Provider**: fal.ai
- **Best for**: Long-form videos exceeding VEO's limit
- **Features**:
  - Long-form video generation
  - Text-to-video conversion
  - Image-to-video animation
  - Up to 15 minutes continuous video

## Automatic Model Selection

The VideoCoordinator automatically selects the appropriate provider based on duration:

- **Duration ≤ 148s**: Uses VEO 3.1 (unless LongCat explicitly enabled)
- **Duration > 148s**: Automatically uses LongCat

## Setup

### 1. Install Dependencies

```bash
npm install @fal-ai/client
```

### 2. Set Environment Variables

Add to your `.env` or `.env.local`:

```bash
# For VEO 3.1 (short videos)
GEMINI_API_KEY=your_gemini_api_key_here

# For LongCat (long videos >148s)
FAL_KEY=your_fal_api_key_here
```

### 3. Get API Keys

- **Gemini API Key**: https://makersuite.google.com/app/apikey
- **fal.ai API Key**: https://fal.ai/dashboard/keys

## Frontend Usage

### Automatic Mode Switching

The frontend automatically switches between VEO and LongCat based on duration:

```typescript
// Duration ≤ 148s: Uses VEO
setDuration(90)  // VEO 3.1

// Duration > 148s: Automatically switches to LongCat
setDuration(300) // LongCat (5 minutes)
```

### Manual Model Selection

Users can manually select the model:

```typescript
// Force VEO (caps duration at 148s)
handleModelChange('veo')

// Force LongCat (minimum 180s)
handleModelChange('longcat')
```

### LongCat Configuration

#### Text-to-Video Mode
```typescript
const longCatConfig = {
  enabled: true,
  mode: 'text-to-video',
  prompt: 'Professional financial services video...',
  duration: 300
}
```

#### Image-to-Video Mode
```typescript
const longCatConfig = {
  enabled: true,
  mode: 'image-to-video',
  prompt: 'Animate this reference image...',
  duration: 300
}

// Upload reference image via FileUpload component
setLongCatReferenceImage([imageFile])
```

## Backend Architecture

### File Structure

```
video/
├── video-generator.js      # VEO 3.1 video generation
├── longcat-generator.js    # LongCat video generation
└── video-coordinator.js    # Routes to appropriate provider
```

### VideoCoordinator

Central router that selects and manages video generation:

```javascript
const coordinator = new VideoCoordinator({
  simulate: false,
  outputDir: './output/videos'
})

const result = await coordinator.generateVideo({
  prompt: 'Professional video about financial planning',
  duration: 300,
  mode: 'text-to-video',
  aspectRatio: '16:9'
})
```

### LongCatGenerator

Handles fal.ai LongCat API integration:

```javascript
const generator = new LongCatGenerator({
  apiKey: process.env.FAL_KEY
})

// Text-to-video
const result = await generator.textToVideo(prompt, {
  duration: 300,
  fps: 24,
  aspectRatio: '16:9'
})

// Image-to-video
const result = await generator.imageToVideo(prompt, imageFile, {
  duration: 180,
  motion_bucket_id: 127
})
```

## API Routes

### Execute Stage Route

`POST /api/workflow/stage`

The route accepts `longCatConfig` and passes it to backend via environment variables:

```typescript
const body = {
  stageId: 4,  // Video production stage
  duration: 300,
  longCatConfig: {
    enabled: true,
    mode: 'text-to-video',
    prompt: 'Professional video...',
    duration: 300
  }
}
```

Environment variables set for backend:
- `LONGCAT_ENABLED`: 'true' or 'false'
- `LONGCAT_MODE`: 'text-to-video' or 'image-to-video'
- `LONGCAT_PROMPT`: Custom prompt for LongCat
- `LONGCAT_DURATION`: Video duration

## Configuration Options

### LongCat Parameters

#### Text-to-Video
```javascript
{
  prompt: string,           // Video description
  duration: number,         // 1-900 seconds
  fps: number,             // 24, 25, or 30
  aspectRatio: string,     // '16:9', '9:16', '1:1', '4:3', '3:4'
  num_inference_steps: number,  // 20-50 (quality)
  guidance_scale: number,  // 5.0-15.0 (prompt adherence)
  seed: number            // For reproducibility (optional)
}
```

#### Image-to-Video
```javascript
{
  prompt: string,          // Animation guidance
  image: string|Buffer,    // Reference image
  duration: number,        // 1-900 seconds
  fps: number,            // 24, 25, or 30
  aspectRatio: string,    // Aspect ratio
  motion_bucket_id: number, // 1-255 (motion intensity, default: 127)
  num_inference_steps: number,
  guidance_scale: number,
  seed: number
}
```

## Command Line Usage

### Using VEO (short videos)
```bash
node main.js campaign instagram-reel \
  --topic "Investment Tips" \
  --duration 90 \
  --use-veo
```

### Using LongCat (long videos)
```bash
# Automatic selection (duration > 148s)
node main.js campaign youtube-explainer \
  --topic "Complete Guide to Wealth Building" \
  --duration 600

# The system automatically uses LongCat for 600s duration
```

## Checking Status

View configured API keys:

```bash
node main.js status
```

Output includes:
```
🔑 API CONFIGURATION:
   Gemini (VEO):      ✅
   fal.ai (LongCat):  ✅
   ...
```

## Troubleshooting

### Missing API Keys

**Error**: `FAL_KEY environment variable not set`

**Solution**: Add `FAL_KEY` to your `.env` file:
```bash
echo "FAL_KEY=your_fal_api_key" >> .env
```

### Duration Errors

**Error**: `Duration cannot exceed 900 seconds`

**Solution**: LongCat supports max 15 minutes (900s). Split longer videos into segments.

### VEO Selected for Long Videos

**Issue**: VEO used instead of LongCat for long video

**Solution**: Ensure duration > 148s or explicitly enable LongCat in frontend

## Performance Considerations

### Processing Time

- **VEO 3.1**: ~30-60 seconds for 8s base video + extensions
- **LongCat**: ~2-10 minutes depending on duration and quality settings

### Cost Optimization

For videos 149-600 seconds, consider:
1. Use lower `num_inference_steps` (20-30) for drafts
2. Use `fps: 24` instead of 30 to reduce processing
3. Test with shorter durations before generating final video

## Examples

### Example 1: 5-Minute Educational Video

```javascript
const config = {
  prompt: 'Professional educational video about retirement planning with charts and data visualization',
  duration: 300,
  mode: 'text-to-video',
  aspectRatio: '16:9',
  fps: 24,
  num_inference_steps: 40
}

const result = await coordinator.generateVideo(config)
```

### Example 2: Animate Reference Image (3 minutes)

```javascript
const config = {
  prompt: 'Smooth camera movement through modern office space, professional atmosphere',
  duration: 180,
  mode: 'image-to-video',
  referenceImage: './reference.jpg',
  aspectRatio: '16:9',
  motion_bucket_id: 150  // Higher motion intensity
}

const result = await coordinator.generateVideo(config)
```

## Future Enhancements

- [ ] Batch video generation for multiple durations
- [ ] Custom motion profiles for image-to-video
- [ ] Style transfer between video segments
- [ ] Automatic scene detection and splitting
- [ ] Video quality presets (draft/standard/premium)

## Support

For issues or questions:
1. Check environment variables are set correctly
2. Verify API keys have sufficient credits
3. Review logs in console output
4. Check fal.ai documentation: https://fal.ai/models/fal-ai/longcat-video

## References

- **fal.ai LongCat Models**:
  - Text-to-Video: https://fal.ai/models/fal-ai/longcat-video/text-to-video/720p
  - Image-to-Video: https://fal.ai/models/fal-ai/longcat-video/image-to-video/720p
- **Google Gemini VEO**: https://ai.google.dev/gemini-api/docs/veo
- **@fal-ai/client**: https://www.npmjs.com/package/@fal-ai/client
