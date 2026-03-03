# Image Generation System - Quick Start

> 🎨 Multi-provider AI image generation with Gemini Native, Fal AI, and Imagen support

---

## 🚀 Quick Start

```javascript
const ImageGenerator = require('./image/image-generator.js');

// Initialize with API keys
const generator = new ImageGenerator({
  geminiApiKey: process.env.GEMINI_API_KEY,
  falApiKey: process.env.FAL_KEY
});

// Generate an image
const result = await generator.textToImage(
  "A futuristic city at sunset with flying cars",
  { aspectRatio: "16:9" }
);

console.log(`✅ Generated: ${result.images[0].path}`);
```

---

## 📋 Available Capabilities

### 1️⃣ Text-to-Image
Generate images from text descriptions

```javascript
await generator.textToImage("prompt", { aspectRatio: "16:9" });
```

### 2️⃣ Image Editing
Edit images with text instructions (no masks needed)

```javascript
await generator.editImage("add a hat", "./image.png", { aspectRatio: "1:1" });
```

### 3️⃣ Multi-Image Composition
Combine up to 3 images

```javascript
await generator.composeImages("merge these", ["img1.png", "img2.png"]);
```

### 4️⃣ Iterative Refinement
Progressive multi-turn editing

```javascript
await generator.refineImage("initial prompt", [
  "refinement 1",
  "refinement 2"
]);
```

### 5️⃣ Style Transfer
Apply style from one image to another

```javascript
await generator.transferStyle("style.png", "content.png");
```

### 6️⃣ Social Media Graphics
Platform-optimized graphics

```javascript
await generator.generateSocialGraphic("text", {
  platform: "instagram",
  postType: "story"
});
```

---

## 🤖 Providers

| Provider | Speed | Best For | Pricing |
|----------|-------|----------|---------|
| **Gemini** | 8.3s | Text rendering, editing | $0.039/image |
| **Fal AI** | 8.7s | Photorealistic, fast | $0.02-$0.05/image |
| **Imagen** | Fast | Maximum quality | $0.02-$0.12/image |

---

## 📐 Aspect Ratios

All ratios generate **1290 tokens** of output:

```javascript
1:1   → 1024x1024 (Square - Instagram)
16:9  → 1344x768  (Widescreen - YouTube)
9:16  → 768x1344  (Stories - Mobile)
21:9  → 1536x672  (Ultra-wide - Banners)
// ... 6 more ratios
```

**Get ratio info:**
```javascript
const info = generator.getAspectRatioInfo("16:9");
// { resolution: "1344x768", tokens: 1290, description: "Horizontal (widescreen)" }
```

---

## 🎯 Smart Recommendations

Get AI-powered provider recommendations:

```javascript
const rec = generator.recommendProvider({
  useCase: 'text-heavy',  // or 'photorealism', 'branding'
  priority: 'quality',    // or 'speed', 'cost'
  hasText: true
});

console.log(rec.provider);  // 'gemini'
console.log(rec.reasoning); // 'Gemini Native excels at...'
```

---

## ⚙️ Advanced Options

### Force Image-Only Output

```javascript
await generator.textToImage("prompt", {
  imageOnly: true,  // No text in response
  aspectRatio: "1:1"
});
```

### Switch Providers

```javascript
// Per request
await generator.textToImage("prompt", {
  provider: 'fal',  // Override default
  aspectRatio: "16:9"
});

// Or set default in constructor
const falGen = new ImageGenerator({
  falApiKey: process.env.FAL_KEY,
  provider: 'fal'
});
```

---

## 📚 Documentation

- **Complete Guide**: [`IMAGEN_CAPABILITIES_GUIDE.md`](./IMAGEN_CAPABILITIES_GUIDE.md)
- **Enhancement Summary**: [`ENHANCEMENT_SUMMARY.md`](./ENHANCEMENT_SUMMARY.md)
- **Official Docs**: https://ai.google.dev/gemini-api/docs/image-generation

---

## 🧪 Test Scripts

```bash
# Test Gemini (6 MADP campaign images)
export GEMINI_API_KEY="your-key"
node test-image-generation.js

# Test Fal AI (3 photorealistic images)
export FAL_KEY="your-key"
node test-fal-image-generation.js

# Test all enhanced capabilities
export GEMINI_API_KEY="your-key"
export FAL_KEY="your-key"
node test-enhanced-capabilities.js
```

---

## ✨ Features

- ✅ **3 AI Providers** - Gemini, Fal AI, Imagen
- ✅ **10 Aspect Ratios** - 1:1 to 21:9
- ✅ **6 Core Capabilities** - Generate, edit, compose, refine, transfer, optimize
- ✅ **Smart Recommendations** - AI-powered provider selection
- ✅ **Response Modalities** - Force image-only output
- ✅ **High-Fidelity Text** - Legible text rendering
- ✅ **Multi-Turn Editing** - Iterative refinement
- ✅ **No Masks Needed** - Conversational editing
- ✅ **SynthID Watermarks** - Built-in provenance

---

## 📊 Test Results

### Generated Images (9 total):
- ✅ 6 Gemini images (MADP campaign)
- ✅ 3 Fal AI images (photorealistic)
- ✅ 2 Provider comparison images
- ✅ 1 Image-only demo

### Performance:
- ⚡ Gemini: 8.3s average
- ⚡ Fal AI: 8.7s average
- 💾 File sizes: 258 KB - 1186 KB

---

## 🎬 Complete Example

```javascript
async function createCampaign() {
  const generator = new ImageGenerator({
    geminiApiKey: process.env.GEMINI_API_KEY,
    falApiKey: process.env.FAL_KEY
  });

  // Get recommendation
  const rec = generator.recommendProvider({
    useCase: 'text-heavy',
    hasText: true
  });

  // Generate hero with Gemini (best for text)
  const hero = await generator.textToImage(
    "Professional banner: '14.5% Annual Returns'",
    { aspectRatio: "16:9", imageOnly: true }
  );

  // Generate product with Fal AI (photorealistic)
  const product = await generator.textToImage(
    "Photorealistic investment portfolio on desk",
    { aspectRatio: "1:1", provider: 'fal' }
  );

  // Create social variant
  const instagram = await generator.generateSocialGraphic(
    "Invest Smart - 14.5% Returns",
    { platform: "instagram", postType: "story" }
  );

  console.log('Campaign complete!');
}
```

---

## 🔗 Quick Links

- [Complete Capabilities Guide](./IMAGEN_CAPABILITIES_GUIDE.md)
- [Enhancement Summary](./ENHANCEMENT_SUMMARY.md)
- [Official Gemini Docs](https://ai.google.dev/gemini-api/docs/image-generation)
- [Imagen Documentation](https://ai.google.dev/gemini-api/docs/imagen)

---

**Ready to generate amazing images! 🎨✨**

