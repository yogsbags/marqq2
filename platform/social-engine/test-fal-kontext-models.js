/**
 * Fal AI FLUX Kontext Models Test
 * 
 * Tests the new Fal AI models:
 * 1. flux-kontext-lora/text-to-image (already tested)
 * 2. flux-pro/kontext (context-aware image editing)
 * 3. flux-kontext-lora/inpaint (mask-based inpainting)
 * 
 * @see https://fal.ai/models/fal-ai/flux-pro/kontext/api
 * @see https://fal.ai/models/fal-ai/flux-kontext-lora/inpaint
 */

const ImageGenerator = require('./image/image-generator.js');
const fs = require('fs').promises;
const path = require('path');

// Example images for testing (publicly accessible)
const TEST_IMAGES = {
  kitchen: "https://v3.fal.media/files/rabbit/rmgBxhwGYb2d3pl3x9sKf_output.png",
  // We'll generate a test image first, then use it for editing
};

async function testFalKontextModels() {
  console.log('🎨 Fal AI FLUX Kontext Models Test\n');
  console.log('=' .repeat(70));

  // Check for API key
  if (!process.env.FAL_KEY) {
    console.error('\n❌ Error: FAL_KEY environment variable not set');
    console.log('\nSet it with:');
    console.log('export FAL_KEY="your-fal-api-key"\n');
    return;
  }

  const generator = new ImageGenerator({
    falApiKey: process.env.FAL_KEY,
    provider: 'fal'
  });

  const results = {
    textToImage: null,
    imageEditing: null,
    inpainting: null
  };

  // ============================================================
  // TEST 1: Text-to-Image (Baseline)
  // ============================================================
  console.log('\n\n' + '='.repeat(70));
  console.log('TEST 1: Text-to-Image (Baseline)');
  console.log('Model: fal-ai/flux-kontext-lora/text-to-image');
  console.log('='.repeat(70));

  try {
    console.log('\nGenerating base image for subsequent tests...\n');
    
    const startTime = Date.now();
    const result = await generator.textToImage(
      "A professional modern kitchen with marble countertops, wooden cabinets, and fresh ingredients on the counter",
      { aspectRatio: "16:9" }
    );
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\n✅ Generated in ${duration}s`);
    console.log(`   Image: ${result.images[0].path}`);
    console.log(`   Size: ${(result.images[0].size / 1024).toFixed(1)} KB`);
    console.log(`   URL: ${result.images[0].url}`);
    
    results.textToImage = result;
    
    // Save for later use
    TEST_IMAGES.generatedKitchen = result.images[0].url;

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    if (error.message.includes('balance') || error.message.includes('credits')) {
      console.log('\n⚠️  Insufficient Fal AI credits. Add credits at fal.ai/dashboard/billing');
      return;
    }
  }

  // ============================================================
  // TEST 2: Context-Aware Image Editing (FLUX Kontext Pro)
  // ============================================================
  console.log('\n\n' + '='.repeat(70));
  console.log('TEST 2: Context-Aware Image Editing');
  console.log('Model: fal-ai/flux-pro/kontext');
  console.log('='.repeat(70));

  try {
    console.log('\nEditing image with context-aware prompt...');
    console.log('Note: Currently requires publicly accessible image URL\n');
    
    // Use the example image from Fal AI docs
    const imageUrl = TEST_IMAGES.kitchen;
    
    console.log(`Input Image: ${imageUrl.substring(0, 60)}...`);
    console.log('Edit Prompt: "Put a donut next to the flour"');
    
    const startTime = Date.now();
    const result = await generator.editImage(
      "Put a donut next to the flour",
      imageUrl,
      { 
        aspectRatio: "16:9",
        provider: 'fal'
      }
    );
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\n✅ Edited in ${duration}s`);
    console.log(`   Output: ${result.images[0].path}`);
    console.log(`   Size: ${(result.images[0].size / 1024).toFixed(1)} KB`);
    console.log(`   Model: ${result.model}`);
    
    results.imageEditing = result;
    
    // Save to organized location
    const outputDir = path.join(__dirname, 'output', 'fal-kontext-tests');
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, 'context-editing-donut.png');
    await fs.copyFile(result.images[0].path, outputPath);
    console.log(`   📥 Saved to: ${outputPath}`);

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    
    if (error.message.includes('image URL')) {
      console.log('\n💡 Tip: Image editing with Fal AI requires publicly accessible URLs');
      console.log('   You can use Fal\'s storage or any public image host');
    }
  }

  // ============================================================
  // TEST 3: Inpainting (Mask-Based Editing)
  // ============================================================
  console.log('\n\n' + '='.repeat(70));
  console.log('TEST 3: Mask-Based Inpainting');
  console.log('Model: fal-ai/flux-kontext-lora/inpaint');
  console.log('='.repeat(70));

  console.log('\nNote: Inpainting requires:');
  console.log('  1. A source image URL (publicly accessible)');
  console.log('  2. A mask image URL (white = inpaint, black = keep)');
  console.log('  3. A prompt describing what to fill in\n');
  
  console.log('Example usage:');
  console.log('```javascript');
  console.log('const result = await generator.inpaint(');
  console.log('  "A red sports car",');
  console.log('  "https://example.com/image.png",');
  console.log('  "https://example.com/mask.png",');
  console.log('  { imageSize: "landscape_16_9" }');
  console.log(');');
  console.log('```');
  
  console.log('\n⚠️  Skipping inpainting test (requires pre-prepared mask image)');
  console.log('   To test inpainting:');
  console.log('   1. Create a mask image (white areas will be filled)');
  console.log('   2. Upload both image and mask to a public URL');
  console.log('   3. Call generator.inpaint(prompt, imageUrl, maskUrl, config)');

  // ============================================================
  // Summary
  // ============================================================
  console.log('\n\n' + '='.repeat(70));
  console.log('📊 Test Summary');
  console.log('='.repeat(70));

  const successful = Object.values(results).filter(r => r !== null).length;
  const total = Object.keys(results).length;

  console.log(`\n✅ Successful: ${successful}/${total}`);
  
  if (results.textToImage) {
    console.log('\n🎨 Text-to-Image:');
    console.log(`   ✓ Model: fal-ai/flux-kontext-lora/text-to-image`);
    console.log(`   ✓ Generated: ${results.textToImage.images.length} image(s)`);
  }
  
  if (results.imageEditing) {
    console.log('\n✏️  Image Editing:');
    console.log(`   ✓ Model: ${results.imageEditing.model}`);
    console.log(`   ✓ Context-aware editing working`);
    console.log(`   ✓ Generated: ${results.imageEditing.images.length} image(s)`);
  } else {
    console.log('\n✏️  Image Editing:');
    console.log(`   ⚠️  Not tested (requires public image URL)`);
  }
  
  if (results.inpainting) {
    console.log('\n🎭 Inpainting:');
    console.log(`   ✓ Model: ${results.inpainting.model}`);
    console.log(`   ✓ Mask-based editing working`);
  } else {
    console.log('\n🎭 Inpainting:');
    console.log(`   ⚠️  Not tested (requires mask image)`);
  }

  console.log('\n\n' + '='.repeat(70));
  console.log('✨ Available Fal AI Models');
  console.log('='.repeat(70));
  
  console.log('\n1. flux-kontext-lora/text-to-image');
  console.log('   └─ Fast text-to-image generation');
  console.log('   └─ Use: generator.textToImage(prompt, { provider: "fal" })');
  
  console.log('\n2. flux-pro/kontext');
  console.log('   └─ Context-aware image editing');
  console.log('   └─ Use: generator.editImage(prompt, imageUrl, { provider: "fal" })');
  console.log('   └─ Requires: Publicly accessible image URL');
  
  console.log('\n3. flux-kontext-lora/inpaint');
  console.log('   └─ Mask-based inpainting');
  console.log('   └─ Use: generator.inpaint(prompt, imageUrl, maskUrl, config)');
  console.log('   └─ Requires: Image URL + Mask URL');

  console.log('\n\n' + '='.repeat(70));
  console.log('📚 Documentation');
  console.log('='.repeat(70));
  
  console.log('\n• FLUX Kontext Pro: https://fal.ai/models/fal-ai/flux-pro/kontext/api');
  console.log('• FLUX Kontext Inpaint: https://fal.ai/models/fal-ai/flux-kontext-lora/inpaint');
  console.log('• Image Generator Guide: IMAGEN_CAPABILITIES_GUIDE.md');

  console.log('\n' + '='.repeat(70));
  console.log('✨ Test complete!\n');
}

// Run tests
testFalKontextModels().catch(error => {
  console.error('\n💥 Unexpected error:', error);
  process.exit(1);
});

