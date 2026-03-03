/**
 * Test Veo 3.1 Avatar Video Generation with Reference Images
 * Uses generated avatar images as references for character consistency
 */

const fs = require('fs');
const path = require('path');
const VideoGenerator = require('../video/video-generator');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Avatar image paths
const AVATAR_DIR = path.join(__dirname, '../generated-avatars');
const avatarImages = {
  raj: path.join(AVATAR_DIR, 'raj_avatar.jpg'),
  priya: path.join(AVATAR_DIR, 'priya_avatar.jpg'),
  arjun: path.join(AVATAR_DIR, 'arjun_avatar.jpg'),
  meera: path.join(AVATAR_DIR, 'meera_avatar.jpg'),
  vikram: path.join(AVATAR_DIR, 'vikram_avatar.jpg')
};

console.log('='.repeat(80));
console.log('  Veo 3.1 Avatar Video Generation with Reference Images');
console.log('='.repeat(80));
console.log('\nAvailable Avatar Images:');
Object.entries(avatarImages).forEach(([name, imgPath]) => {
  const exists = fs.existsSync(imgPath);
  console.log(`  ${name.charAt(0).toUpperCase() + name.slice(1)}: ${exists ? '✅' : '❌'} ${imgPath}`);
});
console.log('='.repeat(80));

/**
 * Test video generation with avatar reference
 */
async function testAvatarVideoGeneration() {
  try {
    const generator = new VideoGenerator({
      apiKey: GEMINI_API_KEY,
      model: 'veo-3.1-generate-preview'
    });

    // Test with Raj avatar
    console.log('\n🎬 Testing with Raj Avatar\n');

    // Load avatar image
    const rajImage = await generator.loadImageFromFile(avatarImages.raj);

    console.log('   ✅ Loaded Raj avatar image');
    console.log(`   Image size: ${(rajImage.imageBytes.length / 1024).toFixed(2)} KB`);
    console.log(`   MIME type: ${rajImage.mimeType}`);

    // Test script for Indian financial advisor
    const testPrompt = `A professional Indian male financial advisor in a navy blue business suit
is speaking directly to the camera in a modern office setting. He gestures naturally
while explaining financial concepts. The lighting is professional with soft shadows.
Cinematic 16:9 shot, 4K quality, natural movements.`;

    console.log('\n📝 Prompt:');
    console.log(`   ${testPrompt.trim()}\n`);

    console.log('🎥 Starting Veo 3.1 video generation...\n');
    console.log('   Model: veo-3.1-generate-preview');
    console.log('   Type: Image-to-Video with Reference');
    console.log('   Reference: Raj avatar (asset reference)');
    console.log('   Duration: 8 seconds');
    console.log('   Resolution: 1080p');
    console.log('   Aspect Ratio: 16:9\n');

    // Generate video using reference image
    const result = await generator.imageToVideoWithReferences(
      testPrompt,
      [
        {
          imageBytes: rajImage.imageBytes,
          mimeType: rajImage.mimeType,
          referenceType: 'asset' // Preserves subject appearance
        }
      ],
      {
        aspectRatio: '16:9',
        resolution: '1080p',
        duration: 8,
        personGeneration: 'allow_adult'
      }
    );

    console.log('\n' + '='.repeat(80));
    console.log('✅ VIDEO GENERATION COMPLETE');
    console.log('='.repeat(80));
    console.log(`\n📹 Video Details:`);
    console.log(`   Type: ${result.type}`);
    console.log(`   Duration: ${result.duration}s`);
    console.log(`   Resolution: ${result.config.resolution}`);
    console.log(`   Aspect Ratio: ${result.config.aspectRatio}`);
    console.log(`   References Used: ${result.referenceCount}`);
    console.log(`\n📂 Video Location:`);
    console.log(`   ${result.videoUri}`);

    // Save result metadata
    const resultPath = path.join(__dirname, '../test-results/veo-raj-avatar-result.json');
    fs.mkdirSync(path.dirname(resultPath), { recursive: true });
    fs.writeFileSync(resultPath, JSON.stringify({
      ...result,
      videoFile: result.videoFile ? { name: result.videoFile.name } : null,
      timestamp: new Date().toISOString(),
      avatarUsed: 'Raj',
      prompt: testPrompt
    }, null, 2));

    console.log(`\n📄 Result metadata saved: ${resultPath}`);

    return result;

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    throw error;
  }
}

