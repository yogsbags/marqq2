/**
 * Test HeyGen Photo Avatar with Native Indian Voices
 * Uses the newly mapped HeyGen native Hindi voices
 */

const fs = require('fs');
const path = require('path');

const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;

// Load HeyGen native voice mappings
const mappingPath = path.join(__dirname, '../config/heygen-native-voice-mapping.json');
const avatarMappings = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));

// Test with all 5 avatars
const avatarsToTest = Object.values(avatarMappings);

console.log('='.repeat(80));
console.log('  HeyGen Photo Avatar + Native Indian Voices Test');
console.log('='.repeat(80));
console.log('\nTesting all 5 avatars with HeyGen native Hindi voices:\n');

avatarsToTest.forEach((avatar, index) => {
  console.log(`${index + 1}. ${avatar.avatarName} (${avatar.gender})`);
  console.log(`   Voice: ${avatar.voiceName}`);
  console.log(`   Voice ID: ${avatar.voiceId}`);
  console.log(`   Group ID: ${avatar.groupId}`);
  console.log();
});

console.log('='.repeat(80));

/**
 * Generate video for a specific avatar
 */
async function generateVideo(avatarMapping) {
  if (!HEYGEN_API_KEY) {
    throw new Error('Missing HEYGEN_API_KEY. Set it in the environment before running.');
  }

  const testScript = `नमस्ते, मैं ${avatarMapping.avatarName} हूं। यह HeyGen फोटो अवतार और देशी हिंदी आवाज एकीकरण का परीक्षण है। Hello, I am ${avatarMapping.avatarName}. This is a test of HeyGen photo avatar with native Hindi voice integration.`;

  console.log(`\n${'='.repeat(80)}`);
  console.log(`  Testing: ${avatarMapping.avatarName}`);
  console.log('='.repeat(80));
  console.log(`\nScript: "${testScript}"\n`);

  try {
    const videoPayload = {
      test: true,
      video_inputs: [{
        character: {
          type: 'talking_photo',
          talking_photo_id: avatarMapping.groupId
        },
        voice: {
          type: 'text',
          input_text: testScript,
          voice_id: avatarMapping.voiceId
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
    console.log('\n' + '-'.repeat(80));

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
        console.log(`\n✅ Video generation started for ${avatarMapping.avatarName}!`);
        console.log(`   Video ID: ${videoId}`);
        console.log(`\n📊 Checking video status...\n`);

        // Check status
        await checkVideoStatus(videoId, avatarMapping.avatarName);
      } else {
        console.log(`\n❌ Failed to generate video for ${avatarMapping.avatarName}`);
        console.log('Response:', JSON.stringify(data, null, 2));
      }
    } catch (e) {
      console.log('\nResponse (not JSON):', text.substring(0, 500));
    }
  } catch (error) {
    console.error(`\n❌ Error for ${avatarMapping.avatarName}: ${error.message}`);
  }
}

/**
 * Check video generation status
 */
async function checkVideoStatus(videoId, avatarName) {
  console.log('-'.repeat(80));
  console.log(`Checking video status for ${avatarName}...`);
  console.log('-'.repeat(80));

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

        console.log(`\n[Attempt ${attempts + 1}/${maxAttempts}] ${avatarName}`);
        console.log(`  Status: ${status}`);
        console.log(`  Progress: ${progress}%`);

        if (status === 'completed') {
          console.log('\n' + '='.repeat(80));
          console.log(`✅ VIDEO COMPLETED: ${avatarName}`);
          console.log('='.repeat(80));
          console.log(`\nVideo URL: ${data.data.video_url}`);
          console.log(`Thumbnail: ${data.data.thumbnail_url || 'N/A'}`);
          console.log(`Duration: ${data.data.duration || 'N/A'}s`);

          // Save result
          const resultPath = path.join(__dirname, `../test-results/${avatarName.toLowerCase()}-heygen-native-voice-result.json`);
          fs.mkdirSync(path.dirname(resultPath), { recursive: true });
          fs.writeFileSync(resultPath, JSON.stringify(data.data, null, 2));
          console.log(`\n📄 Result saved to: ${resultPath}`);
          return;
        } else if (status === 'failed') {
          console.log(`\n❌ Video generation failed for ${avatarName}!`);
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

  console.log(`\n⏱️ Maximum attempts reached for ${avatarName}. Check status later using:`);
  console.log(`   Video ID: ${videoId}`);
  console.log(`   URL: https://app.heygen.com/video/${videoId}`);
}

/**
 * Test one avatar (Raj) or all avatars
 */
async function runTests() {
  const args = process.argv.slice(2);
  const testAll = args.includes('--all');

  if (testAll) {
    console.log('\n🎬 Testing all 5 avatars...\n');
    for (const avatar of avatarsToTest) {
      await generateVideo(avatar);
      console.log('\n' + '='.repeat(80));
      console.log('Waiting 5 seconds before next avatar...');
      console.log('='.repeat(80) + '\n');
      await new Promise(r => setTimeout(r, 5000));
    }
  } else {
    console.log('\n🎬 Testing Raj avatar only (use --all to test all avatars)...\n');
    const rajMapping = avatarsToTest.find(a => a.avatarName === 'Raj');
    await generateVideo(rajMapping);
  }

  console.log('\n\n' + '='.repeat(80));
  console.log('  Test Complete!');
  console.log('='.repeat(80));
}

// Run the tests
runTests().catch(console.error);
