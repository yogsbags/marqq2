/**
 * Upload Generated Avatar Images to HeyGen as Talking Photos
 * Uses the correct HeyGen API endpoint for talking photo creation
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

async function uploadTalkingPhoto(name, imagePath) {
  console.log(`\n📸 Uploading ${name} as talking photo...`);
  console.log(`   Image: ${imagePath}`);

  if (!HEYGEN_API_KEY) {
    throw new Error('Missing HEYGEN_API_KEY. Set it in the environment before running.');
  }

  // Read image and convert to base64
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

  // Try the v1 talking photo upload endpoint with FormData-like approach
  // HeyGen API expects the image in a specific format

  // Method 1: Try v1 upload.create endpoint
  const uploadPayload = {
    image: `data:${mimeType};base64,${base64Image}`
  };

  try {
    // First, try the v1 talking_photo upload
    const response = await fetch('https://api.heygen.com/v1/talking_photo', {
      method: 'POST',
      headers: {
        'X-Api-Key': HEYGEN_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(uploadPayload)
    });

    const text = await response.text();
    console.log(`   Status: ${response.status}`);

    try {
      const data = JSON.parse(text);
      if (data.data && data.data.talking_photo_id) {
        console.log(`   ✅ Success! Talking Photo ID: ${data.data.talking_photo_id}`);
        return { success: true, talkingPhotoId: data.data.talking_photo_id, data };
      }
      return { success: false, data, text };
    } catch (e) {
      return { success: false, error: text };
    }
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function uploadWithFormData(name, imagePath) {
  console.log(`\n📸 Trying FormData upload for ${name}...`);

  if (!HEYGEN_API_KEY) {
    throw new Error('Missing HEYGEN_API_KEY. Set it in the environment before running.');
  }

  // Use node-fetch FormData approach
  const FormData = require('form-data');
  const form = new FormData();
  form.append('file', fs.createReadStream(imagePath));

  try {
    const response = await fetch('https://api.heygen.com/v1/talking_photo', {
      method: 'POST',
      headers: {
        'X-Api-Key': HEYGEN_API_KEY,
        ...form.getHeaders()
      },
      body: form
    });

    const text = await response.text();
    console.log(`   Status: ${response.status}`);

    try {
      const data = JSON.parse(text);
      if (data.data && data.data.talking_photo_id) {
        console.log(`   ✅ Success! Talking Photo ID: ${data.data.talking_photo_id}`);
        return { success: true, talkingPhotoId: data.data.talking_photo_id, data };
      }
      console.log(`   Response: ${JSON.stringify(data, null, 2)}`);
      return { success: false, data, text };
    } catch (e) {
      console.log(`   Response: ${text.substring(0, 200)}`);
      return { success: false, error: text };
    }
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function uploadWithUploadEndpoint(name, imagePath) {
  console.log(`\n📸 Trying upload.heygen.com endpoint for ${name}...`);

  if (!HEYGEN_API_KEY) {
    throw new Error('Missing HEYGEN_API_KEY. Set it in the environment before running.');
  }

  const FormData = require('form-data');
  const form = new FormData();
  form.append('file', fs.createReadStream(imagePath));

  try {
    const response = await fetch('https://upload.heygen.com/v1/talking_photo', {
      method: 'POST',
      headers: {
        'X-Api-Key': HEYGEN_API_KEY,
        ...form.getHeaders()
      },
      body: form
    });

    const text = await response.text();
    console.log(`   Status: ${response.status}`);

    try {
      const data = JSON.parse(text);
      console.log(`   Response: ${JSON.stringify(data, null, 2)}`);
      if (data.data && (data.data.talking_photo_id || data.data.id)) {
        const id = data.data.talking_photo_id || data.data.id;
        console.log(`   ✅ Success! Talking Photo ID: ${id}`);
        return { success: true, talkingPhotoId: id, data };
      }
      return { success: false, data, text };
    } catch (e) {
      console.log(`   Response: ${text.substring(0, 200)}`);
      return { success: false, error: text };
    }
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('=== HeyGen Talking Photo Upload ===\n');
  console.log('Attempting to upload generated avatar images as talking photos...\n');

  const results = [];
  const avatarsDir = path.join(__dirname, '../generated-avatars');

  for (const avatar of avatars) {
    const imagePath = path.join(avatarsDir, avatar.file);

    if (!fs.existsSync(imagePath)) {
      console.log(`❌ Skip ${avatar.name}: File not found at ${imagePath}`);
      results.push({ ...avatar, status: 'file_not_found' });
      continue;
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`Processing: ${avatar.name}`);
    console.log(`${'='.repeat(50)}`);

    // Try different upload methods
    let result = await uploadTalkingPhoto(avatar.name, imagePath);

    if (!result.success) {
      console.log('\n   Trying FormData method...');
      result = await uploadWithFormData(avatar.name, imagePath);
    }

    if (!result.success) {
      console.log('\n   Trying upload.heygen.com endpoint...');
      result = await uploadWithUploadEndpoint(avatar.name, imagePath);
    }

    if (result.success) {
      results.push({
        ...avatar,
        talkingPhotoId: result.talkingPhotoId,
        status: 'success'
      });
    } else {
      results.push({
        ...avatar,
        status: 'failed',
        error: result.error || result.data
      });
    }

    // Wait between uploads
    await new Promise(r => setTimeout(r, 2000));
  }

  // Save results
  const outputPath = path.join(__dirname, '../config/talking-photo-mappings.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n\n📄 Results saved to: ${outputPath}`);

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('Summary:');
  console.log('='.repeat(50));
  results.forEach(r => {
    const status = r.status === 'success' ? '✅' : '❌';
    console.log(`  ${status} ${r.name}: ${r.status} ${r.talkingPhotoId ? `(${r.talkingPhotoId})` : ''}`);
  });

  // Generate final config if successful
  const successful = results.filter(r => r.status === 'success');
  if (successful.length > 0) {
    console.log('\n\n📋 Final Avatar-Voice Mapping:');
    console.log(JSON.stringify(
      successful.map(s => ({
        avatarName: s.name,
        talkingPhotoId: s.talkingPhotoId,
        voiceId: s.voiceId,
        voiceName: s.voiceName,
        gender: s.gender
      })),
      null, 2
    ));
  }
}

main().catch(console.error);