/**
 * Test all avatars sequentially
 */
async function testAllAvatars() {
  console.log('\n🎬 Testing ALL Avatars\n');

  const avatarPrompts = {
    raj: `A professional Indian male financial advisor in a navy blue suit speaking
confidently to camera about investment strategies. Modern office setting, natural gestures.`,

    priya: `A friendly Indian female corporate trainer in professional attire presenting
to camera. She smiles warmly and gestures while explaining concepts. Office background.`,

    arjun: `A young Indian male professional in business casual attire discussing
tech and business topics to camera. Casual office setting, relaxed demeanor.`,

    meera: `A senior Indian female executive in formal business attire speaking
authoritatively about leadership. Executive office setting, confident presence.`,

    vikram: `A mature Indian male financial expert in formal suit delivering
market analysis to camera. Professional studio setting, serious tone.`
  };

  const generator = new VideoGenerator({
    apiKey: GEMINI_API_KEY,
    model: 'veo-3.1-generate-preview'
  });

  const results = [];

  for (const [name, prompt] of Object.entries(avatarPrompts)) {
    try {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`  Testing: ${name.toUpperCase()}`);
      console.log('='.repeat(80));

      const imagePath = avatarImages[name];
      if (!fs.existsSync(imagePath)) {
        console.log(`   ❌ Image not found: ${imagePath}`);
        continue;
      }

      const imageData = await generator.loadImageFromFile(imagePath);
      console.log(`   ✅ Loaded ${name} image (${(imageData.imageBytes.length / 1024).toFixed(2)} KB)`);

      const result = await generator.imageToVideoWithReferences(
        prompt,
        [{ imageBytes: imageData.imageBytes, mimeType: imageData.mimeType, referenceType: 'asset' }],
        { aspectRatio: '16:9', resolution: '1080p', duration: 8 }
      );

      console.log(`   ✅ Video generated: ${result.videoUri}`);
      results.push({ name, result });

      // Save result
      const resultPath = path.join(__dirname, `../test-results/veo-${name}-avatar-result.json`);
      fs.writeFileSync(resultPath, JSON.stringify({
        ...result,
        videoFile: result.videoFile ? { name: result.videoFile.name } : null,
        avatarUsed: name,
        prompt
      }, null, 2));

      // Wait between generations
      if (Object.keys(avatarPrompts).indexOf(name) < Object.keys(avatarPrompts).length - 1) {
        console.log('\n   ⏳ Waiting 30 seconds before next generation...');
        await new Promise(r => setTimeout(r, 30000));
      }

    } catch (error) {
      console.error(`   ❌ Error for ${name}:`, error.message);
      results.push({ name, error: error.message });
    }
  }

  console.log('\n\n' + '='.repeat(80));
  console.log('  ALL TESTS COMPLETE');
  console.log('='.repeat(80));
  console.log('\nResults Summary:');
  results.forEach(({ name, result, error }) => {
    if (error) {
      console.log(`  ${name}: ❌ ${error}`);
    } else {
      console.log(`  ${name}: ✅ ${result.videoUri}`);
    }
  });

  return results;
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  if (!GEMINI_API_KEY) {
    throw new Error('Missing GEMINI_API_KEY. Set it in the environment before running.');
  }

  if (args.includes('--all')) {
    await testAllAvatars();
  } else {
    console.log('\n💡 Testing with Raj avatar only. Use --all to test all avatars.\n');
    await testAvatarVideoGeneration();
  }

  console.log('\n\n' + '='.repeat(80));
  console.log('  Test Complete!');
  console.log('='.repeat(80));
  console.log('\n🎉 Videos are ready for review!\n');
}

main().catch(console.error);
