# Veo 3.1 Features Guide

Complete guide to all Veo 3.1 video generation capabilities with practical examples.

---

## Overview

Google's Veo 3.1 offers five distinct video generation modes:

1. **Text-to-Video** - Generate from text prompts
2. **Image-to-Video (References)** - Use reference images to guide generation
3. **Image-to-Video (First/Last Frame)** - Interpolate between two frames
4. **Video Extension** - Extend Veo videos by 7 seconds
5. **Long-Form Generation** - Chain extensions for videos up to 148 seconds

---

## Feature Comparison

| Feature | Duration | Input Required | Use Case | Complexity |
|---------|----------|----------------|----------|------------|
| Text-to-Video | 8s | Text prompt | Quick standalone clips | ⭐ Easy |
| Reference Images | 8s | Prompt + 1-3 images | Maintain brand/character consistency | ⭐⭐ Medium |
| First/Last Frame | 8s | Prompt + 2 frames | Precise composition control | ⭐⭐ Medium |
| Video Extension | +7s | Prompt + Veo video | Extend existing Veo videos | ⭐⭐⭐ Advanced |
| Long-Form | 8-148s | Prompts + chaining | Multi-segment videos | ⭐⭐⭐⭐ Expert |

---

## 1. Text-to-Video Generation

### What It Does

Generates 8-second 720p or 1080p videos from text descriptions with native audio (dialogue, sound effects, ambient noise).

### When to Use

- Quick standalone video clips
- Testing prompts and concepts
- Simple content without specific visual references
- Initial video in an extension chain

### Code Example

```javascript
const producer = new ComprehensiveVeoProducer({
  apiKey: process.env.GEMINI_API_KEY
});

const result = await producer.textToVideo(
  `A close up of an Indian professional woman, mid-30s, wearing business casual attire.
   Modern office with floor-to-ceiling windows showing cityscape. Warm natural lighting.
   She looks at camera confidently and says, "Let me show you how smart portfolios work."
   Background has subtle financial charts on screens. Cinematic quality, 4K look.`,
  {
    aspectRatio: "16:9",  // or "9:16" for vertical
    resolution: "1080p",   // or "720p"
    negativePrompt: "blurry, pixelated, amateur, low quality"
  }
);

console.log(`Video saved: ${result.videoUri}`);
// Output: /tmp/veo-text-1234567890.mp4
```

### Prompt Best Practices

**Structure your prompt**:
1. **Subject** - Who/what (Indian professional woman, mid-30s)
2. **Appearance** - Clothing, features (business casual attire)
3. **Setting** - Location details (modern office, cityscape view)
4. **Lighting** - Atmosphere (warm natural lighting)
5. **Action** - What happens (looks at camera, speaks)
6. **Audio** - Dialogue/sounds (says "...")
7. **Style** - Visual quality (cinematic, 4K look)

**Examples**:

✅ **Good**:
```
"Close up of a calico kitten sleeping peacefully in a sunny window, soft natural light,
gentle breathing motion, ambient outdoor sounds of birds chirping. Cozy home interior
with plants in background. Warm color grading, shallow depth of field."
```

❌ **Bad**:
```
"A cat sleeps"
```

### Output

```javascript
{
  type: "text-to-video",
  videoUri: "/tmp/veo-text-1234567890.mp4",
  videoFile: {
    name: "files/abc123...",
    mimeType: "video/mp4"
  },
  duration: 8,
  config: { aspectRatio: "16:9", resolution: "1080p" }
}
```

---

## 2. Image-to-Video with Reference Images

### What It Does

Generates videos using up to 3 reference images to guide content. Preserves subject appearance, style, and characteristics from the references.

### When to Use

- Maintain character/product consistency
- Brand-specific content with logo/product references
- Videos featuring specific people (with proper permissions)
- Fashion/product demonstrations

### Code Example

```javascript
// Load reference images
const productImage = await producer.loadImageFromFile('./assets/product.png');
const logoImage = await producer.loadImageFromFile('./assets/logo.png');
const personImage = await producer.loadImageFromFile('./assets/model.png');

const result = await producer.imageToVideoWithReferences(
  `A woman wearing the featured dress walks confidently through a modern art gallery.
   She pauses to admire a painting, adjusts her heart-shaped sunglasses, then continues.
   Soft ambient lighting, fashion photography style. Brand logo subtly visible on product.`,
  [
    { ...productImage, referenceType: "asset" },   // Reference 1: Dress
    { ...logoImage, referenceType: "asset" },      // Reference 2: Brand logo
    { ...personImage, referenceType: "asset" }     // Reference 3: Model
  ],
  {
    aspectRatio: "9:16",   // Vertical for Instagram
    resolution: "1080p"
  }
);
```

