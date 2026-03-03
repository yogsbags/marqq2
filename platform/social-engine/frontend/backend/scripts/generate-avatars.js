/**
 * Generate Avatar Images using Gemini and Create HeyGen Photo Avatars
 */

const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;

// Avatar definitions with prompts
const avatarDefinitions = [
  {
    name: 'Raj',
    gender: 'male',
    prompt: 'Professional headshot photo of an Indian male financial advisor, age 38, wearing a navy blue business suit with white shirt and subtle tie. Clean shaven, confident warm smile, well-groomed hair. Professional corporate look. Neutral light gray studio background. High quality portrait photo, sharp focus, professional lighting.',
    voiceId: 'LolxzR74HCt7Un4IvoxI', // Maneesh
    voiceName: 'Maneesh',
    style: 'professional',
    useCase: 'Portfolio updates, Market insights, Client communications'
  },
  {
    name: 'Priya',
    gender: 'female',
    prompt: 'Professional headshot photo of an Indian female corporate trainer, age 32, wearing elegant business formal attire - navy blazer with light colored blouse. Warm approachable smile, professional makeup, neat hairstyle. Friendly yet professional appearance. Neutral light gray studio background. High quality portrait photo, sharp focus, professional lighting.',
    voiceId: 'vZcFdbaKO9EUmpfW004U', // Saheli
    voiceName: 'Saheli',
    style: 'educational',
    useCase: 'Educational content, Client onboarding, Product explainers'
  },
  {
    name: 'Arjun',
    gender: 'male',
    prompt: 'Professional headshot photo of an Indian male, age 30, wearing smart business casual - light blue button-down shirt without tie. Friendly approachable smile, modern look, well-groomed. Casual yet professional appearance. Neutral light gray studio background. High quality portrait photo, sharp focus, professional lighting.',
    voiceId: 'oH8YmZXJYEZq5ScgoGn9', // Aakash Aryan
    voiceName: 'Aakash Aryan',
    style: 'approachable',
    useCase: 'Internal communications, Training videos, Team announcements'
  },
  {
    name: 'Meera',
    gender: 'female',
    prompt: 'Professional headshot photo of an Indian female senior executive, age 45, wearing elegant executive business attire - dark blazer with subtle jewelry. Confident authoritative expression, sophisticated look, well-styled hair. Executive presence. Neutral light gray studio background. High quality portrait photo, sharp focus, professional lighting.',
    voiceId: 'm28sDRnudtExG3WLAufB', // Alekhya
    voiceName: 'Alekhya',
    style: 'executive',
    useCase: 'CEO messages, Strategic updates, Leadership communications'
  },
  {
    name: 'Vikram',
    gender: 'male',
    prompt: 'Professional headshot photo of an Indian male financial expert, age 42, wearing brown/tan business blazer with white shirt. Knowledgeable trustworthy expression, slight smile, glasses optional, well-groomed beard optional. Expert advisor appearance. Neutral light gray studio background. High quality portrait photo, sharp focus, professional lighting.',
    voiceId: 'CZdRaSQ51p0onta4eec8', // Akshay
    voiceName: 'Akshay',
    style: 'expert',
    useCase: 'Market analysis, Investment advice, Research presentations'
  }
];

async function generateImageWithGemini(prompt, name) {
  console.log(`\n🎨 Generating image for ${name}...`);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
      })
    }
  );

  const data = await response.json();

  if (data.error) {
    throw new Error(`Gemini error: ${data.error.message}`);
  }

  // Extract image data
  const imagePart = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (!imagePart) {
    throw new Error('No image generated');
  }

  const imageData = imagePart.inlineData.data;
  const mimeType = imagePart.inlineData.mimeType;

  // Save image locally
  const outputDir = path.join(__dirname, '../generated-avatars');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const ext = mimeType.includes('png') ? 'png' : 'jpg';
  const filename = `${name.toLowerCase()}_avatar.${ext}`;
  const filepath = path.join(outputDir, filename);

  fs.writeFileSync(filepath, Buffer.from(imageData, 'base64'));
  console.log(`   ✅ Saved: ${filepath}`);

  return {
    filepath,
    base64: imageData,
    mimeType
  };
}

async function createHeyGenPhotoAvatar(name, imageBase64) {
  console.log(`\n📸 Creating HeyGen photo avatar for ${name}...`);

  // Step 1: Create photo avatar group
  const groupResponse = await fetch('https://api.heygen.com/v2/photo_avatar/photo_avatar_group', {
    method: 'POST',
    headers: {
      'X-Api-Key': HEYGEN_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: `PL_${name}_Avatar` })
  });

  const groupData = await groupResponse.json();
  if (!groupResponse.ok) {
    throw new Error(`Failed to create group: ${JSON.stringify(groupData)}`);
  }

  const groupId = groupData.data?.group_id || groupData.group_id;
  console.log(`   Group ID: ${groupId}`);

  // Step 2: Add photo look
  const lookResponse = await fetch('https://api.heygen.com/v2/photo_avatar/add_photo_avatar_looks', {
    method: 'POST',
    headers: {
      'X-Api-Key': HEYGEN_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      group_id: groupId,
      looks: [{
        image: `data:image/png;base64,${imageBase64}`,
        name: 'default'
      }]
    })
  });

  const lookData = await lookResponse.json();
  if (!lookResponse.ok) {
    console.log(`   ⚠️ Add looks response: ${JSON.stringify(lookData)}`);
  }

  // Step 3: Train the avatar
  const trainResponse = await fetch('https://api.heygen.com/v2/photo_avatar/train', {
    method: 'POST',
    headers: {
      'X-Api-Key': HEYGEN_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ group_id: groupId })
  });

  const trainData = await trainResponse.json();
  console.log(`   Training started: ${JSON.stringify(trainData.data || trainData)}`);

  return {
    groupId,
    status: 'training'
  };
}

async function main() {
  console.log('🚀 Avatar Generation Script');
  console.log('='.repeat(50));

  if (!GEMINI_API_KEY) {
    throw new Error('Missing GEMINI_API_KEY. Set it in the environment before running.');
  }

  if (!HEYGEN_API_KEY) {
    throw new Error('Missing HEYGEN_API_KEY. Set it in the environment before running.');
  }

  const results = [];

  for (const avatar of avatarDefinitions) {
    try {
      // Generate image
      const image = await generateImageWithGemini(avatar.prompt, avatar.name);

      // Create HeyGen photo avatar
      const heygenResult = await createHeyGenPhotoAvatar(avatar.name, image.base64);

      results.push({
        ...avatar,
        heygenGroupId: heygenResult.groupId,
        imagePath: image.filepath,
        status: 'training'
      });

      console.log(`\n✅ ${avatar.name} avatar created successfully`);

      // Wait between requests to avoid rate limits
      await new Promise(r => setTimeout(r, 2000));

    } catch (error) {
      console.error(`\n❌ Failed for ${avatar.name}:`, error.message);
      results.push({
        ...avatar,
        error: error.message,
        status: 'failed'
      });
    }
  }

  // Save results
  const outputPath = path.join(__dirname, '../config/avatar-mappings.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n📄 Results saved to: ${outputPath}`);

  console.log('\n' + '='.repeat(50));
  console.log('Summary:');
  results.forEach(r => {
    console.log(`  ${r.name}: ${r.status} ${r.heygenGroupId ? `(${r.heygenGroupId})` : ''}`);
  });
}

main().catch(console.error);
