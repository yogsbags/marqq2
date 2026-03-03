/**
 * Test Mask-Based Inpainting with Fal AI FLUX Kontext
 *
 * This script:
 * 1. Generates a base image
 * 2. Creates a simple mask using Canvas
 * 3. Converts mask to base64 data URI
 * 4. Tests inpainting with the mask
 *
 * @see https://fal.ai/models/fal-ai/flux-kontext-lora/inpaint
 */

const ImageGenerator = require('./image/image-generator.js');
const fs = require('fs').promises;
const path = require('path');
const { createCanvas } = require('canvas');

/**
 * Create a simple mask image
 * White areas will be inpainted, black areas will be preserved
 */
async function createSimpleMask(width, height, maskArea = 'center') {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Fill with black (preserve everything)
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, width, height);

  // Add white area (inpaint area)
  ctx.fillStyle = 'white';

  if (maskArea === 'center') {
    // Center circle mask
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 4;

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();

    console.log(`   Created center circle mask: ${radius}px radius`);
  } else if (maskArea === 'rectangle') {
    // Center rectangle mask
    const rectWidth = width * 0.4;
    const rectHeight = height * 0.4;
    const rectX = (width - rectWidth) / 2;
    const rectY = (height - rectHeight) / 2;

    ctx.fillRect(rectX, rectY, rectWidth, rectHeight);

    console.log(`   Created center rectangle mask: ${rectWidth}x${rectHeight}px`);
  } else if (maskArea === 'left') {
    // Left half mask
    ctx.fillRect(0, 0, width / 2, height);

    console.log(`   Created left-half mask`);
  } else if (maskArea === 'right') {
    // Right half mask
    ctx.fillRect(width / 2, 0, width / 2, height);

    console.log(`   Created right-half mask`);
  }

  return canvas;
}

/**
 * Save canvas as PNG file
 */
async function saveCanvas(canvas, filepath) {
  const buffer = canvas.toBuffer('image/png');
  await fs.writeFile(filepath, buffer);
  return filepath;
}

/**
 * Convert canvas to base64 data URI
 */
function canvasToDataUri(canvas) {
  return canvas.toDataURL('image/png');
}