### Reference Image Guidelines

**Best Practices**:
- ✅ Clear, well-lit product/character images
- ✅ Subject prominently featured
- ✅ High resolution source images
- ✅ Consistent style across references
- ✅ Similar angles to desired video output

**Avoid**:
- ❌ Blurry or low-quality images
- ❌ Multiple subjects in one reference (ambiguous)
- ❌ Drastically different lighting conditions
- ❌ More than 3 references (API limit)

### Use Cases

**Product Showcase**:
```javascript
// Product + Logo + Usage Context
const showcase = await producer.imageToVideoWithReferences(
  "Product being used in modern home setting, lifestyle shot",
  [productRef, logoRef, lifestyleRef]
);
```

**Character Consistency**:
```javascript
// Character + Outfit + Accessories
const characterVideo = await producer.imageToVideoWithReferences(
  "Animated character walking through fantasy landscape",
  [characterDesign, outfitRef, accessoriesRef]
);
```

**Brand Content**:
```javascript
// Brand assets + spokesperson + product
const brandVideo = await producer.imageToVideoWithReferences(
  "Brand ambassador presenting product benefits",
  [brandLogo, ambassador, product]
);
```

---

## 3. First and Last Frame Specification

### What It Does

Generates video interpolating smoothly between two specified frames. Provides precise control over start and end composition.

### When to Use

- Animated transitions
- Specific start/end states required
- Data visualization animations
- Logo reveals or transformations

### Code Example

```javascript
// Load frame images
const startFrame = await producer.loadImageFromFile('./frames/start.png');
const endFrame = await producer.loadImageFromFile('./frames/end.png');

const result = await producer.firstLastFrameVideo(
  `Smooth animated transition showing portfolio value growth from ₹50 Lakhs to ₹2 Crores.
   Professional financial chart with green upward trending line. Corporate color scheme
   with navy blue and gold accents. Data points and grid lines visible. Clean, modern
   financial graphics style.`,
  startFrame,  // Chart showing ₹50L
  endFrame,    // Chart showing ₹2Cr
  {
    aspectRatio: "16:9",
    resolution: "1080p"
  }
);
```

### Frame Requirements

**Start Frame**:
- Shows initial state
- Clear composition
- Matches desired aspect ratio

**End Frame**:
- Shows final state
- Same aspect ratio as start
- Visual continuity with start frame

### Use Cases

**Data Visualization**:
```javascript
// Animate chart/graph transitions
const chartAnimation = await producer.firstLastFrameVideo(
  "Bar chart animating from empty to full data visualization",
  emptyChartFrame,
  fullChartFrame
);
```

**Product Transformation**:
```javascript
// Before/after animations
const transformation = await producer.firstLastFrameVideo(
  "Product transforming from basic to premium version",
  basicProductFrame,
  premiumProductFrame
);
```

**Logo Animation**:
```javascript
// Logo reveal
const logoReveal = await producer.firstLastFrameVideo(
  "Brand logo materializing from particles to solid form",
  particlesFrame,
  solidLogoFrame
);
```

---

## 4. Video Extension

### What It Does

Extends Veo-generated videos by exactly 7 seconds. Can extend up to 20 times for a maximum total length of ~148 seconds.

### When to Use

- Extend existing Veo videos
- Build longer narratives
- Add continuation to completed scenes
- Create extended explainer videos

### Code Example

```javascript
// Step 1: Generate base video (8 seconds)
const baseVideo = await producer.textToVideo(
  "Indian financial advisor in modern office starts presentation to camera",
  { aspectRatio: "16:9", resolution: "720p" }
);

console.log(`Base video: ${baseVideo.videoUri} (8s)`);

// Step 2: First extension (+7 seconds = 15s total)
const extension1 = await producer.extendVideo(
  baseVideo.videoFile,  // Required: Veo video file reference
  "Advisor continues explaining MADP portfolio strategy, gesturing to screen behind them",
  { aspectRatio: "16:9", resolution: "720p" }  // Must match base video
);

console.log(`After extension 1: ${extension1.videoUri} (15s)`);

// Step 3: Second extension (+7 seconds = 22s total)
const extension2 = await producer.extendVideo(
  extension1.videoFile,
  "Animated chart appears showing portfolio performance, advisor points to key metrics",
  { aspectRatio: "16:9", resolution: "720p" }
);

console.log(`After extension 2: ${extension2.videoUri} (22s)`);

// Step 4: Third extension (+7 seconds = 29s total)
const extension3 = await producer.extendVideo(
  extension2.videoFile,
  "Advisor gives confident smile and call-to-action, text overlay appears with website URL",
  { aspectRatio: "16:9", resolution: "720p" }
);

console.log(`Final video: ${extension3.videoUri} (29s total)`);
```

