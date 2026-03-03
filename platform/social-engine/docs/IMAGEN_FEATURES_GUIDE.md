# Nano Banana (Gemini Image Generation) Features Guide

Practical guide to all image generation capabilities with real-world examples and use cases.

**Official Docs**: https://ai.google.dev/gemini-api/docs/image-generation

---

## Table of Contents

1. [Feature Overview](#feature-overview)
2. [Text-to-Image Generation](#1-text-to-image-generation)
3. [Image Editing](#2-image-editing-with-text-prompts)
4. [Multi-Image Composition](#3-multi-image-composition)
5. [Iterative Refinement](#4-iterative-refinement)
6. [Style Transfer](#5-style-transfer)
7. [Social Media Graphics](#6-social-media-graphics)
8. [Production Workflows](#production-workflows)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)

---

## Feature Overview

### All Available Features

| Feature | Input | Output | Max Images | Use Case |
|---------|-------|--------|------------|----------|
| **Text-to-Image** | Text prompt | 1-4 images | - | Create from scratch |
| **Image Editing** | Text + 1 image | 1 edited image | 1 | Modify existing images |
| **Multi-Image Composition** | Text + 1-3 images | 1 composed image | 3 | Combine multiple images |
| **Iterative Refinement** | Initial prompt + N edits | N+1 images | - | Progressive enhancement |
| **Style Transfer** | Text + 1 image | 1 stylized image | 1 | Apply artistic styles |
| **Social Graphics** | Text + platform | Platform-optimized | - | Social media content |

### Feature Comparison

**When to Use Each**:

```
📝 Text-to-Image          → Create new images from descriptions
✏️ Image Editing          → Modify specific parts of existing images
🎨 Multi-Image Composition → Combine multiple images into one
🔄 Iterative Refinement   → Progressively improve an image
🖼️ Style Transfer         → Apply artistic styles
📱 Social Graphics        → Platform-optimized content
```

---

## 1. Text-to-Image Generation

### What It Does

Generates images from text descriptions with high fidelity, including accurate text rendering.

### When to Use

- Creating original artwork
- Generating product mockups
- Creating marketing materials
- Visualizing concepts
- Generating backgrounds/textures

### Code Example

```javascript
const producer = new NanoBananaProducer({
  apiKey: process.env.GEMINI_API_KEY
});

const result = await producer.textToImage(
  `Professional financial dashboard showing MADP portfolio performance.
   Modern UI with navy blue and gold color scheme. Charts displaying
   valuation and momentum metrics. Clean, corporate aesthetic with
   data visualization. High quality, 4K rendering.`,
  {
    aspectRatio: "16:9",
    numberOfImages: 1
  }
);

console.log(`Generated: ${result.images[0].path}`);
```

### Real-World Example: LinkedIn Post

```javascript
const linkedinPost = await producer.textToImage(
  `Professional infographic titled "5 Benefits of MADP Portfolio Strategy"
   with numbered list from 1 to 5. Navy blue and gold corporate colors.
   Modern, clean design with icons for each benefit. Professional typography.
   High contrast for readability. Square format optimized for LinkedIn feed.`,
  { aspectRatio: "1:1" }
);
```

### Tips

**Detailed Prompts Work Best**:
```javascript
// ✅ Good - Specific and detailed
"Professional Indian woman in navy blue business suit, modern office
 with glass windows, natural lighting, looking confidently at camera,
 corporate headshot style, high quality 4K, professional photography"

// ❌ Bad - Too vague
"Woman in office"
```

**Include Style Descriptors**:
- "Professional photography"
- "Cinematic quality"
- "Modern aesthetic"
- "Clean corporate design"
- "High resolution 4K"

---

## 2. Image Editing with Text Prompts

### What It Does

Modifies existing images using text instructions with semantic understanding.

### When to Use

- Adding text overlays
- Removing/adding objects
- Changing colors or styles
- Adjusting composition
- Making targeted improvements

### Code Example

```javascript
// First, generate or load a base image
const baseImage = await producer.textToImage(
  "Professional headshot of Indian financial advisor in business attire",
  { aspectRatio: "1:1" }
);

// Then edit it
const edited = await producer.editImage(
  "Add text overlay in lower third: 'Rajesh Kumar, CFP' in professional font",
  baseImage.images[0].path,
  { aspectRatio: "1:1" }
);

console.log(`Original: ${baseImage.images[0].path}`);
console.log(`Edited: ${edited.images[0].path}`);
```

### Real-World Example: Adding Branding

```javascript
// Load company logo
const logoImage = await producer.loadImageFromFile('./company-logo.png');

// Generate base image
const basePhoto = await producer.textToImage(
  "Modern office workspace with computer and coffee",
  { aspectRatio: "16:9" }
);

// Add logo watermark
const branded = await producer.editImage(
  "Add the company logo in the top right corner, semi-transparent, professional placement",
  basePhoto.images[0].path,
  { aspectRatio: "16:9" }
);
```

### Tips

**Be Specific About Edits**:
```javascript
// ✅ Good - Clear instructions
"Add blue circular border around the subject, 5px thickness"

// ❌ Bad - Unclear
"Make it look better"
```

**Sequential Editing**:
```javascript
let current = baseImage.images[0].path;

const edits = [
  "Brighten the background by 20%",
  "Add subtle text: 'Trusted Since 2010' at the bottom",
  "Apply slight vignette effect"
];

for (const edit of edits) {
  const result = await producer.editImage(edit, current);
  current = result.images[0].path;
}
```

---

## 3. Multi-Image Composition

### What It Does

Combines multiple images (up to 3) into a single composed image using AI guidance.

### When to Use

- Creating collages
- Combining brand elements
- Building composite scenes
- Creating before/after comparisons
- Assembling marketing materials

### Code Example

```javascript
// Generate three separate images
const img1 = await producer.textToImage(
  "Professional Indian businessman portrait, left third composition",
  { aspectRatio: "1:1" }
);

const img2 = await producer.textToImage(
  "Modern office with financial charts, center composition",
  { aspectRatio: "1:1" }
);

const img3 = await producer.textToImage(
  "Rising graph showing portfolio growth, right third composition",
  { aspectRatio: "1:1" }
);

// Compose them into a LinkedIn banner
const composed = await producer.composeImages(
  "Create a professional LinkedIn banner combining these three images in a triptych layout",
  [
    img1.images[0].path,
    img2.images[0].path,
    img3.images[0].path
  ],
  { aspectRatio: "21:9" }
);

console.log(`Composed banner: ${composed.images[0].path}`);
```

### Real-World Example: Product Showcase

```javascript
// Load product images
const product = await producer.loadImageFromFile('./product-main.png');
const detail1 = await producer.loadImageFromFile('./product-detail1.png');
const detail2 = await producer.loadImageFromFile('./product-detail2.png');

// Create showcase composition
const showcase = await producer.composeImages(
  `Create e-commerce product showcase with main product image in center (70% of space),
   and two detail images on the right side stacked vertically (30% of space).
   Clean white background, professional product photography style.`,
  [product.path, detail1.path, detail2.path],
  { aspectRatio: "16:9" }
);
```

### Tips

**Balance Image Sizes**:
```javascript
// Load and resize to similar dimensions before composing
const images = await Promise.all([
  producer.loadImageFromFile('./image1-1024x1024.png'),
  producer.loadImageFromFile('./image2-1024x1024.png'),
  producer.loadImageFromFile('./image3-1024x1024.png')
]);
```

**Clear Layout Instructions**:
```javascript
// ✅ Good - Specific layout
"Place image 1 on left (40%), image 2 top right (30%), image 3 bottom right (30%)"

// ❌ Bad - Vague
"Put them together nicely"
```

---

## 4. Iterative Refinement

### What It Does

Progressively refines an image through multiple editing iterations, maintaining context.

### When to Use

- Logo design evolution
- Perfecting compositions
- A/B testing variations
- Client feedback iterations
- Progressive enhancement

### Code Example

```javascript
const refined = await producer.refineImage(
  // Initial prompt
  "Modern minimalist logo for PL Capital featuring letters 'PL' in navy blue",

  // Refinement prompts (applied sequentially)
  [
    "Add a subtle gold gradient effect to the letters",
    "Make the font more bold and impactful",
    "Add a thin circular border around the logo in gold",
    "Place tagline below: 'Smart Wealth Management' in small professional font"
  ],

  { aspectRatio: "1:1" }
);

console.log(`Total iterations: ${refined.iterations.length}`);
refined.iterations.forEach((iter, i) => {
  console.log(`${i + 1}. ${iter.type}: ${iter.images[0].path}`);
});
console.log(`Final: ${refined.finalImage}`);
```

### Real-World Example: Logo Design Process

```javascript
const logoEvolution = await producer.refineImage(
  // Version 1: Basic concept
  "Simple letter 'P' logo in navy blue, minimalist design",

  // Iterative improvements
  [
    // Version 2: Add color
    "Add gold accent to create two-tone effect",

    // Version 3: Refine shape
    "Make the letter more geometric and bold",

    // Version 4: Add depth
    "Add subtle 3D effect with light shadow",

    // Version 5: Add context
    "Place on white background with circular badge shape",

    // Version 6: Finalize
    "Add company name 'PL Capital' below in professional serif font"
  ],

  { aspectRatio: "1:1" }
);

// Save each iteration for client review
logoEvolution.iterations.forEach((iter, i) => {
  console.log(`Version ${i + 1}: ${iter.images[0].path}`);
});
```

### Tips

**Incremental Changes**:
```javascript
// ✅ Good - One change per iteration
[
  "Adjust color to warmer tone",
  "Increase contrast by 15%",
  "Add subtle texture overlay"
]

// ❌ Bad - Multiple changes at once
[
  "Change color, add texture, adjust lighting, and modify composition"
]
```

**Save Intermediate Versions**:
```javascript
const versions = [];
for (const iteration of refined.iterations) {
  versions.push({
    version: iteration.iteration,
    path: iteration.images[0].path,
    prompt: iteration.prompt
  });
}

// Can rollback to any version
console.log('Available versions:', versions);
```

---

## 5. Style Transfer

### What It Does

Applies artistic or photographic styles to existing images while preserving content.

### When to Use

- Artistic transformations
- Brand consistency
- Creative variations
- Stylized marketing materials
- Photo-to-illustration conversion

### Code Example

```javascript
// Generate realistic base image
const realistic = await producer.textToImage(
  "Modern office building photograph, professional architectural shot",
  { aspectRatio: "4:3" }
);

// Apply artistic style
const stylized = await producer.applyStyle(
  realistic.images[0].path,
  "Transform into watercolor painting style with soft brushstrokes and pastel colors",
  { aspectRatio: "4:3" }
);

console.log(`Original: ${realistic.images[0].path}`);
console.log(`Stylized: ${stylized.images[0].path}`);
```

### Real-World Example: Content Variations

```javascript
// Start with one professional photo
const basePhoto = await producer.loadImageFromFile('./professional-photo.png');

// Create multiple style variations for different uses
const styles = [
  {
    name: "corporate",
    instruction: "Apply professional corporate style, clean and crisp"
  },
  {
    name: "artistic",
    instruction: "Transform into artistic illustration with bold colors"
  },
  {
    name: "vintage",
    instruction: "Apply vintage photograph style with sepia tones"
  },
  {
    name: "modern",
    instruction: "Apply modern minimalist style with high contrast"
  }
];

const variations = await Promise.all(
  styles.map(async (style) => {
    const result = await producer.applyStyle(
      basePhoto.path,
      style.instruction
    );
    return { name: style.name, path: result.images[0].path };
  })
);

console.log('Style variations:', variations);
```

### Tips

**Describe Target Style Clearly**:
```javascript
// ✅ Good - Specific style description
"Transform into Van Gogh's Starry Night painting style with swirling brushstrokes and vibrant blues and yellows"

// ❌ Bad - Vague
"Make it look artistic"
```

**Maintain Content Context**:
```javascript
// ✅ Good - Preserves subject
"Apply watercolor style while keeping the subject clearly recognizable"

// ❌ Bad - May lose subject
"Make it abstract art"
```

---

## 6. Social Media Graphics

### What It Does

Generates platform-optimized images with correct aspect ratios and sizes for social media.

### When to Use

- LinkedIn posts and banners
- Instagram feed and stories
- Twitter/X posts
- Facebook posts
- YouTube thumbnails

### Code Example

```javascript
// LinkedIn Post (1:1)
const linkedinPost = await producer.generateSocialGraphic(
  `Professional infographic: "5 Benefits of MADP Portfolio Strategy"
   with numbered list, corporate colors (navy blue, gold), modern design,
   PL Capital branding, clean layout`,
  "linkedin"
);

// Instagram Story (9:16)
const instaStory = await producer.generateSocialGraphic(
  `Vertical format success story: Client testimonial with portfolio growth
   from ₹50L to ₹2Cr, modern gradient background, quote marks, professional
   typography, mobile-optimized design`,
  "instagram-story"
);

// YouTube Thumbnail (16:9)
const youtubeThumbnail = await producer.generateSocialGraphic(
  `Bold YouTube thumbnail: "MADP Strategy Explained" in large text,
   professional advisor image on left, financial charts on right,
   high contrast colors, click-worthy design`,
  "youtube"
);

console.log(`LinkedIn: ${linkedinPost.images[0].path}`);
console.log(`Instagram: ${instaStory.images[0].path}`);
console.log(`YouTube: ${youtubeThumbnail.images[0].path}`);
```

### Platform Specifications

| Platform | Type | Aspect Ratio | Optimized Size |
|----------|------|--------------|----------------|
| LinkedIn | Post | 1:1 | 1200x1200 |
| LinkedIn | Banner | 21:9 | ~1584x677 |
| Instagram | Feed | 1:1 | 1080x1080 |
| Instagram | Story | 9:16 | 1080x1920 |
| Twitter/X | Post | 16:9 | 1200x675 |
| Facebook | Post | 1:1 | 1200x1200 |
| YouTube | Thumbnail | 16:9 | 1280x720 |

### Real-World Example: Complete Campaign

```javascript
const campaign = {
  theme: "MADP Portfolio Launch",
  platforms: []
};

// LinkedIn announcement
const linkedin = await producer.generateSocialGraphic(
  `Professional announcement graphic: "Introducing MADP Portfolio Strategy"
   with corporate branding, navy blue and gold, modern design, key features
   listed: Valuation, Momentum, Protection. Clean corporate aesthetic.`,
  "linkedin"
);
campaign.platforms.push({ platform: "LinkedIn", path: linkedin.images[0].path });

// Instagram carousel slide
const instagram = await producer.generateSocialGraphic(
  `Instagram-optimized carousel slide: "Why MADP Works" with bold headline,
   3 key statistics, modern gradient background, mobile-friendly text size`,
  "instagram"
);
campaign.platforms.push({ platform: "Instagram", path: instagram.images[0].path });

// YouTube video thumbnail
const youtube = await producer.generateSocialGraphic(
  `Eye-catching YouTube thumbnail: "MADP Strategy Explained in 5 Minutes"
   Large bold text, professional advisor image, chart graphics, high contrast,
   click-worthy design with curiosity hook`,
  "youtube"
);
campaign.platforms.push({ platform: "YouTube", path: youtube.images[0].path });

console.log('Campaign graphics ready:', campaign);
```

### Tips

**Platform-Specific Design**:
```javascript
// LinkedIn - Professional and corporate
"Clean corporate design, professional colors, business-focused messaging"

// Instagram - Visual and engaging
"Bold colors, gradient backgrounds, eye-catching design, mobile-optimized"

// YouTube - High contrast and bold
"Large text, high contrast, attention-grabbing, clickable thumbnail style"
```

**Text Readability**:
```javascript
// ✅ Good - Clear hierarchy
"Large headline at top: 'MADP Strategy', smaller subtext: 'Portfolio Growth Made Simple'"

// ❌ Bad - Too much text
"[Entire paragraph of small text]"
```

---

## Production Workflows

### Workflow 1: Complete Brand Kit

```javascript
async function createBrandKit(brandName, colors) {
  const kit = {};

  // 1. Logo
  kit.logo = await producer.textToImage(
    `Modern professional logo for ${brandName} with ${colors} color scheme`,
    { aspectRatio: "1:1" }
  );

  // 2. Business card mockup
  kit.businessCard = await producer.textToImage(
    `Professional business card design for ${brandName}, ${colors} colors, minimalist layout`,
    { aspectRatio: "3:2" }
  );

  // 3. Letterhead
  kit.letterhead = await producer.textToImage(
    `Professional letterhead design with ${brandName} branding, ${colors} accent`,
    { aspectRatio: "2:3" }
  );

  // 4. Social media profile
  kit.profile = await producer.generateSocialGraphic(
    `Professional profile image for ${brandName}, ${colors} branding`,
    "linkedin"
  );

  // 5. Cover banner
  kit.banner = await producer.textToImage(
    `Modern banner design for ${brandName}, ${colors} color scheme, professional aesthetic`,
    { aspectRatio: "21:9" }
  );

  return kit;
}

const brandKit = await createBrandKit("PL Capital", "navy blue and gold");
```

### Workflow 2: Social Media Content Calendar

```javascript
async function generateWeeklyContent(topic, platforms) {
  const content = [];

  for (const platform of platforms) {
    const post = await producer.generateSocialGraphic(
      `${topic} - educational post for ${platform}, engaging design, clear messaging`,
      platform
    );

    content.push({
      platform: platform,
      topic: topic,
      image: post.images[0].path,
      optimizedFor: post.optimizedFor
    });
  }

  return content;
}

const weeklyContent = await generateWeeklyContent(
  "5 Benefits of Diversification",
  ["linkedin", "instagram", "youtube"]
);
```

### Workflow 3: Product Launch Campaign

```javascript
async function createProductLaunch(productName, productImage) {
  const campaign = {};

  // Hero banner
  campaign.hero = await producer.composeImages(
    `Professional hero banner featuring ${productName}, modern design`,
    [productImage],
    { aspectRatio: "21:9" }
  );

  // Feature highlights
  campaign.features = await producer.textToImage(
    `Infographic showing ${productName} key features, numbered list, modern design`,
    { aspectRatio: "16:9" }
  );

  // Social proof
  campaign.testimonial = await producer.textToImage(
    `Client testimonial card for ${productName}, 5-star rating, professional design`,
    { aspectRatio: "1:1" }
  );

  // Call-to-action
  campaign.cta = await producer.textToImage(
    `Bold CTA graphic: "Try ${productName} Today", button design, compelling copy`,
    { aspectRatio: "16:9" }
  );

  return campaign;
}
```

---

## Best Practices

### 1. Prompt Writing

**Structure Your Prompts**:
```
[SUBJECT] + [ACTION/STATE] + [SETTING] + [STYLE] + [QUALITY]

Example:
"Professional financial advisor (SUBJECT)
 explaining charts to camera (ACTION)
 in modern office with bookshelf background (SETTING)
 corporate photography style (STYLE)
 high quality 4K professional photography (QUALITY)"
```

### 2. Iterative Development

**Start Simple, Refine Progressively**:
```javascript
// Version 1: Basic concept
const v1 = await producer.textToImage("Simple logo design");

// Version 2: Add details
const v2 = await producer.editImage("Add color scheme", v1.images[0].path);

// Version 3: Finalize
const v3 = await producer.editImage("Add finishing touches", v2.images[0].path);
```

### 3. Consistency

**Use Reference Images**:
```javascript
// Generate once, reuse as reference
const brandStyle = await producer.textToImage("Brand style example");

// Use in multiple generations
const social1 = await producer.composeImages(
  "Apply same style to new content",
  [brandStyle.images[0].path, newContent.path]
);
```

### 4. Quality Control

**Test Multiple Variations**:
```javascript
const variations = await Promise.all([
  producer.textToImage(prompt, { aspectRatio: "16:9" }),
  producer.textToImage(prompt, { aspectRatio: "1:1" }),
  producer.textToImage(promptVariation, { aspectRatio: "16:9" })
]);

// Compare and select best
```

---

## Troubleshooting

### Issue 1: Generated Image Quality Poor

**Solution**: Enhance prompt with quality descriptors
```javascript
// Add quality keywords
const enhanced = await producer.textToImage(
  originalPrompt + ", high quality, 4K resolution, professional photography, sharp details",
  config
);
```

### Issue 2: Text Not Rendering Correctly

**Solution**: Be specific about text placement and style
```javascript
// ✅ Good
"Add text 'Company Name' in center, large bold sans-serif font, navy blue color"

// ❌ Bad
"Add some text"
```

### Issue 3: Composition Not As Expected

**Solution**: Provide precise layout instructions
```javascript
// Use percentages and positions
"Image 1 occupies left 60%, image 2 occupies right 40%, images 3-4 split right quadrants"
```

### Issue 4: Style Not Consistent

**Solution**: Use reference images and detailed style descriptions
```javascript
const reference = await producer.textToImage("Create style reference");

// Use reference in subsequent generations
const consistent = await producer.composeImages(
  "Apply same style as reference image",
  [reference.images[0].path, newImage.path]
);
```

### Issue 5: Quota Exceeded

**Solution**: Check quota and implement caching
```javascript
// Check quota: https://ai.dev/usage?tab=rate-limit

// Implement simple cache
const cache = new Map();

async function getCachedImage(prompt, config) {
  const key = JSON.stringify({ prompt, config });
  if (cache.has(key)) {
    return cache.get(key);
  }

  const result = await producer.textToImage(prompt, config);
  cache.set(key, result);
  return result;
}
```

---

## Related Resources

- **API Reference**: `docs/IMAGEN_API_REFERENCE.md`
- **Code Examples**: `examples/nano-banana-examples.js`
- **Producer Class**: `image/nano-banana-producer.js`
- **Official Docs**: https://ai.google.dev/gemini-api/docs/image-generation

---

**Last Updated**: 2025-01-15
**Version**: 1.0
**SDK**: @google/genai 1.29.1+
