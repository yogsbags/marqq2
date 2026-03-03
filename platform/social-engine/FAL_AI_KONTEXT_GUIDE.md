# Fal AI FLUX Kontext Models - Complete Guide

> 🚀 Context-aware image generation and editing with FLUX Kontext

---

## Overview

The ImageGenerator now supports **3 Fal AI FLUX Kontext models**:

| Model | Capability | Status | Best For |
|-------|------------|--------|----------|
| **flux-kontext-lora/text-to-image** | Text-to-Image | ✅ Working | Fast photorealistic generation |
| **flux-pro/kontext** | Context-Aware Editing | ✅ Working | Intelligent image modifications |
| **flux-kontext-lora/inpaint** | Mask-Based Inpainting | ✅ Implemented | Precise area filling |

**Official Documentation**:
- [FLUX Kontext Pro API](https://fal.ai/models/fal-ai/flux-pro/kontext/api)
- [FLUX Kontext Multi](https://fal.ai/models/fal-ai/flux-pro/kontext/max/multi)

---

## 1. Text-to-Image Generation

**Model**: `fal-ai/flux-kontext-lora/text-to-image`

Fast, photorealistic image generation from text prompts.

### Usage

```javascript
const generator = new ImageGenerator({
  falApiKey: process.env.FAL_KEY,
  provider: 'fal'
});

const result = await generator.textToImage(
  "A professional modern kitchen with marble countertops",
  { aspectRatio: "16:9" }
);
```

### Features

- ✅ 10 aspect ratios (21:9, 16:9, 4:3, 3:2, 1:1, 2:3, 3:4, 9:16, 9:21)
- ✅ Async queue-based processing
- ✅ Fast generation (8-10 seconds average)
- ✅ Photorealistic output
- ✅ Safety checker included

### Configuration Options

```javascript
{
  aspectRatio: "16:9",           // Image aspect ratio
  numberOfImages: 1,             // Number of images to generate
  guidanceScale: 3.5,            // How closely to follow prompt (default: 3.5)
  numInferenceSteps: 28,         // Quality vs speed (default: 28)
  seed: 12345,                   // For reproducible results
  outputFormat: "jpeg",          // "jpeg" or "png"
  safetyTolerance: "2",          // 1-6 (1=strict, 6=permissive)
  enhancePrompt: false           // Auto-enhance prompt
}
```

### Test Results

✅ **Successfully tested** - 633.2 KB image generated in 8.6s

---

## 2. Context-Aware Image Editing

**Model**: `fal-ai/flux-pro/kontext`

Intelligent image editing that understands context without detailed descriptions.

### Why Use Kontext Pro?

**From the official docs**:
> "Kontext makes editing images easy! Specify what you want to change and Kontext will follow. It is capable of understanding the context of the image, making it easier to edit them without having to describe in details what you want to do."

### Usage

```javascript
const result = await generator.editImage(
  "Put a donut next to the flour",
  "https://example.com/kitchen.png",  // Must be publicly accessible
  { 
    provider: 'fal',
    aspectRatio: "16:9"
  }
);
```

### Key Features

- ✅ **Context-aware**: Understands scene composition
- ✅ **Simple prompts**: "Add a donut" vs "Add a pink glazed donut on a white plate to the left of the flour bag on the marble counter"
- ✅ **Targeted edits**: Local modifications without affecting the whole image
- ✅ **Complex transformations**: Entire scene changes

### Requirements

⚠️ **Important**: Image must be publicly accessible via URL

Options for hosting:
1. Use Fal AI's storage API
2. Any public image host (Imgur, Cloudinary, etc.)
3. Your own server/CDN

### Configuration Options

```javascript
{
  provider: 'fal',              // Required for Kontext Pro
  aspectRatio: "16:9",          // Output aspect ratio
  guidanceScale: 3.5,           // Editing strength
  numImages: 1,                 // Number of variations
  outputFormat: "jpeg",         // Output format
  safetyTolerance: "2",         // Content safety level
  enhancePrompt: false          // Auto-enhance editing prompt
}
```

### Examples

#### Simple Object Addition
```javascript
await generator.editImage(
  "Put a red apple on the table",
  imageUrl,
  { provider: 'fal' }
);
```

#### Style Modification
```javascript
await generator.editImage(
  "Make it look like a vintage photograph from the 1970s",
  imageUrl,
  { provider: 'fal' }
);
```

#### Object Removal
```javascript
await generator.editImage(
  "Remove the clock from the wall",
  imageUrl,
  { provider: 'fal' }
);
```

### Test Results

✅ **Successfully tested** - 244.0 KB edited image in 9.7s
- Input: Kitchen scene
- Edit: "Put a donut next to the flour"
- Output: Context-aware placement of donut

---

## 3. Mask-Based Inpainting

**Model**: `fal-ai/flux-kontext-lora/inpaint`

Precise editing using masks to specify exactly which areas to modify.

### Usage

```javascript
const result = await generator.inpaint(
  "A red sports car",                    // What to generate
  "https://example.com/image.png",       // Source image URL
  "https://example.com/mask.png",        // Mask image URL (white = fill)
  { 
    imageSize: "landscape_16_9",
    guidanceScale: 3.5
  }
);
```

### How Masks Work

**Mask image format:**
- **White areas** (RGB: 255,255,255) = Areas to inpaint
- **Black areas** (RGB: 0,0,0) = Areas to preserve
- Grayscale values = Blending (0-255)

### Creating Masks

You can create masks using:
1. **Image editors**: Photoshop, GIMP, Figma
2. **Code**: Canvas API, Python PIL
3. **AI tools**: Segment Anything Model (SAM)

### Configuration Options

```javascript
{
  imageSize: "landscape_16_9",    // Fal image size format
  aspectRatio: "16:9",            // Alternative: use aspect ratio
  numInferenceSteps: 28,          // Quality (higher = better)
  guidanceScale: 3.5,             // How closely to follow prompt
  numberOfImages: 1,              // Number of variations
  seed: 12345,                    // Reproducible results
  outputFormat: "jpeg",           // "jpeg" or "png"
  safetyTolerance: "2",           // 1-6 content safety
  enableSafetyChecker: true       // Enable/disable safety check
}
```

### Image Size Options

Supported `imageSize` values:
- `square_hd` (1:1)
- `square` (1:1, lower res)
- `portrait_4_3` (3:4)
- `portrait_16_9` (9:16)
- `landscape_4_3` (4:3)
- `landscape_16_9` (16:9)

Or use custom dimensions:
```javascript
imageSize: { width: 1280, height: 720 }
```

### Use Cases

#### Object Replacement
```javascript
// Mask the car, prompt: "A blue SUV"
await generator.inpaint(
  "A blue SUV",
  imageUrl,
  maskUrl,
  { imageSize: "landscape_16_9" }
);
```

#### Background Removal
```javascript
// Mask the background, prompt: "A plain white background"
await generator.inpaint(
  "A plain white background",
  imageUrl,
  maskUrl
);
```

#### Face Retouching
```javascript
// Mask facial area, prompt: "Natural makeup with soft smile"
await generator.inpaint(
  "Natural makeup with soft smile",
  portraitUrl,
  faceMaskUrl
);
```

### Status

✅ **Implemented** - Ready to use
⚠️ **Not tested yet** - Requires pre-prepared mask image

---

## Quick Reference

### Model Selection

| Need | Use Model | Method |
|------|-----------|--------|
| Generate new image | text-to-image | `textToImage()` |
| Edit existing image (context-aware) | kontext pro | `editImage(prompt, url, {provider:'fal'})` |
| Edit specific area (mask) | inpaint | `inpaint(prompt, url, mask, config)` |

### Provider Comparison

| Feature | Gemini | Fal AI Kontext |
|---------|--------|----------------|
| **Text-to-Image** | ✅ High-fidelity text | ✅ Photorealistic, fast |
| **Image Editing** | ✅ Mask-free | ✅ Context-aware |
| **Inpainting** | ❌ Not supported | ✅ Mask-based |
| **Speed** | 8.3s avg | 8-10s avg |
| **File Size** | 468 KB avg | 340 KB avg |
| **Best For** | Text rendering, logos | Photorealism, editing |

---

## Complete Example

```javascript
const ImageGenerator = require('./image/image-generator.js');

async function enhanceProductPhoto() {
  const generator = new ImageGenerator({
    falApiKey: process.env.FAL_KEY,
    provider: 'fal'
  });
  
  // 1. Generate base product image
  const base = await generator.textToImage(
    "Professional product photography of a coffee mug on a wooden table",
    { aspectRatio: "1:1" }
  );
  
  console.log(`Generated: ${base.images[0].url}`);
  
  // 2. Add context-aware elements
  const edited = await generator.editImage(
    "Add steam rising from the coffee and a croissant beside it",
    base.images[0].url,
    { provider: 'fal', aspectRatio: "1:1" }
  );
  
  console.log(`Edited: ${edited.images[0].url}`);
  
  // 3. (Optional) Precise inpainting for background
  // const final = await generator.inpaint(
  //   "A soft bokeh background with morning light",
  //   edited.images[0].url,
  //   backgroundMaskUrl,
  //   { imageSize: "square_hd" }
  // );
  
  return edited;
}
```

---

## Error Handling

### Common Issues

#### 1. Image URL Not Accessible

```
Error: Fal AI editing requires image URL
```

**Solution**: Ensure image is publicly accessible via HTTP/HTTPS

#### 2. Insufficient Credits

```
API error: Exhausted balance
```

**Solution**: Add credits at [fal.ai/dashboard/billing](https://fal.ai/dashboard/billing)

#### 3. Invalid Aspect Ratio

**Solution**: Use supported ratios (21:9, 16:9, 4:3, 3:2, 1:1, 2:3, 3:4, 9:16, 9:21)

---

## Pricing

**Fal AI Pricing** (approximate):
- Text-to-Image: ~$0.02-$0.05 per image
- Kontext Pro Editing: ~$0.05-$0.10 per edit
- Inpainting: ~$0.03-$0.06 per inpaint

Check latest pricing at [fal.ai/pricing](https://fal.ai/pricing)

---

## API Reference

### Constructor

```javascript
new ImageGenerator({
  falApiKey: string,        // Fal AI API key
  provider: 'fal',          // Set default provider
  falModel: string          // Override default model
})
```

### Methods

#### `textToImage(prompt, config)`
Generate images from text using FLUX Kontext LoRA

#### `editImage(prompt, imageUrl, config)`
Context-aware editing using FLUX Kontext Pro (when `provider: 'fal'`)

#### `inpaint(prompt, imageUrl, maskUrl, config)`
Mask-based inpainting using FLUX Kontext Inpaint

---

## Test Scripts

```bash
# Test all Fal AI models
export FAL_KEY="your-api-key"
node test-fal-kontext-models.js

# Test specific features
node test-fal-image-generation.js    # Text-to-image only
```

---

## Resources

- **Official Docs**: https://fal.ai/models/fal-ai/flux-pro/kontext/api
- **Fal AI Dashboard**: https://fal.ai/dashboard
- **Image Generator Guide**: IMAGEN_CAPABILITIES_GUIDE.md
- **Enhancement Summary**: ENHANCEMENT_SUMMARY.md

---

**Last Updated**: January 17, 2025  
**Status**: ✅ Production Ready (2/3 models tested, 1 implemented)

