# Image Generator - Complete Capabilities Guide

> Based on [Official Gemini Image Generation Documentation](https://ai.google.dev/gemini-api/docs/image-generation)

## Overview

The ImageGenerator supports **3 AI providers** with comprehensive image generation and editing capabilities:

| Provider | Model | Best For | Speed | Quality |
|----------|-------|----------|-------|---------|
| **Gemini Native** | gemini-2.5-flash-image | Text rendering, multi-image composition, iterative editing | 8.3s | High-fidelity text |
| **Fal AI** | flux-kontext-lora | Photorealistic single images, fast generation | 8.7s | Photorealistic |
| **Imagen** | imagen-4 | Highest quality, branding, advanced typography | Low latency | Maximum quality |

---

## 🎨 Core Capabilities

### 1. Text-to-Image Generation

Generate high-quality images from text descriptions.

```javascript
const ImageGenerator = require('./image/image-generator.js');

const generator = new ImageGenerator({
  geminiApiKey: process.env.GEMINI_API_KEY
});

// Basic generation
const result = await generator.textToImage(
  "A nano banana dish in a fancy restaurant with Gemini theme",
  { aspectRatio: "16:9" }
);

// With advanced options
const result = await generator.textToImage(
  "Professional financial chart showing 14.5% returns",
  {
    aspectRatio: "16:9",
    imageOnly: true,  // Force image-only output (no text)
    responseModalities: ["Image"]  // Official API parameter
  }
);
```

### 2. Image Editing (Text + Image → Image)

Edit existing images using text instructions without masks.

```javascript
const result = await generator.editImage(
  "Add a wizard hat to the cat's head",
  "./cat.png",
  { aspectRatio: "1:1" }
);

// Advanced editing
const result = await generator.editImage(
  "Change background to a futuristic cityscape, add neon lighting",
  "./product.png",
  {
    aspectRatio: "16:9",
    imageOnly: true  // Force image-only output
  }
);
```

### 3. Multi-Image Composition

Combine up to 3 images with text instructions.

```javascript
const result = await generator.composeImages(
  "Combine these product images into a professional collage showing evolution",
  ["./v1.png", "./v2.png", "./v3.png"],
  { aspectRatio: "16:9" }
);

// Style transfer
const result = await generator.composeImages(
  "Apply the artistic style from the first image to the subject in the second image",
  ["./style-reference.png", "./subject.png"],
  { aspectRatio: "1:1" }
);
```

### 4. Iterative Refinement

Progressively refine images through multiple turns.

```javascript
const result = await generator.refineImage(
  "Create a modern office workspace",
  [
    "Add a large window with city view",
    "Make it more minimalist, remove clutter",
    "Add subtle warm lighting from the window"
  ],
  { aspectRatio: "16:9" }
);
```

### 5. Style Transfer

Transfer style from one image to another.

```javascript
const result = await generator.transferStyle(
  "./style-reference.png",    // Style source
  "./content-image.png",      // Content to apply style to
  { aspectRatio: "1:1" }
);
```

### 6. Social Media Graphics

Generate platform-optimized graphics.

```javascript
const result = await generator.generateSocialGraphic(
  "14.5% Returns with MADP Investment",
  {
    platform: "instagram",     // instagram, linkedin, facebook, twitter
    postType: "post",          // post, story, ad
    includeText: true,
    branding: {
      colors: ["#1E40AF", "#10B981"],
      logo: "./logo.png"
    }
  }
);
```

---

## 📐 Aspect Ratios & Specifications

All aspect ratios generate **1290 tokens** worth of image output.

| Aspect Ratio | Resolution | Description | Best For |
|--------------|------------|-------------|----------|
| **1:1** | 1024x1024 | Square | Instagram posts, profile pics |
| **2:3** | 832x1248 | Portrait | Pinterest, tall posters |
| **3:2** | 1248x832 | Landscape | Photography, banners |
| **3:4** | 864x1184 | Portrait | Instagram/Facebook posts |
| **4:3** | 1184x864 | Landscape | Presentations, classic photos |
| **4:5** | 896x1152 | Portrait | Instagram feed |
| **5:4** | 1152x896 | Landscape | Social media headers |
| **9:16** | 768x1344 | Vertical | Mobile stories, Reels |
| **16:9** | 1344x768 | Horizontal | YouTube thumbnails, widescreen |
| **21:9** | 1536x672 | Ultra-wide | Cinematic, banners |

### Get Aspect Ratio Info

```javascript
const info = generator.getAspectRatioInfo("16:9");
console.log(info);
// {
//   resolution: "1344x768",
//   tokens: 1290,
//   description: "Horizontal (widescreen)"
// }
```

---

## 🤖 Multi-Provider Support

### Provider Selection

```javascript
// Method 1: Set default provider in constructor
const geminiGen = new ImageGenerator({
  geminiApiKey: process.env.GEMINI_API_KEY,
  provider: 'gemini'
});

const falGen = new ImageGenerator({
  falApiKey: process.env.FAL_KEY,
  provider: 'fal',
  falModel: 'fal-ai/flux-kontext-lora/text-to-image'
});

// Method 2: Override per request
await generator.textToImage("prompt", {
  provider: 'fal',  // Override default
  aspectRatio: "1:1"
});
```

### Smart Provider Recommendation

Get AI-powered recommendations based on your use case:

```javascript
// For text-heavy graphics
const rec = generator.recommendProvider({
  useCase: 'text-heavy',
  hasText: true
});
console.log(rec);
// {
//   provider: 'gemini',
//   model: 'gemini-2.5-flash-image',
//   reasoning: 'Gemini Native excels at high-fidelity text rendering',
//   features: ['High-fidelity text rendering', 'Contextual understanding', ...]
// }

// For photorealistic images
const rec = generator.recommendProvider({
  useCase: 'photorealism',
  priority: 'speed'
});
// Recommends: Fal AI (Flux Kontext LoRA)

// For maximum quality branding
const rec = generator.recommendProvider({
  useCase: 'branding',
  priority: 'quality'
});
// Recommends: Imagen 4
```

---

## ⚙️ Advanced Configuration

### Response Modalities

Force image-only output (no text):

```javascript
const result = await generator.textToImage(
  "Create a logo for MADP Investment Platform",
  {
    aspectRatio: "1:1",
    imageOnly: true  // Simplified flag
  }
);

// Or use official API parameter
const result = await generator.textToImage(
  "Professional financial chart",
  {
    aspectRatio: "16:9",
    responseModalities: ["Image"]  // Official Gemini API parameter
  }
);
```

### Simulation Mode (for testing)

```javascript
const generator = new ImageGenerator({
  geminiApiKey: process.env.GEMINI_API_KEY,
  simulate: true  // Don't call actual APIs, return mock data
});
```

---

## 💰 Pricing Comparison

| Provider | Model | Pricing | Best Value For |
|----------|-------|---------|----------------|
| **Gemini Native** | gemini-2.5-flash-image | $30 per 1M tokens<br>(1290 tokens/image = $0.039/image) | Multi-turn editing, text rendering |
| **Fal AI** | flux-kontext-lora | ~$0.02-$0.05/image | High-volume photorealistic generation |
| **Imagen 4** | imagen-4 | $0.02-$0.12/image | Quality-critical projects, branding |

---

## 🎯 Use Case Examples

### E-commerce Product Graphics

```javascript
// Product showcase with multiple angles
const result = await generator.composeImages(
  "Create a professional product showcase grid with these 3 angles",
  ["./front.png", "./side.png", "./back.png"],
  { aspectRatio: "1:1" }
);
```

### Social Media Campaigns

```javascript
// Instagram Story
const story = await generator.generateSocialGraphic(
  "Summer Sale - 50% Off",
  {
    platform: "instagram",
    postType: "story",
    aspectRatio: "9:16"
  }
);

// LinkedIn Post
const linkedin = await generator.generateSocialGraphic(
  "Q4 Results: 145% Growth",
  {
    platform: "linkedin",
    postType: "post",
    aspectRatio: "1:1",
    includeText: true
  }
);
```

### Branding & Logos

```javascript
// Use Gemini for high-fidelity text
const logo = await generator.textToImage(
  "Modern minimalist logo for 'TechVision AI' with geometric shapes, blue and green color scheme",
  {
    aspectRatio: "1:1",
    imageOnly: true,
    provider: 'gemini'  // Best for text rendering
  }
);
```

### Marketing Materials

```javascript
// Infographic with data visualization
const infographic = await generator.textToImage(
  "Professional infographic showing 5 key benefits of cloud computing with icons and statistics",
  {
    aspectRatio: "3:4",
    imageOnly: true
  }
);
```

---

## 🔄 Comparison: Gemini vs Imagen

### When to Use Gemini Native (Nano Banana)

✅ **Choose Gemini when you need:**
- Conversational multi-turn editing
- Multi-image composition (up to 3 images)
- High-fidelity text rendering in images
- Simple mask-free editing
- Contextual understanding
- Iterative refinement over multiple turns

**Best for:** Logos, diagrams, posters, text-heavy graphics, iterative design work

### When to Use Imagen

✅ **Choose Imagen when you need:**
- Maximum image quality and photorealism
- Advanced spelling and typography
- Branding and product design
- Specific artistic styles (impressionism, anime)
- Near real-time performance
- Single-shot generation

**Best for:** Photography, realistic scenes, branding materials, artistic renders

### When to Use Fal AI

✅ **Choose Fal AI when you need:**
- Fast photorealistic generation (8-10s)
- High-volume image production
- Cost-effective single images
- Specific model features (Flux, SDXL, etc.)

**Best for:** Quick prototyping, high-volume campaigns, realistic product photos

---

## 🚀 Getting Started

### Installation

```bash
npm install @google/genai node-fetch
```

### Environment Setup

```bash
# For Gemini (default)
export GEMINI_API_KEY="your-gemini-api-key"

# For Fal AI (optional)
export FAL_KEY="your-fal-api-key"
```

### Quick Start

```javascript
const ImageGenerator = require('./image/image-generator.js');

const generator = new ImageGenerator({
  geminiApiKey: process.env.GEMINI_API_KEY
});

// Generate an image
const result = await generator.textToImage(
  "A futuristic city at sunset with flying cars",
  { aspectRatio: "16:9" }
);

console.log(`Generated: ${result.images[0].path}`);
```

---

## 📚 Additional Resources

- **Official Gemini Image Docs**: https://ai.google.dev/gemini-api/docs/image-generation
- **Imagen Documentation**: https://ai.google.dev/gemini-api/docs/imagen
- **Fal AI Models**: https://fal.ai/models
- **Code Examples**: See `/test-image-generation.js` and `/test-fal-image-generation.js`

---

## 🎬 Complete Example

```javascript
const ImageGenerator = require('./image/image-generator.js');

async function createMarketingCampaign() {
  const generator = new ImageGenerator({
    geminiApiKey: process.env.GEMINI_API_KEY,
    falApiKey: process.env.FAL_KEY
  });

  // 1. Get recommendation for use case
  const rec = generator.recommendProvider({
    useCase: 'text-heavy',
    hasText: true,
    needsIteration: false
  });
  console.log(`Using ${rec.provider}: ${rec.reasoning}`);

  // 2. Generate hero image with Gemini (best for text)
  const hero = await generator.textToImage(
    "Professional banner: '14.5% Annual Returns' in bold modern typography, financial growth visualization",
    {
      aspectRatio: "16:9",
      imageOnly: true
    }
  );

  // 3. Generate photorealistic product shot with Fal AI
  const product = await generator.textToImage(
    "Photorealistic premium investment portfolio on a modern desk with laptop",
    {
      aspectRatio: "1:1",
      provider: 'fal'
    }
  );

  // 4. Create social media variants
  const instagram = await generator.generateSocialGraphic(
    "Invest Smart with MADP - 14.5% Returns",
    {
      platform: "instagram",
      postType: "post",
      aspectRatio: "1:1"
    }
  );

  console.log('Campaign complete!');
  console.log('Hero:', hero.images[0].path);
  console.log('Product:', product.images[0].path);
  console.log('Instagram:', instagram.images[0].path);
}

createMarketingCampaign();
```

---

## ✨ All Features Summary

- ✅ **Text-to-Image** - Generate from descriptions
- ✅ **Image Editing** - Mask-free conversational editing
- ✅ **Multi-Image Composition** - Combine up to 3 images
- ✅ **Iterative Refinement** - Progressive multi-turn editing
- ✅ **Style Transfer** - Apply artistic styles
- ✅ **Social Media Graphics** - Platform-optimized outputs
- ✅ **10 Aspect Ratios** - From 1:1 to 21:9
- ✅ **3 AI Providers** - Gemini, Fal AI, Imagen support
- ✅ **Response Modalities** - Force image-only output
- ✅ **Smart Recommendations** - AI-powered provider selection
- ✅ **High-Fidelity Text** - Legible text rendering in images
- ✅ **SynthID Watermarks** - Built-in provenance tracking

---

*Generated: 2025-01-17*
*Documentation based on: https://ai.google.dev/gemini-api/docs/image-generation*

