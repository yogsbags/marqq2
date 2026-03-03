/**
 * Test Photo Avatar Video Generation
 * Generates a test video using HeyGen photo avatar + ElevenLabs voice
 */

const fs = require('fs');
const path = require('path');

const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

// Load avatar mappings
const mappingPath = path.join(__dirname, '../config/avatar-voice-mapping.json');
const avatarMappings = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));

// Select Raj for testing
const rajMapping = Object.values(avatarMappings).find(a => a.avatarName === 'Raj');

console.log('='.repeat(60));
console.log('  HeyGen Photo Avatar Video Generation Test');
console.log('='.repeat(60));
console.log('\nTest Configuration:');
console.log(`  Avatar: ${rajMapping.avatarName} (${rajMapping.gender})`);
console.log(`  Group ID: ${rajMapping.groupId}`);
console.log(`  Voice: ${rajMapping.voiceName} (${rajMapping.voiceId})`);
console.log('='.repeat(60));

/**
 * Generate test video with photo avatar and ElevenLabs voice
 */
async function generateTestVideo() {
  console.log('\n📹 Generating test video...\n');

  if (!HEYGEN_API_KEY) {
    throw new Error('Missing HEYGEN_API_KEY. Set it in the environment before running.');
  }

  if (!ELEVENLABS_API_KEY) {
    throw new Error('Missing ELEVENLABS_API_KEY. Set it in the environment before running.');
  }

  const testScript = `Hello, I am ${rajMapping.avatarName}. This is a test of the HeyGen photo avatar video generation with ElevenLabs voice integration. I'm speaking in an Indian accent using the ${rajMapping.voiceName} voice.`;

  console.log(`Script: "${testScript}"\n`);

  try {
    // Method 1: Try v2 video generation endpoint
    // Use 'talking_photo' type (photo avatar groups are automatically converted to talking photos)
    const videoPayload = {
      video_inputs: [{
        character: {
          type: 'talking_photo',
          talking_photo_id: rajMapping.groupId
        },
        voice: {
          type: 'text',
          input_text: testScript,
          voice_id: rajMapping.voiceId,
          elevenlabs_settings: {
            model: 'eleven_multilingual_v2',
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0
          }
        }
      }],
      dimension: {
        width: 1920,
        height: 1080
      },
      aspect_ratio: '16:9'
    };

    console.log('Payload:');
    console.log(JSON.stringify(videoPayload, null, 2));
    console.log('\n' + '-'.repeat(60));

    const response = await fetch('https://api.heygen.com/v2/video/generate', {
      method: 'POST',
      headers: {
        'X-Api-Key': HEYGEN_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(videoPayload)
    });

    const text = await response.text();
    console.log(`\nStatus: ${response.status}`);

    try {
      const data = JSON.parse(text);

      if (response.status === 200 && data.data) {
        const videoId = data.data.video_id;
        console.log(`\n✅ Video generation started!`);
        console.log(`   Video ID: ${videoId}`);
        console.log(`\n📊 Checking video status...\n`);

        // Check status
        await checkVideoStatus(videoId);
      } else {
        console.log(`\n❌ Failed to generate video`);
        console.log('Response:', JSON.stringify(data, null, 2));

        // Try alternate method
        console.log('\n\nTrying alternate v1 method...');
        await tryV1Method(testScript);
      }
    } catch (e) {
      console.log('\nResponse (not JSON):', text.substring(0, 500));
    }
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
  }
}

/**
 * Try v1 video generation method
 */
async function tryV1Method(testScript) {
  try {
    const payload = {
      test: true,
      caption: false,
      title: 'Photo Avatar Test',
      video_inputs: [{
        character: {
          type: 'avatar',
          avatar_id: rajMapping.groupId,
          avatar_style: 'normal'
        },
        voice: {
          type: 'text',
          input_text: testScript,
          voice_id: rajMapping.voiceId,
          provider: 'elevenlabs'
        }
      }]
    };

    console.log('\nV1 Payload:');
    console.log(JSON.stringify(payload, null, 2));

    const response = await fetch('https://api.heygen.com/v1/video.generate', {
      method: 'POST',
      headers: {
        'X-Api-Key': HEYGEN_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    console.log(`\nV1 Status: ${response.status}`);

    try {
      const data = JSON.parse(text);
      console.log('V1 Response:', JSON.stringify(data, null, 2));

      if (data.data && data.data.video_id) {
        const videoId = data.data.video_id;
        console.log(`\n✅ Video generation started!`);
        console.log(`   Video ID: ${videoId}`);
        await checkVideoStatus(videoId);
      }
    } catch (e) {
      console.log('V1 Response (not JSON):', text.substring(0, 500));
    }
  } catch (error) {
    console.error(`V1 Error: ${error.message}`);
  }
}

/**
 * Check video generation status
 */
async function checkVideoStatus(videoId) {
  console.log('-'.repeat(60));
  console.log('Checking video status...');
  console.log('-'.repeat(60));

  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    try {
      const response = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
        headers: {
          'X-Api-Key': HEYGEN_API_KEY
        }
      });

      const data = await response.json();

      if (data.data) {
        const status = data.data.status;
        const progress = data.data.progress || 0;

        console.log(`\n[Attempt ${attempts + 1}/${maxAttempts}]`);
        console.log(`  Status: ${status}`);
        console.log(`  Progress: ${progress}%`);

        if (status === 'completed') {
          console.log('\n' + '='.repeat(60));
          console.log('✅ VIDEO GENERATION COMPLETED!');
          console.log('='.repeat(60));
          console.log(`\nVideo URL: ${data.data.video_url}`);
          console.log(`Thumbnail: ${data.data.thumbnail_url || 'N/A'}`);
          console.log(`Duration: ${data.data.duration || 'N/A'}s`);

          // Save result
          const resultPath = path.join(__dirname, '../test-results/photo-avatar-test-result.json');
          fs.mkdirSync(path.dirname(resultPath), { recursive: true });
          fs.writeFileSync(resultPath, JSON.stringify(data.data, null, 2));
          console.log(`\n📄 Result saved to: ${resultPath}`);
          return;
        } else if (status === 'failed') {
          console.log('\n❌ Video generation failed!');
          console.log('Error:', data.data.error || 'Unknown error');
          return;
        }

        // Wait before next check
        if (attempts < maxAttempts - 1) {
          console.log('   Waiting 10 seconds before next check...');
          await new Promise(r => setTimeout(r, 10000));
        }
      } else {
        console.log('\nUnexpected response:', JSON.stringify(data, null, 2));
      }
    } catch (error) {
      console.error(`\nStatus check error: ${error.message}`);
    }

    attempts++;
  }

  console.log('\n⏱️ Maximum attempts reached. Check status later using:');
  console.log(`   Video ID: ${videoId}`);
  console.log(`   URL: https://app.heygen.com/video/${videoId}`);
}

// Run the test
generateTestVideo().catch(console.error);
