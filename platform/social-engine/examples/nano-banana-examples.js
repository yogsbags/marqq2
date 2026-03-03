/**
 * Nano Banana (Gemini 2.5 Flash Image) Examples
 *
 * Demonstrates all image generation capabilities:
 * 1. Text-to-Image Generation
 * 2. Image Editing
 * 3. Multi-Image Composition
 * 4. Iterative Refinement
 * 5. Style Transfer
 * 6. Social Media Graphics
 */

const NanoBananaProducer = require('../image/nano-banana-producer');

async function main() {
  // Initialize producer
  const producer = new NanoBananaProducer({
    apiKey: process.env.GEMINI_API_KEY
  });

  console.log('🎨 Nano Banana - Image Generation Demo\n');

  // ============================================
  // 1. TEXT-TO-IMAGE GENERATION
  // ============================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Example 1: Text-to-Image Generation');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const textToImage = await producer.textToImage(
      `Professional financial dashboard showing MADP portfolio performance.
       Modern UI with navy blue and gold color scheme. Charts displaying
       valuation and momentum metrics. Clean, corporate aesthetic with
       data visualization. High quality, 4K rendering.`,
      {
        aspectRatio: "16:9"
      }
    );

    console.log('\n✅ Text-to-Image Result:');
    console.log(`   Images: ${textToImage.images.length}`);
    textToImage.images.forEach((img, i) => {
      console.log(`   ${i + 1}. ${img.path} (${(img.size / 1024).toFixed(2)} KB)`);
    });
  } catch (error) {
    console.error(`❌ Text-to-Image Error: ${error.message}\n`);
  }

  // ============================================
  // 2. IMAGE EDITING
  // ============================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Example 2: Image Editing');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // First generate a base image
    console.log('Generating base image...');
    const baseImage = await producer.textToImage(
      "Professional headshot of Indian financial advisor in business attire, office background",
      { aspectRatio: "1:1" }
    );

    console.log('✅ Base image created\n');

    // Then edit it
    console.log('Editing image...');
    const edited = await producer.editImage(
      "Add subtle text overlay in lower third: 'Rajesh Kumar, CFP' in professional font",
      baseImage.images[0].path,
      { aspectRatio: "1:1" }
    );

    console.log('\n✅ Image Editing Result:');
    console.log(`   Original: ${baseImage.images[0].path}`);
    console.log(`   Edited: ${edited.images[0].path}`);
  } catch (error) {
    console.error(`❌ Image Editing Error: ${error.message}\n`);
  }

  // ============================================
  // 3. MULTI-IMAGE COMPOSITION
  // ============================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Example 3: Multi-Image Composition');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Generate three images to compose
    console.log('Generating images to compose...');

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

    console.log('✅ Individual images created\n');

    // Compose them
    console.log('Composing images into collage...');
    const composed = await producer.composeImages(
      "Create a professional LinkedIn banner combining these three images in a triptych layout",
      [
        img1.images[0].path,
        img2.images[0].path,
        img3.images[0].path
      ],
      { aspectRatio: "21:9" } // Ultra-wide for LinkedIn banner
    );

    console.log('\n✅ Multi-Image Composition Result:');
    console.log(`   Input Images: ${composed.inputImageCount}`);
    console.log(`   Composed: ${composed.images[0].path}`);
  } catch (error) {
    console.error(`❌ Composition Error: ${error.message}\n`);
  }

  // ============================================
  // 4. ITERATIVE REFINEMENT
  // ============================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Example 4: Iterative Refinement');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const refined = await producer.refineImage(
      // Initial prompt
      "Modern minimalist logo for PL Capital featuring letters 'PL' in navy blue",

      // Refinement prompts
      [
        "Add a subtle gold gradient effect to the letters",
        "Make the font more bold and impactful",
        "Add a thin circular border around the logo in gold",
        "Place tagline below: 'Smart Wealth Management' in small professional font"
      ],

      { aspectRatio: "1:1" }
    );

    console.log('\n✅ Iterative Refinement Result:');
    console.log(`   Total Iterations: ${refined.iterations.length}`);
    refined.iterations.forEach((iter, i) => {
      console.log(`   ${i + 1}. ${iter.type}: ${iter.prompt.substring(0, 50)}...`);
      console.log(`      Image: ${iter.images[0].path}`);
    });
    console.log(`\n   Final: ${refined.finalImage}`);
  } catch (error) {
    console.error(`❌ Refinement Error: ${error.message}\n`);
  }

  // ============================================
  // 5. STYLE TRANSFER
  // ============================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Example 5: Style Transfer');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Generate a photo-realistic image first
    console.log('Generating realistic base image...');
    const realistic = await producer.textToImage(
      "Modern office building photograph, professional architectural shot",
      { aspectRatio: "4:3" }
    );

    console.log('✅ Realistic image created\n');

    // Apply artistic style
    console.log('Applying artistic style...');
    const stylized = await producer.applyStyle(
      realistic.images[0].path,
      "Transform into watercolor painting style with soft brushstrokes and pastel colors",
      { aspectRatio: "4:3" }
    );

    console.log('\n✅ Style Transfer Result:');
    console.log(`   Original: ${realistic.images[0].path}`);
    console.log(`   Stylized: ${stylized.images[0].path}`);
    console.log(`   Style: ${stylized.styleDescription}`);
  } catch (error) {
    console.error(`❌ Style Transfer Error: ${error.message}\n`);
  }

  // ============================================
  // 6. SOCIAL MEDIA GRAPHICS
  // ============================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Example 6: Social Media Graphics');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // LinkedIn Post
    console.log('Generating LinkedIn post graphic...');
    const linkedinPost = await producer.generateSocialGraphic(
      `Professional infographic: "5 Benefits of MADP Portfolio Strategy"
       with numbered list, corporate colors (navy blue, gold), modern design,
       PL Capital branding, clean layout`,
      "linkedin"
    );

    console.log(`✅ LinkedIn (${linkedinPost.optimizedFor}): ${linkedinPost.images[0].path}\n`);

    // Instagram Story
    console.log('Generating Instagram story graphic...');
    const instaStory = await producer.generateSocialGraphic(
      `Vertical format success story: Client testimonial with portfolio growth
       from ₹50L to ₹2Cr, modern gradient background, quote marks, professional
       typography, mobile-optimized design`,
      "instagram-story"
    );

    console.log(`✅ Instagram Story (${instaStory.optimizedFor}): ${instaStory.images[0].path}\n`);

    // YouTube Thumbnail
    console.log('Generating YouTube thumbnail...');
    const youtubeThumbnail = await producer.generateSocialGraphic(
      `Bold YouTube thumbnail: "MADP Strategy Explained" in large text,
       professional advisor image on left, financial charts on right,
       high contrast colors, click-worthy design, 16:9 format`,
      "youtube"
    );

    console.log(`✅ YouTube (${youtubeThumbnail.optimizedFor}): ${youtubeThumbnail.images[0].path}\n`);

  } catch (error) {
    console.error(`❌ Social Graphics Error: ${error.message}\n`);
  }

  // ============================================
  // 7. CAMPAIGN GRAPHICS WORKFLOW
  // ============================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Example 7: Complete Campaign Graphics');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    console.log('Creating complete campaign graphics set...\n');

    const campaign = {
      theme: "MADP Portfolio Launch Campaign",
      images: []
    };

    // Hero Image
    console.log('1. Hero Banner...');
    const hero = await producer.textToImage(
      `Professional hero banner: Modern financial dashboard with MADP branding,
       premium aesthetic, navy blue and gold colors, data visualizations,
       confident and trustworthy feel`,
      { aspectRatio: "21:9" }
    );
    campaign.images.push({ type: "hero", path: hero.images[0].path });

    // Feature Highlights (3 images)
    console.log('2. Feature Highlights...');
    const features = await producer.textToImage(
      `Three panel infographic showing: 1) Valuation analysis 2) Momentum indicators
       3) Portfolio protection. Modern icons, clean layout, professional colors`,
      { aspectRatio: "16:9" }
    );
    campaign.images.push({ type: "features", path: features.images[0].path });

    // Social Proof
    console.log('3. Social Proof...');
    const testimonial = await producer.textToImage(
      `Client testimonial card: Professional headshot placeholder, 5-star rating,
       quote marks, growth statistics (₹50L → ₹2Cr), modern design`,
      { aspectRatio: "1:1" }
    );
    campaign.images.push({ type: "testimonial", path: testimonial.images[0].path });

    // Call-to-Action
    console.log('4. Call-to-Action...');
    const cta = await producer.textToImage(
      `Bold CTA graphic: "Start Your MADP Journey Today" in large text,
       "Book Free Consultation" button, contact details, premium design`,
      { aspectRatio: "16:9" }
    );
    campaign.images.push({ type: "cta", path: cta.images[0].path });

    console.log('\n✅ Campaign Graphics Complete:');
    campaign.images.forEach((img, i) => {
      console.log(`   ${i + 1}. ${img.type}: ${img.path}`);
    });

  } catch (error) {
    console.error(`❌ Campaign Graphics Error: ${error.message}\n`);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 All Examples Complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// ============================================
// SIMULATION MODE (FOR TESTING WITHOUT API)
// ============================================
async function simulationDemo() {
  const producer = new NanoBananaProducer({
    simulate: true // No API calls, instant results
  });

  console.log('🔄 SIMULATION MODE - No API calls made\n');

  const result = await producer.textToImage(
    "Test prompt for simulation",
    { aspectRatio: "16:9" }
  );

  console.log('✅ Simulated Result:');
  console.log(JSON.stringify(result, null, 2));
}

// ============================================
// RUN EXAMPLES
// ============================================

// Check if API key is set
if (!process.env.GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY not set');
  console.log('\nSet your API key:');
  console.log('  export GEMINI_API_KEY="your-key-here"');
  console.log('\nOr run in simulation mode:');
  console.log('  node examples/nano-banana-examples.js --simulate\n');
  process.exit(1);
}

// Run simulation or real examples
if (process.argv.includes('--simulate')) {
  simulationDemo().catch(console.error);
} else {
  main().catch(console.error);
}