### Extension Requirements

**Must match original video**:
- ✅ Same aspect ratio
- ✅ Same resolution
- ✅ Video must be Veo-generated (not external)

**Limitations**:
- Input video ≤ 141 seconds
- Maximum 20 extensions
- Each extension adds exactly 7 seconds
- Cannot extend non-Veo videos

### Extension Chain Planning

**Calculate total duration**:
```
Total = 8s (base) + (N × 7s) (extensions)

Examples:
- 1 extension:  8 + 7 = 15s
- 3 extensions: 8 + 21 = 29s
- 6 extensions: 8 + 42 = 50s
- 20 extensions: 8 + 140 = 148s (maximum)
```

**Plan your segments**:
```javascript
const segments = [
  { duration: 8, prompt: "Introduction - advisor introduces topic" },
  { duration: 7, prompt: "Point 1 - explains concept with gestures" },
  { duration: 7, prompt: "Point 2 - shows data on screen" },
  { duration: 7, prompt: "Point 3 - provides example case" },
  { duration: 7, prompt: "Conclusion - summarizes key takeaways" },
  { duration: 7, prompt: "CTA - calls to action with URL overlay" }
];
// Total: 8 + (5 × 7) = 43 seconds
```

---

## 5. Long-Form Video Generation

### What It Does

Automates the process of creating long-form videos by chaining base video + multiple extensions.

### When to Use

- Multi-segment content (50s - 2+ minutes)
- Educational videos with multiple topics
- Product demonstrations with several features
- Storytelling with multiple scenes

### Code Example

```javascript
const result = await producer.generateLongVideo(
  // Base video prompt (8s)
  "Indian financial advisor introduces MADP portfolio strategy in modern office",

  // Extension prompts (7s each)
  [
    "Animated dashboard appears showing valuation vs momentum metrics split screen",
    "Advisor explains how MADP combines quality stocks with momentum indicators",
    "Chart visualizes 5-year portfolio performance with 15% annual returns",
    "Risk management graphic shows defensive allocation protecting during downturns",
    "Client testimonial overlay: Rajesh Kumar, ₹50L → ₹2Cr growth in 5 years",
    "Advisor discusses minimum investment requirements and consultation process",
    "Call-to-action with website URL and 'Book Free Consultation' button overlay"
  ],

  // Config (must be consistent across all clips)
  {
    aspectRatio: "16:9",
    resolution: "720p"
  }
);

console.log(`Total clips: ${result.totalClips}`);        // 8
console.log(`Total duration: ${result.totalDuration}s`);  // 57s
console.log(`Final video: ${result.finalVideoUri}`);
```

### Output Structure

```javascript
{
  type: "long-video",
  clips: [
    { type: "text-to-video", videoUri: "/tmp/veo-text-...mp4", duration: 8 },
    { type: "video-extension", videoUri: "/tmp/veo-extended-...mp4", duration: 7 },
    { type: "video-extension", videoUri: "/tmp/veo-extended-...mp4", duration: 7 },
    // ... more extensions
  ],
  totalClips: 8,
  totalDuration: 57,
  finalVideoUri: "/tmp/veo-extended-...mp4",
  finalVideoFile: { name: "files/...", mimeType: "video/mp4" }
}
```

### Content Planning

**Segment Types**:

1. **Introduction (8s)** - Hook and context
2. **Main Points (7s each)** - Core content segments
3. **Supporting Visuals (7s each)** - Charts, B-roll, examples
4. **Transitions (7s each)** - Bridge between topics
5. **Conclusion (7s)** - Summary and key takeaways
6. **Call-to-Action (7s)** - Next steps, contact info

**Example Structure for 1-minute video**:
```
0-8s:   Introduction (base)
8-15s:  Point 1 (extension 1)
15-22s: Visual example (extension 2)
22-29s: Point 2 (extension 3)
29-36s: Data/chart (extension 4)
36-43s: Point 3 (extension 5)
43-50s: Conclusion (extension 6)
50-57s: CTA (extension 7)
Total: 57 seconds (8 clips)
```

---

## Combining Features

### Hybrid Workflows

**1. Reference Images + Extensions**

Generate base with references, then extend:

```javascript
// Step 1: Generate base with product references
const base = await producer.imageToVideoWithReferences(
  "Woman introduces featured dress in boutique setting",
  [dressRef, modelRef, brandRef],
  { aspectRatio: "9:16", resolution: "1080p" }
);

// Step 2: Extend with matching context
const extended = await producer.extendVideo(
  base.videoFile,
  "She twirls to show dress from all angles, fabric flows elegantly",
  { aspectRatio: "9:16", resolution: "1080p" }
);
```

**2. First/Last Frame + Text-to-Video**

