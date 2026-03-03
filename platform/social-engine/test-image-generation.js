/**
 * Test Image Generation - MADP Campaign
 *
 * Tests the ImageGenerator with Gemini 3 Pro Image Preview (Primary)
 * Features: Native 4K generation, Google Search grounding, text rendering
 * Fallback: Gemini 2.5 Flash Image for simpler/faster tasks
 *
 * Prompts optimized for the MADP social media campaign
 */

const ImageGenerator = require('./image/image-generator.js');
const fs = require('fs').promises;
const path = require('path');

// MADP Campaign Image Prompts
const testPrompts = [
  {
    name: "financial-comparison-chart",
    prompt: "Professional financial comparison infographic showing three investment options side by side: MADP at 14.5% returns (highlighted in vibrant green), Fixed Deposits at 6.5% (navy blue), and Mutual Funds at 11% (orange). Clean modern corporate design with clear bar charts, professional typography, trust-building aesthetic. White background with subtle gradient. Include percentage labels and category names. Photorealistic business graphics style.",
    config: {
      aspectRatio: "16:9"
    },
    platform: null
  },
  {
    name: "linkedin-post-returns",
    prompt: "Eye-catching LinkedIn post graphic featuring bold text '14.5% Returns with MADP' in large professional font. Modern gradient background transitioning from deep navy blue to teal. Include subtle financial growth chart pattern in background. Clean, corporate aesthetic with PL Capital branding elements. High contrast, business professional style with geometric accent shapes.",
    config: {
      aspectRatio: "1:1"
    },
    platform: "linkedin"
  },
  {
    name: "instagram-story-testimonial",
    prompt: "Mobile-optimized Instagram story template with text overlay 'Why I chose MADP over Fixed Deposits' at the top in bold sans-serif font. Background showing abstract financial growth visualization with upward trending lines in gradient green and blue. Space for testimonial quote in the middle. Modern, vibrant, social media aesthetic with rounded corners and contemporary design elements.",
    config: {
      aspectRatio: "9:16"
    },
    platform: "instagram-story"
  },
  {
    name: "trust-badge-certificate",
    prompt: "Professional certificate-style badge graphic showing 'MADP - Trusted by 50,000+ Investors'. Elegant border design with gold accents, shield emblem in center, corporate navy blue background. Include trust symbols like checkmarks and laurel wreaths. Formal, prestigious aesthetic with high-end corporate styling. Photorealistic rendering with subtle shadows and depth.",
    config: {
      aspectRatio: "1:1"
    },
    platform: "facebook"
  },
  {
    name: "data-visualization-growth",
    prompt: "Sophisticated 3D data visualization showing investment growth over 5 years with MADP. Multiple ascending bar columns in metallic green gradient, floating on dark background with blue ambient lighting. Include axis labels and percentage growth indicators. Modern tech aesthetic with glass morphism effects, realistic lighting and reflections. Professional financial dashboard style.",
    config: {
      aspectRatio: "16:9"
    },
    platform: "youtube"
  },
  {
    name: "comparison-table-infographic",
    prompt: "Clean comparison table infographic with three columns comparing MADP, Fixed Deposits, and Mutual Funds. Rows showing: Returns (14.5%, 6.5%, 11%), Risk Level (Low, Low, Medium), Liquidity (High, Medium, Medium), Tax Benefits (Yes, No, Partial). Color-coded with green checkmarks for advantages, professional table design, corporate blue header. Modern infographic style with icons and clear typography.",
    config: {
      aspectRatio: "1:1"
    },
    platform: "linkedin"
  }
];