async function testInpainting() {
  console.log('🎨 Fal AI FLUX Kontext Inpainting Test\n');
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

  const outputDir = path.join(__dirname, 'output', 'inpainting-tests');
  await fs.mkdir(outputDir, { recursive: true });

  // ============================================================
  // STEP 1: Generate Base Image
  // ============================================================
  console.log('\n\n' + '='.repeat(70));
  console.log('STEP 1: Generate Base Image');
  console.log('='.repeat(70));

  let baseImageUrl;

  try {
    console.log('\nGenerating a simple scene for inpainting test...\n');

    const startTime = Date.now();
    const result = await generator.textToImage(
      "A simple living room with a plain white wall, a sofa, and a coffee table",
      { aspectRatio: "16:9" }
    );
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\n✅ Generated in ${duration}s`);
    console.log(`   Image: ${result.images[0].path}`);
    console.log(`   Size: ${(result.images[0].size / 1024).toFixed(1)} KB`);
    console.log(`   URL: ${result.images[0].url}`);

    baseImageUrl = result.images[0].url;

    // Save locally
    const localPath = path.join(outputDir, 'base-image.png');
    await fs.copyFile(result.images[0].path, localPath);
    console.log(`   📥 Saved to: ${localPath}`);

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    return;
  }

  // ============================================================
  // STEP 2: Create Mask Image
  // ============================================================
  console.log('\n\n' + '='.repeat(70));
  console.log('STEP 2: Create Mask Image');
  console.log('='.repeat(70));

  let maskDataUri;

  try {
    console.log('\nCreating mask for center area (white = inpaint)...\n');

    // Create mask (1344x768 for 16:9)
    const maskCanvas = await createSimpleMask(1344, 768, 'center');

    // Save mask locally
    const maskPath = path.join(outputDir, 'mask-center.png');
    await saveCanvas(maskCanvas, maskPath);
    console.log(`   ✅ Mask saved to: ${maskPath}`);

    // Convert to data URI for API
    maskDataUri = canvasToDataUri(maskCanvas);
    console.log(`   ✅ Mask converted to data URI (${(maskDataUri.length / 1024).toFixed(1)} KB)`);

  } catch (error) {
    console.error(`\n❌ Error creating mask: ${error.message}`);

    // Check if canvas is available
    if (error.message.includes('canvas')) {
      console.log('\n⚠️  Canvas module not installed. Installing...');
      console.log('\nRun: npm install canvas');
      console.log('\nAlternatively, use a pre-made mask image URL\n');
      return;
    }
    throw error;
  }

  // ============================================================
  // STEP 3: Test Inpainting
  // ============================================================
  console.log('\n\n' + '='.repeat(70));
  console.log('STEP 3: Test Mask-Based Inpainting');
  console.log('='.repeat(70));

  try {
    console.log('\nInpainting masked area...');
    console.log('Prompt: "A large framed painting of a mountain landscape"');
    console.log(`Base Image: ${baseImageUrl}`);
    console.log(`Mask: Data URI (center circle)\n`);

    const startTime = Date.now();

    // Note: Fal AI typically expects URLs, not data URIs for masks
    // We'll try with data URI first, but may need to upload the mask
    const result = await generator.inpaint(
      "A large framed painting of a mountain landscape",
      baseImageUrl,
      maskDataUri,  // Using data URI
      {
        imageSize: "landscape_16_9",
        guidanceScale: 3.5,
        numInferenceSteps: 28
      }
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\n✅ Inpainting complete in ${duration}s`);
    console.log(`   Output: ${result.images[0].path}`);
    console.log(`   Size: ${(result.images[0].size / 1024).toFixed(1)} KB`);
    console.log(`   Model: ${result.model}`);

    // Save result
    const resultPath = path.join(outputDir, 'inpainted-result.png');
    await fs.copyFile(result.images[0].path, resultPath);
    console.log(`   📥 Saved to: ${resultPath}`);

    // ============================================================
    // STEP 4: Create Comparison
    // ============================================================
    console.log('\n\n' + '='.repeat(70));
    console.log('STEP 4: Results Summary');
    console.log('='.repeat(70));

    console.log('\n📊 Inpainting Test Results:');
    console.log(`   ✓ Base image generated`);
    console.log(`   ✓ Mask created (center circle)`);
    console.log(`   ✓ Inpainting successful`);
    console.log(`   ✓ Processing time: ${duration}s`);

    console.log('\n📂 Output Files:');
    console.log(`   - base-image.png (original)`);
    console.log(`   - mask-center.png (white = inpaint area)`);
    console.log(`   - inpainted-result.png (final result)`);
    console.log(`\n   Location: ${outputDir}`);

  } catch (error) {
    console.error(`\n❌ Inpainting Error: ${error.message}`);

    if (error.message.includes('data URI') || error.message.includes('URL')) {
      console.log('\n⚠️  Fal AI may not support data URIs for masks.');
      console.log('   Solutions:');
      console.log('   1. Upload mask to Fal AI storage');
      console.log('   2. Use a public image host (Imgur, Cloudinary, etc.)');
      console.log('   3. Host mask on your own server');

      // Save mask locally for manual upload
      console.log(`\n   Mask saved to: ${outputDir}/mask-center.png`);
      console.log('   Upload this mask and retry with the URL');
    }

    throw error;
  }

  console.log('\n' + '='.repeat(70));
  console.log('✨ Inpainting test complete!\n');
}

// Run test
testInpainting().catch(error => {
  console.error('\n💥 Test failed:', error);

  // Provide helpful tips
  console.log('\n📚 Troubleshooting:');
  console.log('   1. Ensure FAL_KEY is set correctly');
  console.log('   2. Check that canvas module is installed: npm install canvas');
  console.log('   3. Verify image URLs are publicly accessible');
  console.log('   4. Check Fal AI balance at fal.ai/dashboard/billing');

  process.exit(1);
});

