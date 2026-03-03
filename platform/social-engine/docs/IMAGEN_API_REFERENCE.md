# Nano Banana (Gemini Image Generation) API Reference

Complete reference for Google Gemini 2.5 Flash Image (Nano Banana) generation API.

**Official Docs**: https://ai.google.dev/gemini-api/docs/image-generation

---

## Table of Contents

1. [Model Information](#model-information)
2. [Generation Methods](#generation-methods)
3. [API Parameters](#api-parameters)
4. [Configuration Options](#configuration-options)
5. [Response Structure](#response-structure)
6. [Image Formats](#image-formats)
7. [Use Cases](#use-cases)
8. [Limitations](#limitations)
9. [Best Practices](#best-practices)

---

## Model Information

### Model Details

| Property | Value |
|----------|-------|
| **Model Name** | `gemini-2.5-flash-image` |
| **Type** | Image Generation |
| **Input** | Text prompts, images |
| **Output** | PNG images (base64 encoded) |
| **Watermarking** | SynthID (automatic) |
| **Languages** | Multi-language support |

### Key Features

- **High-fidelity text rendering** - Accurate text in generated images
- **Semantic masking/inpainting** - Intelligent image editing
- **Multiple aspect ratios** - 1:1, 16:9, 9:16, 21:9, etc.
- **Multi-language prompts** - Support for various languages
- **Reference image support** - Up to 3 reference images
- **Style consistency** - Maintain visual style across generations

---

## Generation Methods

### 1. Text-to-Image Generation

Generate images from text descriptions.

```javascript
const response = await ai.models.generateContent({
  model: "gemini-2.5-flash-image",
  contents: "A professional financial dashboard with navy blue and gold colors",
  config: {
    imageConfig: {
      aspectRatio: "16:9"
    }
  }
});
```

**Parameters**:
- `contents` (string, required): Text description of the image
- `config.imageConfig.aspectRatio` (string, optional): Aspect ratio (default: "1:1")

**Returns**: Response with inline image data (base64)

### 2. Image Editing with Text Prompts

Edit existing images using text instructions.

```javascript
const response = await ai.models.generateContent({
  model: "gemini-2.5-flash-image",
  contents: [
    { text: "Add a wizard hat to the subject" },
    {
      inlineData: {
        mimeType: "image/png",
        data: base64ImageData
      }
    }
  ],
  config: {
    imageConfig: {
      aspectRatio: "1:1"
    }
  }
});
```

**Parameters**:
- `contents` (array, required): Array with text prompt and image data
- `contents[0].text` (string): Editing instructions
- `contents[1].inlineData` (object): Image to edit
  - `mimeType`: Image MIME type
  - `data`: Base64-encoded image data

**Returns**: Response with edited image (base64)

### 3. Multi-Image Composition

Combine multiple images with text instructions (max 3 images).

```javascript
const response = await ai.models.generateContent({
  model: "gemini-2.5-flash-image",
  contents: [
    { text: "Create a collage combining these three images" },
    { inlineData: { mimeType: "image/png", data: image1Data } },
    { inlineData: { mimeType: "image/png", data: image2Data } },
    { inlineData: { mimeType: "image/png", data: image3Data } }
  ],
  config: {
    imageConfig: {
      aspectRatio: "16:9"
    }
  }
});
```

**Parameters**:
- `contents` (array, required): Text prompt followed by 1-3 images
- Maximum 3 input images

**Returns**: Response with composed image (base64)

---

## API Parameters

### Core Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | string | ✅ | Model name: `"gemini-2.5-flash-image"` |
| `contents` | string \| array | ✅ | Text prompt or array with text + images |
| `config` | object | ❌ | Configuration options |

### Configuration Options

| Parameter | Type | Default | Options | Description |
|-----------|------|---------|---------|-------------|
| `imageConfig.aspectRatio` | string | `"1:1"` | See below | Image aspect ratio |
| `imageConfig.numberOfImages` | number | `1` | `1-4` | Number of images to generate |

### Supported Aspect Ratios

| Ratio | Description | Dimensions (at 1024 base) |
|-------|-------------|---------------------------|
| `"1:1"` | Square | 1024x1024 |
| `"2:3"` | Portrait | ~853x1280 |
| `"3:2"` | Landscape | 1280x853 |
| `"3:4"` | Portrait | ~910x1213 |
| `"4:3"` | Landscape | 1213x910 |
| `"4:5"` | Portrait | ~972x1215 |
| `"5:4"` | Landscape | 1215x972 |
| `"9:16"` | Vertical (mobile) | ~576x1024 |
| `"16:9"` | Horizontal (widescreen) | 1024x576 |
| `"21:9"` | Ultra-wide | ~1024x439 |

---

## Response Structure

### Response Object

```javascript
{
  parts: [
    {
      inlineData: {
        mimeType: "image/png",
        data: "iVBORw0KGgoAAAANSUhEUgAA..."  // Base64-encoded PNG
      }
    }
  ],
  usageMetadata: {
    promptTokenCount: 123,
    candidatesTokenCount: 0,
    totalTokenCount: 123
  }
}
```

### Extracting Images

```javascript
for (const part of response.parts) {
  if (part.inlineData) {
    const buffer = Buffer.from(part.inlineData.data, "base64");
    await fs.writeFile("output.png", buffer);
  }
}
```

---

## Image Formats

### Supported Input Formats

- PNG (`image/png`)
- JPEG (`image/jpeg`)
- GIF (`image/gif`)
- WebP (`image/webp`)

### Output Format

- PNG only (`image/png`)
- Base64-encoded in response
- SynthID watermarking included automatically

### Loading Images

**From File**:
```javascript
const fs = require('fs').promises;
const imageBytes = await fs.readFile('./image.png');
const base64Data = imageBytes.toString('base64');
```

**From Buffer**:
```javascript
const base64Data = buffer.toString('base64');
```

---

## Use Cases

### 1. Social Media Graphics

**LinkedIn Posts (1:1)**:
```javascript
const result = await producer.generateSocialGraphic(
  "Professional infographic: 5 Benefits of MADP Portfolio Strategy",
  "linkedin"
);
```

**Instagram Stories (9:16)**:
```javascript
const result = await producer.generateSocialGraphic(
  "Vertical client testimonial with growth metrics",
  "instagram-story"
);
```

**YouTube Thumbnails (16:9)**:
```javascript
const result = await producer.generateSocialGraphic(
  "Bold thumbnail: MADP Strategy Explained",
  "youtube"
);
```

### 2. Branding and Marketing

**Logo Design**:
```javascript
const logo = await producer.textToImage(
  "Modern minimalist logo for PL Capital featuring letters 'PL' in navy blue",
  { aspectRatio: "1:1" }
);
```

**Banner Graphics**:
```javascript
const banner = await producer.textToImage(
  "Professional hero banner for financial services website",
  { aspectRatio: "21:9" }
);
```

### 3. Product Visualization

**With Reference Images**:
```javascript
const productImage = await producer.loadImageFromFile('./product.png');

const showcase = await producer.composeImages(
  "Product showcase in modern lifestyle setting",
  [productImage.path],
  { aspectRatio: "16:9" }
);
```

### 4. Data Visualization

**Chart Animation Frames**:
```javascript
const startFrame = await producer.textToImage(
  "Financial chart showing portfolio at ₹50L",
  { aspectRatio: "16:9" }
);

const endFrame = await producer.textToImage(
  "Same chart showing growth to ₹2Cr",
  { aspectRatio: "16:9" }
);
```

### 5. Content Personalization

**Iterative Refinement**:
```javascript
const refined = await producer.refineImage(
  "Professional headshot of financial advisor",
  [
    "Adjust lighting to be warmer",
    "Add subtle office background blur",
    "Enhance professional appearance"
  ]
);
```

---

## Limitations

### Technical Limits

| Limit | Value | Notes |
|-------|-------|-------|
| **Max input images** | 3 | Per generation request |
| **Aspect ratios** | 10 options | See supported ratios above |
| **Output format** | PNG only | Base64-encoded |
| **Multiple outputs** | 1-4 images | Via `numberOfImages` parameter |
| **Image size** | ~1024px | Base dimension, varies by ratio |

### Content Restrictions

- Subject to Google's content policies
- SynthID watermarking cannot be disabled
- No explicit control over random seed
- Generated images include metadata tags

### API Quotas

**Check your quota**: https://ai.dev/usage?tab=rate-limit

**Typical limits**:
- Requests per minute (RPM)
- Requests per day (RPD)
- Image generations per day

---

## Best Practices

### 1. Prompt Engineering

**Good Prompts**:
```
✅ "Professional Indian financial advisor in business attire, modern office
   background with bookshelf, warm lighting, looking at camera with confident
   smile, corporate photography style, high quality 4K"
```

**Bad Prompts**:
```
❌ "Person in office"  (too vague)
❌ "Photo"             (no specifics)
```

**Prompt Structure**:
1. **Subject**: Who or what
2. **Details**: Specific characteristics
3. **Setting**: Environment and background
4. **Style**: Visual aesthetic
5. **Quality**: Resolution/rendering hints

### 2. Aspect Ratio Selection

**Platform-Specific**:
```javascript
const platforms = {
  "linkedin-post": "1:1",
  "instagram-feed": "1:1",
  "instagram-story": "9:16",
  "twitter-post": "16:9",
  "youtube-thumbnail": "16:9",
  "website-hero": "21:9",
  "blog-featured": "16:9"
};
```

### 3. Editing Workflow

**Incremental Changes**:
```javascript
// Step 1: Generate base
const base = await producer.textToImage("Professional logo design");

// Step 2: Refine colors
const colored = await producer.editImage(
  "Change colors to navy blue and gold",
  base.images[0].path
);

// Step 3: Add elements
const final = await producer.editImage(
  "Add tagline below logo: 'Smart Wealth Management'",
  colored.images[0].path
);
```

### 4. Composition Best Practices

**Balanced Input**:
```javascript
// Use similarly-sized reference images
const refs = [
  await producer.loadImageFromFile('./product-1024x1024.png'),
  await producer.loadImageFromFile('./logo-1024x1024.png'),
  await producer.loadImageFromFile('./background-1024x1024.png')
];

const composed = await producer.composeImages(
  "Create balanced composition",
  refs.map(r => r.path)
);
```

### 5. Error Handling

```javascript
try {
  const result = await producer.textToImage(prompt, config);
} catch (error) {
  if (error.message.includes('quota')) {
    console.error('Quota exceeded. Check: https://ai.dev/usage');
  } else if (error.message.includes('content policy')) {
    console.error('Content policy violation. Adjust prompt.');
  } else {
    console.error('Generation failed:', error.message);
  }
}
```

### 6. Optimization Tips

**Parallel Generation** (within quota):
```javascript
const [logo, banner, thumbnail] = await Promise.all([
  producer.textToImage("Logo design", { aspectRatio: "1:1" }),
  producer.textToImage("Hero banner", { aspectRatio: "21:9" }),
  producer.textToImage("Video thumbnail", { aspectRatio: "16:9" })
]);
```

**Reuse References**:
```javascript
// Load reference once
const brandImage = await producer.loadImageFromFile('./brand.png');

// Use in multiple generations
const social1 = await producer.composeImages("LinkedIn post", [brandImage.path]);
const social2 = await producer.composeImages("Twitter post", [brandImage.path]);
```

---

## Code Examples

### Complete Text-to-Image

```javascript
const NanoBananaProducer = require('./image/nano-banana-producer');

const producer = new NanoBananaProducer({
  apiKey: process.env.GEMINI_API_KEY
});

const result = await producer.textToImage(
  "Professional financial dashboard showing MADP portfolio performance with navy blue and gold color scheme",
  {
    aspectRatio: "16:9",
    numberOfImages: 1
  }
);

console.log(`Image saved: ${result.images[0].path}`);
```

### Complete Editing Workflow

```javascript
// Generate base
const base = await producer.textToImage(
  "Professional headshot of Indian financial advisor"
);

// Edit sequentially
const edits = [
  "Add text overlay: 'Rajesh Kumar, CFP'",
  "Adjust background blur",
  "Enhance professional lighting"
];

let current = base.images[0].path;
for (const edit of edits) {
  const result = await producer.editImage(edit, current);
  current = result.images[0].path;
}

console.log(`Final image: ${current}`);
```

### Complete Composition

```javascript
// Load multiple images
const images = await Promise.all([
  producer.loadImageFromFile('./person.png'),
  producer.loadImageFromFile('./product.png'),
  producer.loadImageFromFile('./logo.png')
]);

// Compose into collage
const result = await producer.composeImages(
  "Create professional LinkedIn banner with person on left, product center, logo right",
  images.map(img => img.path),
  { aspectRatio: "21:9" }
);
```

---

## Related Resources

- **Official Docs**: https://ai.google.dev/gemini-api/docs/image-generation
- **Quota Management**: https://ai.dev/usage?tab=rate-limit
- **API Key**: https://aistudio.google.com/apikey
- **Prompt Guide**: https://ai.google.dev/gemini-api/docs/prompting-strategies

---

**Last Updated**: 2025-01-15
**Version**: 1.0
**SDK Version**: @google/genai 1.29.1+