async function testImageGeneration() {
  console.log('🎨 Image Generation Test - MADP Campaign\n');
  console.log('=' .repeat(60));

  // Check for API key
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ Error: GEMINI_API_KEY environment variable not set');
    console.log('\nSet it with:');
    console.log('export GEMINI_API_KEY="your-api-key-here"\n');
    return;
  }

  const generator = new ImageGenerator({
    apiKey: process.env.GEMINI_API_KEY,
    simulate: false  // Set to true to test without API calls
  });

  const results = [];
  const outputDir = path.join(__dirname, 'output', 'test-images');

  // Create output directory
  try {
    await fs.mkdir(outputDir, { recursive: true });
    console.log(`📁 Output directory: ${outputDir}\n`);
  } catch (error) {
    console.error('Error creating output directory:', error.message);
  }

  // Test each prompt
  for (let i = 0; i < testPrompts.length; i++) {
    const test = testPrompts[i];
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Test ${i + 1}/${testPrompts.length}: ${test.name}`);
    console.log('='.repeat(60));

    try {
      console.log(`\n📝 Prompt: ${test.prompt.substring(0, 100)}...`);
      console.log(`⚙️  Config: ${JSON.stringify(test.config)}`);
      if (test.platform) {
        console.log(`📱 Platform: ${test.platform.toUpperCase()}`);
      }
      console.log('\n⏳ Generating image (this may take 10-30 seconds)...\n');

      const startTime = Date.now();

      // Use platform-specific generation if specified
      const result = test.platform
        ? await generator.generateSocialGraphic(test.prompt, test.platform, test.config)
        : await generator.textToImage(test.prompt, test.config);

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log(`\n✅ Success! Generated in ${duration}s`);
      console.log(`   Images: ${result.images.length}`);

      result.images.forEach((img, idx) => {
        console.log(`   Image ${idx + 1}: ${img.path}`);
        console.log(`   Size: ${(img.size / 1024).toFixed(1)} KB`);
      });

      results.push({
        name: test.name,
        success: true,
        result: result,
        generationTime: duration
      });

      // Copy to organized output location
      for (let imgIdx = 0; imgIdx < result.images.length; imgIdx++) {
        const img = result.images[imgIdx];
        const ext = path.extname(img.path);
        const outputPath = path.join(outputDir, `${test.name}-${imgIdx}${ext}`);

        try {
          await fs.copyFile(img.path, outputPath);
          console.log(`   📥 Copied to: ${outputPath}`);
        } catch (copyError) {
          console.log(`   ⚠️  Could not copy file: ${copyError.message}`);
        }
      }

    } catch (error) {
      console.error(`\n❌ Error: ${error.message}`);

      if (error.message.includes('quota')) {
        console.log('\n⚠️  API quota exceeded. Wait a few minutes and try again.');
      } else if (error.message.includes('authentication') || error.message.includes('API key')) {
        console.log('\n⚠️  Check your GEMINI_API_KEY is valid.');
      } else if (error.message.includes('aspect')) {
        console.log('\n⚠️  Invalid aspect ratio. Check supported ratios.');
      }

      results.push({
        name: test.name,
        success: false,
        error: error.message
      });
    }

    // Wait between requests to avoid rate limiting
    if (i < testPrompts.length - 1) {
      console.log('\n⏸️  Waiting 5 seconds before next test...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60));

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`\n✅ Successful: ${successful}/${results.length}`);
  console.log(`❌ Failed: ${failed}/${results.length}`);

  if (successful > 0) {
    console.log('\n🎨 Generated Images:');
    results.filter(r => r.success).forEach(r => {
      const imageCount = r.result.images.length;
      const totalSize = r.result.images.reduce((sum, img) => sum + img.size, 0);
      console.log(`   - ${r.name}: ${imageCount} image(s), ${(totalSize / 1024).toFixed(1)} KB (${r.generationTime}s)`);
    });

    console.log(`\n📂 All images saved to: ${outputDir}`);
  }

  if (failed > 0) {
    console.log('\n❌ Failed Tests:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`   - ${r.name}: ${r.error}`);
    });
  }

  // Calculate statistics
  if (successful > 0) {
    const avgTime = results
      .filter(r => r.success)
      .reduce((sum, r) => sum + parseFloat(r.generationTime), 0) / successful;

    console.log('\n📈 Statistics:');
    console.log(`   Average generation time: ${avgTime.toFixed(1)}s`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✨ Test complete!\n');
}

// Test advanced features (optional)
async function testAdvancedFeatures() {
  console.log('\n' + '='.repeat(60));
  console.log('🔬 Testing Advanced Features');
  console.log('='.repeat(60));

  const generator = new ImageGenerator({
    apiKey: process.env.GEMINI_API_KEY
  });

  const outputDir = path.join(__dirname, 'output', 'test-images', 'advanced');
  await fs.mkdir(outputDir, { recursive: true });

  try {
    // Test 1: Iterative Refinement
    console.log('\n📐 Test: Iterative Image Refinement');
    const refinement = await generator.refineImage(
      "Create a modern logo for MADP featuring growth arrow and financial symbols",
      [
        "Make the colors more vibrant with green and navy blue",
        "Add a subtle gradient background",
        "Increase the size of the main text 'MADP'"
      ],
      { aspectRatio: "1:1" }
    );

    console.log(`✅ Refinement complete: ${refinement.iterations.length} iterations`);

    // Test 2: Multi-Platform Generation
    console.log('\n📱 Test: Multi-Platform Generation');
    const platforms = ['linkedin', 'instagram-story', 'youtube'];
    const basePrompt = "MADP investment returns growing steadily, professional financial graphics with 14.5% highlighted";

    for (const platform of platforms) {
      const result = await generator.generateSocialGraphic(basePrompt, platform);
      console.log(`   ✅ ${platform.toUpperCase()}: ${result.images[0].path}`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

  } catch (error) {
    console.error(`❌ Advanced test error: ${error.message}`);
  }
}

// Test Gemini 3 Pro Image Preview specific features
async function testGemini3ProFeatures() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 Testing Gemini 3 Pro Image Preview Features');
  console.log('='.repeat(60));

  const generator = new ImageGenerator({
    apiKey: process.env.GEMINI_API_KEY
  });

  const outputDir = path.join(__dirname, 'output', 'test-images', 'gemini3-pro');
  await fs.mkdir(outputDir, { recursive: true });

  try {
    // Test 1: 4K Image Generation
    console.log('\n🖼️  Test 1: 4K Image Generation');
    const result4K = await generator.generate4KImage(
      "Professional financial dashboard showing MADP portfolio performance with 14.5% returns highlighted in green. Clean modern UI design with charts and graphs.",
      { aspectRatio: "16:9" }
    );
    console.log(`   ✅ 4K Image generated: ${result4K.images[0]?.path || 'simulated'}`);
    console.log(`   Features: ${result4K.features?.join(', ') || 'N/A'}`);

    await new Promise(resolve => setTimeout(resolve, 5000));

    // Test 2: Grounded Image Generation (real-world data)
    console.log('\n🌍 Test 2: Grounded Image Generation (Google Search)');
    const resultGrounded = await generator.generateGroundedImage(
      "Generate a visualization of the current stock market trends in India with Nifty 50 and Sensex data",
      { aspectRatio: "16:9" }
    );
    console.log(`   ✅ Grounded Image generated: ${resultGrounded.images[0]?.path || 'simulated'}`);
    console.log(`   Features: ${resultGrounded.features?.join(', ') || 'N/A'}`);

    await new Promise(resolve => setTimeout(resolve, 5000));

    // Test 3: Social Media Graphic with 4K
    console.log('\n📱 Test 3: Social Media Graphic with 4K Quality');
    const resultSocial = await generator.generateSocialGraphic(
      "Eye-catching LinkedIn post about MADP achieving 14.5% returns. Modern gradient background with bold typography and PL Capital branding.",
      "linkedin",
      { imageSize: "4K", useGrounding: true }
    );
    console.log(`   ✅ Social graphic generated: ${resultSocial.images[0]?.path || 'simulated'}`);
    console.log(`   Platform: ${resultSocial.platform}`);
    console.log(`   Optimized: ${resultSocial.optimizedFor}`);

    await new Promise(resolve => setTimeout(resolve, 5000));

    // Test 4: Explicit Gemini 3 Pro Model Selection
    console.log('\n🎯 Test 4: Explicit Gemini 3 Pro Model Selection');
    const resultExplicit = await generator.textToImage(
      "Create a modern infographic comparing MADP returns vs Fixed Deposits vs Mutual Funds with clear percentages",
      {
        model: "gemini-3-flash-preview",
        aspectRatio: "1:1",
        imageSize: "4K",
        useGrounding: true
      }
    );
    console.log(`   ✅ Model: ${resultExplicit.model}`);
    console.log(`   Features: ${resultExplicit.features?.join(', ') || 'N/A'}`);
    console.log(`   Image: ${resultExplicit.images[0]?.path || 'simulated'}`);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ Gemini 3 Pro Image Preview Tests Complete');
    console.log('='.repeat(60));
    console.log('\nFeatures tested:');
    console.log('   - Native 4K image generation');
    console.log('   - Google Search grounding for accuracy');
    console.log('   - Social media optimized output');
    console.log('   - Explicit model selection');
    console.log(`\n📂 Images saved to: ${outputDir}`);

  } catch (error) {
    console.error(`\n❌ Gemini 3 Pro test error: ${error.message}`);
    console.error(error.stack);
  }
}

// Run tests
async function main() {
  await testImageGeneration();

  // Uncomment to test Gemini 3 Pro Image Preview specific features (4K, grounding)
  // await testGemini3ProFeatures();

  // Uncomment to test advanced features (refinement, multi-platform)
  // await testAdvancedFeatures();
}

main().catch(error => {
  console.error('\n💥 Unexpected error:', error);
  process.exit(1);
});