Create bookends with animated transitions:

```javascript
// Opening title card
const opening = await producer.firstLastFrameVideo(
  "Title card fades in: 'MADP Portfolio Strategy'",
  blankFrame,
  titleFrame
);

// Main content
const content = await producer.textToVideo(
  "Advisor presents portfolio strategy"
);

// Closing title card
const closing = await producer.firstLastFrameVideo(
  "Call-to-action fades in: 'Book Your Consultation'",
  contentEndFrame,
  ctaFrame
);

// (Then stitch together in video editing software)
```

**3. Advanced Long-Form**

Mix different techniques in extension chain:

```javascript
const longVideo = await producer.generateLongVideo(
  "Professional introduction",  // Base: talking head
  [
    "Animated chart appears",    // Extension 1: data viz
    "Returns to professional",   // Extension 2: talking head
    "Product B-roll showcase",   // Extension 3: product shots
    "Back to professional",      // Extension 4: talking head
    "Client testimonial overlay",// Extension 5: text + footage
    "Final CTA with graphics"    // Extension 6: branded outro
  ]
);
```

---

## Production Workflows

### LinkedIn Post (15-30s)

```javascript
// Quick testimonial video
const linkedin = await producer.generateLongVideo(
  "Client introduces their success story with PL Capital",
  [
    "Shows portfolio dashboard with growth metrics",
    "Explains why they chose MADP strategy",
    "Shares results: ₹50L to ₹2Cr in 5 years"
  ],
  { aspectRatio: "16:9", resolution: "1080p" }
);
// Total: 8 + (3 × 7) = 29 seconds
```

### Instagram Reel (30s)

```javascript
// Vertical format product showcase
const reel = await producer.generateLongVideo(
  "Quick hook: 'This strategy changed my portfolio'",
  [
    "Shows before/after portfolio comparison",
    "Explains MADP in simple terms",
    "Call-to-action: Link in bio"
  ],
  { aspectRatio: "9:16", resolution: "1080p" }
);
// Total: 8 + (3 × 7) = 29 seconds
```

### YouTube Explainer (90s)

```javascript
// Educational deep-dive
const youtube = await producer.generateLongVideo(
  "Introduction to MADP portfolio strategy",
  [
    "What is MADP?",
    "Valuation factor explained",
    "Momentum factor explained",
    "How they work together",
    "Historical performance data",
    "Risk management approach",
    "Who should consider MADP?",
    "Minimum investment details",
    "How to get started",
    "Book consultation CTA"
  ],
  { aspectRatio: "16:9", resolution: "1080p" }
);
// Total: 8 + (10 × 7) = 78 seconds
```

---

## Cost & Performance

### Generation Times

| Video Type | Typical Time | Max Time |
|------------|--------------|----------|
| Single 8s clip | 1-3 minutes | 6 minutes |
| 15s (1 extension) | 2-5 minutes | 12 minutes |
| 30s (3 extensions) | 5-10 minutes | 25 minutes |
| 60s (7 extensions) | 10-20 minutes | 45 minutes |
| 90s (11 extensions) | 15-30 minutes | 65 minutes |

### Cost Estimates

(Approximate, check current pricing at https://ai.google.dev/pricing)

- **Single 8s video**: ~$0.10
- **15s video (1 ext)**: ~$0.15-0.20
- **30s video (3 ext)**: ~$0.30-0.40
- **90s video (11 ext)**: ~$0.90-1.20

---

## Troubleshooting

### Common Issues

**"All providers failed" / Quota exceeded**:
- Check quota: https://ai.dev/usage?tab=rate-limit
- Wait for quota reset or upgrade plan

**"Cannot extend this video"**:
- Only Veo-generated videos can be extended
- Check video is ≤141 seconds

**"Aspect ratio mismatch"**:
- Extensions must match original aspect ratio
- Use same config for all extensions

**"No video in response"**:
- Generation may have failed
- Check operation error details
- Try simpler prompt

### Best Practices

✅ **Do**:
- Test prompts with simulation mode first
- Plan extension chains before starting
- Monitor quota usage
- Use descriptive prompts (100-200 words)
- Include audio cues for dialogue

❌ **Don't**:
- Don't try to extend non-Veo videos
- Don't change aspect ratio mid-chain
- Don't use vague prompts
- Don't exceed quota limits
- Don't expect instant results (polling required)

---

## Next Steps

1. **Try Examples**: Run `node examples/veo-all-features.js`
2. **Read API Reference**: See `docs/VEO_API_REFERENCE.md`
3. **Check Installation**: See `INSTALL.md`
4. **Review Limits**: https://ai.google.dev/gemini-api/docs/video

---

**Last Updated**: 2025-01-15
**Version**: 1.0
