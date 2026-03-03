/**
 * Complete workflow: Upload images as assets, create photo avatar groups, and train them
 * Following the correct HeyGen API v2 workflow
 */

const fs = require('fs');
const path = require('path');

const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;

const avatars = [
  { name: 'Raj', file: 'raj_avatar.jpg', voiceId: 'LolxzR74HCt7Un4IvoxI', voiceName: 'Maneesh', gender: 'male' },
  { name: 'Priya', file: 'priya_avatar.jpg', voiceId: 'vZcFdbaKO9EUmpfW004U', voiceName: 'Saheli', gender: 'female' },
  { name: 'Arjun', file: 'arjun_avatar.jpg', voiceId: 'oH8YmZXJYEZq5ScgoGn9', voiceName: 'Aakash Aryan', gender: 'male' },
  { name: 'Meera', file: 'meera_avatar.jpg', voiceId: 'm28sDRnudtExG3WLAufB', voiceName: 'Alekhya', gender: 'female' },
  { name: 'Vikram', file: 'vikram_avatar.jpg', voiceId: 'CZdRaSQ51p0onta4eec8', voiceName: 'Akshay', gender: 'male' }
];

/**
 * Step 1: Upload image as asset and get image_key
 */
async function uploadAsset(name, imagePath) {
  console.log(`\n📤 Uploading ${name} as asset...`);

  // Read image as binary buffer (NOT FormData!)
  const imageBuffer = fs.readFileSync(imagePath);
  const contentType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

  try {
    const response = await fetch('https://upload.heygen.com/v1/asset', {
      method: 'POST',
      headers: {
        'X-Api-Key': HEYGEN_API_KEY,
        'Content-Type': contentType
      },
      body: imageBuffer
    });

    const text = await response.text();
    console.log(`   Status: ${response.status}`);

    if (response.status !== 200) {
      console.log(`   Response: ${text.substring(0, 200)}`);
      return { success: false, error: text };
    }

    const data = JSON.parse(text);

    // Get the image_key (NOT the URL) from the response
    // Response format: {"code":100,"data":{"image_key":"image/xxx/original","url":"https://..."}}
    const imageKey = data.data?.image_key || data.image_key;

    if (imageKey) {
      console.log(`   ✅ Asset uploaded! Image key: ${imageKey}`);
      return { success: true, imageKey, imageUrl: data.data?.url, data };
    } else {
      console.log(`   Response: ${JSON.stringify(data, null, 2)}`);
      return { success: false, error: 'No image_key in response', data };
    }
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Step 2: Create photo avatar group using image_key
 */
async function createPhotoAvatarGroup(name, imageKey) {
  console.log(`\n🎭 Creating photo avatar group for ${name}...`);

  try {
    const response = await fetch('https://api.heygen.com/v2/photo_avatar/avatar_group/create', {
      method: 'POST',
      headers: {
        'X-Api-Key': HEYGEN_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: name,
        image_key: imageKey
      })
    });

    const text = await response.text();
    console.log(`   Status: ${response.status}`);

    if (response.status !== 200) {
      console.log(`   Response: ${text.substring(0, 200)}`);
      return { success: false, error: text };
    }

    const data = JSON.parse(text);
    const groupId = data.data?.group_id || data.group_id;

    if (groupId) {
      console.log(`   ✅ Avatar group created! Group ID: ${groupId}`);
      return { success: true, groupId, data };
    } else {
      console.log(`   Response: ${JSON.stringify(data, null, 2)}`);
      return { success: false, error: 'No group_id in response', data };
    }
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Step 3: Train the photo avatar group
 */
async function trainPhotoAvatar(name, groupId) {
  console.log(`\n🎓 Training photo avatar for ${name}...`);

  try {
    const response = await fetch('https://api.heygen.com/v2/photo_avatar/train', {
      method: 'POST',
      headers: {
        'X-Api-Key': HEYGEN_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        group_id: groupId
      })
    });

    const text = await response.text();
    console.log(`   Status: ${response.status}`);

    if (response.status !== 200) {
      console.log(`   Response: ${text.substring(0, 200)}`);
      return { success: false, error: text };
    }

    const data = JSON.parse(text);
    console.log(`   ✅ Training started! Response: ${JSON.stringify(data, null, 2)}`);
    return { success: true, data };
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Main workflow
 */
async function main() {
  if (!HEYGEN_API_KEY) {
    throw new Error('Missing HEYGEN_API_KEY. Set it in the environment before running.');
  }

  console.log('='.repeat(60));
  console.log('  HeyGen Photo Avatar Creation Workflow');
  console.log('='.repeat(60));
  console.log('\nWorkflow:');
  console.log('  1. Upload image as asset → get image_key');
  console.log('  2. Create photo avatar group → get group_id');
  console.log('  3. Train photo avatar → get avatar_id');
  console.log('  4. Map avatar_id to ElevenLabs voice_id\n');

  const results = [];
  const avatarsDir = path.join(__dirname, '../generated-avatars');

  for (const avatar of avatars) {
    const imagePath = path.join(avatarsDir, avatar.file);

    if (!fs.existsSync(imagePath)) {
      console.log(`\n❌ Skip ${avatar.name}: File not found at ${imagePath}`);
      results.push({ ...avatar, status: 'file_not_found' });
      continue;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Processing: ${avatar.name} (${avatar.gender})`);
    console.log(`Voice: ${avatar.voiceName} (${avatar.voiceId})`);
    console.log('='.repeat(60));

    // Step 1: Upload asset
    const uploadResult = await uploadAsset(avatar.name, imagePath);
    if (!uploadResult.success) {
      results.push({ ...avatar, status: 'upload_failed', error: uploadResult.error });
      continue;
    }

    // Wait a bit between API calls
    await new Promise(r => setTimeout(r, 1000));

    // Step 2: Create avatar group
    const createResult = await createPhotoAvatarGroup(avatar.name, uploadResult.imageKey);
    if (!createResult.success) {
      results.push({
        ...avatar,
        imageKey: uploadResult.imageKey,
        status: 'group_creation_failed',
        error: createResult.error
      });
      continue;
    }

    // Wait a bit between API calls
    await new Promise(r => setTimeout(r, 1000));

    // Step 3: Train avatar
    const trainResult = await trainPhotoAvatar(avatar.name, createResult.groupId);

    results.push({
      ...avatar,
      imageKey: uploadResult.imageKey,
      groupId: createResult.groupId,
      trainStatus: trainResult.success ? 'training_started' : 'training_failed',
      trainError: trainResult.error,
      status: trainResult.success ? 'success' : 'partially_successful'
    });

    // Wait between avatars
    await new Promise(r => setTimeout(r, 2000));
  }

  // Save results
  const outputPath = path.join(__dirname, '../config/photo-avatar-mappings.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n\n📄 Results saved to: ${outputPath}`);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  results.forEach(r => {
    const status = r.status === 'success' ? '✅' : r.status === 'partially_successful' ? '⚠️' : '❌';
    console.log(`${status} ${r.name.padEnd(8)} | Status: ${r.status.padEnd(25)} | Group: ${r.groupId || 'N/A'}`);
  });

  // Generate final mapping config
  const successful = results.filter(r => r.groupId);
  if (successful.length > 0) {
    console.log('\n\n📋 Avatar-Voice Mapping Configuration:');
    console.log('='.repeat(60));
    const mapping = {};
    successful.forEach(s => {
      mapping[s.groupId] = {
        avatarName: s.name,
        groupId: s.groupId,
        imageKey: s.imageKey,
        voiceId: s.voiceId,
        voiceName: s.voiceName,
        gender: s.gender
      };
    });
    console.log(JSON.stringify(mapping, null, 2));

    // Save mapping config
    const mappingPath = path.join(__dirname, '../config/avatar-voice-mapping.json');
    fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2));
    console.log(`\n✅ Mapping saved to: ${mappingPath}`);
  }

  console.log('\n\n💡 Note: Avatar training may take several minutes to complete.');
  console.log('   Check training status via HeyGen dashboard or API.');
}

main().catch(console.error);
