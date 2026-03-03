/**
 * Upload generated photos to HeyGen as Photo Avatars
 */

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;

const avatars = [
  { name: 'Raj', file: 'raj_avatar.jpg', voiceId: 'LolxzR74HCt7Un4IvoxI', voiceName: 'Maneesh' },
  { name: 'Priya', file: 'priya_avatar.jpg', voiceId: 'vZcFdbaKO9EUmpfW004U', voiceName: 'Saheli' },
  { name: 'Arjun', file: 'arjun_avatar.jpg', voiceId: 'oH8YmZXJYEZq5ScgoGn9', voiceName: 'Aakash Aryan' },
  { name: 'Meera', file: 'meera_avatar.jpg', voiceId: 'm28sDRnudtExG3WLAufB', voiceName: 'Alekhya' },
  { name: 'Vikram', file: 'vikram_avatar.jpg', voiceId: 'CZdRaSQ51p0onta4eec8', voiceName: 'Akshay' }
];

async function uploadTalkingPhoto(name, imagePath) {
  if (!HEYGEN_API_KEY) {
    throw new Error('Missing HEYGEN_API_KEY. Set it in the environment before running.');
  }

  console.log(`\nUploading ${name} to HeyGen Talking Photo...`);

  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');

  // Use the v2 talking_photo upload endpoint with proper structure
  const response = await fetch('https://api.heygen.com/v2/photo_avatar/talking_photo', {
    method: 'POST',
    headers: {
      'X-Api-Key': HEYGEN_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      image_key: `data:image/jpeg;base64,${base64Image.substring(0, 100)}...` // Truncated for logging
    })
  });

  // Also try the v1 endpoint as fallback
  const response2 = await fetch('https://upload.heygen.com/v1/talking_photo', {
    method: 'POST',
    headers: {
      'X-Api-Key': HEYGEN_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      image: `data:image/jpeg;base64,${base64Image}`
    })
  });

  const text = await response.text();
  console.log(`Response status: ${response.status}`);
  console.log(`Response: ${text.substring(0, 500)}`);

  try {
    const data = JSON.parse(text);
    return data;
  } catch (e) {
    return { error: text };
  }
}

async function listTalkingPhotos() {
  console.log('\nListing existing talking photos...');

  if (!HEYGEN_API_KEY) {
    throw new Error('Missing HEYGEN_API_KEY. Set it in the environment before running.');
  }

  const response = await fetch('https://api.heygen.com/v1/talking_photo.list', {
    method: 'GET',
    headers: {
      'X-Api-Key': HEYGEN_API_KEY
    }
  });

  const data = await response.json();
  console.log('Existing talking photos:', JSON.stringify(data, null, 2));
  return data;
}

async function main() {
  console.log('=== HeyGen Photo Avatar Upload ===\n');

  // First list existing
  await listTalkingPhotos();

  const results = [];
  const avatarsDir = path.join(__dirname, '../generated-avatars');

  for (const avatar of avatars) {
    const imagePath = path.join(avatarsDir, avatar.file);

    if (!fs.existsSync(imagePath)) {
      console.log(`Skip ${avatar.name}: File not found`);
      continue;
    }

    try {
      const result = await uploadTalkingPhoto(avatar.name, imagePath);
      results.push({
        ...avatar,
        heygenResult: result
      });
    } catch (error) {
      console.error(`Error for ${avatar.name}:`, error.message);
      results.push({
        ...avatar,
        error: error.message
      });
    }

    // Wait between uploads
    await new Promise(r => setTimeout(r, 2000));
  }

  // Save results
  const outputPath = path.join(__dirname, '../config/heygen-avatar-ids.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);
}

main().catch(console.error);
