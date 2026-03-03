/**
 * Test Fal AI Image Generation - MADP Campaign
 *
 * Compares Fal AI (Flux Kontext LoRA) vs Gemini (Nano Banana)
 * for MADP social media graphics
 */

const ImageGenerator = require('./image/image-generator.js');
const fs = require('fs').promises;
const path = require('path');

// MADP Campaign Test Prompts (optimized for comparison)
const testPrompts = [
  {
    name: "financial-chart-comparison",
    prompt: "Professional financial bar chart infographic showing MADP 14.5% returns in green, Fixed Deposits 6.5% in blue, Mutual Funds 11% in orange. Modern corporate design, clean layout, photorealistic business graphics.",
    config: { aspectRatio: "16:9" }
  },
  {
    name: "social-media-post",
    prompt: "Eye-catching social media post with bold text '14.5% Returns with MADP' in modern typography. Gradient blue-green background, professional corporate aesthetic, high contrast design.",
    config: { aspectRatio: "1:1" }
  },
  {
    name: "mobile-story",
    prompt: "Vertical mobile story template with 'MADP Investment Advantage' title. Financial growth visualization with upward trending graph, modern minimalist design, space for text overlay.",
    config: { aspectRatio: "9:16" }
  }
];

async function testFalImageGeneration() {
  console.log('🎨 Fal AI Image Generation Test - MADP Campaign\n');
  console.log('Model: fal-ai/flux-kontext-lora/text-to-image');
  console.log('=' .repeat(60));

  // Check for API keys
  if (!process.env.FAL_KEY) {
    console.error('❌ Error: FAL_KEY environment variable not set');
    console.log('\nSet it with:');
    console.log('export FAL_KEY="your-fal-api-key"\n');
    return;
  }

  const generator = new ImageGenerator({
    falApiKey: process.env.FAL_KEY,
    provider: 'fal',
    falModel: 'fal-ai/flux-kontext-lora/text-to-image'
  });

  const results = [];
  const outputDir = path.join(__dirname, 'output', 'test-images', 'fal-ai');

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
      console.log(`\n📝 Prompt: ${test.prompt.substring(0, 80)}...`);
      console.log(`⚙️  Config: ${JSON.stringify(test.config)}`);
      console.log('\n⏳ Generating with Fal AI...\n');

      const startTime = Date.now();

      const result = await generator.textToImage(test.prompt, test.config);

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log(`\n✅ Success! Generated in ${duration}s`);
      console.log(`   Provider: ${result.provider}`);
      console.log(`   Model: ${result.model}`);
      console.log(`   Images: ${result.images.length}`);

      result.images.forEach((img, idx) => {
        console.log(`   Image ${idx + 1}: ${img.path}`);
        console.log(`   Size: ${(img.size / 1024).toFixed(1)} KB`);
        if (img.url) {
          console.log(`   URL: ${img.url.substring(0, 60)}...`);
        }
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

      if (error.message.includes('balance')) {
        console.log('\n⚠️  Insufficient Fal AI credits. Add credits at fal.ai/dashboard/billing');
      } else if (error.message.includes('authentication') || error.message.includes('API key')) {
        console.log('\n⚠️  Check your FAL_KEY is valid.');
      }

      results.push({
        name: test.name,
        success: false,
        error: error.message
      });
    }

    // Wait between requests
    if (i < testPrompts.length - 1) {
      console.log('\n⏸️  Waiting 3 seconds before next test...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Fal AI Test Summary');
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

    const avgTime = results
      .filter(r => r.success)
      .reduce((sum, r) => sum + parseFloat(r.generationTime), 0) / successful;

    console.log('\n📈 Statistics:');
    console.log(`   Average generation time: ${avgTime.toFixed(1)}s`);
    console.log(`   Model: fal-ai/flux-kontext-lora/text-to-image`);
  }

  if (failed > 0) {
    console.log('\n❌ Failed Tests:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`   - ${r.name}: ${r.error}`);
    });
  }

  console.log('\n' + '='.repeat(60));
  console.log('✨ Test complete!\n');
}

// Comparison test (optional)
async function compareProviders() {
  console.log('\n' + '='.repeat(60));
  console.log('⚖️  Provider Comparison: Fal AI vs Gemini');
  console.log('='.repeat(60));

  const prompt = "Professional financial growth chart showing 14.5% MADP returns, corporate design, photorealistic";
  const config = { aspectRatio: "1:1" };

  try {
    // Test Gemini
    console.log('\n🧪 Testing Gemini 2.5 Flash Image...');
    const geminiGen = new ImageGenerator({
      geminiApiKey: process.env.GEMINI_API_KEY,
      provider: 'gemini'
    });

    const geminiStart = Date.now();
    const geminiResult = await geminiGen.textToImage(prompt, config);
    const geminiTime = ((Date.now() - geminiStart) / 1000).toFixed(1);

    console.log(`✅ Gemini: ${geminiTime}s, ${(geminiResult.images[0].size / 1024).toFixed(1)} KB`);

    // Test Fal AI
    console.log('\n🧪 Testing Fal AI Flux Kontext LoRA...');
    const falGen = new ImageGenerator({
      falApiKey: process.env.FAL_KEY,
      provider: 'fal',
      falModel: 'fal-ai/flux-kontext-lora/text-to-image'
    });

    const falStart = Date.now();
    const falResult = await falGen.textToImage(prompt, config);
    const falTime = ((Date.now() - falStart) / 1000).toFixed(1);

    console.log(`✅ Fal AI: ${falTime}s, ${(falResult.images[0].size / 1024).toFixed(1)} KB`);

    // Comparison
    console.log('\n📊 Comparison Results:');
    console.log(`   Speed: ${geminiTime < falTime ? 'Gemini' : 'Fal AI'} (${geminiTime}s vs ${falTime}s)`);
    console.log(`   File Size: Gemini ${(geminiResult.images[0].size / 1024).toFixed(1)} KB vs Fal AI ${(falResult.images[0].size / 1024).toFixed(1)} KB`);

    // Save comparison images
    const outputDir = path.join(__dirname, 'output', 'test-images', 'comparison');
    await fs.mkdir(outputDir, { recursive: true });

    await fs.copyFile(geminiResult.images[0].path, path.join(outputDir, 'gemini-comparison.png'));
    await fs.copyFile(falResult.images[0].path, path.join(outputDir, 'fal-ai-comparison.png'));

    console.log(`\n📂 Comparison images saved to: ${outputDir}`);

  } catch (error) {
    console.error(`❌ Comparison error: ${error.message}`);
  }
}

// Run tests
async function main() {
  await testFalImageGeneration();

  // Uncomment to run provider comparison
  // if (process.env.GEMINI_API_KEY && process.env.FAL_KEY) {
  //   await compareProviders();
  // }
}

main().catch(error => {
  console.error('\n💥 Unexpected error:', error);
  process.exit(1);
});

