/**
 * Test Multi-Provider Video Generation
 *
 * Tests all three video providers:
 * - Google Gemini (Primary)
 * - Fal AI (Secondary)
 * - Replicate (Fallback)
 */

const MultiProviderVeoProducer = require('./video/multi-provider-veo-producer');

async function testProviders() {
  console.log('🧪 Testing Multi-Provider Video Generation\n');

  // Initialize producer with API keys
  const producer = new MultiProviderVeoProducer({
    geminiApiKey: process.env.GEMINI_API_KEY,
    falApiKey: process.env.FAL_API_KEY,
    replicateApiKey: process.env.REPLICATE_API_TOKEN,
    providers: ['gemini', 'fal', 'replicate'],  // Priority order
    simulate: false  // Set to true for testing without API calls
  });

  console.log('📋 Configuration:');
  console.log(`   Gemini API Key: ${producer.geminiApiKey ? '✅ Set' : '❌ Missing'}`);
  console.log(`   Fal API Key: ${producer.falApiKey ? '✅ Set' : '❌ Missing'}`);
  console.log(`   Replicate API Key: ${producer.replicateApiKey ? '✅ Set' : '❌ Missing'}`);
  console.log(`   Provider Priority: ${producer.providers.join(' → ')}\n`);

  // Test 1: Single video generation
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test 1: Single Video Generation (8s)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const singleResult = await producer.generateVideo({
      prompt: 'Indian professional presenting financial data on a modern screen, clean office environment, 4K quality',
      config: {
        aspect_ratio: '16:9',
        duration: 8,
        fps: 30
      }
    });

    console.log('\n✅ Test 1 Passed');
    console.log(`   Video URI: ${singleResult.videoUri}`);
    console.log(`   Provider Used: ${singleResult.provider.toUpperCase()}`);
    console.log(`   Duration: ${singleResult.duration}s`);

  } catch (error) {
    console.error(`\n❌ Test 1 Failed: ${error.message}`);
  }

  // Test 2: Scene extension (3 clips)
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test 2: Scene Extension (24s = 3 clips)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const segments = [
      {
        timeRange: '0-8s',
        prompt: 'Indian professional introducing investment strategy, modern office'
      },
      {
        timeRange: '8-16s',
        prompt: 'Continue scene, show portfolio dashboard with rising graph'
      },
      {
        timeRange: '16-24s',
        prompt: 'Continue scene, animated chart showing returns comparison'
      }
    ];

    const extensionResult = await producer.generateLongVideo(segments, {
      aspect_ratio: '16:9',
      duration: 8,
      fps: 30
    });

    console.log('\n✅ Test 2 Passed');
    console.log(`   Total Clips: ${extensionResult.completedClips}/${extensionResult.totalClips}`);
    console.log(`   Total Duration: ${extensionResult.totalDuration}s`);
    console.log(`   Status: ${extensionResult.status}`);
    console.log(`   Provider Usage: ${JSON.stringify(extensionResult.providerUsage)}`);
    console.log(`   Final Video: ${extensionResult.finalVideoUri}`);

  } catch (error) {
    console.error(`\n❌ Test 2 Failed: ${error.message}`);
  }

  // Test 3: 90s Testimonial
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test 3: 90s Testimonial (12 clips)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const testimonialData = {
      clientName: 'Rajesh Kumar',
      clientAge: 55,
      clientGender: 'male',
      topic: 'MADP Portfolio Success',
      startValue: '50L',
      endValue: '2Cr'
    };

    const testimonialResult = await producer.generate90sTestimonial(testimonialData);

    console.log('\n✅ Test 3 Passed');
    console.log(`   Total Clips: ${testimonialResult.completedClips}/${testimonialResult.totalClips}`);
    console.log(`   Total Duration: ${testimonialResult.totalDuration}s`);
    console.log(`   Status: ${testimonialResult.status}`);
    console.log(`   Provider Usage: ${JSON.stringify(testimonialResult.providerUsage)}`);
    console.log(`   Type: ${testimonialResult.type}`);
    console.log(`   Platform: ${testimonialResult.platform}`);
    console.log(`   Final Video: ${testimonialResult.finalVideoUri}`);

  } catch (error) {
    console.error(`\n❌ Test 3 Failed: ${error.message}`);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 All Tests Completed');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// Run tests
testProviders().catch(error => {
  console.error('💥 Fatal Error:', error);
  process.exit(1);
});
