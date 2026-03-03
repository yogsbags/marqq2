/**
 * Comprehensive Veo 3.1 Examples
 *
 * Demonstrates all Veo capabilities:
 * 1. Text-to-Video Generation
 * 2. Image-to-Video with Reference Images
 * 3. First and Last Frame Specification
 * 4. Video Extension
 * 5. Long-Form Video Generation
 */

const ComprehensiveVeoProducer = require('../video/comprehensive-veo-producer');

async function main() {
  // Initialize producer
  const producer = new ComprehensiveVeoProducer({
    apiKey: process.env.GEMINI_API_KEY
  });

  console.log('🎬 Veo 3.1 - All Features Demo\n');

  // ============================================
  // 1. TEXT-TO-VIDEO GENERATION
  // ============================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Example 1: Text-to-Video Generation');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const textToVideoResult = await producer.textToVideo(
      `A close up of two people staring at a cryptic drawing on a wall, torchlight flickering.
       A man murmurs, 'This must be it. That's the secret code.'
       The woman looks at him and whispering excitedly, 'What did you find?'`,
      {
        aspectRatio: "16:9",
        resolution: "720p"
      }
    );

    console.log('\n✅ Text-to-Video Result:');
    console.log(`   Video: ${textToVideoResult.videoUri}`);
    console.log(`   Duration: ${textToVideoResult.duration}s`);
    console.log(`   Type: ${textToVideoResult.type}\n`);
  } catch (error) {
    console.error(`❌ Text-to-Video Error: ${error.message}\n`);
  }

  // ============================================
  // 2. IMAGE-TO-VIDEO WITH REFERENCE IMAGES
  // ============================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Example 2: Image-to-Video with References');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Load reference images
    const dressImage = await producer.loadImageFromFile('./assets/dress.png');
    const womanImage = await producer.loadImageFromFile('./assets/woman.png');
    const glassesImage = await producer.loadImageFromFile('./assets/sunglasses.png');

    const referenceResult = await producer.imageToVideoWithReferences(
      "A woman wearing a high-fashion flamingo dress with heart-shaped sunglasses, walking confidently on a runway",
      [
        { ...dressImage, referenceType: "asset" },
        { ...womanImage, referenceType: "asset" },
        { ...glassesImage, referenceType: "asset" }
      ],
      {
        aspectRatio: "9:16",
        resolution: "1080p"
      }
    );

    console.log('\n✅ Reference Images Result:');
    console.log(`   Video: ${referenceResult.videoUri}`);
    console.log(`   References Used: ${referenceResult.referenceCount}`);
    console.log(`   Type: ${referenceResult.type}\n`);
  } catch (error) {
    console.error(`❌ Reference Images Error: ${error.message}`);
    console.log('   Note: Make sure reference images exist in ./assets/\n');
  }

  // ============================================
  // 3. FIRST AND LAST FRAME SPECIFICATION
  // ============================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Example 3: First and Last Frame');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Load frame images
    const firstFrame = await producer.loadImageFromFile('./assets/cat-start.png');
    const lastFrame = await producer.loadImageFromFile('./assets/cat-end.png');

    const frameResult = await producer.firstLastFrameVideo(
      "A calico kitten driving a toy car from the starting line to the edge of a cliff, cartoon style",
      firstFrame,
      lastFrame,
      {
        aspectRatio: "16:9",
        resolution: "720p"
      }
    );

    console.log('\n✅ First/Last Frame Result:');
    console.log(`   Video: ${frameResult.videoUri}`);
    console.log(`   Type: ${frameResult.type}\n`);
  } catch (error) {
    console.error(`❌ First/Last Frame Error: ${error.message}`);
    console.log('   Note: Make sure frame images exist in ./assets/\n');
  }

  // ============================================
  // 4. VIDEO EXTENSION
  // ============================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Example 4: Video Extension');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Generate base video (8 seconds)
    console.log('Generating base video (8s)...');
    const baseVideo = await producer.textToVideo(
      "A professional Indian woman in business attire starts presenting financial data on a screen",
      {
        aspectRatio: "16:9",
        resolution: "720p"
      }
    );

    console.log(`✅ Base video: ${baseVideo.videoUri}\n`);

    // Extend the video (+7 seconds)
    console.log('Extending video (+7s)...');
    const extension1 = await producer.extendVideo(
      baseVideo.videoFile,
      "She continues explaining the portfolio performance metrics with animated charts appearing",
      {
        aspectRatio: "16:9",
        resolution: "720p"
      }
    );

    console.log(`✅ Extended video (15s total): ${extension1.videoUri}\n`);

    // Extend again (+7 more seconds)
    console.log('Extending again (+7s)...');
    const extension2 = await producer.extendVideo(
      extension1.videoFile,
      "She concludes with a confident smile and a call-to-action overlay appears",
      {
        aspectRatio: "16:9",
        resolution: "720p"
      }
    );

    console.log(`✅ Final extended video (22s total): ${extension2.videoUri}\n`);

  } catch (error) {
    console.error(`❌ Video Extension Error: ${error.message}\n`);
  }

  // ============================================
  // 5. LONG-FORM VIDEO GENERATION
  // ============================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Example 5: Long-Form Video (50+ seconds)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const longVideoResult = await producer.generateLongVideo(
      // Base video (8s)
      "Indian financial advisor in modern office introducing MADP portfolio strategy to camera",

      // Extensions (7s each)
      [
        "B-roll transitions to animated MADP portfolio dashboard showing valuation vs momentum metrics",
        "Return to advisor explaining how MADP combines quality and momentum factors",
        "Animated chart shows portfolio performance graph trending upward over 5 years",
        "Advisor discusses risk management with shield icon protecting portfolio graphic",
        "Success story testimonial overlay with client name and ₹50L to ₹2Cr growth metric",
        "Final call-to-action: advisor gives confident advice with website URL overlay"
      ],

      {
        aspectRatio: "16:9",
        resolution: "720p"
      }
    );

    console.log('\n✅ Long Video Result:');
    console.log(`   Total Clips: ${longVideoResult.totalClips}`);
    console.log(`   Total Duration: ${longVideoResult.totalDuration}s`);
    console.log(`   Final Video: ${longVideoResult.finalVideoUri}`);
    console.log(`   Clips:`);

    longVideoResult.clips.forEach((clip, i) => {
      console.log(`     ${i + 1}. ${clip.type} - ${clip.videoUri}`);
    });

  } catch (error) {
    console.error(`❌ Long Video Error: ${error.message}\n`);
  }

  // ============================================
  // 6. ADVANCED: ALL OPTIONS COMBINED
  // ============================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Example 6: Advanced Generation (All Options)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const advancedResult = await producer.generateAdvanced({
      prompt: "Cinematic wide shot of a majestic lion walking through the African savannah at golden hour",
      type: "text-to-video",
      config: {
        aspectRatio: "16:9",
        resolution: "1080p",
        negativePrompt: "blurry, low quality, pixelated, distorted",
        personGeneration: "allow_all"
      }
    });

    console.log('✅ Advanced Generation Result:');
    console.log(`   Video: ${advancedResult.videoUri}`);
    console.log(`   Type: ${advancedResult.type}`);
    console.log(`   Config: ${JSON.stringify(advancedResult.config)}\n`);
  } catch (error) {
    console.error(`❌ Advanced Generation Error: ${error.message}\n`);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 All Examples Complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// ============================================
// SIMULATION MODE (FOR TESTING WITHOUT API)
// ============================================
async function simulationDemo() {
  const producer = new ComprehensiveVeoProducer({
    simulate: true // No API calls, instant results
  });

  console.log('🔄 SIMULATION MODE - No API calls made\n');

  const result = await producer.textToVideo(
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
  console.log('  node examples/veo-all-features.js --simulate\n');
  process.exit(1);
}

// Run simulation or real examples
if (process.argv.includes('--simulate')) {
  simulationDemo().catch(console.error);
} else {
  main().catch(console.error);
}
