# Veo 3.1 API Reference

Complete reference for Google Gemini Veo 3.1 video generation API.

**Official Docs**: https://ai.google.dev/gemini-api/docs/video

---

## Table of Contents

1. [Model Versions](#model-versions)
2. [Generation Methods](#generation-methods)
3. [API Parameters](#api-parameters)
4. [Configuration Options](#configuration-options)
5. [Response Structure](#response-structure)
6. [Operation Polling](#operation-polling)
7. [Use Cases](#use-cases)
8. [Limitations](#limitations)
9. [Best Practices](#best-practices)

---

## Model Versions

### Available Models

| Model | Description | Speed | Quality | Use Case |
|-------|-------------|-------|---------|----------|
| `veo-3.1-generate-preview` | Latest Veo model | Medium | Highest | Production |
| `veo-3.1-fast-preview` | Faster generation | Fast | High | Quick iterations |
| `veo-3` | Previous generation | Medium | High | Stable |
| `veo-3-fast` | Fast previous gen | Fast | Medium | Rapid testing |
| `veo-2` | Legacy model | Medium | Medium | Legacy support |

**Recommended**: `veo-3.1-generate-preview`

---

## Generation Methods

### 1. Text-to-Video

Generate video from text prompt only.

```javascript
const operation = await ai.models.generateVideos({
  model: "veo-3.1-generate-preview",
  prompt: "Your video description with audio cues"
});
```

**Parameters**:
- `prompt` (required): Text description of the video
- `config` (optional): Video configuration object

**Prompt Tips**:
- Include subject, action, and style
- Specify camera angles and movements
- Add audio cues (dialogue, sound effects, music)
- Provide context and ambiance details

**Example**:
```javascript
const prompt = `A close up of two people staring at a cryptic drawing on a wall,
torchlight flickering. A man murmurs, 'This must be it. That's the secret code.'
The woman looks at him and whispering excitedly, 'What did you find?'`;
```

### 2. Image-to-Video with Reference Images

Generate video using up to 3 reference images to guide content.

```javascript
const operation = await ai.models.generateVideos({
  model: "veo-3.1-generate-preview",
  prompt: "Video description",
  config: {
    referenceImages: [
      {
        image: { imageBytes, mimeType },
        referenceType: "asset"
      }
    ]
  }
});
```

**Parameters**:
- `referenceImages`: Array of reference image objects (max 3)
  - `image.imageBytes`: Image data as bytes
  - `image.mimeType`: Image MIME type (`image/png`, `image/jpeg`)
  - `referenceType`: `"asset"` (preserves subject appearance)

**Use Cases**:
- Preserve character/product appearance
- Maintain brand consistency
- Reference specific people or objects

**Limitations**:
- Maximum 3 reference images
- Images must be static (not videos)
- Subject must be clearly visible in references

### 3. First and Last Frame Specification

Generate video interpolating between two specified frames.

```javascript
const operation = await ai.models.generateVideos({
  model: "veo-3.1-generate-preview",
  prompt: "Video description",
  image: { imageBytes: firstFrameBytes, mimeType: "image/png" },
  config: {
    lastFrame: { imageBytes: lastFrameBytes, mimeType: "image/png" }
  }
});
```

**Parameters**:
- `image`: First frame image
  - `imageBytes`: Image data
  - `mimeType`: Image MIME type
- `config.lastFrame`: Last frame image (same format as `image`)

**Use Cases**:
- Precise composition control
- Animated transitions
- Consistent start/end states

### 4. Video Extension

Extend Veo-generated videos by 7 seconds.

```javascript
const operation = await ai.models.generateVideos({
  model: "veo-3.1-generate-preview",
  video: previousVideoFile,
  prompt: "Description of extension"
});
```

**Parameters**:
- `video`: Video file reference from previous Veo generation
- `prompt`: Description of the extension content

**Requirements**:
- Video must be Veo-generated (not external videos)
- Input video must be ≤141 seconds
- Can extend up to 20 times
- Each extension adds exactly 7 seconds
- Must match original aspect ratio and resolution

**Extension Chain Example**:
```
Base: 8s → Extension 1: +7s = 15s → Extension 2: +7s = 22s → ...
```

---

## API Parameters

### Core Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | string | ✅ | Model version (e.g., `"veo-3.1-generate-preview"`) |
| `prompt` | string | ✅ | Video description with optional audio cues |
| `image` | object | ❌ | First frame image (for image-to-video or first/last frame) |
| `video` | object | ❌ | Video file reference (for extension only) |
| `config` | object | ❌ | Configuration options (see below) |

### Configuration Parameters

All config parameters are optional:

| Parameter | Type | Default | Options | Description |
|-----------|------|---------|---------|-------------|
| `aspectRatio` | string | `"16:9"` | `"16:9"`, `"9:16"` | Video aspect ratio |
| `resolution` | string | `"720p"` | `"720p"`, `"1080p"` | Video resolution |
| `negativePrompt` | string | `null` | Any text | Elements to exclude from video |
| `personGeneration` | string | `"allow_all"` | `"allow_all"`, `"allow_adult"` | Person generation policy |
| `duration` | number | `8` | `4`, `6`, `8` | Video duration in seconds (may vary by model) |
| `lastFrame` | object | `null` | Image object | Last frame for interpolation |
| `referenceImages` | array | `null` | Array of image objects | Reference images (max 3) |

---

## Response Structure

### Operation Object

Video generation returns a long-running operation:

```javascript
{
  name: "operations/abc123...",
  done: false,          // true when complete
  metadata: { ... },
  response: {           // Only when done: true
    generatedVideos: [
      {
        video: {
          name: "files/xyz789...",
          displayName: "generated_video.mp4",
          mimeType: "video/mp4",
          sizeBytes: "12345678",
          createTime: "2025-01-15T10:30:00Z",
          updateTime: "2025-01-15T10:35:00Z",
          uri: "https://generativelanguage.googleapis.com/..."
        }
      }
    ]
  }
}
```

### Video File Object

```javascript
{
  name: "files/xyz789...",
  displayName: "generated_video.mp4",
  mimeType: "video/mp4",
  sizeBytes: "12345678",
  createTime: "2025-01-15T10:30:00Z",
  updateTime: "2025-01-15T10:35:00Z",
  uri: "https://generativelanguage.googleapis.com/..."
}
```

---

## Operation Polling

Video generation is asynchronous and requires polling:

```javascript
// Submit generation request
let operation = await ai.models.generateVideos({ ... });

// Poll until complete
while (!operation.done) {
  console.log("Waiting for video generation...");
  await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10s

  operation = await ai.operations.getVideosOperation({
    operation: operation
  });
}

// Download video
await ai.files.download({
  file: operation.response.generatedVideos[0].video,
  downloadPath: "output.mp4"
});
```

### Polling Best Practices

| Aspect | Recommendation |
|--------|----------------|
| **Interval** | 10 seconds |
| **Timeout** | 10 minutes (60 attempts) |
| **Typical Time** | 1-6 minutes |
| **Max Wait** | Varies by video length and complexity |

---

## Use Cases

### 1. Social Media Content (8-15s)

**LinkedIn Testimonials**:
```javascript
// 8s base video
const base = await producer.textToVideo(
  "Professional introducing success story",
  { aspectRatio: "16:9", resolution: "1080p" }
);

// +7s extension
const extended = await producer.extendVideo(
  base.videoFile,
  "Shows portfolio results and metrics"
);
```

**Instagram Reels (9:16)**:
```javascript
const reel = await producer.textToVideo(
  "Vertical format product showcase",
  { aspectRatio: "9:16", resolution: "1080p" }
);
```

### 2. YouTube Content (60s+)

**Long-Form Deep Dive**:
```javascript
const longVideo = await producer.generateLongVideo(
  "Indian financial advisor introducing MADP strategy",
  [
    "B-roll: Animated portfolio dashboard",
    "Explains valuation and momentum factors",
    "Shows 5-year performance chart",
    "Discusses risk management approach",
    "Client testimonial with growth metrics",
    "Call-to-action with consultation link"
  ],
  { aspectRatio: "16:9", resolution: "1080p" }
);
// Total: 8s + (6 × 7s) = 50 seconds
```

### 3. Product Demos with References

```javascript
const productImage = await producer.loadImageFromFile('./product.png');
const logoImage = await producer.loadImageFromFile('./logo.png');

const demo = await producer.imageToVideoWithReferences(
  "Product being used in modern office environment",
  [
    { ...productImage, referenceType: "asset" },
    { ...logoImage, referenceType: "asset" }
  ]
);
```

### 4. Animated Explainers

```javascript
const startFrame = await producer.loadImageFromFile('./chart-start.png');
const endFrame = await producer.loadImageFromFile('./chart-end.png');

const animation = await producer.firstLastFrameVideo(
  "Animated transition showing portfolio growth from ₹50L to ₹2Cr",
  startFrame,
  endFrame
);
```

---

## Limitations

### Technical Limits

| Limit | Value | Notes |
|-------|-------|-------|
| **Max video length (single gen)** | 8 seconds | Base generation |
| **Extension length** | 7 seconds | Per extension |
| **Max extensions** | 20 | Total 141 seconds input |
| **Max total length (extended)** | ~148 seconds | 8s + (20 × 7s) |
| **Reference images** | 3 max | Per generation |
| **Aspect ratios** | 2 options | 16:9 or 9:16 |
| **Resolutions** | 2 options | 720p or 1080p |
| **Audio** | Native | Dialogue, effects, music |

### Content Restrictions

- **Extension only works with Veo videos**: Cannot extend external videos
- **Aspect ratio locked**: Extensions must match original aspect ratio
- **Resolution locked**: Extensions must match original resolution
- **Person generation**: Follows `personGeneration` policy

### API Quotas

Check your quota at: https://ai.dev/usage?tab=rate-limit

**Typical limits**:
- Requests per minute (RPM)
- Requests per day (RPD)
- Video minutes per day

---

## Best Practices

### 1. Prompt Engineering

**Good Prompts**:
```
✅ "A close up of an Indian professional woman in business attire,
   modern office with bookshelf background, speaking confidently to camera
   explaining financial concepts, warm lighting, cinematic quality.
   She says, 'Let me show you how MADP portfolios work.'"
```

**Bad Prompts**:
```
❌ "Woman talks about finance"  (too vague)
❌ "Make a video"               (no details)
```

**Prompt Structure**:
1. **Subject**: Who or what (Indian professional woman)
2. **Action**: What they're doing (speaking to camera)
3. **Setting**: Where (modern office with bookshelf)
4. **Style**: Visual quality (warm lighting, cinematic)
5. **Audio**: Dialogue or sound effects (optional)

### 2. Video Extensions

**Plan your segments**:
```javascript
const segments = [
  { duration: 8,  type: "intro",     prompt: "Introduction" },
  { duration: 7,  type: "extension", prompt: "Point 1" },
  { duration: 7,  type: "extension", prompt: "Point 2" },
  { duration: 7,  type: "extension", prompt: "Conclusion" }
];
// Total: 29 seconds
```

**Maintain continuity**:
- Keep same subject/setting across extensions
- Reference previous action ("continues explaining...")
- Maintain consistent lighting and style

### 3. Reference Images

**Best results**:
- Clear, well-lit reference images
- Subject prominently featured
- Similar angles to desired video output
- Consistent styling across all references

### 4. Error Handling

```javascript
try {
  const result = await producer.textToVideo(prompt, config);
} catch (error) {
  if (error.message.includes('quota')) {
    console.error('Quota exceeded. Check: https://ai.dev/usage');
  } else if (error.message.includes('timeout')) {
    console.error('Generation timeout. Try simpler prompt.');
  } else {
    console.error('Generation failed:', error.message);
  }
}
```

### 5. Performance Optimization

**Polling optimization**:
```javascript
// Start with 5s intervals, increase to 10s after 30s
let interval = 5000;
let elapsed = 0;

while (!operation.done) {
  await new Promise(r => setTimeout(r, interval));
  operation = await ai.operations.getVideosOperation({ operation });

  elapsed += interval;
  if (elapsed > 30000) interval = 10000; // Switch to 10s intervals
}
```

**Parallel generation** (within quota):
```javascript
const results = await Promise.all([
  producer.textToVideo(prompt1),
  producer.textToVideo(prompt2),
  producer.textToVideo(prompt3)
]);
```

---

## Code Examples

### Complete Text-to-Video

```javascript
const ComprehensiveVeoProducer = require('./video/comprehensive-veo-producer');

const producer = new ComprehensiveVeoProducer({
  apiKey: process.env.GEMINI_API_KEY
});

const result = await producer.textToVideo(
  "A majestic lion walking through African savannah at golden hour",
  {
    aspectRatio: "16:9",
    resolution: "1080p",
    negativePrompt: "blurry, pixelated, low quality"
  }
);

console.log(`Video saved: ${result.videoUri}`);
```

### Complete Extension Chain

```javascript
// Generate base
const base = await producer.textToVideo(
  "Professional starts presentation",
  { aspectRatio: "16:9", resolution: "720p" }
);

// Extend 3 times
let current = base.videoFile;
const extensions = [];

for (const prompt of extensionPrompts) {
  const ext = await producer.extendVideo(current, prompt);
  extensions.push(ext);
  current = ext.videoFile;
}

// Total: 8s + (3 × 7s) = 29s
```

### Reference Images

```javascript
const refs = await Promise.all([
  producer.loadImageFromFile('./ref1.png'),
  producer.loadImageFromFile('./ref2.png'),
  producer.loadImageFromFile('./ref3.png')
]);

const result = await producer.imageToVideoWithReferences(
  "Product showcase video",
  refs.map(r => ({ ...r, referenceType: "asset" }))
);
```

---

## Related Resources

- **Official Docs**: https://ai.google.dev/gemini-api/docs/video
- **Quota Management**: https://ai.dev/usage?tab=rate-limit
- **API Key**: https://aistudio.google.com/apikey
- **Prompt Guide**: https://ai.google.dev/gemini-api/docs/video#prompt-guide

---

**Last Updated**: 2025-01-15
**Version**: 1.0
**SDK Version**: @google/genai 1.29.1+
